import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireRoadmapMember } from "@/lib/access";
import { syncRoadmapFromJira } from "@/lib/jira-sync";

// Synchronisation ouverte a tous les membres du workspace (decision actee, audit I1) : un
// membre peut deja modifier les dates d'un item, ce qui les renvoie vers Jira.
export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const access = await requireRoadmapMember(params.id, session.user.id);
  if (!access.ok) return access.response;

  const result = await syncRoadmapFromJira(params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true, summary: result.summary });
}
