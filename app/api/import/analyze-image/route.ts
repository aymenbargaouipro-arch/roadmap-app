import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractAndMapFromImage } from "@/lib/anthropic";
import { transformRowsToItems, type PreviewMilestone } from "@/lib/import-transform";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
// 8 Mo : marge de securite sous les limites de taille de l'API vision (documentees autour
// de quelques Mo par image selon le point d'entree), a ajuster si des cas reels y buttent.
const MAX_FILE_BYTES = 8 * 1024 * 1024;

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

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Format non supporté. Utilise une image PNG, JPEG ou WebP." },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "Image trop volumineuse (8 Mo max). Réduis-la avant de réessayer." },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64Data = buffer.toString("base64");

  let extraction;
  try {
    extraction = await extractAndMapFromImage(base64Data, file.type);
  } catch (err) {
    console.error("Erreur extraction image:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "L'extraction depuis l'image a échoué." },
      { status: 502 }
    );
  }

  const {
    viewType,
    rawRows,
    headerRowIndex,
    mapping,
    dateFormat,
    statusValueMap,
    milestoneTruthyValues,
    hierarchy,
    truncated,
  } = extraction;

  // headerRowIndex peut valoir -1 : cela signifie "vue timeline, pas de ligne d'en-tete",
  // toutes les lignes extraites sont alors directement des donnees (slice(0) = tout garder).
  if (
    mapping.title == null ||
    headerRowIndex == null ||
    headerRowIndex < -1 ||
    headerRowIndex >= rawRows.length
  ) {
    return NextResponse.json(
      {
        error:
          "Impossible d'identifier la structure du tableau dans l'image (ligne d'en-tête ou colonne du titre non trouvée).",
      },
      { status: 422 }
    );
  }

  const dataRows = rawRows.slice(headerRowIndex + 1);

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

  // Rappel systematique : le risque d'erreur (hallucination, cellule mal lue) est plus eleve
  // que pour un Excel, l'ecran de revue doit etre parcouru plus attentivement.
  warnings.unshift(
    "Extraction depuis une image : les valeurs ont été lues visuellement, vérifie-les particulièrement avant de confirmer."
  );

  if (viewType === "timeline") {
    warnings.unshift(
      "Vue chronologique (Gantt) détectée : les dates ont été estimées au niveau de la période affichée (trimestre/mois), pas au jour précis. Corrige-les si besoin d'une precision plus fine."
    );
  }

  if (truncated) {
    warnings.unshift(
      "L'image semble contenir plus de lignes que ce qui a été extrait : vérifie qu'aucune ligne ne manque."
    );
  }

  if (items.length === 0) {
    return NextResponse.json({ error: "Aucune tâche exploitable trouvée dans cette image." }, { status: 422 });
  }

  const suggestedRoadmapName = file.name.replace(/\.[^.]+$/, "");

  return NextResponse.json({ suggestedRoadmapName, items, milestones, warnings });
}
