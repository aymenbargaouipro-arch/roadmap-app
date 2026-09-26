import { randomBytes } from "crypto";
import type { Role } from "@prisma/client";

// Regles des liens d'invitation (audit M2).
// - Tout lien expire apres INVITE_TTL_DAYS jours.
// - Un lien Admin ne sert qu'une fois (donner les droits d'admin doit rester un acte cible).
// - Un lien Membre peut servir plusieurs fois (pratique a partager dans un canal d'equipe).
// - Un admin peut revoquer un lien a tout moment.

export const INVITE_TTL_DAYS = 7;

export function newInviteToken(): string {
  // 128 bits d'aleatoire, encodes pour une URL (22 caracteres).
  return randomBytes(16).toString("base64url");
}

export function inviteDefaults(role: Role, now = new Date()) {
  return {
    expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
    maxUses: role === "ADMIN" ? 1 : null,
  };
}

export type InviteState = "active" | "expired" | "revoked" | "exhausted";

type InviteLike = {
  expiresAt: Date | null;
  revokedAt: Date | null;
  maxUses: number | null;
  useCount: number;
};

export function inviteState(invite: InviteLike, now = new Date()): InviteState {
  if (invite.revokedAt) return "revoked";
  // Un lien sans date d'expiration a ete cree avant l'ajout de cette regle : expire.
  if (!invite.expiresAt || invite.expiresAt <= now) return "expired";
  if (invite.maxUses != null && invite.useCount >= invite.maxUses) return "exhausted";
  return "active";
}
