"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Link2, ChevronRight, ChevronDown, CornerDownRight, Eye, EyeOff } from "lucide-react";
import { addDays, computeTimelineRange, diffInDays, startOfDay, computeCalendarTicks, type ZoomLevel } from "@/lib/gantt";
import { computeSprintBands, type SprintBand } from "@/lib/sprints";
import { cn } from "@/lib/utils";
import { DEFAULT_ROADMAP_COLOR, withAlpha } from "@/lib/roadmap-theme";
import {
  DependencyModal,
  type DependencyDirection,
  type DependencyTargetKind,
  type WorkspaceItem,
} from "@/components/dependency-modal";
import { DependencyTableModal, type DependencySourceItem } from "@/components/dependency-table-modal";
import { MilestoneModal } from "@/components/milestone-modal";

type ConsolidatedItem = {
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

type ConsolidatedRoadmap = {
  id: string;
  name: string;
  items: ConsolidatedItem[];
  color?: string | null;
  icon?: string | null;
  logoUrl?: string | null;
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
type LinkState = { sourceId: string; side: "left" | "right"; x: number; y: number } | null;
type CurveDrag = { id: string; offX: number; offY: number } | null;

type DepModalState = {
  sourceItemId: string;
  sourceItemTitle: string;
  initialDirection?: DependencyDirection;
  initialTargetKind?: DependencyTargetKind;
  initialTargetItemId?: string;
} | null;

const PX_PER_DAY_BY_ZOOM: Record<ZoomLevel, number> = { week: 22, month: 8, quarter: 3 };
const LABEL_WIDTH = 260;
const GROUP_ROW_HEIGHT = 30;
const ITEM_ROW_HEIGHT = 46;
const BAR_HEIGHT = 28;
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

export function ConsolidatedGantt({
  roadmaps,
  dependencies,
  workspaceItems = [],
  sprintConfig = null,
}: {
  roadmaps: ConsolidatedRoadmap[];
  dependencies: Dependency[];
  workspaceItems?: WorkspaceItem[];
  sprintConfig?: SprintConfigProp;
}) {
  const router = useRouter();
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("week");
  const pxPerDay = PX_PER_DAY_BY_ZOOM[zoomLevel];
  const [linking, setLinking] = useState<LinkState>(null);
  const [depModal, setDepModal] = useState<DepModalState>(null);
  const [depTableItems, setDepTableItems] = useState<DependencySourceItem[] | null>(null);
  const [milestoneModal, setMilestoneModal] = useState<{ roadmapId: string; date: string } | null>(null);
  const [curveDrag, setCurveDrag] = useState<CurveDrag>(null);
  const [pendingCurveSave, setPendingCurveSave] = useState<CurveDrag>(null);
  const [collapsedEpics, setCollapsedEpics] = useState<Set<string>>(() => {
    const parentIds = new Set<string>();
    for (const item of roadmaps.flatMap((r) => r.items)) {
      if (item.parentId) parentIds.add(item.parentId);
    }
    return parentIds;
  });
  const [showDependencies, setShowDependencies] = useState(true);
  const curveDragMetaRef = useRef<{ mx: number; my: number; dist: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const linkStartPos = useRef<{ x: number; y: number } | null>(null);
  const linkProcessingRef = useRef(false);

  const allItems = useMemo(() => roadmaps.flatMap((r) => r.items), [roadmaps]);
  const itemsById = useMemo(() => new Map(allItems.map((i) => [i.id, i])), [allItems]);
  const roadmapMeta = useMemo(
    () =>
      new Map(
        roadmaps.map((r) => [
          r.id,
          { color: r.color ?? DEFAULT_ROADMAP_COLOR, icon: r.icon ?? null, logoUrl: r.logoUrl ?? null },
        ])
      ),
    [roadmaps]
  );

  const childrenByParent = useMemo(() => {
    const map = new Map<string, ConsolidatedItem[]>();
    for (const item of allItems) {
      if (item.parentId) {
        if (!map.has(item.parentId)) map.set(item.parentId, []);
        map.get(item.parentId)!.push(item);
      }
    }
    return map;
  }, [allItems]);

  function toggleCollapsed(id: string) {
    setCollapsedEpics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Meme logique que gantt-chart.tsx : exclut du compteur les dependances entre deux
  // sous-items de la MEME Epic (elles ne produiront jamais de fleche visible une fois
  // l'Epic repliee, les deux extremites se redirigeant vers le meme point).
  function countExternalDependencies(epicItem: ConsolidatedItem): number {
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

  const range = useMemo(
    () =>
      computeTimelineRange(allItems.map((i) => ({ startDate: new Date(i.startDate), endDate: new Date(i.endDate) }))),
    [allItems]
  );
  const totalDays = diffInDays(range.end, range.start);
  const totalWidth = totalDays * pxPerDay;
  const todayOffset = diffInDays(startOfDay(new Date()), range.start) * pxPerDay;

  const sprintBands: SprintBand[] = sprintConfig
    ? computeSprintBands(
        {
          referenceDate: new Date(sprintConfig.referenceDate),
          durationWeeks: sprintConfig.durationWeeks,
          referenceNumber: sprintConfig.referenceNumber,
        },
        range.start,
        range.end
      )
    : [];

  type Row =
    | { type: "group"; roadmapId: string; roadmapName: string; roadmapColor: string; roadmapIcon: string | null; roadmapLogoUrl: string | null }
    | { type: "item"; item: ConsolidatedItem; roadmapId: string; depth: 0 | 1; isEpic: boolean };
  const rows: Row[] = [];
  const positions = new Map<string, { x1: number; x2: number; y: number }>();

  function pushItemRow(item: ConsolidatedItem, roadmapId: string, depth: 0 | 1, isEpic: boolean) {
    rows.push({ type: "item", item, roadmapId, depth, isEpic });
    const x1 = diffInDays(new Date(item.startDate), range.start) * pxPerDay;
    const x2 = x1 + (diffInDays(new Date(item.endDate), new Date(item.startDate)) + 1) * pxPerDay;
    positions.set(item.id, { x1, x2, y: y + ITEM_ROW_HEIGHT / 2 });
    y += ITEM_ROW_HEIGHT;
  }

  let y = 0;
  for (const roadmap of roadmaps) {
    const meta = roadmapMeta.get(roadmap.id)!;
    rows.push({
      type: "group",
      roadmapId: roadmap.id,
      roadmapName: roadmap.name,
      roadmapColor: meta.color,
      roadmapIcon: meta.icon,
      roadmapLogoUrl: meta.logoUrl,
    });
    y += GROUP_ROW_HEIGHT;
    for (const item of roadmap.items) {
      if (item.parentId) continue; // gere via son parent ci-dessous
      const children = childrenByParent.get(item.id) ?? [];
      const isEpic = children.length > 0;
      pushItemRow(item, roadmap.id, 0, isEpic);
      if (isEpic && !collapsedEpics.has(item.id)) {
        for (const child of children) pushItemRow(child, roadmap.id, 1, false);
      }
    }
  }
  const contentHeight = y;

  // Graduations de l'en-tete, calculees differemment selon le niveau de zoom (voir le meme
  // commentaire plus detaille dans gantt-chart.tsx) : pas fixe de 7 jours pour "week" (avec
  // alignement sprint), calage sur le vrai calendrier pour "month"/"quarter".
  let periodTicks: { offsetDays: number; label: string }[];
  if (zoomLevel === "week") {
    let weekTickStartOffset = 0;
    if (sprintConfig) {
      const refDate = new Date(sprintConfig.referenceDate);
      const diff = diffInDays(range.start, refDate);
      const mod = ((diff % 7) + 7) % 7;
      weekTickStartOffset = mod === 0 ? 0 : 7 - mod;
    }
    periodTicks = [];
    for (let d = weekTickStartOffset; d <= totalDays; d += 7) {
      periodTicks.push({ offsetDays: d, label: format(addDays(range.start, d), "d MMM", { locale: fr }) });
    }
  } else if (zoomLevel === "month") {
    periodTicks = computeCalendarTicks("month", range.start, range.end, (d) => format(d, "MMMM yyyy", { locale: fr }));
  } else {
    periodTicks = computeCalendarTicks(
      "quarter",
      range.start,
      range.end,
      (d) => `T${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`
    );
  }

  const computedArrows = dependencies
    .map((dep) => {
      // Renvoie l'id de la ligne qui represente reellement ce point (l'item lui-meme s'il
      // est visible, sinon son Epic parente si elle est repliee).
      function resolveId(id: string): string | undefined {
        if (positions.has(id)) return id;
        const parentId = itemsById.get(id)?.parentId;
        return parentId && positions.has(parentId) ? parentId : undefined;
      }

      const resolvedFromId = resolveId(dep.blockingItemId);
      const resolvedToId = resolveId(dep.blockedItemId);
      if (!resolvedFromId || !resolvedToId) return null;
      // Dependance entre deux sous-items de la MEME Epic repliee : les deux extremites se
      // redirigent vers le meme point. Une courbe de Bezier avec un point de depart et
      // d'arrivee identiques dessine quand meme une boucle visible via son point de
      // controle - il faut explicitement l'exclure du trace, pas seulement du compteur.
      if (resolvedFromId === resolvedToId) return null;
      const from = positions.get(resolvedFromId)!;
      const to = positions.get(resolvedToId)!;

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

  const byMergeKey = new Map<string, (typeof computedArrows)[number] & { mergedCount: number }>();
  for (const arrow of computedArrows) {
    const existing = byMergeKey.get(arrow.mergeKey);
    if (existing) existing.mergedCount += 1;
    else byMergeKey.set(arrow.mergeKey, { ...arrow, mergedCount: 1 });
  }
  const arrows = Array.from(byMergeKey.values());

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
      const rect = svgRef.current?.getBoundingClientRect();
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
    const pos = positions.get(itemId);
    if (!pos) return;
    linkStartPos.current = { x: e.clientX, y: e.clientY };
    setLinking({ sourceId: itemId, side, x: side === "left" ? pos.x1 : pos.x2, y: pos.y });
  }

  useEffect(() => {
    if (!linking) return;

    function onMove(e: PointerEvent) {
      const rect = svgRef.current?.getBoundingClientRect();
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

  function handleRowDoubleClick(e: React.MouseEvent<HTMLDivElement>, roadmapId: string) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const dayOffset = Math.round(x / pxPerDay);
    const date = addDays(range.start, dayOffset);
    setMilestoneModal({ roadmapId, date: format(date, "yyyy-MM-dd") });
  }

  if (allItems.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface px-5 py-10 text-center text-sm text-ink-muted">
        Aucun item dans l'espace pour l'instant.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Gantt consolidé - toutes les équipes
          </h2>
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
          Cliquer ou glisser le point d&apos;une barre pour créer une dépendance · double-clic sur une ligne pour un
          jalon
        </p>
      </div>
      <div
        className="gantt-scrollbar max-h-[70vh] overflow-x-auto overflow-y-auto"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.15) transparent" }}
      >
        <style>{`
          .gantt-scrollbar::-webkit-scrollbar { height: 10px; width: 10px; }
          .gantt-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .gantt-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(255,255,255,0.15); border-radius: 9999px; }
          .gantt-scrollbar::-webkit-scrollbar-thumb:hover { background-color: rgba(255,255,255,0.25); }
        `}</style>
        <div style={{ width: LABEL_WIDTH + totalWidth }}>
          {/* En-tête timeline : bandeau sprints (optionnel) + dates, empiles dans le meme
              conteneur sticky pour rester colles ensemble pendant le scroll vertical. */}
          <div className="sticky top-0 z-20 flex flex-col border-b border-border bg-surface">
            {sprintBands.length > 0 && (
              <div className="flex border-b border-border">
                <div className="sticky left-0 z-40 shrink-0 bg-surface" style={{ width: LABEL_WIDTH }} />
                <div className="relative shrink-0" style={{ width: totalWidth, height: 20 }}>
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
            <div className="flex">
              <div className="sticky left-0 z-40 shrink-0 bg-surface" style={{ width: LABEL_WIDTH }} />
              <div className="relative shrink-0" style={{ width: totalWidth, height: 32 }}>
                {periodTicks.map((tick) => (
                  <div
                    key={tick.offsetDays}
                    className="absolute top-0 h-full border-l border-border/85 pl-1.5 text-[11px] capitalize text-ink-muted"
                    style={{ left: tick.offsetDays * pxPerDay }}
                  >
                    {tick.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Corps : lignes + flèches en overlay */}
          <div className="relative select-none">
            {rows.map((row, idx) =>
              row.type === "group" ? (
                <div key={`g-${idx}`} className="flex border-b border-border bg-background/40">
                  <div
                    className="sticky left-0 z-40 flex shrink-0 items-center gap-2 bg-background/40 pl-3 pr-3 text-[11px] font-semibold uppercase tracking-wide text-ink-muted"
                    style={{
                      width: LABEL_WIDTH,
                      height: GROUP_ROW_HEIGHT,
                      borderLeft: `3px solid ${withAlpha(row.roadmapColor, "AA")}`,
                    }}
                  >
                    <span
                      className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] normal-case"
                      style={{ backgroundColor: withAlpha(row.roadmapColor, "33") }}
                    >
                      {row.roadmapLogoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.roadmapLogoUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        row.roadmapIcon ?? ""
                      )}
                    </span>
                    <Link
                      href={`/roadmaps/${row.roadmapId}`}
                      className="truncate hover:text-accent hover:underline"
                    >
                      {row.roadmapName}
                    </Link>
                  </div>
                  <div style={{ width: totalWidth, height: GROUP_ROW_HEIGHT }} />
                </div>
              ) : (
                <div key={row.item.id} className="flex border-b border-border last:border-b-0">
                  <div
                    className="sticky left-0 z-40 flex shrink-0 items-center gap-1.5 truncate border-r border-border bg-surface px-4 text-xs text-ink"
                    style={{
                      width: LABEL_WIDTH,
                      height: ITEM_ROW_HEIGHT,
                      paddingLeft: row.depth === 1 ? "2.25rem" : "1rem",
                    }}
                    title={row.item.title}
                  >
                    {row.isEpic ? (
                      <button
                        type="button"
                        onClick={() => toggleCollapsed(row.item.id)}
                        className="shrink-0 text-ink-muted hover:text-ink"
                        aria-label={collapsedEpics.has(row.item.id) ? "Déplier" : "Replier"}
                      >
                        {collapsedEpics.has(row.item.id) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                      </button>
                    ) : row.depth === 1 ? (
                      <CornerDownRight size={11} className="shrink-0 text-ink-muted" />
                    ) : null}
                    <span className={cn("truncate", row.isEpic && "font-semibold")}>{row.item.title}</span>
                  </div>
                  <div
                    className="relative shrink-0 cursor-copy"
                    style={{ width: totalWidth, height: ITEM_ROW_HEIGHT }}
                    onDoubleClick={(e) => handleRowDoubleClick(e, row.roadmapId)}
                    title="Double-cliquer pour ajouter un jalon à cette équipe"
                  >
                    {todayOffset >= 0 && todayOffset <= totalWidth && (
                      <div className="absolute top-0 h-full w-px bg-accent/30" style={{ left: todayOffset }} />
                    )}
                    <ConsolidatedBar
                      item={row.item}
                      rangeStart={range.start}
                      pxPerDay={pxPerDay}
                      interactive={!row.isEpic}
                      epicColor={roadmapMeta.get(row.roadmapId)?.color}
                      onCommit={commitDates}
                      onStartLink={handleStartLink}
                      dependencyCountOverride={
                        row.isEpic && collapsedEpics.has(row.item.id)
                          ? countExternalDependencies(row.item)
                          : undefined
                      }
                      onShowDependencies={() => {
                        const isCollapsed = row.isEpic && collapsedEpics.has(row.item.id);
                        const children = isCollapsed ? childrenByParent.get(row.item.id) ?? [] : [];
                        setDepTableItems([
                          { id: row.item.id, title: row.item.title },
                          ...children.map((c) => ({ id: c.id, title: c.title })),
                        ]);
                      }}
                    />
                  </div>
                </div>
              )
            )}

            {/* Flèches de dépendance existantes + ligne de lien en cours (overlay SVG) */}
            <svg
              ref={svgRef}
              className="pointer-events-none absolute top-0"
              style={{ left: LABEL_WIDTH, width: totalWidth, height: contentHeight, overflow: "visible" }}
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
                      r={4}
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
                  const from = positions.get(linking.sourceId);
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

      {milestoneModal && (
        <MilestoneModal
          roadmapId={milestoneModal.roadmapId}
          initialDate={milestoneModal.date}
          onClose={() => setMilestoneModal(null)}
          onCreated={() => router.refresh()}
        />
      )}
    </div>
  );
}

function ConsolidatedBar({
  item,
  rangeStart,
  pxPerDay,
  onCommit,
  onStartLink,
  onShowDependencies,
  interactive = true,
  dependencyCountOverride,
  epicColor,
}: {
  item: ConsolidatedItem;
  rangeStart: Date;
  pxPerDay: number;
  onCommit: (id: string, start: Date, end: Date) => Promise<boolean>;
  onStartLink: (itemId: string, side: "left" | "right", e: React.PointerEvent) => void;
  onShowDependencies: () => void;
  interactive?: boolean;
  dependencyCountOverride?: number;
  epicColor?: string;
}) {
  const origStart = new Date(item.startDate);
  const origEnd = new Date(item.endDate);
  const [preview, setPreview] = useState<{ start: Date; end: Date } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ mode: "move" | "left" | "right"; startX: number } | null>(null);

  const displayStart = preview?.start ?? origStart;
  const displayEnd = preview?.end ?? origEnd;
  const left = diffInDays(displayStart, rangeStart) * pxPerDay;
  // Meme correctif que gantt-chart.tsx : marge proportionnelle au zoom avec plancher absolu.
  const gutter = Math.min(3, pxPerDay / 3);
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

  // Arrondi conditionnel : cf. gantt-chart.tsx - evite le "pincement" visuel entre la barre
  // pleine et son extension exterieure.
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
      onDoubleClick={(e) => e.stopPropagation()}
      className={cn(
        "group absolute flex touch-none select-none items-center text-[10px] font-medium text-white",
        interactive ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        STATUS_BAR_COLOR[item.status],
        roundingClass
      )}
      style={{
        left,
        width,
        height: BAR_HEIGHT,
        top: (ITEM_ROW_HEIGHT - BAR_HEIGHT) / 2,
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
          title="Démarrage retardé par rapport à la date prévue"
        />
      )}
      {endOverlay?.outside && (
        <div
          className={cn(
            "absolute top-0 z-10 h-full rounded-r-md border-y border-r border-dashed",
            endOverlay.kind === "delay" ? "border-red-500" : "border-green-500"
          )}
          style={{ left: endOverlay.leftPx, width: endOverlay.widthPx, backgroundColor: "rgba(255,255,255,0.45)" }}
          title="Terminé en avance par rapport à la date prévue"
        />
      )}

      {/* Contenu clippé aux coins arrondis (remplissage, titre, poignées de resize) */}
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
            title="Démarré en avance par rapport à la date prévue"
          />
        )}
        {endOverlay && !endOverlay.outside && (
          <div
            className={cn(
              "absolute inset-y-0 z-10 border-y border-dashed",
              endOverlay.kind === "delay" ? "border-red-500" : "border-green-500"
            )}
            style={{ left: endOverlay.leftPx, width: endOverlay.widthPx, backgroundColor: "rgba(255,255,255,0.45)" }}
            title="Retard par rapport à la date de fin prévue"
          />
        )}

        {interactive && (
          <>
            <div
              onPointerDown={(e) => beginDrag(e, "left")}
              className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize rounded-l-md bg-white/0 opacity-0 transition-colors group-hover:bg-white/30 group-hover:opacity-100 hover:bg-white/50"
              title="Glisser pour changer la date de début"
            />
            <div
              onPointerDown={(e) => beginDrag(e, "right")}
              className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r-md bg-white/0 opacity-0 transition-colors group-hover:bg-white/30 group-hover:opacity-100 hover:bg-white/50"
              title="Glisser pour changer la date de fin"
            />
          </>
        )}
      </div>

      <span className="pointer-events-none absolute left-1.5 top-1/2 z-10 max-w-[200px] -translate-y-1/2 truncate whitespace-nowrap text-[11px] font-medium text-white">
        {item.title} · {item.progress}%
      </span>

      <span className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap text-[10px] text-ink-muted opacity-0 transition-opacity group-hover:opacity-100">
        {format(displayStart, "d MMM", { locale: fr })}
      </span>
      <span className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap text-[10px] text-ink-muted opacity-0 transition-opacity group-hover:opacity-100">
        {format(displayEnd, "d MMM", { locale: fr })}
      </span>

      {/* Icone de dependances (hors zone clippee) */}
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
            className="absolute -top-1.5 -right-1.5 z-20 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-accent bg-surface text-accent shadow-sm transition-transform hover:scale-110"
            title={`${count} dépendance${count > 1 ? "s" : ""} · cliquer pour voir`}
          >
            <Link2 size={8} />
          </button>
        );
      })()}

      {/* Connecteurs de dependance (hors zone clippee) : clic = modale vierge, glisser vers une autre barre = cible pre-remplie */}
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
