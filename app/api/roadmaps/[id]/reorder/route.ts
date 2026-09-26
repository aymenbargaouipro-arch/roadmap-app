import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoadmapMember } from "@/lib/access";

const MAX_REORDER_ITEMS = 5000;

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const access = await requireRoadmapMember(params.id, session.user.id);
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => null);
  const orderedIds: unknown = body?.orderedIds;
  if (
    !Array.isArray(orderedIds) ||
    orderedIds.length > MAX_REORDER_ITEMS ||
    !orderedIds.every((id) => typeof id === "string")
  ) {
    return NextResponse.json({ error: "orderedIds requis." }, { status: 400 });
  }

  const ids = orderedIds as string[];

  // Tous les items doivent appartenir a CETTE roadmap : on refuse sinon, pour qu'on ne
  // puisse pas reordonner les items d'une autre roadmap en glissant leurs ids ici.
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    return NextResponse.json({ error: "orderedIds contient des doublons." }, { status: 400 });
  }
  const matching = await prisma.item.count({
    where: { id: { in: ids }, roadmapId: params.id },
  });
  if (matching !== ids.length) {
    return NextResponse.json({ error: "Certains items n'appartiennent pas à cette roadmap." }, { status: 400 });
  }

  await prisma.$transaction(
    ids.map((itemId, index) =>
      prisma.item.update({ where: { id: itemId }, data: { position: index } })
    )
  );

  return NextResponse.json({ ok: true });
}
