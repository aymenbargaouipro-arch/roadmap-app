"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Flag, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MilestoneModal } from "@/components/milestone-modal";

type Milestone = {
  id: string;
  title: string;
  date: string;
};

export function RoadmapMilestones({ roadmapId, milestones }: { roadmapId: string; milestones: Milestone[] }) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);

  async function handleFieldChange(id: string, field: string, value: string) {
    await fetch(`/api/milestones/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    router.refresh();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/milestones/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          <Flag size={14} className="text-accent" />
          Jalons <span className="text-ink">({milestones.length})</span>
        </h2>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowCreate(true)}>
          <Plus size={14} />
          Ajouter un jalon
        </Button>
      </div>

      {milestones.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-ink-muted">Aucun jalon défini.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-ink-muted">
                <th className="px-5 py-3 font-medium">Titre</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {milestones.map((m) => (
                <tr key={m.id} className="transition-colors hover:bg-background/30">
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-2">
                      <Flag size={13} className="shrink-0 text-accent" />
                      <EditableText
                        value={m.title}
                        onSave={(v) => handleFieldChange(m.id, "title", v)}
                        className="font-medium text-ink"
                      />
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <EditableDate
                      value={m.date}
                      onSave={(v) => handleFieldChange(m.id, "date", v)}
                    />
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger"
                      aria-label="Supprimer le jalon"
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
        <MilestoneModal
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
      className="w-full max-w-[220px] rounded-md border border-border bg-background px-2 py-1 text-sm text-ink"
    />
  );
}

function EditableDate({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const isoDate = value.slice(0, 10);
  const [displayDate, setDisplayDate] = useState(isoDate);
  const [draft, setDraft] = useState(isoDate);

  useEffect(() => {
    if (!editing) setDisplayDate(isoDate);
  }, [isoDate, editing]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(displayDate);
          setEditing(true);
        }}
        className="text-left text-xs text-ink-muted decoration-dotted hover:underline"
      >
        {format(new Date(displayDate), "d MMMM yyyy", { locale: fr })}
      </button>
    );
  }

  return (
    <Input
      type="date"
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft && draft !== displayDate) {
          setDisplayDate(draft);
          onSave(draft);
        }
      }}
      className="h-8 w-[150px] text-xs"
    />
  );
}

