import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { optionalText, parseJsonBody, requiredText } from "@/lib/validation";

const createRoadmapSchema = z.object({
  name: requiredText(200, "Nom requis."),
  description: optionalText(2000),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const parsed = await parseJsonBody(req, createRoadmapSchema);
  if (!parsed.ok) return parsed.response;
  const { name, description } = parsed.data;

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
      name,
      description,
      position: count,
      workspaceId: membership.workspaceId,
    },
  });

  return NextResponse.json(roadmap);
}
