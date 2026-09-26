import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recomputeEpicAggregates } from "@/lib/item-hierarchy";
import { requireRoadmapMember } from "@/lib/access";
import { parseDateInput } from "@/lib/validation";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const access = await requireRoadmapMember(params.id, session.user.id);
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 500) : "";
  const startDate = parseDateInput(body.startDate);
  const endDate = parseDateInput(body.endDate);
  const parentId = typeof body.parentId === "string" && body.parentId ? body.parentId : null;
  if (!title || !startDate || !endDate) {
    return NextResponse.json({ error: "Titre et dates valides requis." }, { status: 400 });
  }
  if (endDate < startDate) {
    return NextResponse.json(
      { error: "La date de fin doit être après la date de début." },
      { status: 400 }
    );
  }

  let validParentId: string | null = null;
  if (parentId) {
    const target = await prisma.item.findUnique({ where: { id: parentId } });
    if (!target || target.roadmapId !== params.id) {
      return NextResponse.json({ error: "Epic cible introuvable dans cette roadmap." }, { status: 400 });
    }
    if (target.parentId) {
      return NextResponse.json(
        { error: "Impossible : cet item est déjà un sous-item, un seul niveau de hiérarchie est autorisé." },
        { status: 400 }
      );
    }
    validParentId = parentId;
  }

  const count = await prisma.item.count({ where: { roadmapId: params.id } });

  const item = await prisma.item.create({
    data: {
      title,
      startDate,
      endDate,
      position: count,
      roadmapId: params.id,
      ownerId: session.user.id,
      parentId: validParentId,
      statusLog: { create: { status: "TODO" } },
    },
  });

  if (validParentId) {
    await recomputeEpicAggregates(validParentId);
  }

  return NextResponse.json(item);
}

