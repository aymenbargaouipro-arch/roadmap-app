import { Info } from "lucide-react";

export type DashboardKpisProps = {
  blockedItemsCount: number;
  strongOpenRisksCount: number;
  upcomingMilestonesCount: number;
  overdueMilestonesCount: number;
  completedItemsCount: number;
  totalItemsCount: number;
  milestonesAtRiskCount: number;
  staleInterTeamDependencyCount: number;
};

function KpiCard({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-1.5 flex items-center gap-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">{label}</p>
        <span title={tooltip} className="cursor-help text-ink-muted/60 hover:text-ink-muted">
          <Info size={11} />
        </span>
      </div>
      {children}
    </div>
  );
}

export function DashboardKpis({
  blockedItemsCount,
  strongOpenRisksCount,
  upcomingMilestonesCount,
  overdueMilestonesCount,
  completedItemsCount,
  totalItemsCount,
  milestonesAtRiskCount,
  staleInterTeamDependencyCount,
}: DashboardKpisProps) {
  const completionRate = totalItemsCount > 0 ? Math.round((completedItemsCount / totalItemsCount) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <KpiCard label="Items bloqués" tooltip="Nombre total d'items actuellement au statut Bloqué, tous roadmaps confondus.">
        <p className={`text-xl font-semibold ${blockedItemsCount > 0 ? "text-status-blocked" : "text-ink"}`}>
          {blockedItemsCount}
        </p>
      </KpiCard>

      <KpiCard
        label="Taux de complétion"
        tooltip="Part des items marqués Terminé sur le total des items du programme."
      >
        <p className="text-xl font-semibold text-ink">{completionRate}%</p>
        <p className="mt-0.5 text-[11px] text-ink-muted">
          {completedItemsCount}/{totalItemsCount} items
        </p>
      </KpiCard>

      <KpiCard
        label="Jalons (14j)"
        tooltip="Nombre de jalons dont la date tombe dans les 14 prochains jours. Le chiffre en rouge indique les jalons déjà dépassés."
      >
        <p className="text-ink">
          <span className="text-xl font-semibold">{upcomingMilestonesCount}</span>
        </p>
        {overdueMilestonesCount > 0 && (
          <p className="mt-0.5 text-[11px] text-status-blocked">{overdueMilestonesCount} en retard</p>
        )}
      </KpiCard>

      <KpiCard
        label="Jalons à risque"
        tooltip="Jalons pas encore passés, mais rattachés à une roadmap actuellement À surveiller ou Critique."
      >
        <p className={`text-xl font-semibold ${milestonesAtRiskCount > 0 ? "text-status-progress" : "text-ink"}`}>
          {milestonesAtRiskCount}
        </p>
        <p className="mt-0.5 text-[11px] text-ink-muted">roadmap à surveiller/critique</p>
      </KpiCard>

      <KpiCard
        label="Risques forts"
        tooltip="Risques ouverts dont l'impact ou la probabilité est évalué comme fort."
      >
        <p className={`text-xl font-semibold ${strongOpenRisksCount > 0 ? "text-status-blocked" : "text-ink"}`}>
          {strongOpenRisksCount}
        </p>
      </KpiCard>

      <KpiCard
        label="Dépendances en retard"
        tooltip="Dépendances qui traversent une frontière d'équipe, en attente depuis plus de 5 jours."
      >
        <p
          className={`text-xl font-semibold ${
            staleInterTeamDependencyCount > 0 ? "text-status-blocked" : "text-ink"
          }`}
        >
          {staleInterTeamDependencyCount}
        </p>
        <p className="mt-0.5 text-[11px] text-ink-muted">inter-équipes, {">"}5j</p>
      </KpiCard>
    </div>
  );
}
