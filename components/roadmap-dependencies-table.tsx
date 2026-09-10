"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type RoadmapDependencyRow = {
  id: string;
  type: "FD" | "DD" | "FF" | "DF";
  status: "PENDING" | "RESOLVED";
  note: string | null;
  sourceLabel: string;
  targetLabel: string;
};

const TYPE_LABELS: Record<RoadmapDependencyRow["type"], string> = {
  FD: "Fin → Début",
  DD: "Début → Début",
  FF: "Fin → Fin",
  DF: "Début → Fin",
};

export function RoadmapDependenciesTable({ dependencies }: { dependencies: RoadmapDependencyRow[] }) {
  const router = useRouter();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  async function handleStatusChange(id: string, status: "PENDING" | "RESOLVED") {
    setPendingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/dependencies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? `Erreur ${res.status} lors de la mise à jour du statut.`);
        return;
      }
      router.refresh();
    } catch {
      alert("Erreur réseau lors de la mise à jour du statut.");
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleRemove(id: string) {
    try {
      const res = await fetch(`/api/dependencies/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? `Erreur ${res.status} lors de la suppression.`);
        return;
      }
      router.refresh();
    } catch {
      alert("Erreur réseau lors de la suppression.");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          <Link2 size={14} className="text-accent" />
          Dépendances <span className="text-ink">({dependencies.length})</span>
        </h2>
      </div>

      {dependencies.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-muted">Aucune dépendance pour cette roadmap.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-ink-muted">
                <th className="px-5 py-2.5 font-semibold">Source</th>
                <th className="px-5 py-2.5 font-semibold"></th>
                <th className="px-5 py-2.5 font-semibold">Cible</th>
                <th className="px-5 py-2.5 font-semibold">Type</th>
                <th className="px-5 py-2.5 font-semibold">Statut</th>
                <th className="px-5 py-2.5 font-semibold">Note</th>
                <th className="px-5 py-2.5 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {dependencies.map((dep) => {
                const saving = pendingIds.has(dep.id);
                const isResolved = dep.status === "RESOLVED";
                return (
                  <tr key={dep.id}>
                    <td className="px-5 py-3 text-ink">{dep.sourceLabel}</td>
                    <td className="px-2 py-3 text-ink-muted">→</td>
                    <td className="px-5 py-3 text-ink">{dep.targetLabel}</td>
                    <td className="px-5 py-3 text-ink-muted">{TYPE_LABELS[dep.type]}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            isResolved ? "bg-status-done" : "bg-status-blocked"
                          )}
                        />
                        <select
                          value={dep.status}
                          disabled={saving}
                          onChange={(e) => handleStatusChange(dep.id, e.target.value as "PENDING" | "RESOLVED")}
                          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-ink"
                        >
                          <option value="PENDING">En attente</option>
                          <option value="RESOLVED">Résolu</option>
                        </select>
                      </div>
                    </td>
                    <td className="max-w-[220px] truncate px-5 py-3 text-ink-muted" title={dep.note ?? undefined}>
                      {dep.note ?? "-"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => handleRemove(dep.id)}
                        className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger"
                        aria-label="Supprimer la dépendance"
                      >
                        <Trash2 size={14} />
                      </button>
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
