import Link from "next/link";
import { Ban, Flag, TriangleAlert, GitBranch, CircleCheck } from "lucide-react";
import type { ActionItem } from "@/lib/attention-items";

const KIND_CONFIG: Record<ActionItem["kind"], { icon: typeof Ban; label: string }> = {
  blocked_item: { icon: Ban, label: "Item bloqué" },
  overdue_milestone: { icon: Flag, label: "Jalon en retard" },
  open_risk: { icon: TriangleAlert, label: "Risque ouvert fort" },
  stale_dependency: { icon: GitBranch, label: "Dépendance en attente" },
};

function daysLabel(item: ActionItem): string {
  if (item.kind === "overdue_milestone") {
    return `${item.daysLate} j de retard`;
  }
  return `depuis ${item.sinceDays} j`;
}

function itemTitle(item: ActionItem): string {
  return item.kind === "stale_dependency" ? item.label : item.title;
}

const MAX_SHOWN = 15;

export function AttentionPanel({ items }: { items: ActionItem[] }) {
  const shown = items.slice(0, MAX_SHOWN);
  const hiddenCount = items.length - shown.length;

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Attention requise</h2>
        <span className="text-xs text-ink-muted">
          {items.length} point{items.length > 1 ? "s" : ""}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="flex items-center gap-2 px-5 py-6 text-sm text-ink-muted">
          <CircleCheck size={16} className="text-accent" />
          Rien à signaler, tout est sous contrôle.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-ink-muted">
                <th className="px-5 py-2.5 font-medium">Équipe</th>
                <th className="px-5 py-2.5 font-medium">Sujet</th>
                <th className="px-5 py-2.5 font-medium">Point d'attention</th>
                <th className="px-5 py-2.5 text-right font-medium">Depuis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((item) => {
                const config = KIND_CONFIG[item.kind];
                const Icon = config.icon;
                return (
                  <tr key={`${item.kind}-${item.id}`}>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <Link href={`/roadmaps/${item.roadmapId}`} className="text-ink hover:text-accent">
                        {item.roadmapName}
                      </Link>
                    </td>
                    <td className="max-w-[320px] truncate px-5 py-3 text-ink">{itemTitle(item)}</td>
                    <td className="px-5 py-3 text-ink-muted">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <Icon size={13} className="shrink-0 text-status-blocked" />
                        {config.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-ink-muted whitespace-nowrap">{daysLabel(item)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hiddenCount > 0 && (
        <p className="border-t border-border px-5 py-2.5 text-xs text-ink-muted">
          + {hiddenCount} autre{hiddenCount > 1 ? "s" : ""} point{hiddenCount > 1 ? "s" : ""} (voir chaque roadmap
          pour le détail)
        </p>
      )}
    </div>
  );
}
