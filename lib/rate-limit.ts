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

// --- Regles propres aux imports IA -------------------------------------------------------
// Chaque analyse d'import coute 1 a 2 appels a l'API Anthropic. Deux garde-fous cumules :
// un par utilisateur (evite les rafales), un par workspace et par jour (plafonne le budget).

const IMPORT_PER_USER_LIMIT = 10;
const IMPORT_PER_USER_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const IMPORT_PER_WORKSPACE_DAILY_LIMIT = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} seconde(s)`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minute(s)`;
  return `${Math.ceil(minutes / 60)} heure(s)`;
}

/** Renvoie null si l'import est autorise, sinon le message d'erreur a afficher. */
export function checkImportRateLimit(userId: string, workspaceId: string): string | null {
  const perUser = hit(`import:user:${userId}`, IMPORT_PER_USER_LIMIT, IMPORT_PER_USER_WINDOW_MS);
  if (!perUser.allowed) {
    return `Trop d'analyses d'import en peu de temps. Réessaie dans ${formatWait(perUser.retryAfterSeconds)}.`;
  }

  const perWorkspace = hit(`import:ws:${workspaceId}`, IMPORT_PER_WORKSPACE_DAILY_LIMIT, DAY_MS);
  if (!perWorkspace.allowed) {
    return `Le quota quotidien d'analyses d'import de l'espace de travail est atteint. Réessaie dans ${formatWait(
      perWorkspace.retryAfterSeconds
    )}.`;
  }

  return null;
}
