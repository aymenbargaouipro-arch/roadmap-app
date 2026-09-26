import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoadmapMember } from "@/lib/access";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const access = await requireRoadmapMember(params.id, session.user.id);
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const date = body?.date ? new Date(body.date) : null;
  if (!title || !date) {
    return NextResponse.json({ error: "Titre et date requis." }, { status: 400 });
  }
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }

  const milestone = await prisma.milestone.create({
    data: { title: title.slice(0, 500), date, roadmapId: params.id },
  });

  return NextResponse.json(milestone);
}
