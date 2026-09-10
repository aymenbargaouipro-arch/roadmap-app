import { prisma } from "@/lib/prisma";
import { getWorkspaceJiraCredentials, searchJiraIssues, type JiraIssue } from "@/lib/jira";
import { recomputeEpicAggregates } from "@/lib/item-hierarchy";

export type JiraSyncResult =
  | {
      ok: true;
      summary: {
        created: number;
        updated: number;
        skippedNoDates: number;
        epics: number;
        items: number;
        hidden: number;
        dependenciesCreated: number;
        dependenciesUpdated: number;
        writebackFailures: number;
      };
    }
  | { ok: false; error: string };

const STATUS_CATEGORY_TO_STATUS: Record<string, "TODO" | "IN_PROGRESS" | "DONE"> = {
  new: "TODO",
  indeterminate: "IN_PROGRESS",
  done: "DONE",
};

const STATUS_TO_PROGRESS: Record<string, number> = {
  TODO: 0,
  IN_PROGRESS: 50,
  DONE: 100,
};

function mapStatus(issue: JiraIssue): "TODO" | "IN_PROGRESS" | "DONE" {
  const categoryKey = issue.fields.status?.statusCategory?.key;
  return STATUS_CATEGORY_TO_STATUS[categoryKey] ?? "TODO";
}

function extractDate(issue: JiraIssue, fieldId: string): Date | null {
  const raw = issue.fields[fieldId];
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

// hierarchyLevel : 1 = Epic, 0 = tache standard (Story/Task/Bug), -1 = sous-tache.
// On ignore les sous-taches (hors perimetre de la hierarchie a un seul niveau de l'app).
function hierarchyLevel(issue: JiraIssue): number {
  return issue.fields.issuetype?.hierarchyLevel ?? 0;
}

export async function syncRoadmapFromJira(roadmapId: string): Promise<JiraSyncResult> {
  const roadmap = await prisma.roadmap.findUnique({
    where: { id: roadmapId },
    select: {
      workspaceId: true,
      jiraProjectKey: true,
      jiraStartDateFieldId: true,
      jiraEndDateFieldId: true,
      jiraSyncFromDate: true,
    },
  });
  if (!roadmap) return { ok: false, error: "Roadmap introuvable." };
  if (!roadmap.jiraProjectKey || !roadmap.jiraStartDateFieldId || !roadmap.jiraEndDateFieldId) {
    return { ok: false, error: "Mapping Jira incomplet (projet ou champs de dates manquants)." };
  }

  const creds = await getWorkspaceJiraCredentials(roadmap.workspaceId);
  if (!creds) return { ok: false, error: "Jira n'est pas connecté pour ce workspace." };

  const startFieldId = roadmap.jiraStartDateFieldId;
  const endFieldId = roadmap.jiraEndDateFieldId;
  const syncFromDate = roadmap.jiraSyncFromDate;

  const result = await searchJiraIssues(
    creds,
    `project = "${roadmap.jiraProjectKey}"`,
    ["summary", "issuetype", "status", "assignee", "parent", "issuelinks", startFieldId, endFieldId]
  );
  if (!result.ok) return { ok: false, error: result.error };

  const issues = result.data.filter((i) => hierarchyLevel(i) !== -1);
  const epicIssues = issues.filter((i) => hierarchyLevel(i) === 1);
  const storyIssues = issues.filter((i) => hierarchyLevel(i) !== 1);

  // Owners : correspondance par nom (insensible a la casse) avec les membres du workspace.
  const members = await prisma.membership.findMany({
    where: { workspaceId: roadmap.workspaceId },
    select: { user: { select: { id: true, name: true } } },
  });
  const ownerByName = new Map(members.map((m) => [m.user.name.trim().toLowerCase(), m.user.id]));

  function resolveOwnerId(issue: JiraIssue): string | null {
    const name = issue.fields.assignee?.displayName as string | undefined;
    if (!name) return null;
    return ownerByName.get(name.trim().toLowerCase()) ?? null;
  }

  let position = await prisma.item.count({ where: { roadmapId } });
  let created = 0;
  let updated = 0;
  let skippedNoDates = 0;
  let hidden = 0;

  // cle Jira -> id interne, rempli au fur et a mesure des Epics upsertes (necessaire pour
  // rattacher les sous-items au bon parentId, qui reference notre id, pas la cle Jira).
  const epicInternalIdByJiraKey = new Map<string, string>();
  // Epics dont un sous-item a ete cree/mis a jour/masque/demasque cette synchro : leurs
  // aggregats (dates/progress derives) doivent etre recalcules a la fin.
  const touchedEpicIds = new Set<string>();

  // Gere une issue Jira (Epic ou Story) deja filtree sur hierarchyLevel. Factorise car les
  // deux boucles (Epics puis Stories) appliquent exactement la meme logique de
  // creation/mise a jour/masquage, seul parentId change.
  async function upsertIssue(issue: JiraIssue, parentId: string | null): Promise<string> {
    const startDate = extractDate(issue, startFieldId);
    const endDate = extractDate(issue, endFieldId);
    const beforeSyncThreshold = Boolean(syncFromDate && startDate && startDate < syncFromDate);
    const status = mapStatus(issue);
    const existing = await prisma.item.findUnique({
      where: { jiraIssueKey: issue.key },
      select: { id: true, jiraHiddenAt: true },
    });

    if (!startDate || !endDate || beforeSyncThreshold) {
      skippedNoDates += 1;
      if (!existing) {
        // Jamais importe et toujours hors perimetre (pas de dates, ou avant le seuil) :
        // rien a faire, rien a masquer.
        return "";
      }
      // Deja importe auparavant, dates retirees depuis : on masque (sans toucher aux
      // anciennes dates, elles redeviendront pertinentes si les dates reviennent), mais on
      // rafraichit quand meme titre/statut/owner pour eviter les infos perimees.
      if (!existing.jiraHiddenAt) hidden += 1;
      await prisma.item.update({
        where: { id: existing.id },
        data: {
          title: issue.fields.summary,
          status,
          progress: STATUS_TO_PROGRESS[status],
          ownerId: resolveOwnerId(issue),
          jiraHiddenAt: existing.jiraHiddenAt ?? new Date(),
        },
      });
      if (parentId) touchedEpicIds.add(parentId);
      updated += 1;
      return existing.id;
    }

    const item = await prisma.item.upsert({
      where: { jiraIssueKey: issue.key },
      update: {
        title: issue.fields.summary,
        startDate,
        endDate,
        status,
        progress: STATUS_TO_PROGRESS[status],
        ownerId: resolveOwnerId(issue),
        parentId,
        jiraHiddenAt: null,
      },
      create: {
        title: issue.fields.summary,
        startDate,
        endDate,
        status,
        progress: STATUS_TO_PROGRESS[status],
        ownerId: resolveOwnerId(issue),
        position: position++,
        roadmapId,
        parentId,
        jiraIssueKey: issue.key,
        statusLog: { create: { status } },
      },
    });
    if (parentId) touchedEpicIds.add(parentId);
    if (existing) updated += 1;
    else created += 1;
    return item.id;
  }

  for (const issue of epicIssues) {
    const id = await upsertIssue(issue, null);
    if (id) epicInternalIdByJiraKey.set(issue.key, id);
  }

  for (const issue of storyIssues) {
    const parentKey = issue.fields.parent?.key as string | undefined;
    const parentId = parentKey ? epicInternalIdByJiraKey.get(parentKey) ?? null : null;
    await upsertIssue(issue, parentId);
  }

  // Detection des issues completement disparues de Jira (supprimees ou deplacees hors du
  // projet) : leur cle n'apparait plus du tout dans les resultats de recherche, meme pas
  // parmi les issues skippees pour dates manquantes (celles-la sont deja gerees ci-dessus).
  const fetchedKeys = new Set(result.data.map((i) => i.key));
  const importedItems = await prisma.item.findMany({
    where: { roadmapId, jiraIssueKey: { not: null } },
    select: { id: true, jiraIssueKey: true, jiraHiddenAt: true, parentId: true },
  });

  for (const item of importedItems) {
    const stillPresent = item.jiraIssueKey ? fetchedKeys.has(item.jiraIssueKey) : true;
    if (!stillPresent) {
      if (!item.jiraHiddenAt) {
        await prisma.item.update({ where: { id: item.id }, data: { jiraHiddenAt: new Date() } });
        hidden += 1;
        if (item.parentId) touchedEpicIds.add(item.parentId);
      }
    }
  }

  // Dates/progress des Epics derivees de leurs sous-items visibles uniquement (voir
  // lib/item-hierarchy.ts) : a recalculer pour tout Epic touche par un changement de
  // visibilite ou de contenu cette synchro. Renvoie aussi les nouvelles dates vers Jira
  // (write-back) : un echec ici n'annule jamais le recalcul local, juste comptabilise.
  let writebackFailures = 0;
  for (const epicId of touchedEpicIds) {
    const wb = await recomputeEpicAggregates(epicId);
    if (wb.attempted && !wb.ok) writebackFailures += 1;
  }

  // Dependances : uniquement le type de lien standard Jira "Blocks" (nom interne stable,
  // independant de la langue de l'instance). Statut deduit du statut de l'issue bloquante :
  // Resolu si elle est Terminee cote Jira, sinon En attente.
  const itemIdCache = new Map<string, string | null>();
  async function resolveItemId(jiraKey: string): Promise<string | null> {
    if (itemIdCache.has(jiraKey)) return itemIdCache.get(jiraKey)!;
    const found = await prisma.item.findUnique({ where: { jiraIssueKey: jiraKey }, select: { id: true } });
    itemIdCache.set(jiraKey, found?.id ?? null);
    return found?.id ?? null;
  }

  let dependenciesCreated = 0;
  let dependenciesUpdated = 0;

  for (const issue of issues) {
    const ownId = await resolveItemId(issue.key);
    if (!ownId) continue; // issue jamais importee (ex : jamais eu de dates valides), on ignore ses liens

    const links = (issue.fields.issuelinks ?? []) as Array<{
      id: string;
      type: { name: string };
      inwardIssue?: { key: string; fields?: { status?: { statusCategory?: { key: string } } } };
      outwardIssue?: { key: string; fields?: { status?: { statusCategory?: { key: string } } } };
    }>;

    for (const link of links) {
      if (link.type?.name !== "Blocks") continue;

      let blockingKey: string;
      let blockedKey: string;
      let blockingStatusCategory: string | undefined;

      if (link.outwardIssue) {
        // Cette issue "blocks" (bloque) l'issue outward.
        blockingKey = issue.key;
        blockedKey = link.outwardIssue.key;
        blockingStatusCategory = issue.fields.status?.statusCategory?.key;
      } else if (link.inwardIssue) {
        // Cette issue "is blocked by" (est bloquee par) l'issue inward.
        blockingKey = link.inwardIssue.key;
        blockedKey = issue.key;
        blockingStatusCategory = link.inwardIssue.fields?.status?.statusCategory?.key;
      } else {
        continue;
      }

      const status = blockingStatusCategory === "done" ? "RESOLVED" : "PENDING";
      const blockingItemId = await resolveItemId(blockingKey);
      const blockedItemId = await resolveItemId(blockedKey);

      const data =
        blockingItemId && blockedItemId
          ? { targetKind: "ITEM" as const, blockingItemId, blockedItemId, externalSystemName: null }
          : blockingItemId
            ? {
                targetKind: "EXTERNAL" as const,
                blockingItemId,
                blockedItemId: null,
                externalSystemName: `Jira : ${blockedKey}`,
              }
            : {
                targetKind: "EXTERNAL" as const,
                blockingItemId: null,
                blockedItemId,
                externalSystemName: `Jira : ${blockingKey}`,
              };

      const existingDep = await prisma.dependency.findUnique({
        where: { jiraLinkId: link.id },
        select: { id: true },
      });

      await prisma.dependency.upsert({
        where: { jiraLinkId: link.id },
        update: { status, ...data },
        create: { jiraLinkId: link.id, type: "FD", status, ...data },
      });
      if (existingDep) dependenciesUpdated += 1;
      else dependenciesCreated += 1;
    }
  }

  await prisma.roadmap.update({ where: { id: roadmapId }, data: { jiraLastSyncAt: new Date() } });

  return {
    ok: true,
    summary: {
      created,
      updated,
      skippedNoDates,
      epics: epicIssues.length,
      items: storyIssues.length,
      hidden,
      dependenciesCreated,
      dependenciesUpdated,
      writebackFailures,
    },
  };
}
