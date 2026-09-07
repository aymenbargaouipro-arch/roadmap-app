import type { HealthTrendPoint } from "@/lib/health-history";

export function HealthTrendChart({
  points,
  totalRoadmaps,
}: {
  points: HealthTrendPoint[];
  totalRoadmaps: number;
}) {
  if (points.length < 2) {
    return (
      <div className="flex h-full flex-col rounded-lg border border-border bg-surface p-4">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
          Tendance santé
        </p>
        <div className="flex flex-1 items-center justify-center py-8 text-center text-xs text-ink-muted">
          Historique en cours de constitution - reviens dans quelques jours pour voir la tendance.
        </div>
      </div>
    );
  }

  // Barres agrandies (etaient 14/120) pour plus de poids visuel.
  const barWidth = 18;
  const gap = 7;
  const chartHeight = 160;
  // Zone reservee aux dates en bas du graphique. Les dates sont ecrites verticalement
  // (pivotees a 90deg) pour ne pas se chevaucher entre elles : le texte pivote occupe de la
  // hauteur plutot que de la largeur.
  const labelAreaHeight = 55;
  const totalHeight = chartHeight + labelAreaHeight;
  const width = points.length * (barWidth + gap) + gap;
  const maxTotal = Math.max(totalRoadmaps, 1);

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-surface p-4">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-ink-muted">Tendance santé</p>
      <svg
        viewBox={`0 0 ${width} ${totalHeight}`}
        className="w-full"
        style={{ maxHeight: 240 }}
        preserveAspectRatio="xMidYMid meet"
      >
        {points.map((p, i) => {
          const x = gap + i * (barWidth + gap);
          const greenH = (p.green / maxTotal) * chartHeight;
          const orangeH = (p.orange / maxTotal) * chartHeight;
          const redH = (p.red / maxTotal) * chartHeight;

          let yCursor = chartHeight;
          const greenY = yCursor - greenH;
          yCursor -= greenH;
          const orangeY = yCursor - orangeH;
          yCursor -= orangeH;
          const redY = yCursor - redH;

          const showLabel = i === 0 || i === points.length - 1 || i % 7 === 0;
          const label = new Date(p.day).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
          const labelPivotX = x + barWidth / 2;
          const labelPivotY = chartHeight + 10;

          return (
            <g key={p.day}>
              {greenH > 0 && (
                <rect x={x} y={greenY} width={barWidth} height={greenH} rx={2} className="fill-accent">
                  <title>{p.greenNames.length > 0 ? p.greenNames.join("\n") : "Sain"}</title>
                </rect>
              )}
              {orangeH > 0 && (
                <rect x={x} y={orangeY} width={barWidth} height={orangeH} rx={2} className="fill-status-progress">
                  <title>{p.orangeNames.length > 0 ? p.orangeNames.join("\n") : "À surveiller"}</title>
                </rect>
              )}
              {redH > 0 && (
                <rect x={x} y={redY} width={barWidth} height={redH} rx={2} className="fill-status-blocked">
                  <title>{p.redNames.length > 0 ? p.redNames.join("\n") : "Critique"}</title>
                </rect>
              )}
              {showLabel && (
                <text
                  x={labelPivotX}
                  y={labelPivotY}
                  textAnchor="end"
                  transform={`rotate(-90, ${labelPivotX}, ${labelPivotY})`}
                  className="fill-ink-muted text-[9px]"
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-auto flex items-center gap-4 pt-2 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-accent" />
          Sain
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-status-progress" />À surveiller
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-status-blocked" />
          Critique
        </span>
      </div>
    </div>
  );
}
