import { prisma } from "@/lib/prisma";

const STALE_DEPENDENCY_DAYS = 5;

function daysSince(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

export type ActionItem =
  | { kind: "blocked_item"; id: string; title: string; roadmapId: string; roadmapName: string; sinceDays: number }
  | { kind: "overdue_milestone"; id: string; title: string; roadmapId: string; roadmapName: string; daysLate: number }
  | { kind: "open_risk"; id: string; title: string; roadmapId: string; roadmapName: string; sinceDays: number }
  | { kind: "stale_dependency"; id: string; label: string; roadmapId: string; roadmapName: string; sinceDays: number };

function urgencyDays(item: ActionItem): number {
  return item.kind === "overdue_milestone" ? item.daysLate : item.sinceDays;
}

// Rassemble, tous roadmaps confondus dans le workspace, tout ce qui merite une action :
// items bloques, jalons en retard, risques ouverts a fort impact/probabilite, et
// dependances en attente depuis plus de STALE_DEPENDENCY_DAYS jours. Trie du plus ancien
// (donc probablement le plus urgent) au plus recent.
export async function getAttentionItems(workspaceId: string): Promise<ActionItem[]> {
  const now = new Date();
  const items: ActionItem[] = [];

  const blockedItems = await prisma.item.findMany({
    where: { status: "BLOCKED", roadmap: { workspaceId } },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      roadmap: { select: { id: true, name: true } },
      statusLog: { orderBy: { changedAt: "desc" }, take: 1, select: { changedAt: true } },
    },
  });
  for (const it of blockedItems) {
    // Le dernier changement de statut logue donne la date depuis laquelle l'item est
    // BLOQUE ; a defaut d'historique (import Excel, anciennes donnees), on retombe sur
    // la derniere modification de l'item - une approximation raisonnable plutot que rien.
    const since = it.statusLog[0]?.changedAt ?? it.updatedAt;
    items.push({
      kind: "blocked_item",
      id: it.id,
      title: it.title,
      roadmapId: it.roadmap.id,
      roadmapName: it.roadmap.name,
      sinceDays: daysSince(since),
    });
  }

  const overdueMilestones = await prisma.milestone.findMany({
    where: { date: { lt: now }, roadmap: { workspaceId } },
    select: { id: true, title: true, date: true, roadmap: { select: { id: true, name: true } } },
  });
  for (const m of overdueMilestones) {
    items.push({
      kind: "overdue_milestone",
      id: m.id,
      title: m.title,
      roadmapId: m.roadmap.id,
      roadmapName: m.roadmap.name,
      daysLate: daysSince(m.date),
    });
  }

  const risks = await prisma.risk.findMany({
    where: {
      status: "OPEN",
      roadmap: { workspaceId },
      OR: [{ impact: "HIGH" }, { probability: "HIGH" }],
    },
    select: { id: true, title: true, createdAt: true, roadmap: { select: { id: true, name: true } } },
  });
  for (const r of risks) {
    items.push({
      kind: "open_risk",
      id: r.id,
      title: r.title,
      roadmapId: r.roadmap.id,
      roadmapName: r.roadmap.name,
      sinceDays: daysSince(r.createdAt),
    });
  }

  const staleThreshold = new Date(now.getTime() - STALE_DEPENDENCY_DAYS * 86400000);
  const staleDependencies = await prisma.dependency.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: staleThreshold },
      OR: [
        { blockingItem: { roadmap: { workspaceId } } },
        { blockedItem: { roadmap: { workspaceId } } },
      ],
    },
    select: {
      id: true,
      createdAt: true,
      externalSystemName: true,
      targetRoadmap: { select: { id: true, name: true } },
      blockedItem: { select: { title: true, roadmap: { select: { id: true, name: true } } } },
      blockingItem: { select: { title: true, roadmap: { select: { id: true, name: true } } } },
    },
  });
  for (const d of staleDependencies) {
    const roadmap = d.blockedItem?.roadmap ?? d.blockingItem?.roadmap;
    if (!roadmap) continue;

    const label =
      d.blockedItem?.title && d.blockingItem?.title
        ? `${d.blockingItem.title} → ${d.blockedItem.title}`
        : d.externalSystemName
        ? `→ ${d.externalSystemName}`
        : d.targetRoadmap
        ? `→ équipe ${d.targetRoadmap.name}`
        : "Dépendance";

    items.push({
      kind: "stale_dependency",
      id: d.id,
      label,
      roadmapId: roadmap.id,
      roadmapName: roadmap.name,
      sinceDays: daysSince(d.createdAt),
    });
  }

  return items.sort((a, b) => urgencyDays(b) - urgencyDays(a));
}
