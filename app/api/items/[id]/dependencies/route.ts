import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Direction = "BLOCKS" | "BLOCKED_BY";
type TargetKind = "ITEM" | "TEAM" | "EXTERNAL";
type DepType = "FD" | "DD" | "FF" | "DF";

const VALID_TYPES: DepType[] = ["FD", "DD", "FF", "DF"];
const VALID_TARGET_KINDS: TargetKind[] = ["ITEM", "TEAM", "EXTERNAL"];

// Verifie si ajouter l'arc newBlockingId -> newBlockedId fermerait un cycle, en tenant
// compte de TOUTES les dependances de type ITEM existantes dans le workspace (les cycles
// peuvent traverser plusieurs equipes). Seules les dependances ayant a la fois un
// blockingItemId et un blockedItemId forment de vraies aretes item -> item (les cibles
// TEAM/EXTERNAL n'en forment pas et ne participent donc pas au graphe de cycles).
async function wouldCreateCycle(newBlockingId: string, newBlockedId: string): Promise<boolean> {
  const edges = await prisma.dependency.findMany({
    where: { blockingItemId: { not: null }, blockedItemId: { not: null } },
    select: { blockingItemId: true, blockedItemId: true },
  });

  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    if (!e.blockingItemId || !e.blockedItemId) continue;
    if (!adjacency.has(e.blockingItemId)) adjacency.set(e.blockingItemId, []);
    adjacency.get(e.blockingItemId)!.push(e.blockedItemId);
  }

  // BFS depuis newBlockedId : si on atteint newBlockingId, un chemin existe deja de
  // newBlockedId vers newBlockingId - ajouter l'arc inverse newBlockingId -> newBlockedId
  // fermerait donc un cycle.
  const queue = [newBlockedId];
  const visited = new Set<string>([newBlockedId]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === newBlockingId) return true;
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const dependencies = await prisma.dependency.findMany({
    where: {
      OR: [{ blockingItemId: params.id }, { blockedItemId: params.id }],
    },
    include: {
      blockingItem: {
        select: { id: true, title: true, status: true, roadmapId: true, roadmap: { select: { id: true, name: true } } },
      },
      blockedItem: {
        select: { id: true, title: true, status: true, roadmapId: true, roadmap: { select: { id: true, name: true } } },
      },
      targetRoadmap: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const result = dependencies.map((d) => {
    const direction: Direction = d.blockingItemId === params.id ? "BLOCKS" : "BLOCKED_BY";

    let target: Record<string, unknown> | null = null;
    if (d.targetKind === "ITEM") {
      const otherItem = direction === "BLOCKS" ? d.blockedItem : d.blockingItem;
      target = otherItem
        ? {
            kind: "ITEM",
            id: otherItem.id,
            title: otherItem.title,
            status: otherItem.status,
            roadmapId: otherItem.roadmapId,
            roadmapName: otherItem.roadmap.name,
          }
        : null;
    } else if (d.targetKind === "TEAM") {
      target = d.targetRoadmap
        ? { kind: "TEAM", roadmapId: d.targetRoadmap.id, roadmapName: d.targetRoadmap.name }
        : null;
    } else {
      target = { kind: "EXTERNAL", name: d.externalSystemName };
    }

    return {
      id: d.id,
      type: d.type,
      targetKind: d.targetKind,
      direction,
      status: d.status,
      note: d.note,
      createdAt: d.createdAt,
      target,
    };
  });

  return NextResponse.json(result);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const {
    type,
    direction,
    targetKind,
    targetItemId,
    targetRoadmapId,
    externalSystemName,
    note,
  }: {
    type?: DepType;
    direction?: Direction;
    targetKind?: TargetKind;
    targetItemId?: string;
    targetRoadmapId?: string;
    externalSystemName?: string;
    note?: string;
  } = body;

  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Type de dépendance invalide." }, { status: 400 });
  }
  if (direction !== "BLOCKS" && direction !== "BLOCKED_BY") {
    return NextResponse.json({ error: "Sens de dépendance invalide." }, { status: 400 });
  }
  if (!targetKind || !VALID_TARGET_KINDS.includes(targetKind)) {
    return NextResponse.json({ error: "Cible de dépendance invalide." }, { status: 400 });
  }
  if (targetKind === "ITEM" && !targetItemId) {
    return NextResponse.json({ error: "Tâche cible manquante." }, { status: 400 });
  }
  if (targetKind === "ITEM" && targetItemId === params.id) {
    return NextResponse.json({ error: "Une tâche ne peut pas dépendre d'elle-même." }, { status: 400 });
  }
  if (targetKind === "TEAM" && !targetRoadmapId) {
    return NextResponse.json({ error: "Équipe cible manquante." }, { status: 400 });
  }
  if (targetKind === "EXTERNAL" && !externalSystemName?.trim()) {
    return NextResponse.json({ error: "Nom du système externe manquant." }, { status: 400 });
  }

  const otherItemId = targetKind === "ITEM" ? targetItemId! : null;
  const blockingItemId = direction === "BLOCKS" ? params.id : otherItemId;
  const blockedItemId = direction === "BLOCKED_BY" ? params.id : otherItemId;
  const finalTargetRoadmapId = targetKind === "TEAM" ? targetRoadmapId! : null;
  const finalExternalName = targetKind === "EXTERNAL" ? externalSystemName!.trim() : null;

  if (targetKind === "ITEM" && blockingItemId && blockedItemId) {
    const cyclic = await wouldCreateCycle(blockingItemId, blockedItemId);
    if (cyclic) {
      return NextResponse.json(
        {
          error:
            "Impossible : cette dépendance créerait un cycle (dépendance circulaire) avec des dépendances déjà existantes.",
        },
        { status: 400 }
      );
    }
  }

  const existing = await prisma.dependency.findFirst({
    where: {
      blockingItemId,
      blockedItemId,
      targetRoadmapId: finalTargetRoadmapId,
      externalSystemName: finalExternalName,
      type,
    },
  });
  if (existing) {
    return NextResponse.json({ error: "Cette dépendance existe déjà." }, { status: 409 });
  }

  try {
    const dependency = await prisma.dependency.create({
      data: {
        type,
        targetKind,
        status: "PENDING",
        note: note?.trim() || null,
        blockingItemId: blockingItemId ?? undefined,
        blockedItemId: blockedItemId ?? undefined,
        targetRoadmapId: finalTargetRoadmapId ?? undefined,
        externalSystemName: finalExternalName ?? undefined,
      },
    });
    return NextResponse.json(dependency);
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "Cette dépendance existe déjà." }, { status: 409 });
    }
    console.error("POST /api/items/[id]/dependencies failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur serveur inconnue." },
      { status: 500 }
    );
  }
}
