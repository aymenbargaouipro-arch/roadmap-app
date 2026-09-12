"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RoadmapDeleteButton({
  roadmapId,
  roadmapName,
  variant = "icon",
}: {
  roadmapId: string;
  roadmapName: string;
  variant?: "icon" | "full";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function stop(e: React.SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/roadmaps/${roadmapId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Erreur ${res.status} lors de la suppression.`);
        setDeleting(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Erreur réseau lors de la suppression.");
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          stop(e);
          setOpen(true);
        }}
        className={
          variant === "icon"
            ? "flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-status-blocked/15 hover:text-status-blocked"
            : "flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:border-status-blocked/40 hover:text-status-blocked"
        }
        title="Supprimer la roadmap"
      >
        <Trash2 size={variant === "icon" ? 14 : 13} />
        {variant === "full" && "Supprimer"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={stop}>
          <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-5" onClick={stop}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">Supprimer la roadmap</h3>
              <button
                type="button"
                onClick={(e) => {
                  stop(e);
                  if (!deleting) setOpen(false);
                }}
                className="text-ink-muted hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-ink-muted">
              Cette action supprime définitivement <span className="font-medium text-ink">{roadmapName}</span>, ainsi
              que tous ses items, jalons, risques et dépendances liées. Cette action est irréversible.
            </p>
            {error && <p className="mt-3 text-xs text-status-blocked">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={(e) => {
                  stop(e);
                  setOpen(false);
                }}
                disabled={deleting}
              >
                Annuler
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={(e) => {
                  stop(e);
                  handleDelete();
                }}
                disabled={deleting}
                className="bg-status-blocked text-white hover:bg-status-blocked/90"
              >
                {deleting ? "Suppression..." : "Supprimer définitivement"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
