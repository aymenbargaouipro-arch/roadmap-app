import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const { title, date } = await req.json();
  if (!title?.trim() || !date) {
    return NextResponse.json({ error: "Titre et date requis." }, { status: 400 });
  }

  const milestone = await prisma.milestone.create({
    data: { title: title.trim(), date: new Date(date), roadmapId: params.id },
  });

  return NextResponse.json(milestone);
}
