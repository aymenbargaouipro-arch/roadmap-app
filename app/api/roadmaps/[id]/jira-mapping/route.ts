import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkspaceJiraCredentials, listJiraProjects, listJiraDateFields } from "@/lib/jira";

async function requireRoadmapAdmin(roadmapId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: NextResponse.json({ error: "Non authentifié." }, { status: 401 }) };

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
  if (!roadmap) return { error: NextResponse.json({ error: "Roadmap introuvable." }, { status: 404 }) };

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspaceId: roadmap.workspaceId },
  });
  if (!membership) return { error: NextResponse.json({ error: "Accès refusé." }, { status: 403 }) };
  if (membership.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 }) };
  }

  return { roadmap };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRoadmapAdmin(params.id);
  if ("error" in auth) return auth.error;

  const creds = await getWorkspaceJiraCredentials(auth.roadmap.workspaceId);
  if (!creds) {
    return NextResponse.json(
      { error: "Jira n'est pas connecté pour ce workspace. Configure-le dans Paramètres." },
      { status: 400 }
    );
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

  const jiraStartDateFieldId = body.jiraStartDateFieldId || null;
  const jiraEndDateFieldId = body.jiraEndDateFieldId || null;

  // Le type de champ (date/datetime) determine le format d'ecriture lors du renvoi des
  // dates vers Jira (write-back) : on le resout ici, une seule fois, plutot que de faire
  // confiance a ce que le client aurait pu renvoyer.
  let jiraStartDateFieldType: string | null = null;
  let jiraEndDateFieldType: string | null = null;

  if (jiraStartDateFieldId || jiraEndDateFieldId) {
    const creds = await getWorkspaceJiraCredentials(auth.roadmap.workspaceId);
    if (creds) {
      const fieldsResult = await listJiraDateFields(creds);
      if (fieldsResult.ok) {
        jiraStartDateFieldType = fieldsResult.data.find((f) => f.id === jiraStartDateFieldId)?.type ?? null;
        jiraEndDateFieldType = fieldsResult.data.find((f) => f.id === jiraEndDateFieldId)?.type ?? null;
      }
    }
  }

  const updated = await prisma.roadmap.update({
    where: { id: params.id },
    data: {
      jiraProjectKey: body.jiraProjectKey || null,
      jiraStartDateFieldId,
      jiraEndDateFieldId,
      jiraStartDateFieldType,
      jiraEndDateFieldType,
      jiraSyncFromDate: body.jiraSyncFromDate ? new Date(body.jiraSyncFromDate) : null,
    },
  });

  return NextResponse.json({
    jiraProjectKey: updated.jiraProjectKey,
    jiraStartDateFieldId: updated.jiraStartDateFieldId,
    jiraEndDateFieldId: updated.jiraEndDateFieldId,
  });
}
