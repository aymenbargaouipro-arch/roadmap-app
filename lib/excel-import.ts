import * as XLSX from "xlsx";
import { parse as parseDateFns, isValid } from "date-fns";

export function parseWorkbook(buffer: Buffer): XLSX.WorkBook {
  return XLSX.read(buffer, { type: "buffer", cellDates: true });
}

// Lit une feuille en tableau brut de lignes (chaque ligne = tableau de cellules dans l'ordre
// des colonnes). On ne suppose PAS que la ligne 1 est l'en-tete : beaucoup de fichiers reels
// ont une ligne de titre de document et/ou des lignes de periodes/sprints au-dessus du vrai
// en-tete. C'est a l'IA de reperer la bonne ligne (voir lib/anthropic.ts).
const MAX_COLUMNS = 80;
const MAX_ROWS = 5000;

export function sheetToRawRows(workbook: XLSX.WorkBook, sheetName: string): unknown[][] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, blankrows: false });

  // Garde-fou : certains fichiers ont une plage "utilisee" gonflee par du formatage residuel
  // (colonnes/lignes entieres mises en forme sans donnee reelle), ce qui peut produire des
  // lignes de plusieurs milliers de cellules. On plafonne quoi qu'il arrive.
  return (rows as unknown[][]).slice(0, MAX_ROWS).map((row) => row.slice(0, MAX_COLUMNS));
}

export function findMilestoneSheetName(workbook: XLSX.WorkBook): string | null {
  const mainSheet = workbook.SheetNames[0];
  return workbook.SheetNames.find((name) => name !== mainSheet && /jalon|milestone/i.test(name)) ?? null;
}

const DATE_FORMATS = ["dd/MM/yyyy", "dd/MM/yy", "MM/dd/yyyy", "yyyy-MM-dd", "dd-MM-yyyy", "dd.MM.yyyy"];

// Excel stocke parfois les dates comme des nombres de serie (jours depuis 1899-12-30)
function excelSerialToDate(serial: number): Date | null {
  const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return isValid(date) ? date : null;
}

export function parseCellDate(value: unknown, hintedFormat?: string): Date | null {
  if (value instanceof Date) return isValid(value) ? value : null;
  if (typeof value === "number") return excelSerialToDate(value);

  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();

    // Nos formats supportes (DATE_FORMATS) sont tous numeriques : si le texte contient
    // des lettres (ex: placeholder "XX/XX/2026"), ce n'est pas une vraie date exploitable.
    if (/[a-zA-Z]/.test(trimmed)) return null;

    const candidates =
      hintedFormat && hintedFormat !== "unknown" ? [hintedFormat, ...DATE_FORMATS] : DATE_FORMATS;

    for (const fmt of candidates) {
      const parsed = parseDateFns(trimmed, fmt, new Date());
      if (isValid(parsed)) return parsed;
    }

    const native = new Date(trimmed);
    if (isValid(native)) return native;
  }

  return null;
}

const VALID_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"];

export function normalizeStatus(
  raw: unknown,
  statusValueMap: Record<string, string>
): { status: string; matched: boolean } {
  if (raw == null || String(raw).trim() === "") return { status: "TODO", matched: true };

  const key = String(raw).trim();
  const mapped = statusValueMap?.[key];
  if (mapped && VALID_STATUSES.includes(mapped)) return { status: mapped, matched: true };

  // Repli heuristique si le mapping IA n'a pas couvert cette valeur precise
  const lower = key.toLowerCase();
  if (/(termin|fait|done|complet|closed)/.test(lower)) return { status: "DONE", matched: true };
  if (/(bloq|block)/.test(lower)) return { status: "BLOCKED", matched: true };
  if (/(cours|progress|wip|going)/.test(lower)) return { status: "IN_PROGRESS", matched: true };
  if (/(faire|todo|not started|planned)/.test(lower)) return { status: "TODO", matched: true };

  return { status: "TODO", matched: false };
}

export function normalizeProgress(raw: unknown): number {
  if (raw == null || raw === "") return 0;

  if (typeof raw === "number") {
    const n = raw > 0 && raw <= 1 ? raw * 100 : raw;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  const cleaned = String(raw).replace("%", "").replace(",", ".").trim();
  const parsed = parseFloat(cleaned);
  if (isNaN(parsed)) return 0;

  const n = parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function cellAt(row: unknown[], index: number | null): unknown {
  if (index == null) return null;
  const value = row[index];
  return value === undefined ? null : value;
}

// --- Detection Epic / sous-item ------------------------------------------------------------
//
// Deux sources de signal, dans cet ordre de priorite :
// 1. Une colonne "Type" reperee par l'IA (lib/anthropic.ts), avec ses valeurs Epic/sous-item.
// 2. A defaut, repli automatique 100% code (aucun appel LLM) sur la numerotation du titre :
//    "3 - Nom" / "3. Nom" / "3) Nom" -> candidat Epic numero "3"
//    "3.1 Nom" / "3.1. Nom"          -> candidat sous-item de l'Epic numero "3"
//
// Le regroupement final (rattachement effectif a un Epic, ou retrogradation d'un Epic sans
// enfant en item normal) se fait ligne par ligne dans app/api/import/analyze/route.ts, car il
// depend de l'ordre des lignes et du contexte "Epic courant" - detectRowLevel ne fait que
// classifier UNE ligne isolement, sans etat.

export type HierarchyMapping = {
  typeColumn: number | null;
  epicValues: string[];
  subItemValues: string[];
};

export type RowLevel = "epic" | "subitem" | "flat";

export type RowLevelResult = {
  level: RowLevel;
  // Numero detecte par la numerotation du titre (repli uniquement). Sert a verifier qu'un
  // sous-item "3.1" se rattache bien a l'Epic "3" plutot qu'a n'importe quel Epic precedent.
  // Reste null quand la detection vient de la colonne Type (pas de notion de numero la).
  epicNumber: string | null;
};

// "3.1 Nom", "3.1. Nom", "3.1) Nom", ou juste "3.1" en fin de titre
const SUBITEM_NUMBERING = /^(\d+)\.(\d+)(?:\s*[.\-:)]\s*|\s+|$)/;
// "3 - Nom", "3. Nom", "3) Nom", "3: Nom" (delimiteur suivi d'un espace obligatoire, pour
// eviter de confondre avec un titre du type "2 semaines de sprint")
const EPIC_NUMBERING = /^(\d+)\s*[.\-:)]\s+/;

export function detectRowLevel(
  title: string,
  rawTypeValue: unknown,
  hierarchy: HierarchyMapping | null | undefined
): RowLevelResult {
  if (hierarchy?.typeColumn != null) {
    const raw = String(rawTypeValue ?? "").trim().toLowerCase();
    if (raw) {
      if (hierarchy.epicValues.some((v) => v.trim().toLowerCase() === raw)) {
        return { level: "epic", epicNumber: null };
      }
      if (hierarchy.subItemValues.some((v) => v.trim().toLowerCase() === raw)) {
        return { level: "subitem", epicNumber: null };
      }
    }
  }

  // Repli numerotation : on teste le sous-item AVANT l'epic, car "3.1 Nom" ne doit jamais
  // etre pris pour un Epic numero "3".
  const subMatch = title.match(SUBITEM_NUMBERING);
  if (subMatch) {
    return { level: "subitem", epicNumber: subMatch[1] };
  }
  const epicMatch = title.match(EPIC_NUMBERING);
  if (epicMatch) {
    return { level: "epic", epicNumber: epicMatch[1] };
  }

  return { level: "flat", epicNumber: null };
}
