import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recomputeEpicAggregates } from "@/lib/item-hierarchy";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const { title, startDate, endDate, parentId } = await req.json();
  if (!title?.trim() || !startDate || !endDate) {
    return NextResponse.json({ error: "Titre et dates requis." }, { status: 400 });
  }
  if (new Date(endDate) < new Date(startDate)) {
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
      title: title.trim(),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
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
