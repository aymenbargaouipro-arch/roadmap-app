import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncRoadmapFromJira } from "@/lib/jira-sync";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const roadmap = await prisma.roadmap.findUnique({
    where: { id: params.id },
    select: { workspaceId: true },
  });
  if (!roadmap) return NextResponse.json({ error: "Roadmap introuvable." }, { status: 404 });

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspaceId: roadmap.workspaceId },
  });
  if (!membership) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const result = await syncRoadmapFromJira(params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true, summary: result.summary });
}
