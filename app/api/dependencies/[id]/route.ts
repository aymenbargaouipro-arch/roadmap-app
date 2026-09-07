import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (body.status !== "PENDING" && body.status !== "RESOLVED") {
      return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
    }
    data.status = body.status;
  }

  if (body.type !== undefined) {
    if (!["FD", "DD", "FF", "DF"].includes(body.type)) {
      return NextResponse.json({ error: "Type invalide." }, { status: 400 });
    }
    data.type = body.type;
  }

  if (body.note !== undefined) {
    data.note = typeof body.note === "string" ? body.note.trim() || null : null;
  }
  if (body.curveOffsetX !== undefined) {
    data.curveOffsetX = typeof body.curveOffsetX === "number" ? body.curveOffsetX : null;
  }
  if (body.curveOffsetY !== undefined) {
    data.curveOffsetY = typeof body.curveOffsetY === "number" ? body.curveOffsetY : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Aucune modification fournie." }, { status: 400 });
  }

  try {
    const dependency = await prisma.dependency.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json(dependency);
  } catch (err) {
    console.error("PATCH /api/dependencies/[id] failed:", err);
    return NextResponse.json({ error: "Dépendance introuvable." }, { status: 404 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  try {
    await prisma.dependency.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/dependencies/[id] failed:", err);
    return NextResponse.json({ error: "Dépendance introuvable." }, { status: 404 });
  }
}
