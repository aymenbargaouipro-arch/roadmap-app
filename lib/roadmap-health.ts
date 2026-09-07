import { prisma } from "@/lib/prisma";
import { computeHealth, DEFAULT_HEALTH_THRESHOLDS, type Health, type HealthThresholds } from "@/lib/health";

export type RoadmapHealthRow = {
  id: string;
  name: string;
  health: Health;
  itemCount: number;
  lateCount: number;
  openRiskCount: number;
  dependencyCount: number;
};

// Reprend exactement la regle de classification des dependances utilisee dans
// app/(app)/consolidated/page.tsx et app/(app)/roadmaps/[id]/page.tsx (une dependance
// "bloquante" = son statut est PENDING), pour que la sante calculee ici soit toujours
// identique a celle affichee sur ces deux pages. Duplique volontairement plutot que de
// toucher a ces fichiers en dehors des seuils de sante.
export async function fetchWorkspaceRoadmapHealth(
  workspaceId: string,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS
): Promise<RoadmapHealthRow[]> {
  const roadmaps = await prisma.roadmap.findMany({
    where: { workspaceId },
    orderBy: { position: "asc" },
    select: {
      id: true,
      name: true,
      items: { select: { id: true, status: true, endDate: true } },
      risks: { select: { status: true, impact: true, probability: true } },
    },
  });

  const dependencies = await prisma.dependency.findMany({
    where: {
      OR: [
        { blockingItem: { roadmap: { workspaceId } } },
        { blockedItem: { roadmap: { workspaceId } } },
      ],
    },
    select: {
      status: true,
      blockedItemId: true,
      blockingItem: { select: { roadmapId: true } },
      blockedItem: { select: { roadmapId: true } },
    },
  });

  const now = new Date();

  return roadmaps.map((roadmap) => {
    const roadmapItemIds = new Set(roadmap.items.map((i) => i.id));
    const blockingDependencies = dependencies
      .filter((d) => d.blockedItemId && roadmapItemIds.has(d.blockedItemId))
      .map((d) => ({ blocking: d.status === "PENDING" }));

    const health = computeHealth(roadmap.items, roadmap.risks, blockingDependencies, thresholds);
    const lateCount = roadmap.items.filter((i) => i.status !== "DONE" && i.endDate < now).length;
    const openRiskCount = roadmap.risks.filter((r) => r.status === "OPEN").length;
    const dependencyCount = dependencies.filter(
      (d) => d.blockingItem?.roadmapId === roadmap.id || d.blockedItem?.roadmapId === roadmap.id
    ).length;

    return {
      id: roadmap.id,
      name: roadmap.name,
      health,
      itemCount: roadmap.items.length,
      lateCount,
      openRiskCount,
      dependencyCount,
    };
  });
}
