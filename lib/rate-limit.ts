import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

// Limitation de debit, compteurs stockes dans PostgreSQL (audit M1-c).
//
// Les compteurs survivent aux redemarrages du serveur (infrastructure qui arrete le serveur
// apres une periode d'inactivite) et sont partages entre plusieurs copies du serveur. Chaque
// increment est une seule requete SQL atomique. Les cles sont stockees sous forme d'empreinte
// SHA-256 : ni email ni adresse IP en clair dans la table.

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

type BucketRow = { count: number; retryAfter: number };

function bucketId(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// Menage occasionnel des compteurs expires depuis plus d'un jour (1 appel sur 100).
function maybeCleanup(): void {
  if (Math.random() >= 0.01) return;
  prisma.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "resetAt" < now() - interval '1 day'`.catch((err) =>
    console.error("[rate-limit] menage impossible :", err)
  );
}

/**
 * Compte un appel pour `key` dans une fenetre fixe de `windowMs`, et dit si le total reste
 * dans `limit`. La fenetre repart de zero des qu'elle est expiree.
 */
export async function hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const id = bucketId(key);
  const rows = await prisma.$queryRaw<BucketRow[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
    VALUES (${id}, 1, now() + (${windowMs}::int * interval '1 millisecond'))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."resetAt" <= now() THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= now() THEN EXCLUDED."resetAt" ELSE "RateLimitBucket"."resetAt" END
    RETURNING "count", GREATEST(CEIL(EXTRACT(EPOCH FROM ("resetAt" - now()))), 1)::int AS "retryAfter"`;
  maybeCleanup();
  const row = rows[0];
  if (!row || row.count <= limit) return { allowed: true };
  return { allowed: false, retryAfterSeconds: row.retryAfter };
}

/** Comme hit, mais sans rien compter : dit seulement si `key` a deja atteint `limit`. */
export async function peek(key: string, limit: number): Promise<RateLimitResult> {
  const id = bucketId(key);
  const rows = await prisma.$queryRaw<BucketRow[]>`
    SELECT "count", GREATEST(CEIL(EXTRACT(EPOCH FROM ("resetAt" - now()))), 1)::int AS "retryAfter"
    FROM "RateLimitBucket"
    WHERE "key" = ${id} AND "resetAt" > now()`;
  const row = rows[0];
  if (!row || row.count < limit) return { allowed: true };
  return { allowed: false, retryAfterSeconds: row.retryAfter };
}

/** Remet a zero le compteur de `key`. */
export async function reset(key: string): Promise<void> {
  const id = bucketId(key);
  await prisma.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "key" = ${id}`;
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} seconde(s)`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minute(s)`;
  return `${Math.ceil(minutes / 60)} heure(s)`;
}

// --- Adresse IP du client -------------------------------------------------------------------
// En production, Apex doit etre derriere un proxy inverse qui renseigne X-Forwarded-For avec
// l'adresse reelle du client, et le port de Node ne doit pas etre expose directement : sinon
// l'en-tete peut etre invente par le client. On prend la DERNIERE valeur, celle ajoutee par le
// proxy le plus proche. Sans en-tete (developpement local), toutes les requetes partagent le
// meme compteur, ce qui reste sans danger.

export function clientIpFromHeaders(get: (name: string) => string | null | undefined): string {
  const forwarded = get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && last.length <= 64) return last;
  }
  const real = get("x-real-ip")?.trim();
  if (real && real.length <= 64) return real;
  return "inconnue";
}

// --- Connexion (audit M1) -------------------------------------------------------------------
// Seuls les ECHECS sont comptes : les connexions reussies de collegues qui sortent tous par la
// meme adresse IP (reseau d'entreprise) ne consomment rien. Un attaquant ne produit que des
// echecs. Une connexion reussie remet a zero le compteur de son email, jamais celui de l'IP
// (sinon un attaquant disposant d'un compte valide pourrait effacer ses propres echecs).

const LOGIN_FAILURES_PER_EMAIL = 3;
const LOGIN_FAILURES_PER_IP = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const loginEmailKey = (email: string) => `login:email:${email}`;
const loginIpKey = (ip: string) => `login:ip:${ip}`;

/** Vrai si une tentative de connexion doit etre refusee sans meme verifier le mot de passe. */
export async function isLoginBlocked(email: string, ip: string): Promise<boolean> {
  const [byEmail, byIp] = await Promise.all([
    peek(loginEmailKey(email), LOGIN_FAILURES_PER_EMAIL),
    peek(loginIpKey(ip), LOGIN_FAILURES_PER_IP),
  ]);
  return !byEmail.allowed || !byIp.allowed;
}

export async function recordLoginFailure(email: string, ip: string): Promise<void> {
  await Promise.all([
    hit(loginEmailKey(email), LOGIN_FAILURES_PER_EMAIL, LOGIN_WINDOW_MS),
    hit(loginIpKey(ip), LOGIN_FAILURES_PER_IP, LOGIN_WINDOW_MS),
  ]);
}

export async function clearLoginFailures(email: string): Promise<void> {
  await reset(loginEmailKey(email));
}

// --- Inscription (audit M1) -----------------------------------------------------------------
// Seuls les REFUS d'entree sont comptes (lien invalide, inscription fermee, email existant) :
// une personne invitee qui s'inscrit normalement ne consomme rien. Les erreurs de saisie
// (mot de passe trop court...) ne sont pas comptees non plus.

const REGISTER_FAILURES_PER_IP = 5;
const REGISTER_WINDOW_MS = 60 * 60 * 1000; // 1 heure

const registerIpKey = (ip: string) => `register:ip:${ip}`;

/** Renvoie null si l'inscription peut etre tentee, sinon le message d'erreur a afficher. */
export async function checkRegisterRateLimit(ip: string): Promise<string | null> {
  const result = await peek(registerIpKey(ip), REGISTER_FAILURES_PER_IP);
  if (result.allowed) return null;
  return `Trop de tentatives d'inscription. Réessaie dans ${formatWait(result.retryAfterSeconds)}.`;
}

export async function recordRegisterFailure(ip: string): Promise<void> {
  await hit(registerIpKey(ip), REGISTER_FAILURES_PER_IP, REGISTER_WINDOW_MS);
}

// --- Regles propres aux imports IA -------------------------------------------------------
// Chaque analyse d'import coute 1 a 2 appels a l'API Anthropic. Trois garde-fous cumules :
// un par utilisateur (evite les rafales), un par workspace et par jour, et un pour toute
// l'instance et par jour (plafonne le budget total, reglable par APEX_AI_DAILY_LIMIT).

const IMPORT_PER_USER_LIMIT = 10;
const IMPORT_PER_USER_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const IMPORT_PER_WORKSPACE_DAILY_LIMIT = 100;
const DEFAULT_AI_DAILY_LIMIT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Plafond quotidien de l'instance : entier de 1 a 100000, sinon la valeur par defaut. */
function instanceAiDailyLimit(): number {
  const raw = process.env.APEX_AI_DAILY_LIMIT;
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : DEFAULT_AI_DAILY_LIMIT;
}

/** Renvoie null si l'import est autorise, sinon le message d'erreur a afficher. */
export async function checkImportRateLimit(userId: string, workspaceId: string): Promise<string | null> {
  const userKey = `import:user:${userId}`;
  const workspaceKey = `import:ws:${workspaceId}`;
  const instanceKey = "import:instance";
  const instanceLimit = instanceAiDailyLimit();

  // On verifie les trois plafonds AVANT de compter : une analyse refusee par l'un d'eux ne
  // consomme rien dans les autres.
  const perUser = await peek(userKey, IMPORT_PER_USER_LIMIT);
  if (!perUser.allowed) {
    return `Trop d'analyses d'import en peu de temps. Réessaie dans ${formatWait(perUser.retryAfterSeconds)}.`;
  }
  const perWorkspace = await peek(workspaceKey, IMPORT_PER_WORKSPACE_DAILY_LIMIT);
  if (!perWorkspace.allowed) {
    return `Le quota quotidien d'analyses d'import de l'espace de travail est atteint. Réessaie dans ${formatWait(
      perWorkspace.retryAfterSeconds
    )}.`;
  }
  const perInstance = await peek(instanceKey, instanceLimit);
  if (!perInstance.allowed) {
    return `Le quota quotidien d'analyses par IA de cette instance Apex est atteint. Réessaie dans ${formatWait(
      perInstance.retryAfterSeconds
    )}.`;
  }

  await Promise.all([
    hit(userKey, IMPORT_PER_USER_LIMIT, IMPORT_PER_USER_WINDOW_MS),
    hit(workspaceKey, IMPORT_PER_WORKSPACE_DAILY_LIMIT, DAY_MS),
    hit(instanceKey, instanceLimit, DAY_MS),
  ]);
  return null;
}
