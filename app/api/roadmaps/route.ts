import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const { name, description } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Nom requis." }, { status: 400 });
  }

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) {
    return NextResponse.json({ error: "Aucun espace de travail." }, { status: 400 });
  }

  const count = await prisma.roadmap.count({ where: { workspaceId: membership.workspaceId } });

  const roadmap = await prisma.roadmap.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      position: count,
      workspaceId: membership.workspaceId,
    },
  });

  return NextResponse.json(roadmap);
}
