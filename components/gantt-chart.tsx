"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { GripVertical, Flag, Link2, Flame, ChevronRight, ChevronDown, CornerDownRight, Eye, EyeOff } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { addDays, computeTimelineRange, diffInDays, startOfDay, computeCalendarTicks, type ZoomLevel } from "@/lib/gantt";
import { computeSprintBands, type SprintBand } from "@/lib/sprints";
import { cn } from "@/lib/utils";
import { DEFAULT_ROADMAP_COLOR, withAlpha } from "@/lib/roadmap-theme";
import { computeCriticalPath } from "@/lib/critical-path";
import {
  DependencyModal,
  type DependencyDirection,
  type DependencyTargetKind,
  type WorkspaceItem,
} from "@/components/dependency-modal";
import { DependencyTableModal, type DependencySourceItem } from "@/components/dependency-table-modal";
import { MilestoneModal } from "@/components/milestone-modal";

type GanttItem = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  status: string;
  progress: number;
  dependencyCount?: number;
  parentId?: string | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
};

type GanttMilestone = {
  id: string;
  title: string;
  date: string;
};

type DependencyType = "FD" | "DD" | "FF" | "DF";

type Dependency = {
  id: string;
  blockingItemId: string;
  blockedItemId: string;
  type?: DependencyType;
  curveOffsetX?: number | null;
  curveOffsetY?: number | null;
};

type CurveDrag = { id: string; offX: number; offY: number } | null;

type LinkState = { sourceId: string; side: "left" | "right"; x: number; y: number } | null;

type DepModalState = {
  sourceItemId: string;
  sourceItemTitle: string;
  initialDirection?: DependencyDirection;
  initialTargetKind?: DependencyTargetKind;
  initialTargetItemId?: string;
} | null;

const PX_PER_DAY_BY_ZOOM: Record<ZoomLevel, number> = { week: 28, month: 10, quarter: 4 };
const LABEL_WIDTH = 220;
const GRIP_WIDTH = 24;
const ROW_HEIGHT = 52;
const CLICK_THRESHOLD_PX = 6;

const STATUS_BAR_COLOR: Record<string, string> = {
  TODO: "bg-status-todo",
  IN_PROGRESS: "bg-status-progress",
  BLOCKED: "bg-status-blocked",
  DONE: "bg-status-done",
};

export type SprintConfigProp = {
  referenceDate: string;
  durationWeeks: number;
  referenceNumber: number;
} | null;

export function GanttChart({
  roadmapId,
  items,
  milestones = [],
  dependencies = [],
  workspaceItems = [],
  roadmapColor,
  sprintConfig = null,
}: {
  roadmapId: string;
  items: GanttItem[];
  milestones?: GanttMilestone[];
  dependencies?: Dependency[];
  workspaceItems?: WorkspaceItem[];
  roadmapColor?: string | null;
  sprintConfig?: SprintConfigProp;
}) {
  const router = useRouter();
  const epicAccentColor = roadmapColor ?? DEFAULT_ROADMAP_COLOR;
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("week");
  const pxPerDay = PX_PER_DAY_BY_ZOOM[zoomLevel];
  const [order, setOrder] = useState<string[]>(items.map((i) => i.id));

  useEffect(() => {
    const currentIds = items.map((i) => i.id);
    setOrder((prev) => {
      const currentSet = new Set(currentIds);
      const kept = prev.filter((id) => currentSet.has(id));
      const missing = currentIds.filter((id) => !prev.includes(id));
      const next = [...kept, ...missing];
      const same = next.length === prev.length && next.every((id, i) => id === prev[i]);
      return same ? prev : next;
    });
  }, [items]);
  const [linking, setLinking] = useState<LinkState>(null);
  const [depModal, setDepModal] = useState<DepModalState>(null);
  const [depTableItems, setDepTableItems] = useState<DependencySourceItem[] | null>(null);
  const [milestoneModalDate, setMilestoneModalDate] = useState<string | null>(null);
  const [curveDrag, setCurveDrag] = useState<CurveDrag>(null);
  const [pendingCurveSave, setPendingCurveSave] = useState<CurveDrag>(null);
  const [collapsedEpics, setCollapsedEpics] = useState<Set<string>>(new Set());
  const [showDependencies, setShowDependencies] = useState(true);
  const curveDragMetaRef = useRef<{ mx: number; my: number; dist: number } | null>(null);
  const rowsWrapperRef = useRef<HTMLDivElement>(null);
  const linkStartPos = useRef<{ x: number; y: number } | null>(null);
  const linkProcessingRef = useRef(false);

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const criticalPathIds = useMemo(() => computeCriticalPath(items, dependencies), [items, dependencies]);

  const topLevelOrder = useMemo(
    () => order.filter((id) => !itemsById.get(id)?.parentId),
    [order, itemsById]
  );

  const childrenByParent = useMemo(() => {
    const map = new Map<string, GanttItem[]>();
    for (const item of items) {
      if (item.parentId) {
        if (!map.has(item.parentId)) map.set(item.parentId, []);
        map.get(item.parentId)!.push(item);
      }
    }
    return map;
  }, [items]);

  type Row = { item: GanttItem; depth: 0 | 1; isEpic: boolean };

  const rows = useMemo<Row[]>(() => {
    const list: Row[] = [];
    for (const id of topLevelOrder) {
      const item = itemsById.get(id);
      if (!item) continue;
      const children = childrenByParent.get(item.id) ?? [];
      list.push({ item, depth: 0, isEpic: children.length > 0 });
      if (!collapsedEpics.has(item.id)) {
        for (const child of children) list.push({ item: child, depth: 1, isEpic: false });
      }
    }
    return list;
  }, [topLevelOrder, itemsById, childrenByParent, collapsedEpics]);

  const orderedItems = useMemo(() => rows.map((r) => r.item), [rows]);

  function toggleCollapsed(id: string) {
    setCollapsedEpics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Compte uniquement les dependances qui touchent l'exterieur du sous-arbre de cette Epic
  // (elle-meme + ses sous-items). Une dependance entre deux sous-items de la MEME Epic ne
  // produira jamais de fleche visible une fois l'Epic repliee (les deux extremites se
  // redirigent vers le meme point, l'Epic elle-meme) : elle est donc exclue du compteur pour
  // ne pas annoncer un nombre de fleches superieur a ce qui peut reellement s'afficher.
  function countExternalDependencies(epicItem: GanttItem): number {
    const children = childrenByParent.get(epicItem.id) ?? [];
    const subtreeIds = new Set([epicItem.id, ...children.map((c) => c.id)]);
    let count = 0;
    for (const dep of dependencies) {
      const blockingInside = subtreeIds.has(dep.blockingItemId);
      const blockedInside = subtreeIds.has(dep.blockedItemId);
      if (!blockingInside && !blockedInside) continue;
      if (blockingInside && blockedInside) continue;
      count += 1;
    }
    return count;
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const range = useMemo(
    () =>
      computeTimelineRange(
        orderedItems.map((i) => ({ startDate: new Date(i.startDate), endDate: new Date(i.endDate) }))
      ),
    [orderedItems]
  );
  const totalDays = diffInDays(range.end, range.start);
  const totalWidth = totalDays * pxPerDay;
  const todayOffset = diffInDays(startOfDay(new Date()), range.start) * pxPerDay;

  const sprintBands = useMemo<SprintBand[]>(() => {
    if (!sprintConfig) return [];
    return computeSprintBands(
      {
        referenceDate: new Date(sprintConfig.referenceDate),
        durationWeeks: sprintConfig.durationWeeks,
        referenceNumber: sprintConfig.referenceNumber,
      },
      range.start,
      range.end
    );
  }, [sprintConfig, range]);

  const itemPositions = useMemo(() => {
    const map = new Map<string, { x1: number; x2: number; y: number }>();
    orderedItems.forEach((item, index) => {
      const x1 = GRIP_WIDTH + LABEL_WIDTH + diffInDays(new Date(item.startDate), range.start) * pxPerDay;
      const x2 = x1 + (diffInDays(new Date(item.endDate), new Date(item.startDate)) + 1) * pxPerDay;
      map.set(item.id, { x1, x2, y: index * ROW_HEIGHT + ROW_HEIGHT / 2 });
    });
    return map;
  }, [orderedItems, range, pxPerDay]);

  const arrows = useMemo(() => {
    // Renvoie l'id de la ligne qui represente reellement ce point (l'item lui-meme s'il est
    // visible, sinon son Epic parente si elle est repliee) - separe de la position pour
    // pouvoir detecter les boucles sur soi-meme (voir plus bas).
    function resolveId(id: string): string | undefined {
      if (itemPositions.has(id)) return id;
      const parentId = itemsById.get(id)?.parentId;
      return parentId && itemPositions.has(parentId) ? parentId : undefined;
    }

    const computed = dependencies
      .map((dep) => {
        const resolvedFromId = resolveId(dep.blockingItemId);
        const resolvedToId = resolveId(dep.blockedItemId);
        if (!resolvedFromId || !resolvedToId) return null;
        // Dependance entre deux sous-items de la MEME Epic repliee : les deux extremites se
        // redirigent vers le meme point. Une courbe de Bezier avec un point de depart et
        // d'arrivee identiques ne s'annule PAS toute seule, elle dessine une boucle visible
        // via son point de controle - il faut donc explicitement l'exclure du trace, pas
        // seulement du compteur (deja corrige plus haut).
        if (resolvedFromId === resolvedToId) return null;
        const from = itemPositions.get(resolvedFromId)!;
        const to = itemPositions.get(resolvedToId)!;

          const type = dep.type ?? "FD";
          const fromX = type === "DD" || type === "DF" ? from.x1 : from.x2;
          const toX = type === "DD" || type === "FD" ? to.x1 : to.x2;
          const fromY = from.y;
          const toY = to.y;

          const mx = (fromX + toX) / 2;
          const my = (fromY + toY) / 2;
          const dx = toX - fromX;
          const dy = toY - fromY;
          const dist = Math.hypot(dx, dy) || 1;
          const perpX = -dy / dist;
          const perpY = dx / dist;
          const autoBend = Math.max(Math.min(Math.abs(dy) * 0.25, 40), 12) / dist;

          const isDragging = curveDrag?.id === dep.id;
          const isPending = pendingCurveSave?.id === dep.id;
          const clampStored = (v: number) => Math.max(-3, Math.min(3, v));
          const offX = isDragging
            ? curveDrag!.offX
            : isPending
            ? pendingCurveSave!.offX
            : clampStored(dep.curveOffsetX ?? perpX * autoBend);
          const offY = isDragging
            ? curveDrag!.offY
            : isPending
            ? pendingCurveSave!.offY
            : clampStored(dep.curveOffsetY ?? perpY * autoBend);
          const ctrlX = mx + offX * dist;
          const ctrlY = my + offY * dist;

          const path = `M ${fromX},${fromY} Q ${ctrlX},${ctrlY} ${toX},${toY}`;
          const handleX = (fromX + 2 * ctrlX + toX) / 4;
          const handleY = (fromY + 2 * ctrlY + toY) / 4;
          const mergeKey = `${Math.round(fromX)},${Math.round(fromY)}-${Math.round(toX)},${Math.round(toY)}`;
          return { key: dep.id, id: dep.id, path, ctrlX, ctrlY, handleX, handleY, mx, my, dist, mergeKey };
        })
        .filter(
          (a): a is {
            key: string;
            id: string;
            path: string;
            ctrlX: number;
            ctrlY: number;
            handleX: number;
            handleY: number;
            mx: number;
            my: number;
            dist: number;
            mergeKey: string;
          } => Boolean(a)
        );

    const byMergeKey = new Map<string, typeof computed[number] & { mergedCount: number }>();
    for (const arrow of computed) {
      const existing = byMergeKey.get(arrow.mergeKey);
      if (existing) {
        existing.mergedCount += 1;
      } else {
        byMergeKey.set(arrow.mergeKey, { ...arrow, mergedCount: 1 });
      }
    }
    return Array.from(byMergeKey.values());
  }, [dependencies, itemPositions, itemsById, curveDrag, pendingCurveSave]);

  async function commitDates(itemId: string, startDate: Date, endDate: Date): Promise<boolean> {
    try {
      const res = await fetch(`/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: startDate.toISOString(), endDate: endDate.toISOString() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("Erreur sauvegarde dates:", res.status, data);
        alert(data.error ?? `Erreur ${res.status} lors de la sauvegarde des dates.`);
        return false;
      }
      router.refresh();
      return true;
    } catch (err) {
      console.error("Erreur réseau sauvegarde dates:", err);
      alert("Erreur réseau lors de la sauvegarde des dates.");
      return false;
    }
  }

  async function persistCurveOffset(dependencyId: string, offX: number, offY: number): Promise<boolean> {
    try {
      const res = await fetch(`/api/dependencies/${dependencyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ curveOffsetX: offX, curveOffsetY: offY }),
      });
      if (!res.ok) return false;
      router.refresh();
      return true;
    } catch (err) {
      console.error("Erreur réseau sauvegarde courbure:", err);
      return false;
    }
  }

  function handleStartCurveDrag(
    e: React.PointerEvent,
    arrow: { id: string; ctrlX: number; ctrlY: number; mx: number; my: number; dist: number }
  ) {
    e.stopPropagation();
    const rect = rowsWrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    curveDragMetaRef.current = { mx: arrow.mx, my: arrow.my, dist: arrow.dist };
    setCurveDrag({
      id: arrow.id,
      offX: (arrow.ctrlX - arrow.mx) / arrow.dist,
      offY: (arrow.ctrlY - arrow.my) / arrow.dist,
    });
  }

  useEffect(() => {
    if (!curveDrag) return;

    function onMove(e: PointerEvent) {
      const rect = rowsWrapperRef.current?.getBoundingClientRect();
      const meta = curveDragMetaRef.current;
      if (!rect || !meta) return;
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const rawOffX = (2 * (px - meta.mx)) / meta.dist;
      const rawOffY = (2 * (py - meta.my)) / meta.dist;
      const clamp = (v: number) => Math.max(-3, Math.min(3, v));
      setCurveDrag((prev) => (prev ? { ...prev, offX: clamp(rawOffX), offY: clamp(rawOffY) } : prev));
    }

    function onUp() {
      setCurveDrag((prev) => {
        if (prev) {
          setPendingCurveSave(prev);
          persistCurveOffset(prev.id, prev.offX, prev.offY).then((ok) => {
            if (!ok) setPendingCurveSave((cur) => (cur?.id === prev.id ? null : cur));
          });
        }
        return null;
      });
      curveDragMetaRef.current = null;
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curveDrag !== null]);

  useEffect(() => {
    if (!pendingCurveSave) return;
    const dep = dependencies.find((d) => d.id === pendingCurveSave.id);
    if (
      dep &&
      typeof dep.curveOffsetX === "number" &&
      typeof dep.curveOffsetY === "number" &&
      Math.abs(dep.curveOffsetX - pendingCurveSave.offX) < 0.0005 &&
      Math.abs(dep.curveOffsetY - pendingCurveSave.offY) < 0.0005
    ) {
      setPendingCurveSave(null);
    }
  }, [dependencies, pendingCurveSave]);

  function handleStartLink(itemId: string, side: "left" | "right", e: React.PointerEvent) {
    const pos = itemPositions.get(itemId);
    if (!pos) return;
    linkStartPos.current = { x: e.clientX, y: e.clientY };
    setLinking({ sourceId: itemId, side, x: side === "left" ? pos.x1 : pos.x2, y: pos.y });
  }

  useEffect(() => {
    if (!linking) return;

    function onMove(e: PointerEvent) {
      const rect = rowsWrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      setLinking((prev) => (prev ? { ...prev, x: e.clientX - rect.left, y: e.clientY - rect.top } : prev));
    }

    function onUp(e: PointerEvent) {
      if (linkProcessingRef.current) return;
      linkProcessingRef.current = true;

      const targetEl = (e.target as Element)?.closest?.("[data-gantt-item-id]") as HTMLElement | null;
      const targetId = targetEl?.getAttribute("data-gantt-item-id");
      const start = linkStartPos.current;
      const movedDistance = start ? Math.hypot(e.clientX - start.x, e.clientY - start.y) : Infinity;

      setLinking((prev) => {
        if (!prev) {
          linkProcessingRef.current = false;
          return null;
        }

        const sourceItem = itemsById.get(prev.sourceId);

        if (targetId && targetId !== prev.sourceId) {
          setDepModal({
            sourceItemId: prev.sourceId,
            sourceItemTitle: sourceItem?.title ?? "",
            initialDirection: "BLOCKS",
            initialTargetKind: "ITEM",
            initialTargetItemId: targetId,
          });
        } else if (movedDistance < CLICK_THRESHOLD_PX) {
          setDepModal({
            sourceItemId: prev.sourceId,
            sourceItemTitle: sourceItem?.title ?? "",
          });
        }

        linkProcessingRef.current = false;
        return null;
      });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linking !== null]);

  function handleTrackDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const dayOffset = Math.round(x / pxPerDay);
    const date = addDays(range.start, dayOffset);
    setMilestoneModalDate(format(date, "yyyy-MM-dd"));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = topLevelOrder.indexOf(String(active.id));
    const newIndex = topLevelOrder.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const newTopLevel = arrayMove(topLevelOrder, oldIndex, newIndex);

    const fullOrder: string[] = [];
    for (const id of newTopLevel) {
      fullOrder.push(id);
      const children = childrenByParent.get(id) ?? [];
      fullOrder.push(...children.map((c) => c.id));
    }

    setOrder(fullOrder);

    await fetch(`/api/roadmaps/${roadmapId}/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: fullOrder }),
    });
    router.refresh();
  }

  // Graduations de l'en-tete, calculees differemment selon le niveau de zoom :
  // - "week" : pas fixe de 7 jours, avec l'alignement sur la date de reference du sprint
  //   deja en place (l'alignement calendaire n'a pas de sens pour mois/trimestre, qui se
  //   calent sur le vrai calendrier de toute facon).
  // - "month"/"quarter" : pas variable (28-31 jours, ~90-92 jours), cale sur le calendrier
  //   reel via computeCalendarTicks plutot que sur un pas de jours fixe.
  const periodTicks = useMemo(() => {
    if (zoomLevel === "week") {
      let weekTickStartOffset = 0;
      if (sprintConfig) {
        const refDate = new Date(sprintConfig.referenceDate);
        const diff = diffInDays(range.start, refDate);
        const mod = ((diff % 7) + 7) % 7;
        weekTickStartOffset = mod === 0 ? 0 : 7 - mod;
      }
      const ticks: { offsetDays: number; label: string }[] = [];
      for (let d = weekTickStartOffset; d <= totalDays; d += 7) {
        ticks.push({ offsetDays: d, label: format(addDays(range.start, d), "d MMM", { locale: fr }) });
      }
      return ticks;
    }
    if (zoomLevel === "month") {
      return computeCalendarTicks("month", range.start, range.end, (d) =>
        format(d, "MMMM yyyy", { locale: fr })
      );
    }
    return computeCalendarTicks("quarter", range.start, range.end, (d) => `T${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`);
  }, [zoomLevel, range, totalDays, sprintConfig]);

  // Garde placee APRES tous les hooks (useState/useMemo/useEffect) du composant : la placer
  // plus haut casserait l'ordre des hooks entre un rendu avec items et un rendu sans item
  // (erreur React "Rendered fewer hooks than expected"), ce qui plantait l'app des qu'on
  // supprimait le dernier item d'une roadmap.
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface px-5 py-10 text-center text-sm text-ink-muted">
        Ajoutez des items pour voir la vue Gantt.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Gantt</h2>
          <div className="flex gap-1 rounded-md border border-border p-1">
            {(["week", "month", "quarter"] as ZoomLevel[]).map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setZoomLevel(z)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-semibold transition-colors",
                  zoomLevel === z ? "bg-accent text-white" : "text-ink-muted hover:text-ink"
                )}
              >
                {z === "week" ? "Semaine" : z === "month" ? "Mois" : "Trimestre"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowDependencies((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-semibold transition-colors",
              showDependencies ? "text-ink-muted hover:text-ink" : "bg-accent/15 text-accent"
            )}
            title={showDependencies ? "Masquer les dépendances" : "Afficher les dépendances"}
          >
            {showDependencies ? <Eye size={13} /> : <EyeOff size={13} />}
            Dépendances
          </button>
        </div>
        <p className="text-[11px] text-ink-muted">
          Cliquer ou glisser le point à droite d&apos;une barre pour créer une dépendance · double-clic pour un jalon
        </p>
      </div>
      <div className="gantt-scrollbar overflow-x-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.15) transparent" }}>
        <style>{`
          .gantt-scrollbar::-webkit-scrollbar { height: 10px; }
          .gantt-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .gantt-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(255,255,255,0.15); border-radius: 9999px; }
          .gantt-scrollbar::-webkit-scrollbar-thumb:hover { background-color: rgba(255,255,255,0.25); }
        `}</style>
        <div style={{ width: LABEL_WIDTH + GRIP_WIDTH + totalWidth }}>
          {sprintBands.length > 0 && (
            <div className="flex border-b border-border">
              <div className="sticky left-0 z-40 shrink-0 bg-surface" style={{ width: LABEL_WIDTH + GRIP_WIDTH }} />
              <div className="relative shrink-0" style={{ width: totalWidth, height: 22 }}>
                {sprintBands.map((band, i) => {
                  const left = diffInDays(band.start, range.start) * pxPerDay;
                  const width = diffInDays(band.end, band.start) * pxPerDay;
                  return (
                    <div
                      key={band.number}
                      className={cn(
                        "absolute top-0 flex h-full items-center justify-center truncate border-r border-border/70 px-1 text-[10px] font-medium text-ink-muted",
                        i % 2 === 0 ? "bg-background/50" : "bg-background/20"
                      )}
                      style={{ left, width }}
                      title={`${band.label} : ${format(band.start, "d MMM", { locale: fr })} → ${format(
                        addDays(band.end, -1),
                        "d MMM",
                        { locale: fr }
                      )}`}
                    >
                      {band.label}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex border-b border-border">
            <div className="sticky left-0 z-40 shrink-0 bg-surface" style={{ width: LABEL_WIDTH + GRIP_WIDTH }} />
            <div
              className="relative shrink-0 cursor-copy"
              style={{ width: totalWidth, height: 32 }}
              onDoubleClick={handleTrackDoubleClick}
              title="Double-cliquer pour ajouter un jalon"
            >
              {periodTicks.map((tick) => (
                <div
                  key={tick.offsetDays}
                  className="absolute top-0 h-full border-l border-border/85 pl-1.5 text-[11px] capitalize text-ink-muted"
                  style={{ left: tick.offsetDays * pxPerDay }}
                >
                  {tick.label}
                </div>
              ))}
              {milestones.map((m) => {
                const offset = diffInDays(new Date(m.date), range.start) * pxPerDay;
                if (offset < 0 || offset > totalWidth) return null;
                return (
                  <div
                    key={m.id}
                    className="absolute top-0 flex h-full items-start"
                    style={{ left: offset }}
                    title={`${m.title} - ${format(new Date(m.date), "d MMM", { locale: fr })}`}
                  >
                    <Flag size={12} className="text-accent" fill="currentColor" />
                  </div>
                );
              })}
            </div>
          </div>

          <div ref={rowsWrapperRef} className="relative select-none">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={topLevelOrder} strategy={verticalListSortingStrategy}>
                {rows.map(({ item, depth, isEpic }) =>
                  depth === 0 ? (
                    <SortableRow key={item.id} id={item.id}>
                      <div
                        className="sticky z-40 flex shrink-0 items-center gap-1.5 truncate border-r border-border bg-surface px-3 text-xs font-medium text-ink"
                        style={{ left: GRIP_WIDTH, width: LABEL_WIDTH, height: ROW_HEIGHT }}
                        title={item.title}
                      >
                        {isEpic && (
                          <button
                            type="button"
                            onClick={() => toggleCollapsed(item.id)}
                            className="shrink-0 text-ink-muted hover:text-ink"
                            aria-label={collapsedEpics.has(item.id) ? "Déplier" : "Replier"}
                          >
                            {collapsedEpics.has(item.id) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                          </button>
                        )}
                        <span className={cn("truncate", isEpic && "font-semibold")}>{item.title}</span>
                      </div>
                      <div
                        className="relative shrink-0 cursor-copy"
                        style={{ width: totalWidth, height: ROW_HEIGHT }}
                        onDoubleClick={handleTrackDoubleClick}
                      >
                        {todayOffset >= 0 && todayOffset <= totalWidth && (
                          <div className="absolute top-0 h-full w-px bg-accent/40" style={{ left: todayOffset }} />
                        )}
                        {milestones.map((m) => {
                          const offset = diffInDays(new Date(m.date), range.start) * pxPerDay;
                          if (offset < 0 || offset > totalWidth) return null;
                          return (
                            <div
                              key={m.id}
                              className="absolute top-0 h-full w-px border-l border-dashed border-accent/50"
                              style={{ left: offset }}
                            />
                          );
                        })}
                        <GanttBar
                          item={item}
                          rangeStart={range.start}
                          pxPerDay={pxPerDay}
                          interactive={!isEpic}
                          epicColor={epicAccentColor}
                          isCritical={criticalPathIds.has(item.id)}
                          onCommit={commitDates}
                          onStartLink={handleStartLink}
                          dependencyCountOverride={
                            isEpic && collapsedEpics.has(item.id)
                              ? countExternalDependencies(item)
                              : undefined
                          }
                          onShowDependencies={() => {
                            const isCollapsed = isEpic && collapsedEpics.has(item.id);
                            const children = isCollapsed ? childrenByParent.get(item.id) ?? [] : [];
                            setDepTableItems([
                              { id: item.id, title: item.title },
                              ...children.map((c) => ({ id: c.id, title: c.title })),
                            ]);
                          }}
                        />
                      </div>
                    </SortableRow>
                  ) : (
                    <div key={item.id} className="flex border-b border-border last:border-b-0">
                      <div className="sticky left-0 z-40 w-6 shrink-0 bg-surface" style={{ height: ROW_HEIGHT }} />
                      <div
                        className="sticky z-40 flex shrink-0 items-center gap-1 truncate border-r border-border bg-surface px-3 text-xs text-ink"
                        style={{ left: GRIP_WIDTH, width: LABEL_WIDTH, height: ROW_HEIGHT }}
                        title={item.title}
                      >
                        <CornerDownRight size={11} className="shrink-0 text-ink-muted" />
                        <span className="truncate">{item.title}</span>
                      </div>
                      <div
                        className="relative shrink-0 cursor-copy"
                        style={{ width: totalWidth, height: ROW_HEIGHT }}
                        onDoubleClick={handleTrackDoubleClick}
                      >
                        {todayOffset >= 0 && todayOffset <= totalWidth && (
                          <div className="absolute top-0 h-full w-px bg-accent/40" style={{ left: todayOffset }} />
                        )}
                        {milestones.map((m) => {
                          const offset = diffInDays(new Date(m.date), range.start) * pxPerDay;
                          if (offset < 0 || offset > totalWidth) return null;
                          return (
                            <div
                              key={m.id}
                              className="absolute top-0 h-full w-px border-l border-dashed border-accent/50"
                              style={{ left: offset }}
                            />
                          );
                        })}
                        <GanttBar
                          item={item}
                          rangeStart={range.start}
                          pxPerDay={pxPerDay}
                          interactive
                          isCritical={criticalPathIds.has(item.id)}
                          onCommit={commitDates}
                          onStartLink={handleStartLink}
                          onShowDependencies={() => setDepTableItems([{ id: item.id, title: item.title }])}
                        />
                      </div>
                    </div>
                  )
                )}
              </SortableContext>
            </DndContext>

            {(arrows.length > 0 || linking) && (
              <svg
                className="pointer-events-none absolute left-0 top-0 z-[5]"
                style={{
                  overflow: "visible",
                  width: LABEL_WIDTH + GRIP_WIDTH + totalWidth,
                  height: orderedItems.length * ROW_HEIGHT,
                }}
              >
                <defs>
                  <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" className="fill-status-blocked" />
                  </marker>
                  <marker id="link-arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" className="fill-accent" />
                  </marker>
                </defs>
                {showDependencies && arrows.map((a) => {
                  const isActive = curveDrag?.id === a.id || pendingCurveSave?.id === a.id;
                  return (
                    <g key={a.key} className="group">
                      <path
                        d={a.path}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={16}
                        style={{ pointerEvents: "auto", cursor: "grab", touchAction: "none" }}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          handleStartCurveDrag(e, a);
                        }}
                      >
                        {a.mergedCount > 1 && <title>{`${a.mergedCount} dépendances fusionnées`}</title>}
                      </path>
                      <path
                        d={a.path}
                        fill="none"
                        className="stroke-status-blocked/90"
                        strokeWidth={2}
                        markerEnd="url(#arrowhead)"
                        style={{ pointerEvents: "none" }}
                      />
                      <circle
                        cx={a.handleX}
                        cy={a.handleY}
                        r={5}
                        className="fill-surface stroke-accent opacity-0 transition-opacity group-hover:opacity-100"
                        style={{ pointerEvents: "none", opacity: isActive ? 1 : undefined }}
                        strokeWidth={1.5}
                      >
                        <title>Glisser pour courber cette flèche</title>
                      </circle>
                    </g>
                  );
                })}
                {linking &&
                  (() => {
                    const from = itemPositions.get(linking.sourceId);
                    if (!from) return null;
                    const fromX = linking.side === "left" ? from.x1 : from.x2;
                    const midX = (fromX + linking.x) / 2;
                    const path = `M ${fromX},${from.y} C ${midX},${from.y} ${midX},${linking.y} ${linking.x},${linking.y}`;
                    return (
                      <path
                        d={path}
                        fill="none"
                        className="stroke-accent"
                        strokeWidth={2}
                        strokeDasharray="4 3"
                        markerEnd="url(#link-arrowhead)"
                      />
                    );
                  })()}
              </svg>
            )}
          </div>
        </div>
      </div>

      {depModal && (
        <DependencyModal
          sourceItemId={depModal.sourceItemId}
          sourceItemTitle={depModal.sourceItemTitle}
          workspaceItems={workspaceItems}
          initialDirection={depModal.initialDirection}
          initialTargetKind={depModal.initialTargetKind}
          initialTargetItemId={depModal.initialTargetItemId}
          onClose={() => setDepModal(null)}
          onCreated={() => router.refresh()}
        />
      )}

      {depTableItems && (
        <DependencyTableModal
          items={depTableItems}
          workspaceItems={workspaceItems}
          onClose={() => setDepTableItems(null)}
          onChanged={() => router.refresh()}
        />
      )}

      {milestoneModalDate && (
        <MilestoneModal
          roadmapId={roadmapId}
          initialDate={milestoneModalDate}
          onClose={() => setMilestoneModalDate(null)}
          onCreated={() => router.refresh()}
        />
      )}
    </div>
  );
}

function SortableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex border-b border-border last:border-b-0">
      <button
        {...attributes}
        {...listeners}
        className="sticky left-0 z-40 flex w-6 shrink-0 cursor-grab items-center justify-center bg-surface text-ink-muted hover:text-ink active:cursor-grabbing"
        style={{ height: ROW_HEIGHT }}
        aria-label="Réordonner"
      >
        <GripVertical size={13} />
      </button>
      {children}
    </div>
  );
}

function GanttBar({
  item,
  rangeStart,
  pxPerDay,
  onCommit,
  onStartLink,
  onShowDependencies,
  interactive = true,
  dependencyCountOverride,
  epicColor,
  isCritical,
}: {
  item: GanttItem;
  rangeStart: Date;
  pxPerDay: number;
  onCommit: (id: string, start: Date, end: Date) => Promise<boolean>;
  onStartLink: (itemId: string, side: "left" | "right", e: React.PointerEvent) => void;
  onShowDependencies: () => void;
  interactive?: boolean;
  dependencyCountOverride?: number;
  epicColor?: string;
  isCritical?: boolean;
}) {
  const origStart = new Date(item.startDate);
  const origEnd = new Date(item.endDate);
  const [preview, setPreview] = useState<{ start: Date; end: Date } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ mode: "move" | "left" | "right"; startX: number } | null>(null);

  const displayStart = preview?.start ?? origStart;
  const displayEnd = preview?.end ?? origEnd;
  const left = diffInDays(displayStart, rangeStart) * pxPerDay;
  // Marge visuelle entre barres adjacentes, proportionnelle au zoom avec un plancher absolu :
  // a "PX_PER_DAY - 4" fixe, un item d'un seul jour deviendrait invisible (largeur 0) des que
  // pxPerDay descend a 4px/jour (zoom trimestre).
  const gutter = Math.min(4, pxPerDay / 3);
  const width = Math.max((diffInDays(displayEnd, displayStart) + 1) * pxPerDay - gutter, Math.max(pxPerDay - gutter, 2));

  const plannedStartRaw = item.plannedStartDate ? new Date(item.plannedStartDate) : null;
  const plannedEndRaw = item.plannedEndDate ? new Date(item.plannedEndDate) : null;

  type ShiftOverlay = { outside: boolean; kind: "delay" | "advance"; leftPx: number; widthPx: number };

  let startOverlay: ShiftOverlay | null = null;
  if (plannedStartRaw && plannedStartRaw.getTime() !== origStart.getTime()) {
    if (plannedStartRaw.getTime() < origStart.getTime()) {
      const days = diffInDays(origStart, plannedStartRaw);
      startOverlay = { outside: true, kind: "delay", leftPx: -days * pxPerDay, widthPx: days * pxPerDay };
    } else {
      const days = diffInDays(plannedStartRaw, origStart);
      startOverlay = { outside: false, kind: "advance", leftPx: 0, widthPx: Math.min(days * pxPerDay, width) };
    }
  }

  let endOverlay: ShiftOverlay | null = null;
  if (plannedEndRaw && plannedEndRaw.getTime() !== origEnd.getTime()) {
    if (plannedEndRaw.getTime() > origEnd.getTime()) {
      const days = diffInDays(plannedEndRaw, origEnd);
      endOverlay = { outside: true, kind: "advance", leftPx: width, widthPx: days * pxPerDay };
    } else {
      const days = diffInDays(origEnd, plannedEndRaw);
      const widthPx = Math.min(days * pxPerDay, width);
      endOverlay = { outside: false, kind: "delay", leftPx: width - widthPx, widthPx };
    }
  }

  function beginDrag(e: React.PointerEvent, mode: "move" | "left" | "right") {
    if (!interactive) return;
    e.stopPropagation();
    barRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = { mode, startX: e.clientX };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const deltaDays = Math.round((e.clientX - dragRef.current.startX) / pxPerDay);
    if (dragRef.current.mode === "move") {
      setPreview({ start: addDays(origStart, deltaDays), end: addDays(origEnd, deltaDays) });
    } else if (dragRef.current.mode === "left") {
      const newStart = addDays(origStart, deltaDays);
      if (newStart <= origEnd) setPreview({ start: newStart, end: origEnd });
    } else {
      const newEnd = addDays(origEnd, deltaDays);
      if (newEnd >= origStart) setPreview({ start: origStart, end: newEnd });
    }
  }

  function onPointerUp() {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (preview) {
      onCommit(item.id, preview.start, preview.end).then((ok) => {
        if (!ok) setPreview(null);
      });
    } else {
      setPreview(null);
    }
  }

  useEffect(() => {
    if (
      preview &&
      new Date(item.startDate).getTime() === preview.start.getTime() &&
      new Date(item.endDate).getTime() === preview.end.getTime()
    ) {
      setPreview(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.startDate, item.endDate]);

  const roundLeft = !startOverlay?.outside;
  const roundRight = !endOverlay?.outside;
  const roundingClass = roundLeft && roundRight
    ? "rounded-md"
    : roundLeft
    ? "rounded-l-md"
    : roundRight
    ? "rounded-r-md"
    : "";

  return (
    <div
      ref={barRef}
      data-gantt-item-id={item.id}
      onPointerDown={(e) => beginDrag(e, "move")}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={cn(
        "group absolute top-2 flex touch-none select-none items-center text-[11px] font-medium text-white",
        interactive ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        STATUS_BAR_COLOR[item.status],
        roundingClass
      )}
      style={{
        left,
        width,
        height: ROW_HEIGHT - 16,
        boxShadow: !interactive && epicColor ? `0 0 0 2px ${withAlpha(epicColor, "55")}` : undefined,
      }}
      title={interactive ? undefined : "Dates et avancement dérivés des sous-items"}
    >
      {startOverlay?.outside && (
        <div
          className={cn(
            "absolute top-0 z-10 h-full rounded-l-md border-y border-l border-dashed",
            startOverlay.kind === "delay" ? "border-red-500" : "border-green-500"
          )}
          style={{ left: startOverlay.leftPx, width: startOverlay.widthPx, backgroundColor: "rgba(255,255,255,0.45)" }}
          title="Démarrage retardé par rapport à la date prévue - voir l'historique dans le tableau Items"
        />
      )}
      {endOverlay?.outside && (
        <div
          className={cn(
            "absolute top-0 z-10 h-full rounded-r-md border-y border-r border-dashed",
            endOverlay.kind === "delay" ? "border-red-500" : "border-green-500"
          )}
          style={{ left: endOverlay.leftPx, width: endOverlay.widthPx, backgroundColor: "rgba(255,255,255,0.45)" }}
          title="Terminé en avance par rapport à la date prévue - voir l'historique dans le tableau Items"
        />
      )}

      <div className={cn("absolute inset-0 overflow-hidden", roundingClass)}>
        <div className="absolute inset-0 bg-black/25" />
        <div className="absolute inset-y-0 left-0 bg-white/25" style={{ width: `${item.progress}%` }} />
        {startOverlay && !startOverlay.outside && (
          <div
            className={cn(
              "absolute inset-y-0 z-10 border-y border-dashed",
              startOverlay.kind === "delay" ? "border-red-500" : "border-green-500"
            )}
            style={{ left: startOverlay.leftPx, width: startOverlay.widthPx, backgroundColor: "rgba(255,255,255,0.45)" }}
            title="Démarré en avance par rapport à la date prévue - voir l'historique dans le tableau Items"
          />
        )}
        {endOverlay && !endOverlay.outside && (
          <div
            className={cn(
              "absolute inset-y-0 z-10 border-y border-dashed",
              endOverlay.kind === "delay" ? "border-red-500" : "border-green-500"
            )}
            style={{ left: endOverlay.leftPx, width: endOverlay.widthPx, backgroundColor: "rgba(255,255,255,0.45)" }}
            title="Retard par rapport à la date de fin prévue - voir l'historique dans le tableau Items"
          />
        )}

        {interactive && (
          <>
            <div
              onPointerDown={(e) => beginDrag(e, "left")}
              className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-md bg-white/0 opacity-0 transition-colors group-hover:bg-white/30 group-hover:opacity-100 hover:bg-white/50"
              title="Glisser pour changer la date de début"
            />
            <div
              onPointerDown={(e) => beginDrag(e, "right")}
              className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-md bg-white/0 opacity-0 transition-colors group-hover:bg-white/30 group-hover:opacity-100 hover:bg-white/50"
              title="Glisser pour changer la date de fin"
            />
          </>
        )}
      </div>

      <span className="pointer-events-none absolute left-2 top-1/2 z-10 max-w-[200px] -translate-y-1/2 truncate whitespace-nowrap text-[11px] font-medium text-white">
        {item.title} · {item.progress}%
      </span>

      {isCritical && (
        <span
          className="absolute -left-1.5 -top-1.5 z-20 flex h-4 w-4 items-center justify-center rounded-full border border-status-blocked bg-surface text-status-blocked shadow-sm"
          title="Sur le chemin critique"
        >
          <Flame size={9} />
        </span>
      )}

      <span className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap text-[10px] text-ink-muted opacity-0 transition-opacity group-hover:opacity-100">
        {format(displayStart, "d MMM", { locale: fr })}
      </span>
      <span className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap text-[10px] text-ink-muted opacity-0 transition-opacity group-hover:opacity-100">
        {format(displayEnd, "d MMM", { locale: fr })}
      </span>

      {(() => {
        const count = dependencyCountOverride ?? item.dependencyCount;
        if (!count) return null;
        return (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onShowDependencies();
            }}
            className="absolute -top-1.5 -right-1.5 z-20 flex h-4 w-4 items-center justify-center rounded-full border border-accent bg-surface text-accent shadow-sm transition-transform hover:scale-110"
            title={`${count} d\u00e9pendance${count > 1 ? "s" : ""} \u00b7 cliquer pour voir`}
          >
            <Link2 size={9} />
          </button>
        );
      })()}

      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          onStartLink(item.id, "left", e);
        }}
        className="absolute -left-1.5 top-1/2 z-10 h-2.5 w-2.5 -translate-y-1/2 cursor-crosshair rounded-full border-[1.5px] border-white/60 bg-accent opacity-0 shadow-md shadow-black/40 transition-all duration-150 group-hover:opacity-100 hover:scale-125"
        title="Cliquer ou glisser pour créer une dépendance"
      />
      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          onStartLink(item.id, "right", e);
        }}
        className="absolute -right-1.5 top-1/2 z-10 h-2.5 w-2.5 -translate-y-1/2 cursor-crosshair rounded-full border-[1.5px] border-white/60 bg-accent opacity-0 shadow-md shadow-black/40 transition-all duration-150 group-hover:opacity-100 hover:scale-125"
        title="Cliquer ou glisser pour créer une dépendance"
      />
    </div>
  );
}
