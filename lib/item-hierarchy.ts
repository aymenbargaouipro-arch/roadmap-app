import { prisma } from "@/lib/prisma";
import { syncItemDatesToJira, type JiraWritebackResult } from "@/lib/jira-writeback";

// A appeler apres toute creation/modification/suppression/rattachement d'un sous-item,
// pour que les dates et l'avancement de l'Epic parent restent le reflet de ses sous-items
// VISIBLES uniquement (un sous-item masque via jiraHiddenAt - dates retirees ou supprime
// cote Jira - ne doit plus influencer l'agregat de son Epic).
// Ne fait rien si l'item n'a plus de sous-items visibles (ses propres valeurs redeviennent
// alors modifiables manuellement, on ne les touche pas).
// Si cet Epic est lui-meme importe de Jira, ses nouvelles dates aggregees sont renvoyees
// vers Jira (write-back) : le resultat est remonte pour que l'appelant puisse afficher une
// alerte en cas d'echec (le changement local, lui, est toujours conserve).
export async function recomputeEpicAggregates(parentId: string): Promise<JiraWritebackResult> {
  const children = await prisma.item.findMany({
    where: { parentId, jiraHiddenAt: null },
    select: { startDate: true, endDate: true, progress: true },
  });

  if (children.length === 0) return { attempted: false };

  const startDate = new Date(Math.min(...children.map((c) => c.startDate.getTime())));
  const endDate = new Date(Math.max(...children.map((c) => c.endDate.getTime())));
  const progress = Math.round(children.reduce((sum, c) => sum + c.progress, 0) / children.length);

  await prisma.item.update({
    where: { id: parentId },
    data: { startDate, endDate, progress },
  });

  return syncItemDatesToJira(parentId);
}
