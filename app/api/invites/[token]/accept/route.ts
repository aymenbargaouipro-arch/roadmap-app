import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { consumeInvite, inviteState } from "@/lib/invites";
import { ALREADY_IN_WORKSPACE_MESSAGE, INVITE_INVALID_MESSAGE, lockInstance } from "@/lib/instance-access";

// Acceptation d'une invitation par un compte deja connecte. Un compte n'appartient qu'a un
// seul espace (audit M1) : un compte deja rattache a un AUTRE espace est refuse.

class InviteUnavailableError extends Error {}
class AlreadyInWorkspaceError extends Error {}

export async function POST(_req: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const userId = session.user.id;

  const invite = await prisma.invite.findUnique({ where: { token: params.token } });
  if (!invite || inviteState(invite) !== "active") {
    return NextResponse.json({ error: INVITE_INVALID_MESSAGE }, { status: 404 });
  }
  const activeInvite = invite;

  const existing = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: invite.workspaceId } },
  });
  if (existing) {
    // Deja membre : on ne consomme pas le lien, et on ne change pas son role (une promotion
    // se fait depuis la page Membres, jamais via un lien).
    return NextResponse.json({ workspaceId: invite.workspaceId, alreadyMember: true });
  }

  // Sous verrou d'instance : deux acceptations simultanees de liens d'espaces differents ne
  // peuvent pas rattacher le meme compte a deux espaces.
  try {
    await prisma.$transaction(async (tx) => {
      await lockInstance(tx);

      const otherMembership = await tx.membership.findFirst({ where: { userId }, select: { id: true } });
      if (otherMembership) throw new AlreadyInWorkspaceError();

      const consumed = await consumeInvite(tx, activeInvite);
      if (!consumed) throw new InviteUnavailableError();

      await tx.membership.create({
        data: { userId, workspaceId: activeInvite.workspaceId, role: activeInvite.role },
      });
    });
  } catch (err) {
    if (err instanceof InviteUnavailableError) {
      return NextResponse.json({ error: INVITE_INVALID_MESSAGE }, { status: 404 });
    }
    if (err instanceof AlreadyInWorkspaceError) {
      return NextResponse.json({ error: ALREADY_IN_WORKSPACE_MESSAGE }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({ workspaceId: invite.workspaceId, alreadyMember: false });
}
