import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoadmapMember } from "@/lib/access";
import {
  getWorkspaceJiraCredentials,
  isValidJiraProjectKey,
  JIRA_NOT_CONNECTED_MESSAGE,
  listJiraProjects,
  listJiraDateFields,
} from "@/lib/jira";

async function requireRoadmapAdmin(roadmapId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: NextResponse.json({ error: "Non authentifié." }, { status: 401 }) };

  const access = await requireRoadmapMember(roadmapId, session.user.id);
  if (!access.ok) return { error: access.response };
  if (access.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 }) };
  }

  return { roadmap: access.entity };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRoadmapAdmin(params.id);
  if ("error" in auth) return auth.error;

  const creds = await getWorkspaceJiraCredentials(auth.roadmap.workspaceId);
  if (!creds) {
    return NextResponse.json({ error: JIRA_NOT_CONNECTED_MESSAGE }, { status: 400 });
  }

  const [projectsResult, fieldsResult] = await Promise.all([
    listJiraProjects(creds),
    listJiraDateFields(creds),
  ]);

  if (!projectsResult.ok) return NextResponse.json({ error: projectsResult.error }, { status: 502 });
  if (!fieldsResult.ok) return NextResponse.json({ error: fieldsResult.error }, { status: 502 });

  return NextResponse.json({
    projects: projectsResult.data,
    dateFields: fieldsResult.data,
    current: {
      jiraProjectKey: auth.roadmap.jiraProjectKey,
      jiraStartDateFieldId: auth.roadmap.jiraStartDateFieldId,
      jiraEndDateFieldId: auth.roadmap.jiraEndDateFieldId,
      jiraSyncFromDate: auth.roadmap.jiraSyncFromDate ? auth.roadmap.jiraSyncFromDate.toISOString().slice(0, 10) : null,
    },
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRoadmapAdmin(params.id);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });

  const jiraProjectKey: string | null =
    typeof body.jiraProjectKey === "string" && body.jiraProjectKey ? body.jiraProjectKey : null;
  const jiraStartDateFieldId: string | null =
    typeof body.jiraStartDateFieldId === "string" && body.jiraStartDateFieldId ? body.jiraStartDateFieldId : null;
  const jiraEndDateFieldId: string | null =
    typeof body.jiraEndDateFieldId === "string" && body.jiraEndDateFieldId ? body.jiraEndDateFieldId : null;

  let jiraSyncFromDate: Date | null = null;
  if (body.jiraSyncFromDate) {
    jiraSyncFromDate = new Date(body.jiraSyncFromDate);
    if (Number.isNaN(jiraSyncFromDate.getTime())) {
      return NextResponse.json({ error: "Date de filtre invalide." }, { status: 400 });
    }
  }

  if (jiraProjectKey && !isValidJiraProjectKey(jiraProjectKey)) {
    return NextResponse.json({ error: "Clé de projet Jira invalide." }, { status: 400 });
  }

  // Tout ce qui est enregistre doit exister reellement dans Jira (audit M5) : la cle de projet
  // doit figurer parmi les projets visibles, et les champs de dates parmi les champs de type
  // date/datetime. Impossible ainsi de designer "summary" (le titre) comme champ de date, ce
  // qui ferait reecrire les titres des tickets lors du renvoi des dates vers Jira.
  // Le type de champ (date/datetime), qui determine le format d'ecriture, est resolu ici
  // plutot que de faire confiance au client.
  let jiraStartDateFieldType: string | null = null;
  let jiraEndDateFieldType: string | null = null;

  if (jiraProjectKey || jiraStartDateFieldId || jiraEndDateFieldId) {
    const creds = await getWorkspaceJiraCredentials(auth.roadmap.workspaceId);
    if (!creds) return NextResponse.json({ error: JIRA_NOT_CONNECTED_MESSAGE }, { status: 400 });

    const [projectsResult, fieldsResult] = await Promise.all([
      jiraProjectKey ? listJiraProjects(creds) : Promise.resolve(null),
      jiraStartDateFieldId || jiraEndDateFieldId ? listJiraDateFields(creds) : Promise.resolve(null),
    ]);

    if (projectsResult) {
      if (!projectsResult.ok) return NextResponse.json({ error: projectsResult.error }, { status: 502 });
      if (!projectsResult.data.some((p) => p.key === jiraProjectKey)) {
        return NextResponse.json({ error: "Projet Jira introuvable ou non accessible." }, { status: 400 });
      }
    }

    if (fieldsResult) {
      if (!fieldsResult.ok) return NextResponse.json({ error: fieldsResult.error }, { status: 502 });
      const startField = jiraStartDateFieldId ? fieldsResult.data.find((f) => f.id === jiraStartDateFieldId) : null;
      const endField = jiraEndDateFieldId ? fieldsResult.data.find((f) => f.id === jiraEndDateFieldId) : null;
      if ((jiraStartDateFieldId && !startField) || (jiraEndDateFieldId && !endField)) {
        return NextResponse.json(
          { error: "Champ de date Jira introuvable : choisis un champ de type date dans la liste." },
          { status: 400 }
        );
      }
      jiraStartDateFieldType = startField?.type ?? null;
      jiraEndDateFieldType = endField?.type ?? null;
    }
  }

  const updated = await prisma.roadmap.update({
    where: { id: params.id },
    data: {
      jiraProjectKey,
      jiraStartDateFieldId,
      jiraEndDateFieldId,
      jiraStartDateFieldType,
      jiraEndDateFieldType,
      jiraSyncFromDate,
    },
  });

  return NextResponse.json({
    jiraProjectKey: updated.jiraProjectKey,
    jiraStartDateFieldId: updated.jiraStartDateFieldId,
    jiraEndDateFieldId: updated.jiraEndDateFieldId,
  });
}
