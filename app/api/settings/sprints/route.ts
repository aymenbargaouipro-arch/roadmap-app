import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseJsonBody, requiredDate, roundedInt } from "@/lib/validation";

const sprintsSchema = z.object({
  referenceDate: requiredDate("Date de référence invalide."),
  durationWeeks: roundedInt(1, 52, "Durée en semaines invalide (entre 1 et 52)."),
  referenceNumber: roundedInt(0, 100000, "Numéro de sprint invalide."),
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

  const parsed = await parseJsonBody(req, sprintsSchema);
  if (!parsed.ok) return parsed.response;
  const { referenceDate, durationWeeks, referenceNumber } = parsed.data;

  await prisma.workspace.update({
    where: { id: membership.workspaceId },
    data: {
      sprintReferenceDate: referenceDate,
      sprintDurationWeeks: durationWeeks,
      sprintReferenceNumber: referenceNumber,
    },
  });

  return NextResponse.json({ ok: true });
}
