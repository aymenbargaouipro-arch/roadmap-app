"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { computeSprintBands } from "@/lib/sprints";

type HealthThresholdsInput = {
  lateRatioRedThreshold: number;
  lateCountOrangeThreshold: number;
  blockedItemTriggersRed: boolean;
  activeDependencyTriggersRed: boolean;
  highRiskTriggersRed: boolean;
  mediumRiskTriggersOrange: boolean;
};

type SprintInitial = {
  referenceDate: string | null;
  durationWeeks: number | null;
  referenceNumber: number | null;
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full border border-border transition-colors",
        checked ? "bg-accent" : "bg-background"
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform",
          checked && "translate-x-[18px]"
        )}
      />
    </button>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="mt-0.5 text-xs text-ink-muted">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// Formulaire unique regroupant seuils de sante ET calendrier de sprints, avec un seul bouton
// Enregistrer qui sauvegarde les deux (deux appels API distincts en parallele, deux routes
// existantes reutilisees telles quelles).
export function WorkspaceSettingsForm({
  initialHealth,
  initialSprint,
}: {
  initialHealth: HealthThresholdsInput;
  initialSprint: SprintInitial;
}) {
  const router = useRouter();
  const [health, setHealth] = useState<HealthThresholdsInput>(initialHealth);
  const [referenceDate, setReferenceDate] = useState(initialSprint.referenceDate ?? "");
  const [durationWeeks, setDurationWeeks] = useState(initialSprint.durationWeeks ?? 2);
  const [referenceNumber, setReferenceNumber] = useState(initialSprint.referenceNumber ?? 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function updateHealth<K extends keyof HealthThresholdsInput>(key: K, value: HealthThresholdsInput[K]) {
    setHealth((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  const sprintPreview = useMemo(() => {
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
      const healthReq = fetch("/api/settings/health", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(health),
      });

      const sprintReq = referenceDate
        ? fetch("/api/settings/sprints", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ referenceDate, durationWeeks, referenceNumber }),
          })
        : Promise.resolve(null);

      const [healthRes, sprintRes] = await Promise.all([healthReq, sprintReq]);

      const healthData = await healthRes.json().catch(() => ({}));
      if (!healthRes.ok) {
        setError(healthData.error ?? `Erreur ${healthRes.status} (seuils de santé).`);
        return;
      }

      if (sprintRes) {
        const sprintData = await sprintRes.json().catch(() => ({}));
        if (!sprintRes.ok) {
          setError(sprintData.error ?? `Erreur ${sprintRes.status} (sprints).`);
          return;
        }
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
    <div className="flex max-w-2xl flex-col gap-5">
      <div className="rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">Retards</h2>
        <div className="flex flex-col gap-5">
          <SettingRow
            label="Seuil Critique : % d'items en retard"
            description="Au-delà de ce pourcentage d'items en retard, la roadmap passe en Critique."
          >
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={0}
                max={100}
                value={health.lateRatioRedThreshold}
                onChange={(e) => updateHealth("lateRatioRedThreshold", Number(e.target.value))}
                className="w-20"
              />
              <span className="text-sm text-ink-muted">%</span>
            </div>
          </SettingRow>

          <SettingRow
            label="Seuil À surveiller : nombre d'items en retard"
            description="À partir de ce nombre d'items en retard, la roadmap passe en À surveiller."
          >
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={0}
                value={health.lateCountOrangeThreshold}
                onChange={(e) => updateHealth("lateCountOrangeThreshold", Number(e.target.value))}
                className="w-20"
              />
              <span className="text-sm text-ink-muted invisible" aria-hidden="true">
                %
              </span>
            </div>
          </SettingRow>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Autres déclencheurs
        </h2>
        <div className="flex flex-col gap-5">
          <SettingRow
            label="Item bloqué → Critique"
            description="Un seul item bloqué suffit à passer la roadmap en Critique."
          >
            <Toggle checked={health.blockedItemTriggersRed} onChange={(v) => updateHealth("blockedItemTriggersRed", v)} />
          </SettingRow>

          <SettingRow
            label="Dépendance active non résolue → Critique"
            description="Une dépendance bloquante en attente suffit à passer la roadmap en Critique."
          >
            <Toggle
              checked={health.activeDependencyTriggersRed}
              onChange={(v) => updateHealth("activeDependencyTriggersRed", v)}
            />
          </SettingRow>

          <SettingRow
            label="Risque impact fort ET probabilité forte → Critique"
            description="Un risque ouvert combinant les deux fait passer la roadmap en Critique."
          >
            <Toggle checked={health.highRiskTriggersRed} onChange={(v) => updateHealth("highRiskTriggersRed", v)} />
          </SettingRow>

          <SettingRow
            label="Risque impact ou probabilité moyenne → À surveiller"
            description="Un risque ouvert avec au moins un critère moyen fait passer la roadmap en À surveiller."
          >
            <Toggle
              checked={health.mediumRiskTriggersOrange}
              onChange={(v) => updateHealth("mediumRiskTriggersOrange", v)}
            />
          </SettingRow>
        </div>
      </div>

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

          {sprintPreview && (
            <p className="text-xs text-ink-muted">
              Aperçu : aujourd&apos;hui tombe dans <span className="font-medium text-ink">{sprintPreview.label}</span>.
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-status-blocked/40 bg-status-blocked/10 px-3 py-2 text-xs text-status-blocked">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Enregistrement..." : "Enregistrer"}
        </Button>
        {saved && <span className="text-xs text-ink-muted">Enregistré.</span>}
      </div>
    </div>
  );
}
