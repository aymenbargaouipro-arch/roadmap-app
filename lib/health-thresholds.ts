import { prisma } from "@/lib/prisma";
import { DEFAULT_HEALTH_THRESHOLDS, type HealthThresholds } from "@/lib/health";

export async function getWorkspaceHealthThresholds(workspaceId: string): Promise<HealthThresholds> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      healthLateRatioRedThreshold: true,
      healthLateCountOrangeThreshold: true,
      healthBlockedItemTriggersRed: true,
      healthActiveDependencyTriggersRed: true,
      healthHighRiskTriggersRed: true,
      healthMediumRiskTriggersOrange: true,
    },
  });

  if (!workspace) return DEFAULT_HEALTH_THRESHOLDS;

  return {
    lateRatioRedThreshold: workspace.healthLateRatioRedThreshold,
    lateCountOrangeThreshold: workspace.healthLateCountOrangeThreshold,
    blockedItemTriggersRed: workspace.healthBlockedItemTriggersRed,
    activeDependencyTriggersRed: workspace.healthActiveDependencyTriggersRed,
    highRiskTriggersRed: workspace.healthHighRiskTriggersRed,
    mediumRiskTriggersOrange: workspace.healthMediumRiskTriggersOrange,
  };
}
