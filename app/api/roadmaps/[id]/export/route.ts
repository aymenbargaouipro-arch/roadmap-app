import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

const STATUS_LABELS: Record<string, string> = {
  TODO: "À faire",
  IN_PROGRESS: "En cours",
  BLOCKED: "Bloqué",
  DONE: "Terminé",
};

const RISK_LEVEL_LABELS: Record<string, string> = { LOW: "Faible", MEDIUM: "Moyen", HIGH: "Élevé" };
const RISK_STATUS_LABELS: Record<string, string> = { OPEN: "Ouvert", MITIGATED: "Atténué", CLOSED: "Clos" };

const DEP_TYPE_LABELS: Record<string, string> = {
  FD: "Fin -> Début",
  DD: "Début -> Début",
  FF: "Fin -> Fin",
  DF: "Début -> Fin",
};
const DEP_STATUS_LABELS: Record<string, string> = { PENDING: "En attente", RESOLVED: "Résolu" };

function formatDate(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const roadmap = await prisma.roadmap.findUnique({
    where: { id: params.id },
    include: {
      items: {
        orderBy: { position: "asc" },
        include: {
          owner: { select: { name: true } },
          blockedBy: {
            include: {
              blockingItem: { select: { id: true, title: true, roadmap: { select: { id: true, name: true } } } },
              targetRoadmap: { select: { id: true, name: true } },
            },
          },
          blocking: {
            include: {
              blockedItem: { select: { id: true, title: true, roadmap: { select: { id: true, name: true } } } },
              targetRoadmap: { select: { id: true, name: true } },
            },
          },
        },
      },
      milestones: { orderBy: { date: "asc" } },
      risks: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!roadmap) return NextResponse.json({ error: "Roadmap introuvable." }, { status: 404 });

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspaceId: roadmap.workspaceId },
  });
  if (!membership) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  // Un item qui apparait comme parent d'au moins un autre est une Epic (dates/avancement
  // derives) ; sinon, sous-item si parentId est renseigne, item simple sinon.
  const parentIds = new Set(roadmap.items.filter((i) => i.parentId).map((i) => i.parentId as string));

  const itemsSheetData = roadmap.items.map((i) => ({
    Titre: i.title,
    Type: parentIds.has(i.id) ? "Epic" : i.parentId ? "Sous-item" : "Item",
    Début: formatDate(i.startDate),
    Fin: formatDate(i.endDate),
    Statut: STATUS_LABELS[i.status] ?? i.status,
    "Avancement (%)": i.progress,
    Responsable: i.owner?.name ?? "",
  }));

  const milestonesSheetData = roadmap.milestones.map((m) => ({
    Titre: m.title,
    Date: formatDate(m.date),
  }));

  const risksSheetData = roadmap.risks.map((r) => ({
    Titre: r.title,
    Impact: RISK_LEVEL_LABELS[r.impact] ?? r.impact,
    Probabilité: RISK_LEVEL_LABELS[r.probability] ?? r.probability,
    Statut: RISK_STATUS_LABELS[r.status] ?? r.status,
  }));

  // Meme logique de dedoublonnage que la page de detail : une dependance interne (source et
  // cible toutes deux dans cette roadmap) apparaitrait dans les deux relations (blockedBy d'un
  // item ET blocking de l'autre), on dedoublonne par id de dependance. Les dependances
  // inter-equipes (Equipe / Externe) sont incluses.
  const dependencyRowsMap = new Map<
    string,
    { type: string; status: string; note: string | null; sourceLabel: string; targetLabel: string }
  >();

  for (const item of roadmap.items) {
    for (const dep of item.blockedBy) {
      if (dependencyRowsMap.has(dep.id)) continue;
      let sourceLabel: string;
      if (dep.blockingItem) {
        sourceLabel =
          dep.blockingItem.roadmap.id !== roadmap.id
            ? `${dep.blockingItem.title} (${dep.blockingItem.roadmap.name})`
            : dep.blockingItem.title;
      } else if (dep.targetRoadmap) {
        sourceLabel = `Équipe : ${dep.targetRoadmap.name}`;
      } else {
        sourceLabel = `Externe : ${dep.externalSystemName ?? "?"}`;
      }
      dependencyRowsMap.set(dep.id, {
        type: dep.type,
        status: dep.status,
        note: dep.note,
        sourceLabel,
        targetLabel: item.title,
      });
    }

    for (const dep of item.blocking) {
      if (dependencyRowsMap.has(dep.id)) continue;
      let targetLabel: string;
      if (dep.blockedItem) {
        targetLabel =
          dep.blockedItem.roadmap.id !== roadmap.id
            ? `${dep.blockedItem.title} (${dep.blockedItem.roadmap.name})`
            : dep.blockedItem.title;
      } else if (dep.targetRoadmap) {
        targetLabel = `Équipe : ${dep.targetRoadmap.name}`;
      } else {
        targetLabel = `Externe : ${dep.externalSystemName ?? "?"}`;
      }
      dependencyRowsMap.set(dep.id, {
        type: dep.type,
        status: dep.status,
        note: dep.note,
        sourceLabel: item.title,
        targetLabel,
      });
    }
  }

  const dependenciesSheetData = Array.from(dependencyRowsMap.values()).map((row) => ({
    Depuis: row.sourceLabel,
    Vers: row.targetLabel,
    Type: DEP_TYPE_LABELS[row.type] ?? row.type,
    Statut: DEP_STATUS_LABELS[row.status] ?? row.status,
    Note: row.note ?? "",
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(itemsSheetData.length > 0 ? itemsSheetData : [{ Titre: "" }]),
    "Items"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(milestonesSheetData.length > 0 ? milestonesSheetData : [{ Titre: "" }]),
    "Jalons"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(risksSheetData.length > 0 ? risksSheetData : [{ Titre: "" }]),
    "Risques"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(dependenciesSheetData.length > 0 ? dependenciesSheetData : [{ Depuis: "" }]),
    "Dépendances"
  );

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const safeName = roadmap.name.replace(/[^\w\-]+/g, "_").slice(0, 60);

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName || "roadmap"}.xlsx"`,
    },
  });
}
