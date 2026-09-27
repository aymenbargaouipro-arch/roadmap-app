// Limitation de debit simple, en memoire (audit M1, partie debit).
//
// Suffisant tant que l'application tourne sur un seul serveur (cas actuel : un seul process
// Node). Les compteurs repartent a zero a chaque redemarrage du serveur. Si l'app passe un
// jour sur plusieurs instances, il faudra un stockage partage (Postgres ou Redis).
//
// Stocke sur globalThis pour survivre aux rechargements a chaud de Next.js en developpement.

type Bucket = { count: number; resetAt: number };

const globalStore = globalThis as unknown as { __apexRateLimit?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = globalStore.__apexRateLimit ?? new Map();
globalStore.__apexRateLimit = buckets;

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Compte un appel pour `key` dans une fenetre fixe de `windowMs`.
 * Refuse des que `limit` appels ont deja ete comptes dans la fenetre en cours.
 */
export function hit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  // Menage opportuniste pour que la Map ne grossisse pas indefiniment.
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true };
}

/** Comme hit, mais sans rien compter : dit seulement si `key` a deja atteint `limit`. */
export function peek(key: string, limit: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now || bucket.count < limit) return { allowed: true };
  return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
}

/** Remet a zero le compteur de `key`. */
export function reset(key: string): void {
  buckets.delete(key);
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} seconde(s)`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minute(s)`;
  return `${Math.ceil(minutes / 60)} heure(s)`;
}

// --- Adresse IP du client -------------------------------------------------------------------
// En production, Apex doit etre derriere un proxy inverse (Caddy) qui renseigne
// X-Forwarded-For avec l'adresse reelle du client, et le port de Node ne doit pas etre expose
// directement : sinon l'en-tete peut etre invente par le client. On prend la DERNIERE valeur,
// celle ajoutee par le proxy le plus proche. Sans en-tete (developpement local), toutes les
// requetes partagent le meme compteur, ce qui reste sans danger.

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
export function isLoginBlocked(email: string, ip: string): boolean {
  return !peek(loginEmailKey(email), LOGIN_FAILURES_PER_EMAIL).allowed || !peek(loginIpKey(ip), LOGIN_FAILURES_PER_IP).allowed;
}

export function recordLoginFailure(email: string, ip: string): void {
  hit(loginEmailKey(email), LOGIN_FAILURES_PER_EMAIL, LOGIN_WINDOW_MS);
  hit(loginIpKey(ip), LOGIN_FAILURES_PER_IP, LOGIN_WINDOW_MS);
}

export function clearLoginFailures(email: string): void {
  reset(loginEmailKey(email));
}

// --- Inscription (audit M1) -----------------------------------------------------------------
// Seuls les REFUS d'entree sont comptes (lien invalide, inscription fermee, email existant) :
// une personne invitee qui s'inscrit normalement ne consomme rien. Les erreurs de saisie
// (mot de passe trop court...) ne sont pas comptees non plus.

const REGISTER_FAILURES_PER_IP = 5;
const REGISTER_WINDOW_MS = 60 * 60 * 1000; // 1 heure

const registerIpKey = (ip: string) => `register:ip:${ip}`;

/** Renvoie null si l'inscription peut etre tentee, sinon le message d'erreur a afficher. */
export function checkRegisterRateLimit(ip: string): string | null {
  const result = peek(registerIpKey(ip), REGISTER_FAILURES_PER_IP);
  if (result.allowed) return null;
  return `Trop de tentatives d'inscription. Réessaie dans ${formatWait(result.retryAfterSeconds)}.`;
}

export function recordRegisterFailure(ip: string): void {
  hit(registerIpKey(ip), REGISTER_FAILURES_PER_IP, REGISTER_WINDOW_MS);
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
export function checkImportRateLimit(userId: string, workspaceId: string): string | null {
  const userKey = `import:user:${userId}`;
  const workspaceKey = `import:ws:${workspaceId}`;
  const instanceKey = "import:instance";
  const instanceLimit = instanceAiDailyLimit();

  // On verifie les trois plafonds AVANT de compter : une analyse refusee par l'un d'eux ne
  // consomme rien dans les autres.
  const perUser = peek(userKey, IMPORT_PER_USER_LIMIT);
  if (!perUser.allowed) {
    return `Trop d'analyses d'import en peu de temps. Réessaie dans ${formatWait(perUser.retryAfterSeconds)}.`;
  }
  const perWorkspace = peek(workspaceKey, IMPORT_PER_WORKSPACE_DAILY_LIMIT);
  if (!perWorkspace.allowed) {
    return `Le quota quotidien d'analyses d'import de l'espace de travail est atteint. Réessaie dans ${formatWait(
      perWorkspace.retryAfterSeconds
    )}.`;
  }
  const perInstance = peek(instanceKey, instanceLimit);
  if (!perInstance.allowed) {
    return `Le quota quotidien d'analyses par IA de cette instance Apex est atteint. Réessaie dans ${formatWait(
      perInstance.retryAfterSeconds
    )}.`;
  }

  hit(userKey, IMPORT_PER_USER_LIMIT, IMPORT_PER_USER_WINDOW_MS);
  hit(workspaceKey, IMPORT_PER_WORKSPACE_DAILY_LIMIT, DAY_MS);
  hit(instanceKey, instanceLimit, DAY_MS);
  return null;
}
