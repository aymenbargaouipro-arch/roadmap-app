import { prisma } from "@/lib/prisma";

export type OwnerLoad = { ownerId: string | null; ownerName: string; activeItemCount: number };

// Compte les items non termines (TODO/IN_PROGRESS/BLOCKED) par owner, tous roadmaps du
// workspace confondus. Les items sans owner sont regroupes sous "Non assigne" plutot que
// d'etre ignores : un item sans responsable est lui-meme un signal a surveiller.
export async function getOwnerWorkload(workspaceId: string): Promise<OwnerLoad[]> {
  const items = await prisma.item.findMany({
    where: { roadmap: { workspaceId }, status: { not: "DONE" } },
    select: { ownerId: true, owner: { select: { name: true } } },
  });

  const counts = new Map<string, { name: string; count: number }>();
  for (const it of items) {
    const key = it.ownerId ?? "__unassigned__";
    const name = it.owner?.name ?? "Non assigné";
    if (!counts.has(key)) counts.set(key, { name, count: 0 });
    counts.get(key)!.count += 1;
  }

  return Array.from(counts.entries())
    .map(([key, v]) => ({
      ownerId: key === "__unassigned__" ? null : key,
      ownerName: v.name,
      activeItemCount: v.count,
    }))
    .sort((a, b) => b.activeItemCount - a.activeItemCount);
}
