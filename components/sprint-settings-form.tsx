"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { computeSprintBands } from "@/lib/sprints";

export type SprintSettingsInitial = {
  referenceDate: string | null;
  durationWeeks: number | null;
  referenceNumber: number | null;
};

export function SprintSettingsForm({ initial }: { initial: SprintSettingsInitial }) {
  const router = useRouter();
  const [referenceDate, setReferenceDate] = useState(initial.referenceDate ?? "");
  const [durationWeeks, setDurationWeeks] = useState(initial.durationWeeks ?? 2);
  const [referenceNumber, setReferenceNumber] = useState(initial.referenceNumber ?? 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Petit apercu en direct, reutilise la meme fonction que celle qui alimentera les Gantt :
  // aide a verifier tout de suite que la config saisie donne le resultat attendu.
  const preview = useMemo(() => {
    if (!referenceDate || !durationWeeks) return null;
    const ref = new Date(referenceDate);
    if (isNaN(ref.getTime())) return null;
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const bands = computeSprintBands({ referenceDate: ref, durationWeeks, referenceNumber }, today, tomorrow);
    return bands[0] ?? null;
  }, [referenceDate, durationWeeks, referenceNumber]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/sprints", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceDate, durationWeeks, referenceNumber }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Erreur ${res.status}.`);
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Sprints</h2>
      <p className="mb-4 text-xs text-ink-muted">
        Un seul calendrier pour tout le workspace, affiché en bandeau sur tous les Gantt (roadmaps individuelles et
        vue consolidée).
      </p>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sprint-ref-date">Date de début d&apos;un sprint de référence</Label>
          <Input
            id="sprint-ref-date"
            type="date"
            value={referenceDate}
            onChange={(e) => {
              setReferenceDate(e.target.value);
              setSaved(false);
            }}
            className="w-44"
          />
        </div>

        <div className="flex gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sprint-duration">Durée (semaines)</Label>
            <Input
              id="sprint-duration"
              type="number"
              min={1}
              value={durationWeeks}
              onChange={(e) => {
                setDurationWeeks(Number(e.target.value));
                setSaved(false);
              }}
              className="w-20"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sprint-number">Numéro de ce sprint</Label>
            <Input
              id="sprint-number"
              type="number"
              value={referenceNumber}
              onChange={(e) => {
                setReferenceNumber(Number(e.target.value));
                setSaved(false);
              }}
              className="w-20"
            />
          </div>
        </div>

        {preview && (
          <p className="text-xs text-ink-muted">
            Aperçu : aujourd&apos;hui tombe dans <span className="font-medium text-ink">{preview.label}</span>.
          </p>
        )}

        {error && (
          <div className="rounded-md border border-status-blocked/40 bg-status-blocked/10 px-3 py-2 text-xs text-status-blocked">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving || !referenceDate}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
          {saved && <span className="text-xs text-ink-muted">Enregistré.</span>}
        </div>
      </div>
    </div>
  );
}
