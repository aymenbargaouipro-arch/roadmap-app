import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recomputeEpicAggregates } from "@/lib/item-hierarchy";
import { syncItemDatesToJira } from "@/lib/jira-writeback";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const current = await prisma.item.findUnique({ where: { id: params.id } });
  if (!current) return NextResponse.json({ error: "Item introuvable." }, { status: 404 });

  const body = await req.json();

  // Validation explicite d'un decalage prevu/reel (depuis la modale d'historique), avec ou
  // sans commentaire. Action isolee : ne se combine pas avec d'autres champs dans le meme
  // appel.
  if (body.validateDateShift === true) {
    if (current.plannedStartDate == null && current.plannedEndDate == null) {
      return NextResponse.json({ error: "Aucun décalage à valider pour cet item." }, { status: 400 });
    }

    await prisma.itemDateShift.create({
      data: {
        itemId: params.id,
        previousPlannedStart: current.plannedStartDate ?? current.startDate,
        previousPlannedEnd: current.plannedEndDate ?? current.endDate,
        newPlannedStart: current.startDate,
        newPlannedEnd: current.endDate,
        comment: typeof body.comment === "string" && body.comment.trim() ? body.comment.trim() : null,
      },
    });

    const validated = await prisma.item.update({
      where: { id: params.id },
      data: { plannedStartDate: null, plannedEndDate: null },
    });

    return NextResponse.json(validated);
  }

  const data: Record<string, unknown> = {};

  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (body.ownerId !== undefined) data.ownerId = body.ownerId || null;
  if (body.status) {
    data.status = body.status;
  }
  if (typeof body.progress === "number") {
    data.progress = Math.max(0, Math.min(100, body.progress));
  }
  if (body.startDate) data.startDate = new Date(body.startDate);
  if (body.endDate) data.endDate = new Date(body.endDate);
  if (typeof body.position === "number") data.position = body.position;

  const oldParentId = current.parentId;

  if (body.parentId !== undefined) {
    const newParentId: string | null = body.parentId || null;

    if (newParentId) {
      if (newParentId === params.id) {
        return NextResponse.json({ error: "Un item ne peut pas être son propre parent." }, { status: 400 });
      }

      const target = await prisma.item.findUnique({ where: { id: newParentId } });
      if (!target || target.roadmapId !== current.roadmapId) {
        return NextResponse.json({ error: "Epic cible introuvable dans cette roadmap." }, { status: 400 });
      }
      if (target.parentId) {
        return NextResponse.json(
          { error: "Impossible : cet item est déjà un sous-item, un seul niveau de hiérarchie est autorisé." },
          { status: 400 }
        );
      }

      const childCount = await prisma.item.count({ where: { parentId: params.id } });
      if (childCount > 0) {
        return NextResponse.json(
          { error: "Impossible : cet item a déjà des sous-items, un seul niveau de hiérarchie est autorisé." },
          { status: 400 }
        );
      }
    }

    data.parentId = newParentId;
  }

  // Suivi prevu vs reel : si les dates changent et qu'aucun decalage n'est deja actif, on
  // fige le "prevu" sur les valeurs D'AVANT ce changement. Si un decalage est deja en cours,
  // on ne re-fige pas (le prevu original doit rester stable jusqu'a validation, meme si la
  // date reelle bouge plusieurs fois).
  const datesChanging = data.startDate !== undefined || data.endDate !== undefined;
  if (datesChanging && current.plannedStartDate == null && current.plannedEndDate == null) {
    data.plannedStartDate = current.startDate;
    data.plannedEndDate = current.endDate;
  }

  // Validation automatique et silencieuse (sans commentaire) si le statut passe a Termine
  // alors qu'un decalage est actif - existant, ou tout juste fige ci-dessus dans ce meme appel.
  const effectivePlannedStart = (data.plannedStartDate as Date | undefined) ?? current.plannedStartDate;
  const effectivePlannedEnd = (data.plannedEndDate as Date | undefined) ?? current.plannedEndDate;
  const hasActiveShift = effectivePlannedStart != null && effectivePlannedEnd != null;

  if (data.status === "DONE" && hasActiveShift) {
    const finalStart = (data.startDate as Date | undefined) ?? current.startDate;
    const finalEnd = (data.endDate as Date | undefined) ?? current.endDate;

    await prisma.itemDateShift.create({
      data: {
        itemId: params.id,
        previousPlannedStart: effectivePlannedStart!,
        previousPlannedEnd: effectivePlannedEnd!,
        newPlannedStart: finalStart,
        newPlannedEnd: finalEnd,
        comment: null,
      },
    });

    data.plannedStartDate = null;
    data.plannedEndDate = null;
  }

  const item = await prisma.item.update({
    where: { id: params.id },
    data: {
      ...data,
      ...(body.status ? { statusLog: { create: { status: body.status } } } : {}),
    },
  });

  // Renvoie les nouvelles dates vers Jira si cet item lui-meme a ete importe depuis Jira
  // et que ses dates viennent de changer (edition manuelle ou drag & drop sur le Gantt).
  // No-op silencieux si l'item n'est pas lie a Jira. Un echec ne fait jamais annuler le
  // changement local : on le remonte juste dans la reponse pour affichage cote client.
  let jiraWriteback: { ok: boolean; error?: string } | null = null;
  if (data.startDate !== undefined || data.endDate !== undefined) {
    const wb = await syncItemDatesToJira(params.id);
    if (wb.attempted) jiraWriteback = wb.ok ? { ok: true } : { ok: false, error: wb.error };
  }

  // Recalcule l'Epic parent concerné (nouveau et/ou ancien si l'item a change de rattachement,
  // ou si ses propres dates/avancement ont change alors qu'il est deja un sous-item)
  const parentsToRecompute = new Set<string>();
  if (item.parentId) parentsToRecompute.add(item.parentId);
  if (oldParentId && oldParentId !== item.parentId) parentsToRecompute.add(oldParentId);
  for (const pid of parentsToRecompute) {
    const wb = await recomputeEpicAggregates(pid);
    if (wb.attempted && !wb.ok && !jiraWriteback) {
      // Priorite au premier echec rencontre (celui de l'item lui-meme, deja capture ci-dessus,
      // passe toujours en premier ; celui-ci ne comble que le cas ou seul l'Epic a echoue).
      jiraWriteback = { ok: false, error: wb.error };
    }
  }

  return NextResponse.json({ ...item, jiraWriteback });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const item = await prisma.item.findUnique({ where: { id: params.id } });
  if (!item) return NextResponse.json({ error: "Item introuvable." }, { status: 404 });

  const childCount = await prisma.item.count({ where: { parentId: params.id } });

  const url = new URL(req.url);
  const cascade = url.searchParams.get("cascade") === "true";

  if (childCount > 0 && !cascade) {
    return NextResponse.json(
      {
        error: "confirmation_requise",
        childCount,
        message: `Cet Epic a ${childCount} sous-item(s). Confirme pour tout supprimer.`,
      },
      { status: 409 }
    );
  }

  const idsToDelete = [params.id];
  if (childCount > 0) {
    const children = await prisma.item.findMany({ where: { parentId: params.id }, select: { id: true } });
    idsToDelete.push(...children.map((c) => c.id));
  }

  await prisma.dependency.deleteMany({
    where: { OR: [{ blockingItemId: { in: idsToDelete } }, { blockedItemId: { in: idsToDelete } }] },
  });
  await prisma.statusHistory.deleteMany({ where: { itemId: { in: idsToDelete } } });
  await prisma.itemDateShift.deleteMany({ where: { itemId: { in: idsToDelete } } });
  await prisma.item.deleteMany({ where: { id: { in: idsToDelete } } });

  if (item.parentId) {
    await recomputeEpicAggregates(item.parentId);
  }

  return NextResponse.json({ ok: true, deletedCount: idsToDelete.length });
}
