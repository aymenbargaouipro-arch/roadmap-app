import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { inviteState } from "@/lib/invites";

const INVALID_MESSAGE = "Invitation invalide, expirée ou déjà utilisée. Demande un nouveau lien à ton administrateur.";

class InviteUnavailableError extends Error {}

export async function POST(_req: Request, { params }: { params: { token: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const invite = await prisma.invite.findUnique({ where: { token: params.token } });
  if (!invite || inviteState(invite) !== "active") {
    return NextResponse.json({ error: INVALID_MESSAGE }, { status: 404 });
  }

  const existing = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId: session.user.id, workspaceId: invite.workspaceId } },
  });
  if (existing) {
    // Deja membre : on ne consomme pas le lien, et on ne change pas son role (une promotion
    // se fait depuis la page Membres, jamais via un lien).
    return NextResponse.json({ workspaceId: invite.workspaceId, alreadyMember: true });
  }

  // Consommation atomique : la mise a jour ne passe que si le lien est toujours actif AU
  // MOMENT de l'ecriture. Deux personnes qui cliquent en meme temps sur un lien a usage
  // unique ne peuvent donc pas l'utiliser toutes les deux.
  try {
    await prisma.$transaction(async (tx) => {
      const consumed = await tx.invite.updateMany({
        where: {
          id: invite.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          ...(invite.maxUses != null ? { useCount: { lt: invite.maxUses } } : {}),
        },
        data: { useCount: { increment: 1 } },
      });
      if (consumed.count === 0) throw new InviteUnavailableError();

      await tx.membership.create({
        data: { userId: session.user.id, workspaceId: invite.workspaceId, role: invite.role },
      });
    });
  } catch (err) {
    if (err instanceof InviteUnavailableError) {
      return NextResponse.json({ error: INVALID_MESSAGE }, { status: 404 });
    }
    throw err;
  }

  return NextResponse.json({ workspaceId: invite.workspaceId, alreadyMember: false });
}
