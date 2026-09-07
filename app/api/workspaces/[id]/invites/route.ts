import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { randomBytes } from "crypto";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const membership = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId: session.user.id, workspaceId: params.id } },
  });
  if (!membership || membership.role !== "ADMIN") {
    return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 });
  }

  const { role } = await req.json();
  const token = randomBytes(12).toString("hex");

  const invite = await prisma.invite.create({
    data: { token, role: role === "ADMIN" ? "ADMIN" : "MEMBER", workspaceId: params.id },
  });

  return NextResponse.json(invite);
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const membership = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId: session.user.id, workspaceId: params.id } },
  });
  if (!membership || membership.role !== "ADMIN") {
    return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 });
  }

  const invites = await prisma.invite.findMany({
    where: { workspaceId: params.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(invites);
}
