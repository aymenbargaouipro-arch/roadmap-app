import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireMilestoneMember } from "@/lib/access";

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const access = await requireMilestoneMember(params.id, session.user.id);
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });

  const data: Record<string, unknown> = {};

  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 500);
  if (body.date) {
    const date = new Date(body.date);
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: "Date invalide." }, { status: 400 });
    }
    data.date = date;
  }

  const milestone = await prisma.milestone.update({ where: { id: params.id }, data });
  return NextResponse.json(milestone);
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const access = await requireMilestoneMember(params.id, session.user.id);
  if (!access.ok) return access.response;

  await prisma.milestone.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
