import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceAdmin } from "@/lib/access";

// Revocation d'un lien d'invitation (audit M2) : le lien cesse immediatement de fonctionner.
// Les membres qui l'ont deja utilise restent membres (a retirer depuis la liste des membres).
export async function DELETE(_req: Request, { params }: { params: { id: string; inviteId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const access = await requireWorkspaceAdmin(params.id, session.user.id);
  if (!access.ok) return access.response;

  const result = await prisma.invite.updateMany({
    where: { id: params.inviteId, workspaceId: params.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Invitation introuvable ou déjà révoquée." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
