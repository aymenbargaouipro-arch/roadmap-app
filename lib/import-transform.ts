import { format } from "date-fns";
import {
  parseCellDate,
  normalizeStatus,
  normalizeProgress,
  cellAt,
  detectRowLevel,
  type RowLevel,
  type HierarchyMapping,
} from "@/lib/excel-import";

// --- Types partages entre l'import Excel et l'import image --------------------------------
// Le mapping et les metadonnees de structure (dateFormat, statusValueMap, hierarchy...) sont
// toujours produits par l'IA (lib/anthropic.ts), que la source soit un tableur ou une image.
// Cette fonction ne fait AUCUN appel IA : elle applique une transformation deterministe sur
// des lignes brutes deja mappees, quelle que soit leur origine.

export type ImportMapping = {
  title: number | null;
  startDate: number | null;
  endDate: number | null;
  status: number | null;
  progress: number | null;
  owner: number | null;
  isMilestone: number | null;
};

export type PreviewItem = {
  rowId: string;
  parentRowId: string | null;
  level: RowLevel;
  title: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  progress: number;
  ownerId: string | null;
  ownerName: string | null;
};

export type PreviewMilestone = { title: string; date: string | null };

export type WorkspaceMemberLite = { user: { id: string; name: string } };

export type TransformRowsInput = {
  dataRows: unknown[][];
  mapping: ImportMapping;
  dateFormat: string;
  statusValueMap: Record<string, string>;
  milestoneTruthyValues: string[];
  hierarchy: HierarchyMapping | null | undefined;
  workspaceMembers: WorkspaceMemberLite[];
};

export type TransformRowsResult = {
  items: PreviewItem[];
  milestonesFromMainSheet: PreviewMilestone[];
  warnings: string[];
};

export function transformRowsToItems(input: TransformRowsInput): TransformRowsResult {
  const { dataRows, mapping, dateFormat, statusValueMap, milestoneTruthyValues, hierarchy, workspaceMembers } =
    input;

  const warnings: string[] = [];

  function matchOwner(raw: unknown): { id: string | null; name: string | null } {
    if (!raw) return { id: null, name: null };
    const rawName = String(raw).trim();
    if (!rawName) return { id: null, name: null };

    const exact = workspaceMembers.find((m) => m.user.name.toLowerCase() === rawName.toLowerCase());
    if (exact) return { id: exact.user.id, name: exact.user.name };

    const partial = workspaceMembers.find(
      (m) =>
        m.user.name.toLowerCase().includes(rawName.toLowerCase()) ||
        rawName.toLowerCase().includes(m.user.name.toLowerCase())
    );
    if (partial) return { id: partial.user.id, name: partial.user.name };

    warnings.push(`Owner "${rawName}" introuvable parmi les membres, ligne laissée non assignée.`);
    return { id: null, name: rawName };
  }

  const items: PreviewItem[] = [];
  const milestonesFromMainSheet: PreviewMilestone[] = [];

  // Contexte de regroupement Epic/sous-item, maintenu au fil des lignes dans l'ordre du fichier.
  let currentEpic: { rowId: string; epicNumber: string | null } | null = null;
  const childCountByEpicRowId = new Map<string, number>();

  dataRows.forEach((row, dataRowIndex) => {
    const rawTitle = cellAt(row, mapping.title);
    const title = rawTitle != null ? String(rawTitle).trim() : "";
    if (!title) return;

    const isMilestoneRow =
      mapping.isMilestone != null &&
      (milestoneTruthyValues ?? []).some(
        (v) => String(cellAt(row, mapping.isMilestone) ?? "").trim().toLowerCase() === v.trim().toLowerCase()
      );

    const startDate = parseCellDate(cellAt(row, mapping.startDate), dateFormat);
    const endDate = parseCellDate(cellAt(row, mapping.endDate), dateFormat);

    if (isMilestoneRow) {
      const milestoneDate = endDate ?? startDate;
      if (!milestoneDate) {
        warnings.push(`Jalon "${title}" ignoré : aucune date reconnue.`);
        return;
      }
      milestonesFromMainSheet.push({ title, date: format(milestoneDate, "yyyy-MM-dd") });
      return;
    }

    if (!startDate || !endDate) {
      warnings.push(`Tâche "${title}" : date de début ou de fin non reconnue, vérifie-la avant import.`);
    }

    const rawStatus = cellAt(row, mapping.status);
    const { status, matched } = normalizeStatus(rawStatus, statusValueMap ?? {});
    if (rawStatus != null && String(rawStatus).trim() !== "" && !matched) {
      warnings.push(`Tâche "${title}" : statut "${rawStatus}" non reconnu, mis à "À faire" par défaut.`);
    }

    const progress = mapping.progress != null ? normalizeProgress(cellAt(row, mapping.progress)) : 0;
    const owner = matchOwner(cellAt(row, mapping.owner));

    const rowId = `r${dataRowIndex}`;
    const rawTypeValue = hierarchy?.typeColumn != null ? cellAt(row, hierarchy.typeColumn) : null;
    const detected = detectRowLevel(title, rawTypeValue, hierarchy);

    let level: RowLevel = detected.level;
    let parentRowId: string | null = null;

    if (level === "epic") {
      currentEpic = { rowId, epicNumber: detected.epicNumber };
    } else if (level === "subitem") {
      // Si la detection vient de la numerotation (epicNumber non-null des deux cotes) et que
      // les numeros ne correspondent pas, on rattache quand meme a l'Epic courant : mieux
      // vaut un rattachement approximatif visible et corrigeable qu'une ligne perdue a plat.
      if (currentEpic) {
        parentRowId = currentEpic.rowId;
      }
      if (parentRowId == null) {
        level = "flat";
        warnings.push(
          `"${title}" ressemble à un sous-item mais aucun Epic précédent n'a été détecté, importé comme item normal.`
        );
      } else {
        childCountByEpicRowId.set(parentRowId, (childCountByEpicRowId.get(parentRowId) ?? 0) + 1);
      }
    }

    items.push({
      rowId,
      parentRowId,
      level,
      title,
      startDate: startDate ? format(startDate, "yyyy-MM-dd") : null,
      endDate: endDate ? format(endDate, "yyyy-MM-dd") : null,
      status,
      progress,
      ownerId: owner.id,
      ownerName: owner.name,
    });
  });

  // Un Epic candidat qui n'a recupere aucun sous-item n'est probablement pas un vrai Epic
  // (ex: numerotation de sprint sans hierarchie reelle) -> retrogradation en item normal.
  for (const it of items) {
    if (it.level === "epic" && !childCountByEpicRowId.has(it.rowId)) {
      it.level = "flat";
    }
  }

  return { items, milestonesFromMainSheet, warnings };
}
