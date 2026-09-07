import { prisma } from "@/lib/prisma";

// Compte uniquement les dependances PENDING qui traversent une frontiere d'equipe :
// - targetKind TEAM : cible une roadmap entiere par definition inter-equipe
// - targetKind ITEM : compte seulement si l'item source et l'item cible sont dans deux
//   roadmaps differentes (une dependance entre deux items de la MEME roadmap n'est pas
//   inter-equipe, meme si elle est bloquante)
// - targetKind EXTERNAL : jamais compte, ce n'est pas une autre equipe mais un systeme tiers
export async function getInterTeamDependencyCount(workspaceId: string): Promise<number> {
  const dependencies = await prisma.dependency.findMany({
    where: {
      status: "PENDING",
      OR: [
        { blockingItem: { roadmap: { workspaceId } } },
        { blockedItem: { roadmap: { workspaceId } } },
        { targetRoadmap: { workspaceId } },
      ],
    },
    select: {
      targetKind: true,
      blockingItem: { select: { roadmapId: true } },
      blockedItem: { select: { roadmapId: true } },
    },
  });

  return dependencies.filter((d) => {
    if (d.targetKind === "EXTERNAL") return false;
    if (d.targetKind === "TEAM") return true;
    return (
      d.blockingItem?.roadmapId != null &&
      d.blockedItem?.roadmapId != null &&
      d.blockingItem.roadmapId !== d.blockedItem.roadmapId
    );
  }).length;
}

export type TeamDependencyEdge = {
  fromRoadmapId: string;
  fromRoadmapName: string;
  toRoadmapId: string;
  toRoadmapName: string;
};

// Liste les arcs "equipe source -> equipe cible" pour les dependances PENDING inter-equipes
// (meme definition que getInterTeamDependencyCount ci-dessus). Sert au mini-graphe du
// dashboard : contrairement au compteur, on a ici besoin des deux roadmaps de chaque arc.
export async function getInterTeamDependencyEdges(workspaceId: string): Promise<TeamDependencyEdge[]> {
  const dependencies = await prisma.dependency.findMany({
    where: {
      status: "PENDING",
      OR: [
        { blockingItem: { roadmap: { workspaceId } } },
        { blockedItem: { roadmap: { workspaceId } } },
        { targetRoadmap: { workspaceId } },
      ],
    },
    select: {
      targetKind: true,
      blockingItem: { select: { roadmap: { select: { id: true, name: true } } } },
      blockedItem: { select: { roadmap: { select: { id: true, name: true } } } },
      targetRoadmap: { select: { id: true, name: true } },
    },
  });

  const edges: TeamDependencyEdge[] = [];
  for (const d of dependencies) {
    if (d.targetKind === "EXTERNAL") continue;
    const fromRoadmap = d.blockingItem?.roadmap;
    if (!fromRoadmap) continue;

    if (d.targetKind === "TEAM" && d.targetRoadmap) {
      edges.push({
        fromRoadmapId: fromRoadmap.id,
        fromRoadmapName: fromRoadmap.name,
        toRoadmapId: d.targetRoadmap.id,
        toRoadmapName: d.targetRoadmap.name,
      });
      continue;
    }

    const toRoadmap = d.blockedItem?.roadmap;
    if (toRoadmap && toRoadmap.id !== fromRoadmap.id) {
      edges.push({
        fromRoadmapId: fromRoadmap.id,
        fromRoadmapName: fromRoadmap.name,
        toRoadmapId: toRoadmap.id,
        toRoadmapName: toRoadmap.name,
      });
    }
  }

  return edges;
}

const STALE_DEPENDENCY_DAYS = 5;

// Sous-ensemble des dependances inter-equipes (meme definition que getInterTeamDependencyCount)
// qui trainent depuis plus de STALE_DEPENDENCY_DAYS jours - le signal de coordination qui
// derape vraiment, plutot que le simple total de dependances en attente.
export async function getStaleInterTeamDependencyCount(workspaceId: string): Promise<number> {
  const threshold = new Date(Date.now() - STALE_DEPENDENCY_DAYS * 24 * 60 * 60 * 1000);
  const dependencies = await prisma.dependency.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: threshold },
      OR: [
        { blockingItem: { roadmap: { workspaceId } } },
        { blockedItem: { roadmap: { workspaceId } } },
        { targetRoadmap: { workspaceId } },
      ],
    },
    select: {
      targetKind: true,
      blockingItem: { select: { roadmapId: true } },
      blockedItem: { select: { roadmapId: true } },
    },
  });

  return dependencies.filter((d) => {
    if (d.targetKind === "EXTERNAL") return false;
    if (d.targetKind === "TEAM") return true;
    return (
      d.blockingItem?.roadmapId != null &&
      d.blockedItem?.roadmapId != null &&
      d.blockingItem.roadmapId !== d.blockedItem.roadmapId
    );
  }).length;
}

// Nombre de passages a "Termine" (via StatusHistory) cette semaine glissante vs la semaine
// precedente. Un item importe deja au statut Termine (sans entree d'historique) n'est
// compte dans aucune des deux fenetres - limite connue, coherente avec le reste du
// dashboard qui s'appuie sur StatusHistory quand elle existe.
export async function getVelocity(workspaceId: string): Promise<Velocity> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [thisWeek, previousWeek] = await Promise.all([
    prisma.statusHistory.count({
      where: { status: "DONE", changedAt: { gte: weekAgo, lte: now }, item: { roadmap: { workspaceId } } },
    }),
    prisma.statusHistory.count({
      where: {
        status: "DONE",
        changedAt: { gte: twoWeeksAgo, lt: weekAgo },
        item: { roadmap: { workspaceId } },
      },
    }),
  ]);

  return { thisWeek, previousWeek };
}
