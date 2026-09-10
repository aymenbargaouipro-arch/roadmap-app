import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeHealth } from "@/lib/health";
import { getWorkspaceHealthThresholds } from "@/lib/health-thresholds";
import { ConsolidatedView } from "@/components/consolidated-view";
import { ShieldAlert } from "lucide-react";

export default async function ConsolidatedPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) redirect("/workspace/new");

  if (membership.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface py-20 text-center">
        <ShieldAlert className="mb-3 text-ink-muted" size={28} />
        <h2 className="text-base font-medium text-ink">Réservé aux administrateurs</h2>
        <p className="mt-1 max-w-sm text-sm text-ink-muted">
          La vue consolidée est visible uniquement par les admins de l'espace.
        </p>
      </div>
    );
  }

  const thresholds = await getWorkspaceHealthThresholds(membership.workspaceId);

  const roadmaps = await prisma.roadmap.findMany({
    where: { workspaceId: membership.workspaceId },
    orderBy: { position: "asc" },
    include: {
      items: {
        where: { jiraHiddenAt: null },
        orderBy: { position: "asc" },
        include: { _count: { select: { blockedBy: true, blocking: true } } },
      },
      risks: true,
    },
  });

  const workspaceItems = await prisma.item.findMany({
    where: { roadmap: { workspaceId: membership.workspaceId } },
    select: { id: true, title: true, roadmap: { select: { id: true, name: true } } },
    orderBy: { title: "asc" },
  });

  const dependencies = await prisma.dependency.findMany({
    where: {
      OR: [
        { blockingItem: { roadmap: { workspaceId: membership.workspaceId } } },
        { blockedItem: { roadmap: { workspaceId: membership.workspaceId } } },
      ],
    },
    select: {
      id: true,
      blockingItemId: true,
      blockedItemId: true,
      type: true,
      status: true,
      curveOffsetX: true,
      curveOffsetY: true,
      blockingItem: { select: { roadmapId: true } },
      blockedItem: { select: { roadmapId: true } },
    },
  });

  const workspaceSprintConfig = await prisma.workspace.findUnique({
    where: { id: membership.workspaceId },
    select: { sprintReferenceDate: true, sprintDurationWeeks: true, sprintReferenceNumber: true },
  });

  const sprintConfig =
    workspaceSprintConfig?.sprintReferenceDate &&
    workspaceSprintConfig.sprintDurationWeeks &&
    workspaceSprintConfig.sprintReferenceNumber != null
      ? {
          referenceDate: workspaceSprintConfig.sprintReferenceDate.toISOString(),
          durationWeeks: workspaceSprintConfig.sprintDurationWeeks,
          referenceNumber: workspaceSprintConfig.sprintReferenceNumber,
        }
      : null;

  // Sante, risques ouverts et dependances : calcules ici sur l'etat REEL (non filtre) de
  // chaque roadmap - ces indicateurs ne doivent pas varier selon les filtres affiches par
  // l'utilisateur (une equipe ne doit pas "paraitre" en meilleure sante juste parce qu'on a
  // filtre ses problemes hors champ de vue).
  const roadmapStats: Record<
    string,
    { health: "green" | "orange" | "red"; openRisksCount: number; dependencyCount: number }
  > = {};

  for (const roadmap of roadmaps) {
    const roadmapItemIds = new Set(roadmap.items.map((i) => i.id));
    const blockingDependencies = dependencies
      .filter((d) => d.blockedItemId && roadmapItemIds.has(d.blockedItemId))
      .map((d) => ({ blocking: d.status === "PENDING" }));

    const health = computeHealth(roadmap.items, roadmap.risks, blockingDependencies, thresholds);
    const openRisksCount = roadmap.risks.filter((r) => r.status === "OPEN").length;
    const dependencyCount = dependencies.filter(
      (d) => d.blockingItem?.roadmapId === roadmap.id || d.blockedItem?.roadmapId === roadmap.id
    ).length;

    roadmapStats[roadmap.id] = { health, openRisksCount, dependencyCount };
  }

  return (
    <ConsolidatedView
        roadmaps={roadmaps.map((r) => ({
          id: r.id,
          name: r.name,
          color: r.color,
          icon: r.icon,
          logoUrl: r.logoUrl,
          jiraProjectKey: r.jiraProjectKey,
          jiraLastSyncAt: r.jiraLastSyncAt ? r.jiraLastSyncAt.toISOString() : null,
          items: r.items.map((i) => ({
            id: i.id,
            title: i.title,
            startDate: i.startDate.toISOString(),
            endDate: i.endDate.toISOString(),
            plannedStartDate: i.plannedStartDate ? i.plannedStartDate.toISOString() : null,
            plannedEndDate: i.plannedEndDate ? i.plannedEndDate.toISOString() : null,
            status: i.status,
            progress: i.progress,
            dependencyCount: i._count.blockedBy + i._count.blocking,
            parentId: i.parentId,
          })),
        }))}
        dependencies={dependencies
          .filter((d): d is typeof d & { blockingItemId: string; blockedItemId: string } =>
            Boolean(d.blockingItemId && d.blockedItemId)
          )
          .map((d) => ({
            id: d.id,
            blockingItemId: d.blockingItemId,
            blockedItemId: d.blockedItemId,
            type: d.type as "FD" | "DD" | "FF" | "DF",
            curveOffsetX: d.curveOffsetX,
            curveOffsetY: d.curveOffsetY,
          }))}
        workspaceItems={workspaceItems}
        roadmapStats={roadmapStats}
        sprintConfig={sprintConfig}
      />
  );
}
