import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceAdmin } from "@/lib/access";
import { inviteDefaults, inviteState, newInviteToken } from "@/lib/invites";

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const access = await requireWorkspaceAdmin(params.id, session.user.id);
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => null);
  const role = body?.role === "ADMIN" ? "ADMIN" : "MEMBER";

  const invite = await prisma.invite.create({
    data: { token: newInviteToken(), role, workspaceId: params.id, ...inviteDefaults(role) },
  });

  // Le token n'est renvoye qu'ici, a la creation : la liste des invitations ne l'expose plus.
  return NextResponse.json({
    id: invite.id,
    token: invite.token,
    role: invite.role,
    expiresAt: invite.expiresAt,
    maxUses: invite.maxUses,
  });
}

// Liste des invitations encore utilisables, sans leur token (un lien deja partage ne peut
// pas etre recopie depuis cette liste, seulement revoque).
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const access = await requireWorkspaceAdmin(params.id, session.user.id);
  if (!access.ok) return access.response;

  const invites = await prisma.invite.findMany({
    where: { workspaceId: params.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, role: true, createdAt: true, expiresAt: true, maxUses: true, useCount: true, revokedAt: true },
  });

  return NextResponse.json(
    invites
      .filter((i) => inviteState(i) === "active")
      .map(({ revokedAt: _revokedAt, ...rest }) => rest)
  );
}
