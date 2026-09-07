import { prisma } from "@/lib/prisma";
import type { Health } from "@/lib/health";

// Un jalon "a risque" est un jalon pas encore passe, mais rattache a une roadmap dont la
// sante globale est actuellement "orange" ou "rouge". Contrairement au compteur "jalons en
// retard" (deja passes), celui-ci sert a anticiper avant que la date soit depassee.
export async function getMilestonesAtRiskCount(
  workspaceId: string,
  healthByRoadmapId: Map<string, Health>
): Promise<number> {
  const now = new Date();
  const upcomingMilestones = await prisma.milestone.findMany({
    where: { date: { gte: now }, roadmap: { workspaceId } },
    select: { roadmapId: true },
  });

  return upcomingMilestones.filter((m) => {
    const health = healthByRoadmapId.get(m.roadmapId);
    return health === "orange" || health === "red";
  }).length;
}
