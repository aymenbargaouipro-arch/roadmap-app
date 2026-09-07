import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, { params }: { params: { token: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const invite = await prisma.invite.findUnique({ where: { token: params.token } });
  if (!invite) {
    return NextResponse.json({ error: "Invitation invalide ou expirée." }, { status: 404 });
  }

  const existing = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId: session.user.id, workspaceId: invite.workspaceId } },
  });
  if (existing) {
    return NextResponse.json({ workspaceId: invite.workspaceId, alreadyMember: true });
  }

  await prisma.membership.create({
    data: { userId: session.user.id, workspaceId: invite.workspaceId, role: invite.role },
  });

  return NextResponse.json({ workspaceId: invite.workspaceId, alreadyMember: false });
}
