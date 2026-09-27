import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Invite } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseJsonBody, requiredText } from "@/lib/validation";
import { checkRegisterRateLimit, clientIpFromHeaders, recordRegisterFailure } from "@/lib/rate-limit";
import { consumeInvite, inviteState } from "@/lib/invites";
import {
  INVITE_INVALID_MESSAGE,
  REGISTRATION_CLOSED_MESSAGE,
  REGISTRATION_FAILED_MESSAGE,
  lockInstance,
} from "@/lib/instance-access";

// Inscription par mot de passe, instance privee (audit M1). Deux cas seulement :
// - avec un lien d'invitation valide : le compte est cree ET rattache a l'espace qui invite,
//   en une seule transaction (aucun compte ne peut exister sans espace) ;
// - sans lien : uniquement si la base ne contient encore aucun utilisateur (amorcage).
// Tout le reste est refuse. Sera complete par la connexion SSO (bloc 2).
// Limitation de debit (audit M1) : 5 refus d'entree par adresse IP et par heure.

const INVITE_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

const registerSchema = z.object({
  name: requiredText(100, "Nom requis."),
  email: z
    .string({ invalid_type_error: "Email invalide.", required_error: "Email requis." })
    .transform((s) => s.trim().toLowerCase())
    .refine((s) => s.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), { message: "Email invalide." }),
  // bcrypt n'exploite que les 72 premiers octets : on borne pour eviter un faux sentiment de
  // securite et des calculs inutilement longs.
  password: z
    .string({ invalid_type_error: "Mot de passe invalide.", required_error: "Mot de passe requis." })
    .min(12, "Le mot de passe doit contenir au moins 12 caractères.")
    .max(72, "Le mot de passe ne doit pas dépasser 72 caractères."),
  inviteToken: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (typeof v === "string" && v.trim() ? v.trim() : null)),
});

class RegistrationRefused extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function POST(req: Request) {
  const ip = clientIpFromHeaders((name) => req.headers.get(name));
  const rateLimitError = checkRegisterRateLimit(ip);
  if (rateLimitError) return NextResponse.json({ error: rateLimitError }, { status: 429 });

  const parsed = await parseJsonBody(req, registerSchema);
  if (!parsed.ok) return parsed.response;
  const { name, email, password, inviteToken } = parsed.data;

  if (inviteToken !== null && !INVITE_TOKEN.test(inviteToken)) {
    recordRegisterFailure(ip);
    return NextResponse.json({ error: INVITE_INVALID_MESSAGE }, { status: 404 });
  }

  // Hash calcule AVANT la transaction : le verrou d'instance reste tenu le moins longtemps
  // possible, et un refus prend le meme temps qu'une inscription reussie.
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const result = await prisma.$transaction(async (tx) => {
      await lockInstance(tx);

      // 1. Droit d'entree, verifie AVANT l'email : sans lien valide, impossible de savoir si
      //    un email est deja inscrit.
      let invite: Invite | null = null;
      if (inviteToken) {
        invite = await tx.invite.findUnique({ where: { token: inviteToken } });
        if (!invite || inviteState(invite) !== "active") {
          throw new RegistrationRefused(404, INVITE_INVALID_MESSAGE);
        }
      } else {
        const userCount = await tx.user.count();
        if (userCount > 0) throw new RegistrationRefused(403, REGISTRATION_CLOSED_MESSAGE);
      }

      // 2. Email deja inscrit : message volontairement vague, et le lien n'est pas consomme.
      //    Comparaison insensible a la casse, comme a la connexion (lib/auth.ts).
      const existing = await tx.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      });
      if (existing) throw new RegistrationRefused(409, REGISTRATION_FAILED_MESSAGE);

      // 3. Creation du compte, puis consommation du lien et rattachement a l'espace. Si le lien
      //    a ete epuise entre-temps, toute la transaction est annulee (compte compris).
      const user = await tx.user.create({ data: { name, email, passwordHash } });

      if (invite) {
        const consumed = await consumeInvite(tx, invite);
        if (!consumed) throw new RegistrationRefused(404, INVITE_INVALID_MESSAGE);
        await tx.membership.create({
          data: { userId: user.id, workspaceId: invite.workspaceId, role: invite.role },
        });
      }

      return { id: user.id, email: user.email, joinedWorkspace: invite !== null };
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof RegistrationRefused) {
      recordRegisterFailure(ip);
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if ((err as { code?: string } | null)?.code === "P2002") {
      recordRegisterFailure(ip);
      return NextResponse.json({ error: REGISTRATION_FAILED_MESSAGE }, { status: 409 });
    }
    console.error("[register] echec inattendu :", err);
    return NextResponse.json({ error: "Erreur serveur, le compte n'a pas été créé." }, { status: 500 });
  }
}
