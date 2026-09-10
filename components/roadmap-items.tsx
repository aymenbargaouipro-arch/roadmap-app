"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ListChecks,
  Plus,
  Trash2,
  Link2,
  Users,
  Globe2,
  User,
  X,
  ChevronRight,
  ChevronDown,
  CornerDownRight,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_ROADMAP_COLOR, withAlpha } from "@/lib/roadmap-theme";
import { DependencyModal, type WorkspaceItem } from "@/components/dependency-modal";
import { DateShiftModal, type DateShiftHistoryEntry } from "@/components/date-shift-modal";

type Dependency = {
  id: string;
  targetKind: "ITEM" | "TEAM" | "EXTERNAL";
  status: "PENDING" | "RESOLVED";
  note: string | null;
  blockingItem: { id: string; title: string; roadmap: { id: string; name: string } } | null;
  targetRoadmap: { id: string; name: string } | null;
  externalSystemName: string | null;
};

type Item = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  status: string;
  progress: number;
  ownerId: string | null;
  owner: { name: string } | null;
  parentId: string | null;
  blockedBy: Dependency[];
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  dateShifts: DateShiftHistoryEntry[];
};

type Member = { id: string; name: string };

const STATUSES = [
  { value: "TODO", label: "À faire", dot: "bg-status-todo" },
  { value: "IN_PROGRESS", label: "En cours", dot: "bg-status-progress" },
  { value: "BLOCKED", label: "Bloqué", dot: "bg-status-blocked" },
  { value: "DONE", label: "Terminé", dot: "bg-status-done" },
];

const PROGRESS_COLOR: Record<string, string> = {
  TODO: "bg-status-todo",
  IN_PROGRESS: "bg-status-progress",
  BLOCKED: "bg-status-blocked",
  DONE: "bg-status-done",
};

type Row = { item: Item; depth: 0 | 1; isEpic: boolean };

function buildHierarchy(items: Item[]): Row[] {
  const byParent = new Map<string, Item[]>();
  const roots: Item[] = [];

  for (const it of items) {
    if (it.parentId) {
      if (!byParent.has(it.parentId)) byParent.set(it.parentId, []);
      byParent.get(it.parentId)!.push(it);
    } else {
      roots.push(it);
    }
  }

  const rows: Row[] = [];
  for (const root of roots) {
    const children = byParent.get(root.id) ?? [];
    rows.push({ item: root, depth: 0, isEpic: children.length > 0 });
    for (const child of children) {
      rows.push({ item: child, depth: 1, isEpic: false });
    }
  }
  return rows;
}

export function RoadmapItems({
  roadmapId,
  items,
  workspaceItems,
  members,
  roadmapColor,
}: {
  roadmapId: string;
  items: Item[];
  workspaceItems: WorkspaceItem[];
  members: Member[];
  roadmapColor?: string | null;
}) {
  const router = useRouter();
  const accentColor = roadmapColor ?? DEFAULT_ROADMAP_COLOR;
  const [showCreate, setShowCreate] = useState<{ parentId: string | null; parentTitle?: string } | null>(null);
  const [dependencyModalItem, setDependencyModalItem] = useState<Item | null>(null);
  const [dateShiftModalItem, setDateShiftModalItem] = useState<Item | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{ itemId: string; childCount: number } | null>(null);

  const rows = useMemo(() => buildHierarchy(items), [items]);
  const visibleRows = rows.filter((r) => !(r.depth === 1 && r.item.parentId && collapsed.has(r.item.parentId)));

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleStatusChange(itemId: string, status: string) {
    await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  async function handleProgressChange(itemId: string, progress: number) {
    await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progress }),
    });
    router.refresh();
  }

  async function handleOwnerChange(itemId: string, ownerId: string) {
    await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerId: ownerId || null }),
    });
    router.refresh();
  }

  async function handleFieldChange(itemId: string, field: string, value: string | number) {
    await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    router.refresh();
  }

  async function handleAttach(itemId: string, parentId: string) {
    const res = await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error ?? "Erreur lors du rattachement.");
      return;
    }
    router.refresh();
  }

  async function handleDetach(itemId: string) {
    await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: "" }),
    });
    router.refresh();
  }

  async function handleDelete(itemId: string, cascade = false) {
    const res = await fetch(`/api/items/${itemId}${cascade ? "?cascade=true" : ""}`, { method: "DELETE" });

    if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      setDeleteConfirm({ itemId, childCount: data.childCount ?? 0 });
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Erreur lors de la suppression.");
      return;
    }
    setDeleteConfirm(null);
    router.refresh();
  }

  async function handleRemoveDependency(dependencyId: string) {
    try {
      const res = await fetch(`/api/dependencies/${dependencyId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? `Erreur ${res.status} lors de la suppression.`);
        return;
      }
      router.refresh();
    } catch {
      alert("Erreur réseau lors de la suppression de la dépendance.");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          <ListChecks size={14} className="text-accent" />
          Items <span className="text-ink">({items.length})</span>
        </h2>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowCreate({ parentId: null })}>
          <Plus size={14} />
          Ajouter un item
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-ink-muted">
          Aucun item pour l'instant. Ajoutez-en un pour commencer.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-ink-muted">
                <th className="px-5 py-3 font-semibold">Tâche</th>
                <th className="px-5 py-3 font-semibold">Dates</th>
                <th className="px-5 py-3 font-semibold">Owner</th>
                <th className="px-5 py-3 font-semibold">Avancement</th>
                <th className="px-5 py-3 font-semibold">Statut</th>
                <th className="px-5 py-3 font-semibold">Dépendances</th>
                <th className="px-5 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleRows.map(({ item, depth, isEpic }) => {
                const availableEpicTargets = items.filter((i) => !i.parentId && i.id !== item.id);
                const parentTitle = item.parentId ? items.find((i) => i.id === item.parentId)?.title : null;

                return (
                  <tr
                    key={item.id}
                    className="align-top transition-colors hover:bg-background/30"
                    style={isEpic ? { backgroundColor: withAlpha(accentColor, "0D") } : undefined}
                  >
                    <td
                      className="px-5 py-3.5"
                      style={{
                        paddingLeft: depth === 1 ? "2.75rem" : "1.25rem",
                        borderLeft: isEpic ? `3px solid ${withAlpha(accentColor, "66")}` : undefined,
                      }}
                    >
                      <div className="flex items-start gap-1.5">
                        {isEpic ? (
                          <button
                            type="button"
                            onClick={() => toggleCollapsed(item.id)}
                            className="mt-0.5 shrink-0 text-ink-muted hover:text-ink"
                            aria-label={collapsed.has(item.id) ? "Déplier" : "Replier"}
                          >
                            {collapsed.has(item.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          </button>
                        ) : depth === 1 ? (
                          <CornerDownRight size={12} className="mt-1 shrink-0 text-ink-muted" />
                        ) : null}

                        <div className="min-w-[180px]">
                          <EditableTitle
                            value={item.title}
                            onSave={(v) => handleFieldChange(item.id, "title", v)}
                            className={cn("font-medium text-ink", isEpic && "font-semibold")}
                          />

                          {isEpic && (
                            <p className="mt-0.5 text-[11px] text-ink-muted">
                              Epic · dates et avancement dérivés des sous-items
                            </p>
                          )}

                          {depth === 1 && parentTitle && (
                            <div className="mt-1 flex items-center gap-1 text-[11px] text-ink-muted">
                              Sous-item de : {parentTitle}
                              <button
                                onClick={() => handleDetach(item.id)}
                                className="ml-1 rounded hover:text-ink"
                              >
                                (détacher)
                              </button>
                            </div>
                          )}

                          {depth === 0 && !isEpic && availableEpicTargets.length > 0 && (
                            <div className="mt-1.5">
                              <select
                                defaultValue=""
                                onChange={(e) => {
                                  if (e.target.value) handleAttach(item.id, e.target.value);
                                }}
                                className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-ink-muted"
                              >
                                <option value="">Rattacher à un Epic...</option>
                                {availableEpicTargets.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.title}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {!isEpic && (
                            <button
                              type="button"
                              onClick={() => setDependencyModalItem(item)}
                              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted hover:text-accent"
                            >
                              <Link2 size={10} />
                              Ajouter une dépendance
                            </button>
                          )}

                          {!isEpic && (item.plannedStartDate || item.plannedEndDate || item.dateShifts.length > 0) && (
                            <button
                              type="button"
                              onClick={() => setDateShiftModalItem(item)}
                              className={cn(
                                "mt-1.5 ml-3 inline-flex items-center gap-1 text-[11px] font-medium",
                                item.plannedStartDate || item.plannedEndDate
                                  ? "text-status-progress hover:text-status-progress"
                                  : "text-ink-muted hover:text-accent"
                              )}
                              title="Prévu vs réel"
                            >
                              <History size={10} />
                              {item.plannedStartDate || item.plannedEndDate ? "Décalage" : "Historique"}
                            </button>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-5 py-3.5 text-xs text-ink-muted">
                      {isEpic ? (
                        <span title="Dérivé des sous-items">
                          {format(new Date(item.startDate), "d MMM", { locale: fr })} →{" "}
                          {format(new Date(item.endDate), "d MMM", { locale: fr })}
                        </span>
                      ) : (
                        <EditableDateRange
                          startDate={item.startDate}
                          endDate={item.endDate}
                          onSaveStart={(v) => handleFieldChange(item.id, "startDate", v)}
                          onSaveEnd={(v) => handleFieldChange(item.id, "endDate", v)}
                        />
                      )}
                    </td>

                    <td className="px-5 py-3.5">
                      <Select value={item.ownerId ?? "__none__"} onValueChange={(v) => handleOwnerChange(item.id, v === "__none__" ? "" : v)}>
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">
                            <span className="text-ink-muted">Non assigné</span>
                          </SelectItem>
                          {members.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              <span className="inline-flex items-center gap-1.5">
                                <User size={12} />
                                {m.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>

                    <td className="px-5 py-3.5">
                      {isEpic ? (
                        <div className="flex items-center gap-2" title="Moyenne des sous-items">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-background">
                            <div
                              className={cn("h-full", PROGRESS_COLOR[item.status] ?? "bg-accent")}
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-ink-muted">{item.progress}%</span>
                        </div>
                      ) : (
                        <ProgressCell
                          itemId={item.id}
                          initial={item.progress}
                          color={PROGRESS_COLOR[item.status] ?? "bg-accent"}
                          onSave={(progress) => handleProgressChange(item.id, progress)}
                        />
                      )}
                    </td>

                    <td className="px-5 py-3.5">
                      <Select value={item.status} onValueChange={(v) => handleStatusChange(item.id, v)}>
                        <SelectTrigger className="w-[128px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              <span className="flex items-center gap-2">
                                <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
                                {s.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>

                    <td className="px-5 py-3.5">
                      {isEpic ? (
                        collapsed.has(item.id) ? (
                          <DependencyCell
                            dependencies={[
                              ...item.blockedBy,
                              ...(rows
                                .filter((r) => r.item.parentId === item.id)
                                .flatMap((r) =>
                                  r.item.blockedBy.map((d) => ({ ...d, sourceTitle: r.item.title }))
                                )),
                            ]}
                            roadmapId={roadmapId}
                            onRemove={handleRemoveDependency}
                          />
                        ) : (
                          <span className="text-xs text-ink-muted">-</span>
                        )
                      ) : (
                        <DependencyCell dependencies={item.blockedBy} roadmapId={roadmapId} onRemove={handleRemoveDependency} />
                      )}
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {depth === 0 && (
                          <button
                            type="button"
                            onClick={() => setShowCreate({ parentId: item.id, parentTitle: item.title })}
                            className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-accent/10 hover:text-accent"
                            aria-label="Ajouter un sous-item"
                            title="Ajouter un sous-item"
                          >
                            <Plus size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger"
                          aria-label="Supprimer l'item"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <ItemCreateModal
          roadmapId={roadmapId}
          parentId={showCreate.parentId}
          parentTitle={showCreate.parentTitle}
          onClose={() => setShowCreate(null)}
          onCreated={() => router.refresh()}
        />
      )}

      {dependencyModalItem && (
        <DependencyModal
          sourceItemId={dependencyModalItem.id}
          sourceItemTitle={dependencyModalItem.title}
          workspaceItems={workspaceItems}
          onClose={() => setDependencyModalItem(null)}
          onCreated={() => router.refresh()}
        />
      )}

      {dateShiftModalItem && (
        <DateShiftModal
          itemId={dateShiftModalItem.id}
          itemTitle={dateShiftModalItem.title}
          plannedStartDate={dateShiftModalItem.plannedStartDate}
          plannedEndDate={dateShiftModalItem.plannedEndDate}
          actualStartDate={dateShiftModalItem.startDate}
          actualEndDate={dateShiftModalItem.endDate}
          history={dateShiftModalItem.dateShifts}
          onClose={() => setDateShiftModalItem(null)}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-5 shadow-xl">
            <h2 className="mb-2 text-sm font-semibold text-ink">Supprimer cet Epic ?</h2>
            <p className="mb-4 text-xs text-ink-muted">
              Cet Epic a {deleteConfirm.childCount} sous-item{deleteConfirm.childCount > 1 ? "s" : ""}. Les
              supprimer aussi, ou annuler ?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
                Annuler
              </Button>
              <Button onClick={() => handleDelete(deleteConfirm.itemId, true)} className="bg-danger hover:bg-danger">
                Tout supprimer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DependencyCell({
  dependencies,
  roadmapId,
  onRemove,
}: {
  dependencies: (Dependency & { sourceTitle?: string })[];
  roadmapId: string;
  onRemove: (dependencyId: string) => void;
}) {
  if (dependencies.length === 0) return <span className="text-xs text-ink-muted">-</span>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {dependencies.map((dep) => {
        const isResolved = dep.status === "RESOLVED";
        const colorClasses = isResolved
          ? "bg-status-done/15 text-status-done"
          : "bg-status-blocked/15 text-status-blocked";
        const hoverClasses = isResolved ? "hover:bg-status-done/25" : "hover:bg-status-blocked/25";

        let icon = <Link2 size={10} />;
        let label = "Cible supprimée";
        if (dep.targetKind === "ITEM" && dep.blockingItem) {
          label = `Bloqué par : ${dep.blockingItem.title}`;
          if (dep.blockingItem.roadmap.id !== roadmapId) {
            label += ` (${dep.blockingItem.roadmap.name})`;
          }
        } else if (dep.targetKind === "TEAM" && dep.targetRoadmap) {
          icon = <Users size={10} />;
          label = `Équipe : ${dep.targetRoadmap.name}`;
        } else if (dep.targetKind === "EXTERNAL" && dep.externalSystemName) {
          icon = <Globe2 size={10} />;
          label = `Externe : ${dep.externalSystemName}`;
        }

        if (dep.sourceTitle) label = `${dep.sourceTitle} · ${label}`;

        return (
          <span
            key={dep.id}
            title={dep.note ?? undefined}
            className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", colorClasses)}
          >
            {icon}
            {label}
            <button
              onClick={() => onRemove(dep.id)}
              className={cn("ml-0.5 rounded-full", hoverClasses)}
              aria-label="Retirer la dépendance"
            >
              <X size={10} />
            </button>
          </span>
        );
      })}
    </div>
  );
}

function ProgressCell({
  itemId,
  initial,
  color,
  onSave,
}: {
  itemId: string;
  initial: number;
  color: string;
  onSave: (progress: number) => void;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => setValue(initial), [initial]);

  function commit() {
    const clamped = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    setValue(clamped);
    if (clamped === initial) return;
    setSaving(true);
    onSave(clamped);
  }

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-background">
        <div className={cn("h-full transition-all", color)} style={{ width: `${value}%` }} />
      </div>
      <input
        type="number"
        min={0}
        max={100}
        value={value}
        disabled={saving}
        onChange={(e) => setValue(Number(e.target.value))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-12 rounded-md border border-border bg-background px-1.5 py-0.5 text-xs tabular-nums text-ink"
        aria-label="Avancement en pourcentage"
      />
      <span className="text-xs text-ink-muted">%</span>
    </div>
  );
}

function EditableDateRange({
  startDate,
  endDate,
  onSaveStart,
  onSaveEnd,
}: {
  startDate: string;
  endDate: string;
  onSaveStart: (v: string) => void;
  onSaveEnd: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const isoStart = startDate.slice(0, 10);
  const isoEnd = endDate.slice(0, 10);
  const [displayStart, setDisplayStart] = useState(isoStart);
  const [displayEnd, setDisplayEnd] = useState(isoEnd);
  const [draftStart, setDraftStart] = useState(isoStart);
  const [draftEnd, setDraftEnd] = useState(isoEnd);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) {
      setDisplayStart(isoStart);
      setDisplayEnd(isoEnd);
    }
  }, [isoStart, isoEnd, editing]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraftStart(displayStart);
          setDraftEnd(displayEnd);
          setEditing(true);
        }}
        className="text-left decoration-dotted hover:underline"
      >
        {format(new Date(displayStart), "d MMM", { locale: fr })} →{" "}
        {format(new Date(displayEnd), "d MMM", { locale: fr })}
      </button>
    );
  }

  function commit() {
    setEditing(false);
    if (draftStart && draftStart !== displayStart) {
      setDisplayStart(draftStart);
      onSaveStart(draftStart);
    }
    if (draftEnd && draftEnd !== displayEnd) {
      setDisplayEnd(draftEnd);
      onSaveEnd(draftEnd);
    }
  }

  // Ne referme/valide le groupe que si le focus sort VRAIMENT des deux champs (pas juste
  // du champ debut vers le champ fin) - sinon le blur du premier champ fermait tout avant
  // que le clic sur le second n'ait pu s'appliquer.
  function handleGroupBlur(e: React.FocusEvent<HTMLDivElement>) {
    const next = e.relatedTarget as Node | null;
    if (next && containerRef.current?.contains(next)) return;
    commit();
  }

  return (
    <div ref={containerRef} className="flex items-center gap-1" onBlur={handleGroupBlur}>
      <input
        type="date"
        autoFocus
        value={draftStart}
        onChange={(e) => setDraftStart(e.target.value)}
        className="rounded-md border border-border bg-background px-1.5 py-1 text-xs text-ink"
      />
      <span>→</span>
      <input
        type="date"
        value={draftEnd}
        onChange={(e) => setDraftEnd(e.target.value)}
        className="rounded-md border border-border bg-background px-1.5 py-1 text-xs text-ink"
      />
    </div>
  );
}

function EditableTitle({
  value,
  onSave,
  className,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    } else {
      setDraft(value);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className={cn("text-left decoration-dotted hover:underline", className)}
      >
        {value}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className={cn(
        "w-full rounded-md border border-border bg-background px-1.5 py-0.5 text-sm text-ink",
        className
      )}
    />
  );
}

function ItemCreateModal({
  roadmapId,
  parentId,
  parentTitle,
  onClose,
  onCreated,
}: {
  roadmapId: string;
  parentId: string | null;
  parentTitle?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/roadmaps/${roadmapId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, startDate, endDate, parentId: parentId || undefined }),
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
        <h2 className="mb-1 text-sm font-semibold text-ink">
          {parentId ? "Nouveau sous-item" : "Nouvel item"}
        </h2>
        {parentTitle && <p className="mb-4 text-xs text-ink-muted">Sous : {parentTitle}</p>}
        {!parentTitle && <div className="mb-4" />}

        <div className="mb-3 flex flex-col gap-1.5">
          <Label htmlFor="item-title">Titre</Label>
          <Input id="item-title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        </div>
        <div className="mb-4 flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="item-start">Début</Label>
            <Input
              id="item-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="item-end">Fin</Label>
            <Input id="item-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </div>
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
