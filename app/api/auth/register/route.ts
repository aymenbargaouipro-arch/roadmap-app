import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseJsonBody, requiredText } from "@/lib/validation";

// Inscription par mot de passe. Sera remplacee par la connexion SSO (bloc 2) ; en attendant,
// chaque champ est verifie strictement (audit L5, M1).
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
    .min(8, "Le mot de passe doit contenir au moins 8 caractères.")
    .max(72, "Le mot de passe ne doit pas dépasser 72 caractères."),
});

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, registerSchema);
  if (!parsed.ok) return parsed.response;
  const { name, email, password } = parsed.data;

  // Comparaison insensible a la casse, comme a la connexion (lib/auth.ts).
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "Un compte existe déjà avec cet email." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, passwordHash },
  });

  return NextResponse.json({ id: user.id, email: user.email });
}
