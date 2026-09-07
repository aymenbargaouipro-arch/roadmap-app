import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeHealth } from "@/lib/health";
import { getWorkspaceHealthThresholds } from "@/lib/health-thresholds";
import { DEFAULT_ROADMAP_COLOR, withAlpha } from "@/lib/roadmap-theme";
import { HealthBadge } from "@/components/status-badge";
import { RoadmapSettingsModal } from "@/components/roadmap-settings-modal";
import { GanttChart } from "@/components/gantt-chart";
import { RoadmapItems } from "@/components/roadmap-items";
import { RoadmapDependenciesTable, type RoadmapDependencyRow } from "@/components/roadmap-dependencies-table";
import { RoadmapRisks } from "@/components/roadmap-risks";
import { RoadmapMilestones } from "@/components/roadmap-milestones";

export default async function RoadmapDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const roadmap = await prisma.roadmap.findUnique({
    where: { id: params.id },
    include: {
      items: {
        orderBy: { position: "asc" },
        include: {
          owner: { select: { name: true } },
          blockedBy: {
            include: {
              blockingItem: { select: { id: true, title: true, roadmap: { select: { id: true, name: true } } } },
              targetRoadmap: { select: { id: true, name: true } },
            },
          },
          blocking: {
            include: {
              blockedItem: { select: { id: true, title: true, roadmap: { select: { id: true, name: true } } } },
              targetRoadmap: { select: { id: true, name: true } },
            },
          },
          dateShifts: { orderBy: { createdAt: "desc" } },
          _count: { select: { blockedBy: true, blocking: true } },
        },
      },
      risks: { orderBy: { createdAt: "desc" } },
      milestones: { orderBy: { date: "asc" } },
    },
  });

  if (!roadmap) notFound();

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspaceId: roadmap.workspaceId },
  });
  if (!membership) redirect("/dashboard");

  const workspaceItems = await prisma.item.findMany({
    where: { roadmap: { workspaceId: roadmap.workspaceId } },
    select: { id: true, title: true, roadmap: { select: { id: true, name: true } } },
    orderBy: { title: "asc" },
  });

  const members = await prisma.membership.findMany({
    where: { workspaceId: roadmap.workspaceId },
    select: { user: { select: { id: true, name: true } } },
    orderBy: { user: { name: "asc" } },
  });

  const workspaceSprintConfig = await prisma.workspace.findUnique({
    where: { id: roadmap.workspaceId },
    select: { sprintReferenceDate: true, sprintDurationWeeks: true, sprintReferenceNumber: true },
  });

  // Config serialisee (Date -> string) pour passage a un composant client ; null tant que
  // rien n'est configure dans /settings.
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

  const blockingDependencies = roadmap.items.flatMap((i) =>
    i.blockedBy.map((dep) => ({ blocking: dep.status === "PENDING" }))
  );

  const thresholds = await getWorkspaceHealthThresholds(roadmap.workspaceId);
  const health = computeHealth(roadmap.items, roadmap.risks, blockingDependencies, thresholds);

  // Liste complete et dedupliquee des dependances de la roadmap (les deux sens : celles qui
  // bloquent un de ses items, et celles que ses items bloquent), y compris inter-equipes.
  // Une dependance interne (source et cible toutes deux dans cette roadmap) apparaitrait dans
  // les deux relations (blockedBy d'un item ET blocking de l'autre) : on dedoublonne par id.
  const dependencyRowsMap = new Map<string, RoadmapDependencyRow>();

  for (const item of roadmap.items) {
    for (const dep of item.blockedBy) {
      if (dependencyRowsMap.has(dep.id)) continue;
      let sourceLabel: string;
      if (dep.blockingItem) {
        sourceLabel =
          dep.blockingItem.roadmap.id !== roadmap.id
            ? `${dep.blockingItem.title} (${dep.blockingItem.roadmap.name})`
            : dep.blockingItem.title;
      } else if (dep.targetRoadmap) {
        sourceLabel = `Équipe : ${dep.targetRoadmap.name}`;
      } else {
        sourceLabel = `Externe : ${dep.externalSystemName ?? "?"}`;
      }
      dependencyRowsMap.set(dep.id, {
        id: dep.id,
        type: dep.type as RoadmapDependencyRow["type"],
        status: dep.status as RoadmapDependencyRow["status"],
        note: dep.note,
        sourceLabel,
        targetLabel: item.title,
      });
    }

    for (const dep of item.blocking) {
      if (dependencyRowsMap.has(dep.id)) continue;
      let targetLabel: string;
      if (dep.blockedItem) {
        targetLabel =
          dep.blockedItem.roadmap.id !== roadmap.id
            ? `${dep.blockedItem.title} (${dep.blockedItem.roadmap.name})`
            : dep.blockedItem.title;
      } else if (dep.targetRoadmap) {
        targetLabel = `Équipe : ${dep.targetRoadmap.name}`;
      } else {
        targetLabel = `Externe : ${dep.externalSystemName ?? "?"}`;
      }
      dependencyRowsMap.set(dep.id, {
        id: dep.id,
        type: dep.type as RoadmapDependencyRow["type"],
        status: dep.status as RoadmapDependencyRow["status"],
        note: dep.note,
        sourceLabel: item.title,
        targetLabel,
      });
    }
  }

  const dependencyRows = Array.from(dependencyRowsMap.values());

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-lg"
            style={{ backgroundColor: withAlpha(roadmap.color ?? DEFAULT_ROADMAP_COLOR, "26") }}
          >
            {roadmap.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={roadmap.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              roadmap.icon ?? "🗺️"
            )}
          </span>
          <h1 className="text-xl font-semibold text-ink">{roadmap.name}</h1>
          <HealthBadge health={health} />
          <div className="ml-auto">
            <RoadmapSettingsModal
              roadmapId={roadmap.id}
              initial={{
                name: roadmap.name,
                description: roadmap.description,
                color: roadmap.color,
                icon: roadmap.icon,
                logoUrl: roadmap.logoUrl,
              }}
            />
          </div>
        </div>
        {roadmap.description && <p className="mt-1 text-sm text-ink-muted">{roadmap.description}</p>}
      </div>

      <GanttChart
        roadmapId={roadmap.id}
        roadmapColor={roadmap.color}
        sprintConfig={sprintConfig}
        items={roadmap.items.map((i) => ({
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
        }))}
        workspaceItems={workspaceItems}
        milestones={roadmap.milestones.map((m) => ({
          id: m.id,
          title: m.title,
          date: m.date.toISOString(),
        }))}
        dependencies={roadmap.items.flatMap((i) =>
          i.blockedBy
            .filter((dep) => dep.blockingItem)
            .map((dep) => ({
              id: dep.id,
              blockingItemId: dep.blockingItem!.id,
              blockedItemId: i.id,
              type: dep.type as "FD" | "DD" | "FF" | "DF",
              curveOffsetX: dep.curveOffsetX,
              curveOffsetY: dep.curveOffsetY,
            }))
        )}
      />

      <RoadmapItems
        roadmapId={roadmap.id}
        roadmapColor={roadmap.color}
        items={roadmap.items.map((i) => ({
          ...i,
          startDate: i.startDate.toISOString(),
          endDate: i.endDate.toISOString(),
          plannedStartDate: i.plannedStartDate ? i.plannedStartDate.toISOString() : null,
          plannedEndDate: i.plannedEndDate ? i.plannedEndDate.toISOString() : null,
          dateShifts: i.dateShifts.map((s) => ({
            id: s.id,
            previousPlannedStart: s.previousPlannedStart.toISOString(),
            previousPlannedEnd: s.previousPlannedEnd.toISOString(),
            newPlannedStart: s.newPlannedStart.toISOString(),
            newPlannedEnd: s.newPlannedEnd.toISOString(),
            comment: s.comment,
            createdAt: s.createdAt.toISOString(),
          })),
        }))}
        workspaceItems={workspaceItems}
        members={members.map((m) => ({ id: m.user.id, name: m.user.name }))}
      />

      <RoadmapDependenciesTable dependencies={dependencyRows} />

      <RoadmapMilestones
        roadmapId={roadmap.id}
        milestones={roadmap.milestones.map((m) => ({
          id: m.id,
          title: m.title,
          date: m.date.toISOString(),
        }))}
      />

      <RoadmapRisks roadmapId={roadmap.id} risks={roadmap.risks} />
    </div>
  );
}
