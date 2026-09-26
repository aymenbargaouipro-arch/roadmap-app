import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { testJiraConnection, validateJiraSiteUrl } from "@/lib/jira";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: NextResponse.json({ error: "Non authentifié." }, { status: 401 }) };

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return { error: NextResponse.json({ error: "Aucun espace de travail." }, { status: 400 }) };
  if (membership.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 }) };
  }
  return { membership };
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const siteUrl = typeof body?.siteUrl === "string" ? body.siteUrl.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const apiToken = typeof body?.apiToken === "string" ? body.apiToken.trim() : "";

  if (!siteUrl || !email || !apiToken) {
    return NextResponse.json({ error: "URL du site, email et token sont requis." }, { status: 400 });
  }
  if (email.length > 320 || apiToken.length > 1000) {
    return NextResponse.json({ error: "Email ou token trop long." }, { status: 400 });
  }

  // Seules les URL Jira Cloud (https://xxx.atlassian.net) sont acceptees (audit H1). On
  // enregistre la forme normalisee, jamais la saisie brute.
  const validation = validateJiraSiteUrl(siteUrl);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
  const normalizedSiteUrl = validation.siteUrl;

  const test = await testJiraConnection({ siteUrl: normalizedSiteUrl, email, apiToken });
  if (!test.ok) {
    return NextResponse.json({ error: test.error }, { status: 400 });
  }

  await prisma.workspace.update({
    where: { id: auth.membership.workspaceId },
    data: {
      jiraSiteUrl: normalizedSiteUrl,
      jiraEmail: email,
      jiraApiTokenEncrypted: encryptSecret(apiToken, auth.membership.workspaceId),
      jiraConnectedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, accountName: test.accountName });
}

export async function DELETE() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  await prisma.workspace.update({
    where: { id: auth.membership.workspaceId },
    data: {
      jiraSiteUrl: null,
      jiraEmail: null,
      jiraApiTokenEncrypted: null,
      jiraConnectedAt: null,
    },
  });

  return NextResponse.json({ ok: true });
}

