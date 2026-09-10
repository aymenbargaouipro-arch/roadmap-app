"use client";

import { useEffect, useState } from "react";
import { Link2, Users, Globe2, Trash2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DependencyModal, type WorkspaceItem } from "@/components/dependency-modal";

type DependencyType = "FD" | "DD" | "FF" | "DF";
type DependencyDirection = "BLOCKS" | "BLOCKED_BY";
type DependencyTargetKind = "ITEM" | "TEAM" | "EXTERNAL";
type DependencyStatus = "PENDING" | "RESOLVED";

type DependencyRow = {
  id: string;
  type: DependencyType;
  targetKind: DependencyTargetKind;
  direction: DependencyDirection;
  status: DependencyStatus;
  note: string | null;
  createdAt: string;
  target:
    | { kind: "ITEM"; id: string; title: string; status: string; roadmapId: string; roadmapName: string }
    | { kind: "TEAM"; roadmapId: string; roadmapName: string }
    | { kind: "EXTERNAL"; name: string }
    | null;
  sourceItemId: string;
  sourceItemTitle: string;
};

const ITEM_STATUS_LABEL: Record<string, string> = {
  TODO: "A faire",
  IN_PROGRESS: "En cours",
  BLOCKED: "Bloque",
  DONE: "Termine",
};

const TYPE_LABEL: Record<DependencyType, string> = {
  FD: "Fin \u2192 D\u00e9but",
  DD: "D\u00e9but \u2192 D\u00e9but",
  FF: "Fin \u2192 Fin",
  DF: "D\u00e9but \u2192 Fin",
};

export type DependencySourceItem = { id: string; title: string };

interface DependencyTableModalProps {
  items: DependencySourceItem[];
  workspaceItems: WorkspaceItem[];
  onClose: () => void;
  onChanged: () => void;
}

export function DependencyTableModal({ items, workspaceItems, onClose, onChanged }: DependencyTableModalProps) {
  const [rows, setRows] = useState<DependencyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const isMerged = items.length > 1;
  const primaryItem = items[0];

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        items.map(async (it) => {
          const res = await fetch(`/api/items/${it.id}/dependencies`);
          const data = await res.json().catch(() => []);
          if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status} lors du chargement.`);
          return (data as Omit<DependencyRow, "sourceItemId" | "sourceItemTitle">[]).map((row) => ({
            ...row,
            sourceItemId: it.id,
            sourceItemTitle: it.title,
          }));
        })
      );
      setRows(results.flat());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur reseau lors du chargement des dependances.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => i.id).join(",")]);

  async function handleDelete(dependencyId: string) {
    setBusyId(dependencyId);
    try {
      const res = await fetch(`/api/dependencies/${dependencyId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? `Erreur ${res.status} lors de la suppression.`);
        return;
      }
      await load();
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleStatus(dependencyId: string, current: DependencyStatus) {
    setBusyId(dependencyId);
    try {
      const res = await fetch(`/api/dependencies/${dependencyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: current === "PENDING" ? "RESOLVED" : "PENDING" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? `Erreur ${res.status} lors de la mise a jour.`);
        return;
      }
      await load();
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  function targetLabel(row: DependencyRow) {
    if (!row.target) return "Cible supprimee";
    if (row.target.kind === "ITEM") return row.target.title;
    if (row.target.kind === "TEAM") return row.target.roadmapName;
    return row.target.name;
  }

  function targetIcon(row: DependencyRow) {
    if (!row.target || row.target.kind === "ITEM") return <Link2 size={12} className="text-ink-muted" />;
    if (row.target.kind === "TEAM") return <Users size={12} className="text-ink-muted" />;
    return <Globe2 size={12} className="text-ink-muted" />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-surface p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">Dépendances</h2>
            <p className="text-xs text-ink-muted">
              {isMerged
                ? `${primaryItem.title} (+ ${items.length - 1} sous-item${items.length - 1 > 1 ? "s" : ""} replié${items.length - 1 > 1 ? "s" : ""})`
                : primaryItem.title}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-ink-muted hover:text-ink"
            >
              <Plus size={12} />
              Ajouter
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-ink-muted hover:text-ink"
              aria-label="Fermer"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {isMerged && (
          <p className="mb-3 text-[11px] text-ink-muted">
            Cet Epic est replié : les dépendances de ses sous-items masqués sont regroupées ci-dessous.
          </p>
        )}

        {loading && <p className="py-8 text-center text-xs text-ink-muted">Chargement...</p>}

        {error && (
          <div className="mb-4 rounded-md border border-status-blocked/40 bg-status-blocked/10 px-3 py-2 text-xs text-status-blocked">
            {error}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <p className="py-8 text-center text-xs text-ink-muted">Aucune dependance pour cet item.</p>
        )}

        {!loading && rows.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-background/40 text-ink-muted">
                  {isMerged && <th className="px-3 py-2 font-semibold">Depuis</th>}
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 font-semibold">Sens</th>
                  <th className="px-3 py-2 font-semibold">Cible</th>
                  <th className="px-3 py-2 font-semibold">Statut</th>
                  <th className="px-3 py-2 font-semibold">Note</th>
                  <th className="px-3 py-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className="text-ink">
                    {isMerged && (
                      <td className="px-3 py-2 whitespace-nowrap text-ink-muted">{row.sourceItemTitle}</td>
                    )}
                    <td className="px-3 py-2 whitespace-nowrap">{TYPE_LABEL[row.type]}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-ink-muted">
                      {row.direction === "BLOCKS" ? "Bloque" : "Bloque par"}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        {targetIcon(row)}
                        {targetLabel(row)}
                        {row.target?.kind === "ITEM" && (
                          <span className="text-[10px] text-ink-muted">
                            ({ITEM_STATUS_LABEL[row.target.status] ?? row.target.status})
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => handleToggleStatus(row.id, row.status)}
                        title={
                          row.targetKind === "ITEM"
                            ? "Statut manuel, independant du statut reel de la tache (visible dans la colonne Cible)"
                            : undefined
                        }
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors disabled:opacity-50",
                          row.status === "RESOLVED"
                            ? "bg-status-done/15 text-status-done hover:bg-status-done/25"
                            : "bg-status-blocked/15 text-status-blocked hover:bg-status-blocked/25"
                        )}
                      >
                        {row.status === "RESOLVED" ? "Resolu" : "En attente"}
                      </button>
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2 text-ink-muted" title={row.note ?? ""}>
                      {row.note || "-"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => handleDelete(row.id)}
                        className="rounded-md p-1 text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                        aria-label="Supprimer la dependance"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-xs font-medium text-ink-muted hover:text-ink"
          >
            Fermer
          </button>
        </div>
      </div>

      {showCreate && (
        <DependencyModal
          sourceItemId={primaryItem.id}
          sourceItemTitle={primaryItem.title}
          workspaceItems={workspaceItems}
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            await load();
            onChanged();
          }}
        />
      )}
    </div>
  );
}
