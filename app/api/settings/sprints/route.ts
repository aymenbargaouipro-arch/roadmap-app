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

  const { referenceDate, durationWeeks, referenceNumber } = body;

  const parsedDate = referenceDate ? new Date(referenceDate) : null;
  if (!parsedDate || isNaN(parsedDate.getTime())) {
    return NextResponse.json({ error: "Date de référence invalide." }, { status: 400 });
  }

  const durationWeeksNum = Number(durationWeeks);
  if (!Number.isFinite(durationWeeksNum) || durationWeeksNum <= 0) {
    return NextResponse.json({ error: "Durée en semaines invalide (doit être un nombre positif)." }, { status: 400 });
  }

  const referenceNumberNum = Number(referenceNumber);
  if (!Number.isFinite(referenceNumberNum)) {
    return NextResponse.json({ error: "Numéro de sprint invalide." }, { status: 400 });
  }

  await prisma.workspace.update({
    where: { id: membership.workspaceId },
    data: {
      sprintReferenceDate: parsedDate,
      sprintDurationWeeks: Math.round(durationWeeksNum),
      sprintReferenceNumber: Math.round(referenceNumberNum),
    },
  });

  return NextResponse.json({ ok: true });
}
