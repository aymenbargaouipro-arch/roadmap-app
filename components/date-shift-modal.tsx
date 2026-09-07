"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { X, History } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DateShiftHistoryEntry = {
  id: string;
  previousPlannedStart: string;
  previousPlannedEnd: string;
  newPlannedStart: string;
  newPlannedEnd: string;
  comment: string | null;
  createdAt: string;
};

function fmt(d: string): string {
  return format(new Date(d), "d MMM yyyy", { locale: fr });
}

function diffDaysLabel(fromIso: string, toIso: string): string {
  const diff = Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86400000);
  if (diff === 0) return "aucun écart";
  return diff > 0 ? `+${diff} j de retard` : `${Math.abs(diff)} j d'avance`;
}

export function DateShiftModal({
  itemId,
  itemTitle,
  plannedStartDate,
  plannedEndDate,
  actualStartDate,
  actualEndDate,
  history,
  onClose,
}: {
  itemId: string;
  itemTitle: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  actualStartDate: string;
  actualEndDate: string;
  history: DateShiftHistoryEntry[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasActiveShift = plannedStartDate != null || plannedEndDate != null;

  async function handleValidate() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validateDateShift: true, comment: comment.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Erreur ${res.status}.`);
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <History size={15} className="text-accent" />
            Prévu vs réel · {itemTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-ink-muted hover:bg-background"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        {hasActiveShift ? (
          <div className="mb-5 rounded-lg border border-status-progress/40 bg-status-progress/10 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-status-progress">
              Décalage en cours
            </p>
            <div className="mb-3 flex flex-col gap-1 text-sm">
              <p className="text-ink-muted">
                Prévu : <span className="text-ink">{fmt(plannedStartDate ?? actualStartDate)}</span> →{" "}
                <span className="text-ink">{fmt(plannedEndDate ?? actualEndDate)}</span>
              </p>
              <p className="text-ink-muted">
                Réel actuel : <span className="text-ink">{fmt(actualStartDate)}</span> →{" "}
                <span className="text-ink">{fmt(actualEndDate)}</span>
              </p>
              <p className="text-xs text-status-progress">
                {diffDaysLabel(plannedEndDate ?? actualEndDate, actualEndDate)}
              </p>
            </div>

            <label className="mb-1.5 block text-xs font-medium text-ink-muted">
              Commentaire (facultatif, mais recommandé pour expliquer le décalage)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-ink"
              placeholder="Ex : attente de livraison de l'équipe Design, +5 jours."
            />

            {error && (
              <div className="mb-3 rounded-md border border-status-blocked/40 bg-status-blocked/10 px-3 py-2 text-xs text-status-blocked">
                {error}
              </div>
            )}

            <div className="flex justify-end">
              <Button size="sm" onClick={handleValidate} disabled={saving}>
                {saving ? "Validation..." : "Valider ce décalage"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="mb-5 text-sm text-ink-muted">Aucun décalage en cours pour cet item.</p>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Historique ({history.length})
          </p>
          {history.length === 0 ? (
            <p className="text-sm text-ink-muted">Aucun décalage validé pour l'instant.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {history.map((h) => (
                <li key={h.id} className="rounded-md border border-border bg-background px-3 py-2.5 text-xs">
                  <div className="mb-1 flex items-center justify-between text-ink-muted">
                    <span>Validé le {fmt(h.createdAt)}</span>
                    <span>{diffDaysLabel(h.previousPlannedEnd, h.newPlannedEnd)}</span>
                  </div>
                  <p className="text-ink-muted">
                    Prévu : {fmt(h.previousPlannedStart)} → {fmt(h.previousPlannedEnd)}
                    {" · "}
                    Réel : {fmt(h.newPlannedStart)} → {fmt(h.newPlannedEnd)}
                  </p>
                  {h.comment && <p className="mt-1.5 text-ink">{h.comment}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
