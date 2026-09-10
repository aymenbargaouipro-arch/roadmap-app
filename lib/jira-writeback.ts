import { prisma } from "@/lib/prisma";
import { getWorkspaceJiraCredentials, updateJiraIssueDates } from "@/lib/jira";

export type JiraWritebackResult =
  | { attempted: false }
  | { attempted: true; ok: true }
  | { attempted: true; ok: false; error: string };

// A appeler juste apres toute mise a jour de startDate/endDate sur un item (edition
// manuelle, drag & drop sur le Gantt, ou recalcul automatique des aggregats d'un Epic).
// No-op silencieux (attempted: false) si l'item n'a pas ete importe depuis Jira, ou si sa
// roadmap n'est pas mappee. Ne bloque jamais l'appelant : en cas d'echec cote Jira, le
// changement local reste acquis, on renvoie juste l'erreur pour affichage optionnel.
export async function syncItemDatesToJira(itemId: string): Promise<JiraWritebackResult> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: {
      jiraIssueKey: true,
      startDate: true,
      endDate: true,
      roadmap: {
        select: {
          workspaceId: true,
          jiraStartDateFieldId: true,
          jiraStartDateFieldType: true,
          jiraEndDateFieldId: true,
          jiraEndDateFieldType: true,
        },
      },
    },
  });

  if (!item?.jiraIssueKey) return { attempted: false };
  const { jiraStartDateFieldId, jiraEndDateFieldId } = item.roadmap;
  if (!jiraStartDateFieldId || !jiraEndDateFieldId) return { attempted: false };

  const creds = await getWorkspaceJiraCredentials(item.roadmap.workspaceId);
  if (!creds) return { attempted: false };

  const result = await updateJiraIssueDates(creds, item.jiraIssueKey, {
    startFieldId: jiraStartDateFieldId,
    startFieldType: item.roadmap.jiraStartDateFieldType,
    startDate: item.startDate,
    endFieldId: jiraEndDateFieldId,
    endFieldType: item.roadmap.jiraEndDateFieldType,
    endDate: item.endDate,
  });

  return result.ok ? { attempted: true, ok: true } : { attempted: true, ok: false, error: result.error };
}
