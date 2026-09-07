import type { TeamDependencyEdge } from "@/lib/cross-team-metrics";

function shortName(name: string): string {
  return name.split("·")[0].trim();
}

export function TeamDependencyGraph({ edges }: { edges: TeamDependencyEdge[] }) {
  if (edges.length === 0) {
    return (
      <div className="flex h-full flex-col rounded-lg border border-border bg-surface p-4">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
          Dépendances inter-équipes
        </p>
        <div className="flex flex-1 items-center justify-center py-8 text-center text-xs text-ink-muted">
          Aucune dépendance inter-équipes en attente.
        </div>
      </div>
    );
  }

  const nodeNames = new Map<string, string>();
  const degreeById = new Map<string, number>();
  for (const e of edges) {
    nodeNames.set(e.fromRoadmapId, shortName(e.fromRoadmapName));
    nodeNames.set(e.toRoadmapId, shortName(e.toRoadmapName));
    degreeById.set(e.fromRoadmapId, (degreeById.get(e.fromRoadmapId) ?? 0) + 1);
    degreeById.set(e.toRoadmapId, (degreeById.get(e.toRoadmapId) ?? 0) + 1);
  }
  const nodeIds = Array.from(nodeNames.keys());
  const n = nodeIds.length;

  // Deux dependances distinctes entre la MEME paire equipe source -> equipe cible se
  // superposent parfaitement a l'ecran (meme ligne) : on les fusionne en un seul arc avec
  // un compteur "xN", au lieu de dessiner des traits invisibles les uns sur les autres.
  const edgeGroups = new Map<string, { fromRoadmapId: string; toRoadmapId: string; count: number }>();
  for (const e of edges) {
    const key = `${e.fromRoadmapId}->${e.toRoadmapId}`;
    const existing = edgeGroups.get(key);
    if (existing) existing.count += 1;
    else edgeGroups.set(key, { fromRoadmapId: e.fromRoadmapId, toRoadmapId: e.toRoadmapId, count: 1 });
  }
  const mergedEdges = Array.from(edgeGroups.values());

  const width = 360;
  const height = 270;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 48;
  const nodeRadius = 26;

  const positions = new Map<string, { x: number; y: number }>();
  nodeIds.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    positions.set(id, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
  });

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        Dépendances inter-équipes
      </p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: 270 }}>
        <defs>
          <marker
            id="team-dep-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" className="fill-status-blocked" />
          </marker>
        </defs>

        {mergedEdges.map((e, i) => {
          const from = positions.get(e.fromRoadmapId)!;
          const to = positions.get(e.toRoadmapId)!;
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const toX = to.x - (dx / dist) * nodeRadius;
          const toY = to.y - (dy / dist) * nodeRadius;
          return (
            <line
              key={i}
              x1={from.x}
              y1={from.y}
              x2={toX}
              y2={toY}
              className="stroke-status-blocked"
              strokeWidth={1.5}
              strokeOpacity={0.7}
              markerEnd="url(#team-dep-arrow)"
            >
              {e.count > 1 && <title>{`${e.count} dépendances fusionnées`}</title>}
            </line>
          );
        })}

        {nodeIds.map((id) => {
          const pos = positions.get(id)!;
          const label = nodeNames.get(id)!;
          const count = degreeById.get(id) ?? 0;
          return (
            <g key={id}>
              <circle cx={pos.x} cy={pos.y} r={nodeRadius} className="fill-background stroke-border" strokeWidth={1} />
              <text x={pos.x} y={pos.y + 4} textAnchor="middle" className="fill-ink text-[11px] font-medium">
                {label}
              </text>
              <text
                x={pos.x}
                y={pos.y + nodeRadius + 13}
                textAnchor="middle"
                className="fill-ink-muted text-[10px]"
              >
                {count} dép.
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
