"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  TriangleAlert,
  Trash2,
  FileSpreadsheet,
  Image as ImageIcon,
  Flag,
  CornerDownRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type RoadmapOption = { id: string; name: string };
type Member = { id: string; name: string };

type ItemLevel = "epic" | "subitem" | "flat";

type PreviewItem = {
  rowId: string;
  parentRowId: string | null;
  level: ItemLevel;
  title: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  progress: number;
  ownerId: string | null;
  ownerName: string | null;
};

type PreviewMilestone = { title: string; date: string | null };

type AnalyzeResponse = {
  suggestedRoadmapName: string;
  items: PreviewItem[];
  milestones: PreviewMilestone[];
  warnings: string[];
};

type SourceMode = "excel" | "image";

const STATUSES = [
  { value: "TODO", label: "À faire" },
  { value: "IN_PROGRESS", label: "En cours" },
  { value: "BLOCKED", label: "Bloqué" },
  { value: "DONE", label: "Terminé" },
];

type Step = "upload" | "analyzing" | "preview" | "confirming";

export function ImportWizard({ roadmaps, members }: { roadmaps: RoadmapOption[]; members: Member[] }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [mode, setMode] = useState<SourceMode>("excel");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [warnings, setWarnings] = useState<string[]>([]);
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [milestones, setMilestones] = useState<PreviewMilestone[]>([]);

  const [targetMode, setTargetMode] = useState<"new" | "existing">("new");
  const [newName, setNewName] = useState("");
  const [existingRoadmapId, setExistingRoadmapId] = useState(roadmaps[0]?.id ?? "");

  const epicCount = items.filter((it) => it.level === "epic").length;

  function selectMode(next: SourceMode) {
    if (next === mode) return;
    setMode(next);
    setFile(null);
    setError(null);
  }

  async function handleAnalyze() {
    if (!file) return;
    setStep("analyzing");
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const endpoint = mode === "excel" ? "/api/import/analyze" : "/api/import/analyze-image";
      const res = await fetch(endpoint, { method: "POST", body: formData });
      const data: AnalyzeResponse & { error?: string } = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? `Erreur ${res.status} lors de l'analyse.`);
        setStep("upload");
        return;
      }

      setWarnings(data.warnings);
      setItems(data.items);
      setMilestones(data.milestones);
      setNewName(data.suggestedRoadmapName);
      setStep("preview");
    } catch {
      setError("Erreur réseau lors de l'analyse du fichier.");
      setStep("upload");
    }
  }

  async function handleConfirm() {
    setStep("confirming");
    setError(null);

    const target =
      targetMode === "new"
        ? { mode: "new" as const, name: newName }
        : { mode: "existing" as const, roadmapId: existingRoadmapId };

    try {
      const res = await fetch("/api/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          items: items.map((it) => ({
            rowId: it.rowId,
            parentRowId: it.parentRowId,
            title: it.title,
            startDate: it.startDate,
            endDate: it.endDate,
            status: it.status,
            progress: it.progress,
            ownerId: it.ownerId,
          })),
          milestones,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? `Erreur ${res.status} lors de la création.`);
        setStep("preview");
        return;
      }

      router.push(`/roadmaps/${data.roadmapId}`);
      router.refresh();
    } catch {
      setError("Erreur réseau lors de la création.");
      setStep("preview");
    }
  }

  function updateItem(index: number, patch: Partial<PreviewItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function removeMilestone(index: number) {
    setMilestones((prev) => prev.filter((_, i) => i !== index));
  }

  const canConfirm =
    items.length > 0 && (targetMode === "new" ? newName.trim() !== "" : existingRoadmapId !== "");

  if (step === "upload" || step === "analyzing") {
    return (
      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="mb-4 flex gap-1 rounded-md border border-border p-1" style={{ width: "fit-content" }}>
          <button
            type="button"
            onClick={() => selectMode("excel")}
            className={cn(
              "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors",
              mode === "excel" ? "bg-accent text-white" : "text-ink-muted hover:text-ink"
            )}
          >
            <FileSpreadsheet size={13} />
            Excel
          </button>
          <button
            type="button"
            onClick={() => selectMode("image")}
            className={cn(
              "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors",
              mode === "image" ? "bg-accent text-white" : "text-ink-muted hover:text-ink"
            )}
          >
            <ImageIcon size={13} />
            Image
          </button>
        </div>

        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border bg-background/40 px-6 py-12 text-center">
          {mode === "excel" ? (
            <FileSpreadsheet size={28} className="text-accent" />
          ) : (
            <ImageIcon size={28} className="text-accent" />
          )}
          <div>
            <p className="text-sm font-medium text-ink">
              {file ? file.name : mode === "excel" ? "Choisis un fichier Excel (.xlsx)" : "Choisis une image (PNG, JPEG, WebP)"}
            </p>
            <p className="mt-1 max-w-md text-xs text-ink-muted">
              {mode === "excel"
                ? "L'IA identifie automatiquement les colonnes (titre, dates, statut, avancement, owner) et détecte les regroupements Epic / sous-item si le fichier en contient"
                : "L'IA lit le tableau ou le planning visible dans l'image et détecte les colonnes ainsi que les regroupements Epic / sous-item (par texte ou par mise en forme). La lecture visuelle est moins fiable qu'un Excel : vérifie bien chaque ligne à l'étape suivante"}
            </p>
          </div>
          <label className="cursor-pointer">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-ink hover:bg-background">
              <Upload size={14} />
              Choisir un fichier
            </span>
            <input
              type="file"
              accept={mode === "excel" ? ".xlsx,.xls" : "image/png,image/jpeg,image/webp"}
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-status-blocked/40 bg-status-blocked/10 px-3 py-2 text-xs text-status-blocked">
            {error}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button onClick={handleAnalyze} disabled={!file || step === "analyzing"}>
            {step === "analyzing" ? "Analyse en cours..." : "Analyser le fichier"}
          </Button>
        </div>
      </div>
    );
  }

  // step === "preview" ou "confirming"
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">Créer dans</h2>
        <div className="mb-3 flex gap-1 rounded-md border border-border p-1" style={{ width: "fit-content" }}>
          <button
            type="button"
            onClick={() => setTargetMode("new")}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-medium transition-colors",
              targetMode === "new" ? "bg-accent text-white" : "text-ink-muted hover:text-ink"
            )}
          >
            Nouvelle roadmap
          </button>
          <button
            type="button"
            onClick={() => setTargetMode("existing")}
            disabled={roadmaps.length === 0}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              targetMode === "existing" ? "bg-accent text-white" : "text-ink-muted hover:text-ink"
            )}
          >
            Roadmap existante
          </button>
        </div>

        {targetMode === "new" ? (
          <div className="flex max-w-sm flex-col gap-1.5">
            <Label htmlFor="import-roadmap-name">Nom de la roadmap</Label>
            <Input id="import-roadmap-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
        ) : (
          <div className="flex max-w-sm flex-col gap-1.5">
            <Label>Roadmap cible</Label>
            <Select value={existingRoadmapId} onValueChange={setExistingRoadmapId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roadmaps.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="rounded-lg border border-status-progress/40 bg-status-progress/10 p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-status-progress">
            <TriangleAlert size={13} />
            {warnings.length} point{warnings.length > 1 ? "s" : ""} à vérifier
          </h3>
          <ul className="space-y-1 text-xs text-ink-muted">
            {warnings.map((w, i) => (
              <li key={i}>· {w}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-muted">
            Les lignes concernées sont surlignées ci-dessous : corrige directement les champs avant de confirmer.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Items <span className="text-ink">({items.length})</span>
          </h2>
          {epicCount > 0 && (
            <span className="text-xs text-ink-muted">
              {epicCount} Epic{epicCount > 1 ? "s" : ""} détecté{epicCount > 1 ? "s" : ""} · rattachement en
              lecture seule pour l'instant
            </span>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-muted">Aucun item à importer.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-ink-muted">
                  <th className="px-5 py-2.5 font-medium">Titre</th>
                  <th className="px-5 py-2.5 font-medium">Dates</th>
                  <th className="px-5 py-2.5 font-medium">Owner</th>
                  <th className="px-5 py-2.5 font-medium">Avancement</th>
                  <th className="px-5 py-2.5 font-medium">Statut</th>
                  <th className="px-5 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item, index) => {
                  const hasDateIssue = !item.startDate || !item.endDate;
                  const hasOwnerIssue = !!item.ownerName && !item.ownerId;
                  const rowHighlighted = hasDateIssue || hasOwnerIssue;
                  const parentTitle =
                    item.level === "subitem" && item.parentRowId
                      ? items.find((p) => p.rowId === item.parentRowId)?.title ?? null
                      : null;

                  return (
                    <tr key={item.rowId} className={cn(rowHighlighted && "bg-status-blocked/5")}>
                      <td className="px-5 py-2.5">
                        <div
                          className="flex items-center gap-1.5"
                          style={{ paddingLeft: item.level === "subitem" ? 20 : 0 }}
                        >
                          {item.level === "epic" && (
                            <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                              Epic
                            </span>
                          )}
                          {item.level === "subitem" && (
                            <span
                              className="shrink-0 text-ink-muted"
                              title={parentTitle ? `Sous-item de "${parentTitle}"` : "Sous-item"}
                            >
                              <CornerDownRight size={13} />
                            </span>
                          )}
                          <input
                            value={item.title}
                            onChange={(e) => updateItem(index, { title: e.target.value })}
                            className="w-full min-w-[160px] rounded-md border border-border bg-background px-2 py-1 text-sm text-ink"
                          />
                        </div>
                      </td>
                      <td className="px-5 py-2.5">
                        <div className={cn("flex items-center gap-1", hasDateIssue && "rounded-md ring-1 ring-status-blocked/50")}>
                          <input
                            type="date"
                            value={item.startDate ?? ""}
                            onChange={(e) => updateItem(index, { startDate: e.target.value || null })}
                            className="rounded-md border border-border bg-background px-1.5 py-1 text-xs text-ink"
                          />
                          <span className="text-ink-muted">→</span>
                          <input
                            type="date"
                            value={item.endDate ?? ""}
                            onChange={(e) => updateItem(index, { endDate: e.target.value || null })}
                            className="rounded-md border border-border bg-background px-1.5 py-1 text-xs text-ink"
                          />
                        </div>
                      </td>
                      <td className="px-5 py-2.5">
                        <Select
                          value={item.ownerId ?? "__none__"}
                          onValueChange={(v) => updateItem(index, { ownerId: v === "__none__" ? null : v })}
                        >
                          <SelectTrigger className={cn("w-[140px]", hasOwnerIssue && "border-status-blocked/50")}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">
                              <span className="text-ink-muted">Non assigné</span>
                            </SelectItem>
                            {members.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {hasOwnerIssue && (
                          <p className="mt-1 text-[10px] text-status-blocked">détecté : "{item.ownerName}"</p>
                        )}
                      </td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={item.progress}
                            onChange={(e) =>
                              updateItem(index, {
                                progress: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                              })
                            }
                            className="w-14 rounded-md border border-border bg-background px-1.5 py-1 text-xs text-ink"
                          />
                          <span className="text-xs text-ink-muted">%</span>
                        </div>
                      </td>
                      <td className="px-5 py-2.5">
                        <Select value={item.status} onValueChange={(v) => updateItem(index, { status: v })}>
                          <SelectTrigger className="w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <button
                          onClick={() => removeItem(index)}
                          className="rounded-md p-1 text-ink-muted hover:bg-danger/10 hover:text-danger"
                          aria-label="Retirer cet item de l'import"
                        >
                          <Trash2 size={13} />
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

      {milestones.length > 0 && (
        <div className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-5 py-4">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <Flag size={13} className="text-accent" />
              Jalons <span className="text-ink">({milestones.length})</span>
            </h2>
          </div>
          <ul className="divide-y divide-border">
            {milestones.map((m, index) => (
              <li key={index} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className="flex-1 text-ink">{m.title}</span>
                <input
                  type="date"
                  value={m.date ?? ""}
                  onChange={(e) =>
                    setMilestones((prev) =>
                      prev.map((mm, i) => (i === index ? { ...mm, date: e.target.value || null } : mm))
                    )
                  }
                  className="rounded-md border border-border bg-background px-1.5 py-1 text-xs text-ink"
                />
                <button
                  onClick={() => removeMilestone(index)}
                  className="rounded-md p-1 text-ink-muted hover:bg-danger/10 hover:text-danger"
                  aria-label="Retirer ce jalon de l'import"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-status-blocked/40 bg-status-blocked/10 px-3 py-2 text-xs text-status-blocked">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setStep("upload");
            setFile(null);
          }}
        >
          Annuler
        </Button>
        <Button onClick={handleConfirm} disabled={!canConfirm || step === "confirming"}>
          {step === "confirming" ? "Création..." : `Confirmer l'import (${items.length} item${items.length > 1 ? "s" : ""})`}
        </Button>
      </div>
    </div>
  );
}
