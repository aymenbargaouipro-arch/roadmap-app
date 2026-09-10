"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { HealthBadge } from "@/components/status-badge";
import { ConsolidatedGantt } from "@/components/consolidated-gantt";
import { ConsolidatedJiraSyncButton } from "@/components/consolidated-jira-sync-button";
import { DEFAULT_ROADMAP_COLOR, withAlpha } from "@/lib/roadmap-theme";
import type { Health } from "@/lib/health";
import type { WorkspaceItem } from "@/components/dependency-modal";

const STATUS_OPTIONS = [
  { value: "TODO", label: "À faire" },
  { value: "IN_PROGRESS", label: "En cours" },
  { value: "BLOCKED", label: "Bloqué" },
  { value: "DONE", label: "Terminé" },
];

type ItemForView = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  status: string;
  progress: number;
  dependencyCount?: number;
  parentId: string | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
};

type RoadmapForView = {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  logoUrl: string | null;
  jiraProjectKey?: string | null;
  jiraLastSyncAt?: string | null;
  items: ItemForView[];
};

type DependencyForView = {
  id: string;
  blockingItemId: string;
  blockedItemId: string;
  type?: "FD" | "DD" | "FF" | "DF";
  curveOffsetX?: number | null;
  curveOffsetY?: number | null;
};

type RoadmapStats = {
  health: Health;
  openRisksCount: number;
  dependencyCount: number;
};

type SprintConfigProp = {
  referenceDate: string;
  durationWeeks: number;
  referenceNumber: number;
} | null;

function shortName(name: string): string {
  return name.split("·")[0].trim();
}

export function ConsolidatedView({
  roadmaps,
  dependencies,
  workspaceItems,
  roadmapStats,
  sprintConfig = null,
}: {
  roadmaps: RoadmapForView[];
  dependencies: DependencyForView[];
  workspaceItems: WorkspaceItem[];
  roadmapStats: Record<string, RoadmapStats>;
  sprintConfig?: SprintConfigProp;
}) {
  const [teamFilter, setTeamFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");

  function resetFilters() {
    setTeamFilter("");
    setStatusFilter("");
    setPeriodFrom("");
    setPeriodTo("");
  }

  const hasActiveFilters = teamFilter !== "" || statusFilter !== "" || periodFrom !== "" || periodTo !== "";

  const filteredRoadmaps = useMemo(() => {
    const from = periodFrom ? new Date(periodFrom) : null;
    const to = periodTo ? new Date(periodTo) : null;

    return roadmaps
      .filter((r) => !teamFilter || r.id === teamFilter)
      .map((r) => ({
        ...r,
        items: r.items.filter((it) => {
          if (statusFilter && it.status !== statusFilter) return false;
          if (from && new Date(it.endDate) < from) return false;
          if (to && new Date(it.startDate) > to) return false;
          return true;
        }),
      }));
  }, [roadmaps, teamFilter, statusFilter, periodFrom, periodTo]);

  const visibleRoadmaps = filteredRoadmaps.filter((r) => r.items.length > 0);
  const now = new Date();
  const jiraRoadmapIds = roadmaps.filter((r) => r.jiraProjectKey).map((r) => r.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Vue consolidée</h1>
          <p className="text-sm text-ink-muted">Statut de santé calculé automatiquement pour chaque roadmap.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ConsolidatedJiraSyncButton roadmapIds={jiraRoadmapIds} />
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-ink"
          >
            <option value="">Toutes les équipes</option>
            {roadmaps.map((r) => (
              <option key={r.id} value={r.id}>
                {shortName(r.name)}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-ink"
          >
            <option value="">Tous les statuts</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-ink"
            />
            <span className="text-xs text-ink-muted">→</span>
            <input
              type="date"
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-ink"
            />
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs text-ink-muted underline hover:text-ink"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {visibleRoadmaps.length > 0 ? (
        <ConsolidatedGantt
          roadmaps={visibleRoadmaps}
          dependencies={dependencies}
          workspaceItems={workspaceItems}
          sprintConfig={sprintConfig}
        />
      ) : (
        <p className="rounded-lg border border-dashed border-border bg-surface px-5 py-10 text-center text-sm text-ink-muted">
          Aucun item ne correspond aux filtres sélectionnés.
        </p>
      )}

      {filteredRoadmaps.length === 0 ? (
        <p className="text-sm text-ink-muted">Aucune roadmap dans cet espace pour l'instant.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-ink-muted">
                <th className="px-5 py-3 font-semibold">Roadmap</th>
                <th className="px-5 py-3 font-semibold">Santé</th>
                <th className="px-5 py-3 font-semibold">Items</th>
                <th className="px-5 py-3 font-semibold">En retard</th>
                <th className="px-5 py-3 font-semibold">Risques ouverts</th>
                <th className="px-5 py-3 font-semibold">Dépendances</th>
                <th className="px-5 py-3 font-semibold">Jira</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRoadmaps.map((roadmap) => {
                const stats = roadmapStats[roadmap.id];
                const lateCount = roadmap.items.filter((i) => i.status !== "DONE" && new Date(i.endDate) < now).length;

                return (
                  <tr key={roadmap.id} className="hover:bg-background/60">
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/roadmaps/${roadmap.id}`}
                        className="flex items-center gap-2 font-medium text-ink hover:text-accent"
                      >
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px]"
                          style={{ backgroundColor: withAlpha(roadmap.color ?? DEFAULT_ROADMAP_COLOR, "33") }}
                        >
                          {roadmap.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={roadmap.logoUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            roadmap.icon ?? ""
                          )}
                        </span>
                        {roadmap.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      <HealthBadge health={stats?.health ?? "green"} />
                    </td>
                    <td className="px-5 py-3.5 text-ink-muted">{roadmap.items.length}</td>
                    <td className="px-5 py-3.5 text-ink-muted">{lateCount}</td>
                    <td className="px-5 py-3.5 text-ink-muted">{stats?.openRisksCount ?? 0}</td>
                    <td className="px-5 py-3.5 text-ink-muted">{stats?.dependencyCount ?? 0}</td>
                    <td className="px-5 py-3.5 text-ink-muted">
                      {roadmap.jiraProjectKey ? (
                        roadmap.jiraLastSyncAt ? (
                          formatDistanceToNow(new Date(roadmap.jiraLastSyncAt), { addSuffix: true, locale: fr })
                        ) : (
                          "Jamais synchronisé"
                        )
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
