import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceAdmin } from "@/lib/access";

// Gestion des membres par un admin (audit M2) : changement de role et retrait.
// Garde-fou commun : un workspace doit toujours garder au moins un admin.

async function loadTarget(workspaceId: string, userId: string) {
  return prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    select: { id: true, role: true },
  });
}

async function isLastAdmin(workspaceId: string, targetRole: string): Promise<boolean> {
  if (targetRole !== "ADMIN") return false;
  const adminCount = await prisma.membership.count({ where: { workspaceId, role: "ADMIN" } });
  return adminCount <= 1;
}

export async function PATCH(req: Request, { params }: { params: { id: string; userId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const access = await requireWorkspaceAdmin(params.id, session.user.id);
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => null);
  const role = body?.role;
  if (role !== "ADMIN" && role !== "MEMBER") {
    return NextResponse.json({ error: "Rôle invalide." }, { status: 400 });
  }

  const target = await loadTarget(params.id, params.userId);
  if (!target) return NextResponse.json({ error: "Membre introuvable." }, { status: 404 });
  if (target.role === role) return NextResponse.json({ ok: true, role });

  if (role === "MEMBER" && (await isLastAdmin(params.id, target.role))) {
    return NextResponse.json(
      { error: "Impossible : c'est le dernier administrateur de l'espace. Nomme d'abord un autre admin." },
      { status: 400 }
    );
  }

  await prisma.membership.update({ where: { id: target.id }, data: { role } });
  return NextResponse.json({ ok: true, role });
}

export async function DELETE(_req: Request, { params }: { params: { id: string; userId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const access = await requireWorkspaceAdmin(params.id, session.user.id);
  if (!access.ok) return access.response;

  const target = await loadTarget(params.id, params.userId);
  if (!target) return NextResponse.json({ error: "Membre introuvable." }, { status: 404 });

  if (await isLastAdmin(params.id, target.role)) {
    return NextResponse.json(
      { error: "Impossible : c'est le dernier administrateur de l'espace. Nomme d'abord un autre admin." },
      { status: 400 }
    );
  }

  // Le retrait prend effet immediatement : chaque requete reverifie l'appartenance au
  // workspace (lib/access.ts). Les items dont il etait responsable dans cet espace sont
  // desassignes, pour ne pas garder un responsable qui n'y a plus acces.
  await prisma.$transaction([
    prisma.item.updateMany({
      where: { ownerId: params.userId, roadmap: { workspaceId: params.id } },
      data: { ownerId: null },
    }),
    prisma.membership.delete({ where: { id: target.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
