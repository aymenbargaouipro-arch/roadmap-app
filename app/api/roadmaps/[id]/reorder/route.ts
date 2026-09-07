import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const { orderedIds }: { orderedIds: string[] } = await req.json();
  if (!Array.isArray(orderedIds)) {
    return NextResponse.json({ error: "orderedIds requis." }, { status: 400 });
  }

  await prisma.$transaction(
    orderedIds.map((itemId, index) =>
      prisma.item.update({ where: { id: itemId }, data: { position: index } })
    )
  );

  return NextResponse.json({ ok: true });
}
