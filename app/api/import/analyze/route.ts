import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { format } from "date-fns";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  parseWorkbook,
  sheetToRawRows,
  findMilestoneSheetName,
  parseCellDate,
  cellAt,
} from "@/lib/excel-import";
import { mapMainSheet, mapMilestoneSheet } from "@/lib/anthropic";
import { transformRowsToItems, type PreviewMilestone } from "@/lib/import-transform";

const AI_SAMPLE_ROWS = 25;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return NextResponse.json({ error: "Aucun espace de travail." }, { status: 400 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }

  let workbook;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    workbook = parseWorkbook(buffer);
  } catch (err) {
    console.error("Erreur lecture Excel:", err);
    return NextResponse.json(
      { error: "Impossible de lire ce fichier. Vérifie que c'est bien un .xlsx valide." },
      { status: 400 }
    );
  }

  if (workbook.SheetNames.length === 0) {
    return NextResponse.json({ error: "Le fichier ne contient aucune feuille." }, { status: 400 });
  }

  const mainSheetName = workbook.SheetNames[0];
  const fullRows = sheetToRawRows(workbook, mainSheetName);

  if (fullRows.length === 0) {
    return NextResponse.json({ error: "La première feuille est vide ou illisible." }, { status: 400 });
  }

  let mainMapping;
  try {
    mainMapping = await mapMainSheet(fullRows.slice(0, AI_SAMPLE_ROWS));
  } catch (err) {
    console.error("Erreur mapping IA:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Le mapping automatique a échoué." },
      { status: 502 }
    );
  }

  const { headerRowIndex, mapping, dateFormat, statusValueMap, milestoneTruthyValues, hierarchy } = mainMapping;

  if (
    mapping.title == null ||
    headerRowIndex == null ||
    headerRowIndex < 0 ||
    headerRowIndex >= fullRows.length
  ) {
    return NextResponse.json(
      {
        error:
          "Impossible d'identifier la structure du fichier (ligne d'en-tête ou colonne du titre non trouvée).",
      },
      { status: 422 }
    );
  }

  const dataRows = fullRows.slice(headerRowIndex + 1);

  const workspaceMembers = await prisma.membership.findMany({
    where: { workspaceId: membership.workspaceId },
    select: { user: { select: { id: true, name: true } } },
  });

  const { items, milestonesFromMainSheet, warnings } = transformRowsToItems({
    dataRows,
    mapping,
    dateFormat,
    statusValueMap,
    milestoneTruthyValues,
    hierarchy,
    workspaceMembers,
  });

  const milestones: PreviewMilestone[] = [...milestonesFromMainSheet];

  const milestoneSheetName = findMilestoneSheetName(workbook);
  if (milestoneSheetName) {
    const mFullRows = sheetToRawRows(workbook, milestoneSheetName);
    if (mFullRows.length > 0) {
      try {
        const mMapping = await mapMilestoneSheet(mFullRows.slice(0, AI_SAMPLE_ROWS));
        if (
          mMapping.mapping.title != null &&
          mMapping.mapping.date != null &&
          mMapping.headerRowIndex != null &&
          mMapping.headerRowIndex < mFullRows.length
        ) {
          const mDataRows = mFullRows.slice(mMapping.headerRowIndex + 1);
          for (const row of mDataRows) {
            const title = String(cellAt(row, mMapping.mapping.title) ?? "").trim();
            const date = parseCellDate(cellAt(row, mMapping.mapping.date), mMapping.dateFormat);
            if (!title || !date) continue;
            milestones.push({ title, date: format(date, "yyyy-MM-dd") });
          }
        } else {
          warnings.push(`Feuille "${milestoneSheetName}" trouvée mais colonnes titre/date non identifiées.`);
        }
      } catch (err) {
        console.error("Erreur mapping jalons:", err);
        warnings.push(`Impossible d'analyser la feuille "${milestoneSheetName}".`);
      }
    }
  }

  if (items.length === 0) {
    return NextResponse.json({ error: "Aucune tâche exploitable trouvée dans ce fichier." }, { status: 422 });
  }

  const suggestedRoadmapName = file.name.replace(/\.[^.]+$/, "");

  return NextResponse.json({ suggestedRoadmapName, items, milestones, warnings });
}
