import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Controle d'acces au niveau objet (audit C1).
// Chaque objet remonte a son workspace (dependance -> item -> roadmap -> workspace,
// jalon | risque | item -> roadmap -> workspace). Un utilisateur n'y a acces que s'il a une
// membership dans ce workspace. Reponse 404 identique pour "n'existe pas" et "pas a toi",
// pour ne pas reveler l'existence d'objets appartenant a d'autres equipes.

type Denied = { ok: false; response: NextResponse };

function denied(message: string): Denied {
  return { ok: false, response: NextResponse.json({ error: message }, { status: 404 }) };
}

async function roleIn(userId: string, workspaceId: string): Promise<Role | null> {
  const membership = await prisma.membership.findFirst({
    where: { userId, workspaceId },
    select: { role: true },
  });
  return membership?.role ?? null;
}

/** Vrai si userId est membre du workspace (sert a verifier un ownerId recu dans un corps). */
export async function isWorkspaceMember(userId: string, workspaceId: string): Promise<boolean> {
  return (await roleIn(userId, workspaceId)) !== null;
}

/** Vrai si l'item existe et appartient a une roadmap du workspace. */
export async function isItemInWorkspace(itemId: string, workspaceId: string): Promise<boolean> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { roadmap: { select: { workspaceId: true } } },
  });
  return item?.roadmap.workspaceId === workspaceId;
}

/** Vrai si la roadmap existe et appartient au workspace. */
export async function isRoadmapInWorkspace(roadmapId: string, workspaceId: string): Promise<boolean> {
  const roadmap = await prisma.roadmap.findUnique({
    where: { id: roadmapId },
    select: { workspaceId: true },
  });
  return roadmap?.workspaceId === workspaceId;
}

export async function requireRoadmapMember(roadmapId: string, userId: string) {
  const roadmap = await prisma.roadmap.findUnique({ where: { id: roadmapId } });
  if (!roadmap) return denied("Roadmap introuvable.");
  const role = await roleIn(userId, roadmap.workspaceId);
  if (!role) return denied("Roadmap introuvable.");
  return { ok: true as const, entity: roadmap, workspaceId: roadmap.workspaceId, role };
}

export async function requireItemMember(itemId: string, userId: string) {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { roadmap: { select: { workspaceId: true } } },
  });
  if (!item) return denied("Item introuvable.");
  const role = await roleIn(userId, item.roadmap.workspaceId);
  if (!role) return denied("Item introuvable.");
  return { ok: true as const, entity: item, workspaceId: item.roadmap.workspaceId, role };
}

export async function requireMilestoneMember(milestoneId: string, userId: string) {
  const milestone = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    include: { roadmap: { select: { workspaceId: true } } },
  });
  if (!milestone) return denied("Jalon introuvable.");
  const role = await roleIn(userId, milestone.roadmap.workspaceId);
  if (!role) return denied("Jalon introuvable.");
  return { ok: true as const, entity: milestone, workspaceId: milestone.roadmap.workspaceId, role };
}

export async function requireRiskMember(riskId: string, userId: string) {
  const risk = await prisma.risk.findUnique({
    where: { id: riskId },
    include: { roadmap: { select: { workspaceId: true } } },
  });
  if (!risk) return denied("Risque introuvable.");
  const role = await roleIn(userId, risk.roadmap.workspaceId);
  if (!role) return denied("Risque introuvable.");
  return { ok: true as const, entity: risk, workspaceId: risk.roadmap.workspaceId, role };
}

export async function requireDependencyMember(dependencyId: string, userId: string) {
  const dependency = await prisma.dependency.findUnique({
    where: { id: dependencyId },
    include: {
      blockingItem: { select: { roadmap: { select: { workspaceId: true } } } },
      blockedItem: { select: { roadmap: { select: { workspaceId: true } } } },
      targetRoadmap: { select: { workspaceId: true } },
    },
  });
  if (!dependency) return denied("Dépendance introuvable.");

  // Une dependance part toujours d'un item reel : on prend le workspace de l'un de ses cotes.
  const workspaceId =
    dependency.blockingItem?.roadmap.workspaceId ??
    dependency.blockedItem?.roadmap.workspaceId ??
    dependency.targetRoadmap?.workspaceId ??
    null;
  if (!workspaceId) return denied("Dépendance introuvable.");

  const role = await roleIn(userId, workspaceId);
  if (!role) return denied("Dépendance introuvable.");
  return { ok: true as const, entity: dependency, workspaceId, role };
}

/** Reserve une action aux administrateurs du workspace (404 si non membre, 403 si membre). */
export async function requireWorkspaceAdmin(workspaceId: string, userId: string) {
  const role = await roleIn(userId, workspaceId);
  if (!role) return denied("Espace de travail introuvable.");
  if (role !== "ADMIN") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 }),
    };
  }
  return { ok: true as const, workspaceId, role };
}
