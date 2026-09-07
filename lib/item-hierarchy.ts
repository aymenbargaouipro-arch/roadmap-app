import { prisma } from "@/lib/prisma";

// A appeler apres toute creation/modification/suppression/rattachement d'un sous-item,
// pour que les dates et l'avancement de l'Epic parent restent le reflet de ses sous-items.
// Ne fait rien si l'item n'a plus de sous-items (ses propres valeurs redeviennent alors
// modifiables manuellement, on ne les touche pas).
export async function recomputeEpicAggregates(parentId: string): Promise<void> {
  const children = await prisma.item.findMany({
    where: { parentId },
    select: { startDate: true, endDate: true, progress: true },
  });

  if (children.length === 0) return;

  const startDate = new Date(Math.min(...children.map((c) => c.startDate.getTime())));
  const endDate = new Date(Math.max(...children.map((c) => c.endDate.getTime())));
  const progress = Math.round(children.reduce((sum, c) => sum + c.progress, 0) / children.length);

  await prisma.item.update({
    where: { id: parentId },
    data: { startDate, endDate, progress },
  });
}
