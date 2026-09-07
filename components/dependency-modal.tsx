"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type DependencyType = "FD" | "DD" | "FF" | "DF";
export type DependencyDirection = "BLOCKS" | "BLOCKED_BY";
export type DependencyTargetKind = "ITEM" | "TEAM" | "EXTERNAL";

export type WorkspaceItem = {
  id: string;
  title: string;
  roadmap: { id: string; name: string };
};

const TYPE_OPTIONS: { value: DependencyType; label: string; hint: string }[] = [
  { value: "FD", label: "Fin -> Debut", hint: "L'un doit finir avant que l'autre commence" },
  { value: "DD", label: "Debut -> Debut", hint: "Les deux doivent demarrer ensemble" },
  { value: "FF", label: "Fin -> Fin", hint: "Les deux doivent finir ensemble" },
  { value: "DF", label: "Debut -> Fin", hint: "L'un doit demarrer avant que l'autre finisse" },
];

interface DependencyModalProps {
  sourceItemId: string;
  sourceItemTitle: string;
  workspaceItems: WorkspaceItem[];
  initialDirection?: DependencyDirection;
  initialTargetKind?: DependencyTargetKind;
  initialTargetItemId?: string;
  onClose: () => void;
  onCreated: () => void;
}

export function DependencyModal({
  sourceItemId,
  sourceItemTitle,
  workspaceItems,
  initialDirection = "BLOCKED_BY",
  initialTargetKind = "ITEM",
  initialTargetItemId = "",
  onClose,
  onCreated,
}: DependencyModalProps) {
  const [type, setType] = useState<DependencyType>("FD");
  const [direction, setDirection] = useState<DependencyDirection>(initialDirection);
  const [targetKind, setTargetKind] = useState<DependencyTargetKind>(initialTargetKind);
  const [targetItemId, setTargetItemId] = useState(initialTargetItemId);
  const [targetRoadmapId, setTargetRoadmapId] = useState("");
  const [externalSystemName, setExternalSystemName] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableItems = workspaceItems.filter((i) => i.id !== sourceItemId);

  const itemsByRoadmap = useMemo(() => {
    return availableItems.reduce<Record<string, WorkspaceItem[]>>((acc, item) => {
      acc[item.roadmap.name] = acc[item.roadmap.name] ?? [];
      acc[item.roadmap.name].push(item);
      return acc;
    }, {});
  }, [availableItems]);

  const roadmapOptions = useMemo(() => {
    const map = new Map<string, string>();
    workspaceItems.forEach((wi) => map.set(wi.roadmap.id, wi.roadmap.name));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [workspaceItems]);

  const isValid =
    (targetKind === "ITEM" && targetItemId !== "") ||
    (targetKind === "TEAM" && targetRoadmapId !== "") ||
    (targetKind === "EXTERNAL" && externalSystemName.trim() !== "");

  async function handleSubmit() {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/items/${sourceItemId}/dependencies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          direction,
          targetKind,
          targetItemId: targetKind === "ITEM" ? targetItemId : undefined,
          targetRoadmapId: targetKind === "TEAM" ? targetRoadmapId : undefined,
          externalSystemName: targetKind === "EXTERNAL" ? externalSystemName.trim() : undefined,
          note: note.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? `Erreur ${res.status} lors de la creation.`);
        setSubmitting(false);
        return;
      }

      onCreated();
      onClose();
    } catch {
      setError("Erreur reseau lors de la creation de la dependance.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-ink">Nouvelle dependance</h2>
          <p className="text-xs text-ink-muted">Depuis : {sourceItemTitle}</p>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-ink-muted">Sens</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDirection("BLOCKS")}
              className={cn(
                "rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                direction === "BLOCKS"
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border text-ink-muted hover:text-ink"
              )}
            >
              Cette tache bloque la cible
            </button>
            <button
              type="button"
              onClick={() => setDirection("BLOCKED_BY")}
              className={cn(
                "rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                direction === "BLOCKED_BY"
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border text-ink-muted hover:text-ink"
              )}
            >
              Cette tache est bloquee par la cible
            </button>
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-ink-muted">Type de dependance</label>
          <div className="grid grid-cols-2 gap-2">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                title={opt.hint}
                className={cn(
                  "rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors",
                  type === opt.value
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border text-ink-muted hover:text-ink"
                )}
              >
                <div>{opt.label}</div>
                <div className="mt-0.5 text-[10px] font-normal text-ink-muted">{opt.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-ink-muted">Cible</label>
          <div className="mb-2 flex gap-1 rounded-md border border-border p-1">
            {(
              [
                { value: "ITEM", label: "Tache" },
                { value: "TEAM", label: "Equipe" },
                { value: "EXTERNAL", label: "Systeme externe" },
              ] as { value: DependencyTargetKind; label: string }[]
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTargetKind(opt.value)}
                className={cn(
                  "flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors",
                  targetKind === opt.value ? "bg-accent text-white" : "text-ink-muted hover:text-ink"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {targetKind === "ITEM" && (
            <select
              value={targetItemId}
              onChange={(e) => setTargetItemId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-ink"
            >
              <option value="">Choisir une tache...</option>
              {Object.entries(itemsByRoadmap).map(([roadmapName, roadmapItems]) => (
                <optgroup key={roadmapName} label={roadmapName}>
                  {roadmapItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}

          {targetKind === "TEAM" && (
            <select
              value={targetRoadmapId}
              onChange={(e) => setTargetRoadmapId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-ink"
            >
              <option value="">Choisir une equipe...</option>
              {roadmapOptions.map((roadmap) => (
                <option key={roadmap.id} value={roadmap.id}>
                  {roadmap.name}
                </option>
              ))}
            </select>
          )}

          {targetKind === "EXTERNAL" && (
            <input
              type="text"
              value={externalSystemName}
              onChange={(e) => setExternalSystemName(e.target.value)}
              placeholder="Nom du systeme (ex : API partenaire, prestataire...)"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-ink placeholder:text-ink-muted"
            />
          )}
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-ink-muted">Note (optionnel)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Precision sur cette dependance..."
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-xs text-ink placeholder:text-ink-muted"
          />
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-status-blocked/40 bg-status-blocked/10 px-3 py-2 text-xs text-status-blocked">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-xs font-medium text-ink-muted hover:text-ink"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className="rounded-md bg-accent px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Creation..." : "Creer la dependance"}
          </button>
        </div>
      </div>
    </div>
  );
}
