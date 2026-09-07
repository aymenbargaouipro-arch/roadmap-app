import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });

  const lateRatioRedThreshold = Math.round(Number(body.lateRatioRedThreshold));
  const lateCountOrangeThreshold = Math.round(Number(body.lateCountOrangeThreshold));

  if (
    Number.isNaN(lateRatioRedThreshold) ||
    Number.isNaN(lateCountOrangeThreshold) ||
    lateRatioRedThreshold < 0 ||
    lateRatioRedThreshold > 100 ||
    lateCountOrangeThreshold < 0
  ) {
    return NextResponse.json({ error: "Valeurs numériques invalides." }, { status: 400 });
  }

  await prisma.workspace.update({
    where: { id: membership.workspaceId },
    data: {
      healthLateRatioRedThreshold: lateRatioRedThreshold,
      healthLateCountOrangeThreshold: lateCountOrangeThreshold,
      healthBlockedItemTriggersRed: Boolean(body.blockedItemTriggersRed),
      healthActiveDependencyTriggersRed: Boolean(body.activeDependencyTriggersRed),
      healthHighRiskTriggersRed: Boolean(body.highRiskTriggersRed),
      healthMediumRiskTriggersOrange: Boolean(body.mediumRiskTriggersOrange),
    },
  });

  return NextResponse.json({ ok: true });
}
