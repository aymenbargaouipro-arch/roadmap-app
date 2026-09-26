import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkbox, parseJsonBody, roundedInt } from "@/lib/validation";

// Les cases a cocher doivent etre de vrais booleens : avant, n'importe quelle valeur non vide
// (y compris le texte "false") etait interpretee comme "coche" (audit L5).
const healthSchema = z.object({
  lateRatioRedThreshold: roundedInt(0, 100, "Le seuil de retard doit être entre 0 et 100 %."),
  lateCountOrangeThreshold: roundedInt(0, 10000, "Le nombre d'items en retard doit être un nombre positif."),
  blockedItemTriggersRed: checkbox,
  activeDependencyTriggersRed: checkbox,
  highRiskTriggersRed: checkbox,
  mediumRiskTriggersOrange: checkbox,
});

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return NextResponse.json({ error: "Aucun espace de travail." }, { status: 400 });
  if (membership.role !== "ADMIN") {
    return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 });
  }

  const parsed = await parseJsonBody(req, healthSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  await prisma.workspace.update({
    where: { id: membership.workspaceId },
    data: {
      healthLateRatioRedThreshold: body.lateRatioRedThreshold,
      healthLateCountOrangeThreshold: body.lateCountOrangeThreshold,
      healthBlockedItemTriggersRed: body.blockedItemTriggersRed,
      healthActiveDependencyTriggersRed: body.activeDependencyTriggersRed,
      healthHighRiskTriggersRed: body.highRiskTriggersRed,
      healthMediumRiskTriggersOrange: body.mediumRiskTriggersOrange,
    },
  });

  return NextResponse.json({ ok: true });
}
