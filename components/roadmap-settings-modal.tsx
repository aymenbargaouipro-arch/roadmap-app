"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Settings, X, Upload, Trash2, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ROADMAP_COLOR_PALETTE, ROADMAP_EMOJI_OPTIONS, MAX_LOGO_BYTES } from "@/lib/roadmap-theme";

export type RoadmapSettingsInitial = {
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  logoUrl: string | null;
};

export function RoadmapSettingsModal({
  roadmapId,
  initial,
}: {
  roadmapId: string;
  initial: RoadmapSettingsInitial;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [color, setColor] = useState(initial.color ?? ROADMAP_COLOR_PALETTE[0].value);
  const [iconMode, setIconMode] = useState<"emoji" | "logo">(initial.logoUrl ? "logo" : "emoji");
  const [icon, setIcon] = useState(initial.icon ?? ROADMAP_EMOJI_OPTIONS[0]);
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logoUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mapping Jira : charge a l'ouverture de la modale (options + valeurs actuelles),
  // pas au montage du composant, pour eviter un appel Jira a chaque chargement de page.
  const [jiraLoading, setJiraLoading] = useState(false);
  const [jiraError, setJiraError] = useState<string | null>(null);
  const [jiraNotConnected, setJiraNotConnected] = useState(false);
  const [jiraProjects, setJiraProjects] = useState<{ key: string; name: string }[]>([]);
  const [jiraDateFields, setJiraDateFields] = useState<{ id: string; name: string }[]>([]);
  const [jiraProjectKey, setJiraProjectKey] = useState<string>("");
  const [jiraStartDateFieldId, setJiraStartDateFieldId] = useState<string>("");
  const [jiraEndDateFieldId, setJiraEndDateFieldId] = useState<string>("");
  const [jiraSyncFromDate, setJiraSyncFromDate] = useState<string>("");
  const [jiraLoaded, setJiraLoaded] = useState(false);

  async function loadJiraMapping() {
    if (jiraLoaded || jiraLoading) return;
    setJiraLoading(true);
    setJiraError(null);
    setJiraNotConnected(false);
    try {
      const res = await fetch(`/api/roadmaps/${roadmapId}/jira-mapping`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 400) setJiraNotConnected(true);
        else setJiraError(data.error ?? `Erreur ${res.status}.`);
        return;
      }
      setJiraProjects(data.projects ?? []);
      setJiraDateFields(data.dateFields ?? []);
      setJiraProjectKey(data.current?.jiraProjectKey ?? "");
      setJiraStartDateFieldId(data.current?.jiraStartDateFieldId ?? "");
      setJiraEndDateFieldId(data.current?.jiraEndDateFieldId ?? "");
      setJiraSyncFromDate(data.current?.jiraSyncFromDate ?? "");
      setJiraLoaded(true);
    } catch {
      setJiraError("Erreur réseau lors du chargement des options Jira.");
    } finally {
      setJiraLoading(false);
    }
  }

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
      const res = await fetch(`/api/roadmaps/${roadmapId}`, {
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Erreur ${res.status}.`);
        return;
      }

      if (jiraLoaded) {
        const jiraRes = await fetch(`/api/roadmaps/${roadmapId}/jira-mapping`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jiraProjectKey: jiraProjectKey || null,
            jiraStartDateFieldId: jiraStartDateFieldId || null,
            jiraEndDateFieldId: jiraEndDateFieldId || null,
            jiraSyncFromDate: jiraSyncFromDate || null,
          }),
        });
        if (!jiraRes.ok) {
          const jiraData = await jiraRes.json().catch(() => ({}));
          setError(jiraData.error ?? "Réglages enregistrés, mais le mapping Jira a échoué.");
          return;
        }
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          loadJiraMapping();
        }}
        style={{ width: 30, height: 30, padding: 0, flexShrink: 0 }}
        className="flex items-center justify-center rounded-md border border-border bg-surface text-ink-muted hover:bg-background"
        title="Paramètres"
        aria-label="Paramètres de la roadmap"
      >
        <Settings size={14} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-y-auto rounded-lg border border-border bg-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Paramètres de la roadmap</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-ink-muted hover:bg-background"
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rm-name">Titre</Label>
                <Input id="rm-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rm-desc">Description</Label>
                <textarea
                  id="rm-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
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

              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <Label className="flex items-center gap-1.5">
                  <Plug size={13} className="text-accent" />
                  Synchronisation Jira
                </Label>

                {jiraLoading && <p className="text-xs text-ink-muted">Chargement des options Jira...</p>}

                {jiraNotConnected && (
                  <p className="text-xs text-ink-muted">
                    Jira n'est pas connecté pour ce workspace. Configure-le dans{" "}
                    <a href="/settings" className="text-accent hover:underline">
                      Paramètres
                    </a>
                    .
                  </p>
                )}

                {jiraError && (
                  <div className="rounded-md border border-status-blocked/40 bg-status-blocked/10 px-3 py-2 text-xs text-status-blocked">
                    {jiraError}
                  </div>
                )}

                {jiraLoaded && (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-normal text-ink-muted">Projet Jira</Label>
                      <Select value={jiraProjectKey || "__none__"} onValueChange={(v) => setJiraProjectKey(v === "__none__" ? "" : v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Aucun" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">
                            <span className="text-ink-muted">Aucun (pas de synchro)</span>
                          </SelectItem>
                          {jiraProjects.map((p) => (
                            <SelectItem key={p.key} value={p.key}>
                              {p.name} ({p.key})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex flex-1 flex-col gap-1.5">
                        <Label className="text-xs font-normal text-ink-muted">Champ "Date de début"</Label>
                        <Select
                          value={jiraStartDateFieldId || "__none__"}
                          onValueChange={(v) => setJiraStartDateFieldId(v === "__none__" ? "" : v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Non défini" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">
                              <span className="text-ink-muted">Non défini</span>
                            </SelectItem>
                            {jiraDateFields.map((f) => (
                              <SelectItem key={f.id} value={f.id}>
                                {f.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-1 flex-col gap-1.5">
                        <Label className="text-xs font-normal text-ink-muted">Champ "Date de fin"</Label>
                        <Select
                          value={jiraEndDateFieldId || "__none__"}
                          onValueChange={(v) => setJiraEndDateFieldId(v === "__none__" ? "" : v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Non défini" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">
                              <span className="text-ink-muted">Non défini</span>
                            </SelectItem>
                            {jiraDateFields.map((f) => (
                              <SelectItem key={f.id} value={f.id}>
                                {f.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-normal text-ink-muted">Synchroniser depuis le</Label>
                      <Input
                        type="date"
                        value={jiraSyncFromDate}
                        onChange={(e) => setJiraSyncFromDate(e.target.value)}
                      />
                      <p className="text-[11px] text-ink-muted">
                        Les tickets dont la date de début est antérieure ne seront pas importés. Laisse vide pour tout
                        remonter.
                      </p>
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
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Annuler
                </Button>
                <Button onClick={handleSave} disabled={saving || !name.trim()}>
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
