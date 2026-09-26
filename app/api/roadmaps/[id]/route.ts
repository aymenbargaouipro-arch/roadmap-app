import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoadmapMember } from "@/lib/access";
import { validateLogoDataUrl } from "@/lib/validation";
import { isValidRoadmapColor, MAX_LOGO_BYTES } from "@/lib/roadmap-theme";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const access = await requireRoadmapMember(params.id, session.user.id);
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });

  const data: {
    name?: string;
    description?: string | null;
    color?: string | null;
    icon?: string | null;
    logoUrl?: string | null;
  } = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "Le titre ne peut pas être vide." }, { status: 400 });
    data.name = name.slice(0, 200);
  }

  if (body.description !== undefined) {
    data.description = body.description ? String(body.description).slice(0, 2000) : null;
  }

  if (body.color !== undefined) {
    if (body.color !== null && !isValidRoadmapColor(String(body.color))) {
      return NextResponse.json({ error: "Couleur non reconnue." }, { status: 400 });
    }
    data.color = body.color;
  }

  // icon et logoUrl sont mutuellement exclusifs : celui envoye (non-null) efface l'autre.
  if (body.icon !== undefined && body.icon) {
    data.icon = String(body.icon).slice(0, 8);
    data.logoUrl = null;
  } else if (body.logoUrl !== undefined && body.logoUrl) {
    // PNG, JPEG ou WebP uniquement, verifie sur les octets reels (audit L3) : le SVG est
    // refuse car il peut embarquer du script.
    const value = String(body.logoUrl);
    if (value.length > MAX_LOGO_BYTES * 1.4) {
      return NextResponse.json({ error: "Image trop lourde (500 Ko max)." }, { status: 400 });
    }
    const logo = validateLogoDataUrl(value, MAX_LOGO_BYTES);
    if (!logo.ok) return NextResponse.json({ error: logo.error }, { status: 400 });
    data.logoUrl = logo.dataUrl;
    data.icon = null;
  } else if (body.icon !== undefined || body.logoUrl !== undefined) {
    // L'un des deux a ete envoye explicitement a vide/null : on efface les deux
    // (retour a l'etat "pas d'icone personnalisee").
    data.icon = null;
    data.logoUrl = null;
  }

  const updated = await prisma.roadmap.update({ where: { id: params.id }, data });

  return NextResponse.json({ roadmap: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const access = await requireRoadmapMember(params.id, session.user.id);
  if (!access.ok) return access.response;
  if (access.role !== "ADMIN") {
    return NextResponse.json({ error: "Seul un administrateur peut supprimer une roadmap." }, { status: 403 });
  }

  // Pas de onDelete: Cascade dans le schema : on supprime nous-memes dans l'ordre qui respecte
  // les contraintes de cle etrangere (dependants des Item d'abord, puis les Item eux-memes,
  // puis les dependants de la Roadmap, puis la Roadmap). Les Dependency inter-equipes (dont
  // un cote seulement appartient a cette roadmap, ou qui la ciblent via targetRoadmapId) sont
  // incluses pour ne jamais laisser de reference orpheline.
  const itemIds = (
    await prisma.item.findMany({ where: { roadmapId: params.id }, select: { id: true } })
  ).map((i) => i.id);

  await prisma.$transaction([
    prisma.itemDateShift.deleteMany({ where: { itemId: { in: itemIds } } }),
    prisma.statusHistory.deleteMany({ where: { itemId: { in: itemIds } } }),
    prisma.dependency.deleteMany({
      where: {
        OR: [
          { blockingItemId: { in: itemIds } },
          { blockedItemId: { in: itemIds } },
          { targetRoadmapId: params.id },
        ],
      },
    }),
    prisma.item.deleteMany({ where: { roadmapId: params.id } }),
    prisma.milestone.deleteMany({ where: { roadmapId: params.id } }),
    prisma.risk.deleteMany({ where: { roadmapId: params.id } }),
    prisma.healthSnapshot.deleteMany({ where: { roadmapId: params.id } }),
    prisma.roadmap.delete({ where: { id: params.id } }),
  ]);

  return NextResponse.json({ success: true });
}

