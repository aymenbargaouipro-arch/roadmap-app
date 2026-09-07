import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Map as MapIcon, Upload } from "lucide-react";
import { RoadmapCreateModal } from "@/components/roadmap-create-modal";
import { fetchWorkspaceRoadmapHealth } from "@/lib/roadmap-health";
import { ensureTodayHealthSnapshot, getHealthTrendSeries } from "@/lib/health-history";
import { getAttentionItems } from "@/lib/attention-items";
import { getWorkspaceHealthThresholds } from "@/lib/health-thresholds";
import { getInterTeamDependencyEdges, getStaleInterTeamDependencyCount } from "@/lib/cross-team-metrics";
import { getMilestonesAtRiskCount } from "@/lib/milestones-at-risk";
import { HealthBadge } from "@/components/status-badge";
import { DashboardKpis } from "@/components/dashboard-kpis";
import { AttentionPanel } from "@/components/attention-panel";
import { RoadmapCard } from "@/components/roadmap-card";
import { HealthTrendChart } from "@/components/health-trend-chart";
import { TeamDependencyGraph } from "@/components/team-dependency-graph";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    include: {
      workspace: {
        include: {
          roadmaps: {
            include: {
              items: true,
              risks: true,
              milestones: { select: { title: true, date: true } },
            },
            orderBy: { position: "asc" },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) redirect("/workspace/new");

  const { roadmaps } = membership.workspace;
  const workspaceId = membership.workspaceId;

  const thresholds = await getWorkspaceHealthThresholds(workspaceId);

  if (roadmaps.length > 0) {
    await ensureTodayHealthSnapshot(workspaceId, thresholds);
  }

  const now = new Date();
  const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [
    healthRows,
    healthTrendSeries,
    attentionItems,
    strongOpenRisksCount,
    blockedItemsCount,
    upcomingMilestonesCount,
    overdueMilestonesCount,
    interTeamDependencyEdges,
    staleInterTeamDependencyCount,
    totalItemsCount,
    completedItemsCount,
  ] = await Promise.all([
    fetchWorkspaceRoadmapHealth(workspaceId, thresholds),
    getHealthTrendSeries(workspaceId),
    getAttentionItems(workspaceId),
    prisma.risk.count({
      where: { status: "OPEN", roadmap: { workspaceId }, OR: [{ impact: "HIGH" }, { probability: "HIGH" }] },
    }),
    prisma.item.count({ where: { status: "BLOCKED", roadmap: { workspaceId } } }),
    prisma.milestone.count({ where: { roadmap: { workspaceId }, date: { gte: now, lte: in14Days } } }),
    prisma.milestone.count({ where: { roadmap: { workspaceId }, date: { lt: now } } }),
    getInterTeamDependencyEdges(workspaceId),
    getStaleInterTeamDependencyCount(workspaceId),
    prisma.item.count({ where: { roadmap: { workspaceId } } }),
    prisma.item.count({ where: { roadmap: { workspaceId }, status: "DONE" } }),
  ]);

  const healthCounts = {
    green: healthRows.filter((r) => r.health === "green").length,
    orange: healthRows.filter((r) => r.health === "orange").length,
    red: healthRows.filter((r) => r.health === "red").length,
  };

  const healthById = new Map(healthRows.map((r) => [r.id, r.health]));
  const programHealth = healthCounts.red > 0 ? "red" : healthCounts.orange > 0 ? "orange" : "green";

  const milestonesAtRiskCount = await getMilestonesAtRiskCount(workspaceId, healthById);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Dashboard</h1>
          <div className="flex items-center gap-2">
            <p className="text-sm text-ink-muted">{membership.workspace.name}</p>
            {roadmaps.length > 0 && (
              <span
                title="Santé globale du programme : reflète la pire situation parmi toutes les roadmaps (Critique si au moins une roadmap est critique, sinon À surveiller si au moins une l'est, sinon Sain)."
                className="cursor-help"
              >
                <HealthBadge health={programHealth} />
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/import">
            <Button size="sm" variant="outline" className="gap-1.5">
              <Upload size={15} />
              Importer
            </Button>
          </Link>
          <RoadmapCreateModal />
        </div>
      </div>

      {roadmaps.length > 0 && (
        <>
          <DashboardKpis
            blockedItemsCount={blockedItemsCount}
            strongOpenRisksCount={strongOpenRisksCount}
            upcomingMilestonesCount={upcomingMilestonesCount}
            overdueMilestonesCount={overdueMilestonesCount}
            completedItemsCount={completedItemsCount}
            totalItemsCount={totalItemsCount}
            milestonesAtRiskCount={milestonesAtRiskCount}
            staleInterTeamDependencyCount={staleInterTeamDependencyCount}
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <HealthTrendChart points={healthTrendSeries} totalRoadmaps={roadmaps.length} />
            <TeamDependencyGraph edges={interTeamDependencyEdges} />
          </div>

          <AttentionPanel items={attentionItems} />
        </>
      )}

      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">Roadmaps</h2>

        {roadmaps.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface py-20 text-center">
            <MapIcon className="mb-3 text-ink-muted" size={28} />
            <h2 className="text-base font-medium text-ink">Aucune roadmap pour l'instant</h2>
            <p className="mt-1 max-w-sm text-sm text-ink-muted">
              Créez votre première roadmap pour commencer à planifier vos items et jalons.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <RoadmapCreateModal label="Créer une roadmap" />
              <Link href="/import">
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Upload size={15} />
                  Importer un Excel
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {roadmaps.map((roadmap) => (
              <RoadmapCard
                key={roadmap.id}
                id={roadmap.id}
                name={roadmap.name}
                health={healthById.get(roadmap.id) ?? "green"}
                items={roadmap.items}
                risks={roadmap.risks}
                milestones={roadmap.milestones}
                color={roadmap.color}
                icon={roadmap.icon}
                logoUrl={roadmap.logoUrl}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
