"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface MilestoneModalProps {
  roadmapId: string;
  initialDate?: string;
  onClose: () => void;
  onCreated: () => void;
}

export function MilestoneModal({ roadmapId, initialDate = "", onClose, onCreated }: MilestoneModalProps) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(initialDate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/roadmaps/${roadmapId}/milestones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, date }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Erreur lors de la création.");
      return;
    }
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl"
      >
        <h2 className="mb-4 text-sm font-semibold text-ink">Nouveau jalon</h2>

        <div className="mb-3 flex flex-col gap-1.5">
          <Label htmlFor="milestone-title">Titre</Label>
          <Input id="milestone-title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        </div>
        <div className="mb-4 flex flex-col gap-1.5">
          <Label htmlFor="milestone-date">Date</Label>
          <Input id="milestone-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>

        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

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
