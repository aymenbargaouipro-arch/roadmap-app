"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ROADMAP_COLOR_PALETTE, ROADMAP_EMOJI_OPTIONS, MAX_LOGO_BYTES } from "@/lib/roadmap-theme";

// Modale de creation, distincte de RoadmapSettingsModal (edition) pour ne pas toucher a ce
// composant deja en place et valide. Memes champs visuels, logique d'enregistrement propre :
// POST /api/roadmaps (creation, meme forme qu'avant) puis PATCH /api/roadmaps/{id} pour la
// couleur/icone/logo, en reutilisant exactement le payload deja valide par la modale d'edition.
//
// Gere son propre etat d'ouverture (comme RoadmapSettingsModal) : pas de navigation vers une
// route separee, la page appelante (ex: dashboard) reste visible derriere l'overlay.
export function RoadmapCreateModal({ label = "Nouvelle roadmap" }: { label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(ROADMAP_COLOR_PALETTE[0].value);
  const [iconMode, setIconMode] = useState<"emoji" | "logo">("emoji");
  const [icon, setIcon] = useState(ROADMAP_EMOJI_OPTIONS[0]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      setError("Image trop lourde (500 Ko max).");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => setLogoUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const createRes = await fetch("/api/roadmaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description.trim() || null }),
      });
      const createData = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        setError(createData.error ?? `Erreur ${createRes.status} lors de la création.`);
        return;
      }

      const newRoadmapId = createData.id;

      await fetch(`/api/roadmaps/${newRoadmapId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description.trim() || null,
          color,
          icon: iconMode === "emoji" ? icon : null,
          logoUrl: iconMode === "logo" ? logoUrl : null,
        }),
      });

      router.push(`/roadmaps/${newRoadmapId}`);
    } catch {
      setError("Erreur réseau.");
    } finally {
      setSaving(false);
    }
  }

  function close() {
    setOpen(false);
  }

  return (
    <>
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus size={15} />
        {label}
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-y-auto rounded-lg border border-border bg-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Nouvelle roadmap</h2>
              <button
                type="button"
                onClick={close}
                className="rounded-md p-1 text-ink-muted hover:bg-background"
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rm-new-name">Titre</Label>
            <Input
              id="rm-new-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Équipe A · Refonte checkout"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rm-new-desc">Description</Label>
            <textarea
              id="rm-new-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Une phrase pour situer le projet (optionnel)"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-ink"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Couleur</Label>
            <div className="flex flex-wrap gap-2">
              {ROADMAP_COLOR_PALETTE.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  title={c.name}
                  aria-label={c.name}
                  className={cn(
                    "h-7 w-7 rounded-full border-2 transition-transform",
                    color === c.value ? "scale-110 border-ink" : "border-transparent"
                  )}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Icône</Label>
            <div className="mb-2 flex gap-1 rounded-md border border-border p-1" style={{ width: "fit-content" }}>
              <button
                type="button"
                onClick={() => setIconMode("emoji")}
                className={cn(
                  "rounded px-3 py-1.5 text-xs font-medium transition-colors",
                  iconMode === "emoji" ? "bg-accent text-white" : "text-ink-muted hover:text-ink"
                )}
              >
                Emoji
              </button>
              <button
                type="button"
                onClick={() => setIconMode("logo")}
                className={cn(
                  "rounded px-3 py-1.5 text-xs font-medium transition-colors",
                  iconMode === "logo" ? "bg-accent text-white" : "text-ink-muted hover:text-ink"
                )}
              >
                Logo importé
              </button>
            </div>

            {iconMode === "emoji" ? (
              <div className="flex flex-wrap gap-1.5">
                {ROADMAP_EMOJI_OPTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setIcon(e)}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-md border text-lg",
                      icon === e ? "border-accent bg-accent/10" : "border-border bg-background"
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Logo" className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-border text-ink-muted">
                    <Upload size={16} />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                    Choisir une image
                  </Button>
                  {logoUrl && (
                    <button
                      type="button"
                      onClick={() => setLogoUrl(null)}
                      className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-danger"
                    >
                      <Trash2 size={12} />
                      Retirer
                    </button>
                  )}
                  <p className="text-[11px] text-ink-muted">PNG/JPG/SVG/WebP, 500 Ko max.</p>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-md border border-status-blocked/40 bg-status-blocked/10 px-3 py-2 text-xs text-status-blocked">
              {error}
            </div>
          )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={close}>
                  Annuler
                </Button>
                <Button onClick={handleSave} disabled={saving || !name.trim()}>
                  {saving ? "Création..." : "Créer la roadmap"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
