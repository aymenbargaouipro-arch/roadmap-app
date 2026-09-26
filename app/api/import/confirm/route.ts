import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recomputeEpicAggregates } from "@/lib/item-hierarchy";
import { parseDateInput } from "@/lib/validation";

type IncomingItem = {
  rowId: string;
  parentRowId: string | null;
  title: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  progress: number;
  ownerId: string | null;
};
type IncomingMilestone = { title: string; date: string | null };
type Target = { mode: "new"; name: string } | { mode: "existing"; roadmapId: string };

const VALID_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"];
const MAX_IMPORT_ITEMS = 5000;
const MAX_IMPORT_MILESTONES = 1000;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return NextResponse.json({ error: "Aucun espace de travail." }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });

  const target: Target | undefined = body.target;
  const items: IncomingItem[] = Array.isArray(body.items) ? body.items : [];
  const milestones: IncomingMilestone[] = Array.isArray(body.milestones) ? body.milestones : [];

  if (
    !target ||
    (target.mode === "new" && !target.name?.trim()) ||
    (target.mode === "existing" && !target.roadmapId)
  ) {
    return NextResponse.json({ error: "Cible d'import invalide." }, { status: 400 });
  }
  if (items.length === 0) {
    return NextResponse.json({ error: "Aucun item à importer." }, { status: 400 });
  }
  if (items.length > MAX_IMPORT_ITEMS || milestones.length > MAX_IMPORT_MILESTONES) {
    return NextResponse.json({ error: "Import trop volumineux." }, { status: 400 });
  }
  if (target.mode === "new" && typeof target.name !== "string") {
    return NextResponse.json({ error: "Cible d'import invalide." }, { status: 400 });
  }
  if (target.mode === "existing" && typeof target.roadmapId !== "string") {
    return NextResponse.json({ error: "Cible d'import invalide." }, { status: 400 });
  }

  let roadmapId: string;

  if (target.mode === "existing") {
    const roadmap = await prisma.roadmap.findUnique({ where: { id: target.roadmapId } });
    if (!roadmap || roadmap.workspaceId !== membership.workspaceId) {
      return NextResponse.json({ error: "Roadmap introuvable." }, { status: 404 });
    }
    roadmapId = roadmap.id;
  } else {
    const count = await prisma.roadmap.count({ where: { workspaceId: membership.workspaceId } });
    const roadmap = await prisma.roadmap.create({
      data: { name: target.name.trim().slice(0, 200), workspaceId: membership.workspaceId, position: count },
    });
    roadmapId = roadmap.id;
  }

  // Un responsable recu du wizard n'est conserve que s'il est membre du workspace cible ;
  // sinon l'item est importe sans responsable plutot que rattache a un compte etranger.
  const requestedOwnerIds = Array.from(
    new Set(items.map((it) => it?.ownerId).filter((id): id is string => typeof id === "string" && id.length > 0))
  );
  const allowedOwnerIds = new Set(
    (
      await prisma.membership.findMany({
        where: { workspaceId: membership.workspaceId, userId: { in: requestedOwnerIds } },
        select: { userId: true },
      })
    ).map((m) => m.userId)
  );

  const existingCount = await prisma.item.count({ where: { roadmapId } });
  const today = new Date();

  // Creation en deux temps dans une transaction :
  // 1. Tous les items sont crees a plat (sans parentId), on garde la correspondance
  //    rowId (identifiant stable venant du wizard, survit a une suppression de ligne
  //    dans l'apercu) -> id reel en base.
  // 2. Les items ayant un parentRowId reconnu (l'Epic n'a pas ete supprime dans l'apercu)
  //    sont rattaches a leur parent reel. Si le parent n'existe plus, l'item reste a plat
  //    plutot que d'echouer.
  const epicIdsToRecompute = await prisma.$transaction(async (tx) => {
    const idByRowId = new Map<string, string>();
    let position = existingCount;

    for (const it of items) {
      // Une date absente ou illisible retombe sur aujourd'hui (comportement existant pour les
      // dates absentes), au lieu de faire echouer tout l'import sur une exception.
      const created = await tx.item.create({
        data: {
          title: (typeof it.title === "string" && it.title.trim() ? it.title : "Sans titre").slice(0, 500),
          startDate: parseDateInput(it.startDate) ?? today,
          endDate: parseDateInput(it.endDate) ?? today,
          status: VALID_STATUSES.includes(it.status) ? (it.status as (typeof VALID_STATUSES)[number]) : "TODO",
          progress: Math.max(0, Math.min(100, Math.round(Number(it.progress)) || 0)),
          ownerId: it.ownerId && allowedOwnerIds.has(it.ownerId) ? it.ownerId : null,
          roadmapId,
          position: position++,
        },
      });
      if (it.rowId) idByRowId.set(it.rowId, created.id);
    }

    const epicIds = new Set<string>();

    for (const it of items) {
      if (!it.parentRowId || !it.rowId) continue;
      const childId = idByRowId.get(it.rowId);
      const parentId = idByRowId.get(it.parentRowId);
      if (!childId || !parentId || parentId === childId) continue;

      await tx.item.update({ where: { id: childId }, data: { parentId } });
      epicIds.add(parentId);
    }

    return Array.from(epicIds);
  });

  for (const epicId of epicIdsToRecompute) {
    await recomputeEpicAggregates(epicId);
  }

  const validMilestones = milestones
    .map((m) => ({ title: typeof m?.title === "string" ? m.title.trim() : "", date: parseDateInput(m?.date) }))
    .filter((m): m is { title: string; date: Date } => Boolean(m.title) && m.date !== null);
  if (validMilestones.length > 0) {
    await prisma.milestone.createMany({
      data: validMilestones.map((m) => ({
        title: m.title.slice(0, 500),
        date: m.date,
        roadmapId,
      })),
    });
  }

  return NextResponse.json({ roadmapId });
}

