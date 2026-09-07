import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const { title, impact, probability } = await req.json();
  if (!title?.trim() || !impact || !probability) {
    return NextResponse.json({ error: "Champs requis manquants." }, { status: 400 });
  }

  const risk = await prisma.risk.create({
    data: {
      title: title.trim(),
      impact,
      probability,
      roadmapId: params.id,
    },
  });

  return NextResponse.json(risk);
}
