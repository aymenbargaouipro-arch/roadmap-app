import type { Prisma } from "@prisma/client";

// Acces a l'instance Apex (audit M1, instance privee).
//
// Regles d'entree :
// - Base vide (aucun utilisateur) : le tout premier compte peut s'inscrire sans invitation,
//   puis creer le premier espace. C'est l'amorcage d'une installation neuve.
// - Ensuite, on n'entre QUE par un lien d'invitation valide, qui rattache directement le
//   nouveau compte a l'espace qui l'invite.
// - Un compte appartient a un seul espace (le multi-espace viendra plus tard, avec un
//   selecteur d'espace).
// Aucun role n'est defini par un email ou une variable d'environnement : l'admin est toujours
// celui d'un espace, stocke en base (Membership).

// Verrou consultatif PostgreSQL, tenu jusqu'a la fin de la transaction. Il serialise les
// verifications "base vide", "compte sans espace" et "aucun espace" : deux inscriptions ou
// deux creations d'espace simultanees ne peuvent pas passer toutes les deux. Valeur
// arbitraire mais fixe, propre a Apex.
const INSTANCE_LOCK_KEY = 4217001;

export async function lockInstance(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${INSTANCE_LOCK_KEY}::bigint)`;
}

// --- Messages communs ----------------------------------------------------------------------

export const INVITE_INVALID_MESSAGE =
  "Invitation invalide, expirée ou déjà utilisée. Demande un nouveau lien à ton administrateur.";

export const REGISTRATION_CLOSED_MESSAGE =
  "L'inscription se fait uniquement sur invitation. Utilise le lien reçu de ton administrateur.";

// Volontairement vague : ne dit pas si l'email existe deja (audit M1, enumeration).
export const REGISTRATION_FAILED_MESSAGE =
  "Impossible de créer ce compte. Si tu as déjà un compte, connecte-toi.";

export const ALREADY_IN_WORKSPACE_MESSAGE =
  "Ton compte appartient déjà à un espace de travail. Pour l'instant, un compte ne peut appartenir qu'à un seul espace.";

export const WORKSPACE_CREATION_CLOSED_MESSAGE =
  "Cette instance Apex est privée : un nouvel espace ne peut pas y être créé. Demande une invitation à l'administrateur d'un espace existant.";

// --- Creation d'espace ---------------------------------------------------------------------

export type WorkspaceCreationCheck =
  | { allowed: true }
  | { allowed: false; reason: "already_member" | "closed" };

/**
 * Un espace ne peut etre cree que par un compte qui n'a encore aucun espace, et seulement si
 * l'instance n'en contient aucun (amorcage). Dans une transaction, appeler lockInstance avant.
 */
export async function checkWorkspaceCreation(
  db: Prisma.TransactionClient,
  userId: string
): Promise<WorkspaceCreationCheck> {
  const membership = await db.membership.findFirst({ where: { userId }, select: { id: true } });
  if (membership) return { allowed: false, reason: "already_member" };

  const workspaceCount = await db.workspace.count();
  if (workspaceCount > 0) return { allowed: false, reason: "closed" };

  return { allowed: true };
}
