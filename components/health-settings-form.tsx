"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type HealthThresholdsInput = {
  lateRatioRedThreshold: number;
  lateCountOrangeThreshold: number;
  blockedItemTriggersRed: boolean;
  activeDependencyTriggersRed: boolean;
  highRiskTriggersRed: boolean;
  mediumRiskTriggersOrange: boolean;
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

export function HealthSettingsForm({ initial }: { initial: HealthThresholdsInput }) {
  const router = useRouter();
  const [values, setValues] = useState<HealthThresholdsInput>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update<K extends keyof HealthThresholdsInput>(key: K, value: HealthThresholdsInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/health", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
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
                value={values.lateRatioRedThreshold}
                onChange={(e) => update("lateRatioRedThreshold", Number(e.target.value))}
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
                value={values.lateCountOrangeThreshold}
                onChange={(e) => update("lateCountOrangeThreshold", Number(e.target.value))}
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
            <Toggle checked={values.blockedItemTriggersRed} onChange={(v) => update("blockedItemTriggersRed", v)} />
          </SettingRow>

          <SettingRow
            label="Dépendance active non résolue → Critique"
            description="Une dépendance bloquante en attente suffit à passer la roadmap en Critique."
          >
            <Toggle
              checked={values.activeDependencyTriggersRed}
              onChange={(v) => update("activeDependencyTriggersRed", v)}
            />
          </SettingRow>

          <SettingRow
            label="Risque impact fort ET probabilité forte → Critique"
            description="Un risque ouvert combinant les deux fait passer la roadmap en Critique."
          >
            <Toggle checked={values.highRiskTriggersRed} onChange={(v) => update("highRiskTriggersRed", v)} />
          </SettingRow>

          <SettingRow
            label="Risque impact ou probabilité moyenne → À surveiller"
            description="Un risque ouvert avec au moins un critère moyen fait passer la roadmap en À surveiller."
          >
            <Toggle
              checked={values.mediumRiskTriggersOrange}
              onChange={(v) => update("mediumRiskTriggersOrange", v)}
            />
          </SettingRow>
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
