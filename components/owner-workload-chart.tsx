import type { OwnerLoad } from "@/lib/owner-workload";

const OVERLOAD_THRESHOLD = 5;

export function OwnerWorkloadChart({ owners }: { owners: OwnerLoad[] }) {
  if (owners.length === 0) {
    return (
      <div className="flex h-full flex-col rounded-lg border border-border bg-surface p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          Charge par owner
        </p>
        <div className="flex flex-1 items-center justify-center py-8 text-center text-xs text-ink-muted">
          Aucun item actif assigné pour l'instant.
        </div>
      </div>
    );
  }

  const max = Math.max(...owners.map((o) => o.activeItemCount), 1);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        Charge par owner (items actifs)
      </p>
      <div className="flex flex-col gap-2.5">
        {owners.map((o) => {
          const widthPct = (o.activeItemCount / max) * 100;
          const overloaded = o.activeItemCount > OVERLOAD_THRESHOLD;
          return (
            <div key={o.ownerId ?? "unassigned"} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate text-xs text-ink-muted">{o.ownerName}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-background">
                <div
                  className={`h-full rounded-full ${overloaded ? "bg-status-blocked" : "bg-accent"}`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span className={`w-6 shrink-0 text-right text-xs ${overloaded ? "text-status-blocked" : "text-ink"}`}>
                {o.activeItemCount}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
