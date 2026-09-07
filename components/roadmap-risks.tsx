"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TriangleAlert, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Risk = {
  id: string;
  title: string;
  impact: string;
  probability: string;
  status: string;
};

const LEVELS = [
  { value: "LOW", label: "Faible" },
  { value: "MEDIUM", label: "Moyen" },
  { value: "HIGH", label: "Fort" },
];

const RISK_STATUSES = [
  { value: "OPEN", label: "Ouvert" },
  { value: "MITIGATED", label: "Mitigé" },
  { value: "CLOSED", label: "Clos" },
];

export function RoadmapRisks({ roadmapId, risks }: { roadmapId: string; risks: Risk[] }) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);

  async function handleFieldChange(riskId: string, field: string, value: string) {
    await fetch(`/api/risks/${riskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    router.refresh();
  }

  async function handleDelete(riskId: string) {
    await fetch(`/api/risks/${riskId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          <TriangleAlert size={14} className="text-status-progress" />
          Risques <span className="text-ink">({risks.length})</span>
        </h2>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowCreate(true)}>
          <Plus size={14} />
          Ajouter un risque
        </Button>
      </div>

      {risks.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-ink-muted">Aucun risque identifié.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-ink-muted">
                <th className="px-5 py-3 font-medium">Titre</th>
                <th className="px-5 py-3 font-medium">Impact</th>
                <th className="px-5 py-3 font-medium">Probabilité</th>
                <th className="px-5 py-3 font-medium">Statut</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {risks.map((risk) => (
                <tr key={risk.id} className="transition-colors hover:bg-background/30">
                  <td className="px-5 py-3.5">
                    <EditableText
                      value={risk.title}
                      onSave={(v) => handleFieldChange(risk.id, "title", v)}
                      className="font-medium text-ink"
                    />
                  </td>
                  <td className="px-5 py-3.5">
                    <Select value={risk.impact} onValueChange={(v) => handleFieldChange(risk.id, "impact", v)}>
                      <SelectTrigger className="w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEVELS.map((l) => (
                          <SelectItem key={l.value} value={l.value}>
                            {l.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-5 py-3.5">
                    <Select
                      value={risk.probability}
                      onValueChange={(v) => handleFieldChange(risk.id, "probability", v)}
                    >
                      <SelectTrigger className="w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEVELS.map((l) => (
                          <SelectItem key={l.value} value={l.value}>
                            {l.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-5 py-3.5">
                    <Select value={risk.status} onValueChange={(v) => handleFieldChange(risk.id, "status", v)}>
                      <SelectTrigger className="w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RISK_STATUSES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => handleDelete(risk.id)}
                      className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger"
                      aria-label="Supprimer le risque"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <RiskCreateModal
          roadmapId={roadmapId}
          onClose={() => setShowCreate(false)}
          onCreated={() => router.refresh()}
        />
      )}
    </div>
  );
}

function EditableText({
  value,
  onSave,
  className,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [display, setDisplay] = useState(value);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDisplay(value);
  }, [value, editing]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(display);
          setEditing(true);
        }}
        className={cn("text-left decoration-dotted hover:underline", className)}
      >
        {display}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        const trimmed = draft.trim();
        if (trimmed && trimmed !== display) {
          setDisplay(trimmed);
          onSave(trimmed);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(display);
          setEditing(false);
        }
      }}
      className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-ink"
    />
  );
}

function RiskCreateModal({
  roadmapId,
  onClose,
  onCreated,
}: {
  roadmapId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [impact, setImpact] = useState("MEDIUM");
  const [probability, setProbability] = useState("MEDIUM");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    await fetch(`/api/roadmaps/${roadmapId}/risks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, impact, probability }),
    });

    setLoading(false);
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl"
      >
        <h2 className="mb-4 text-sm font-semibold text-ink">Nouveau risque</h2>

        <div className="mb-3 flex flex-col gap-1.5">
          <Label htmlFor="risk-title">Titre</Label>
          <Input id="risk-title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        </div>
        <div className="mb-4 flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label>Impact</Label>
            <Select value={impact} onValueChange={setImpact}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEVELS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label>Probabilité</Label>
            <Select value={probability} onValueChange={setProbability}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEVELS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "..." : "Créer"}
          </Button>
        </div>
      </form>
    </div>
  );
}
