// Client Jira Cloud minimal. Authentification Basic (email + API token), seule methode
// supportee par Jira Cloud pour un usage serveur-a-serveur sans passer par un flow OAuth
// complet (inutile pour un usage interne mono-workspace).

import { ProxyAgent, fetch as undiciFetch, type Response as UndiciResponse } from "undici";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

// Certains reseaux d'entreprise (PAC/WinINet) imposent un proxy que Node ne detecte pas
// tout seul. Si JIRA_HTTP_PROXY est defini dans .env, on route les appels Jira dessus ;
// sinon, connexion directe (comportement par defaut, inchange pour les autres utilisateurs).
function getDispatcher() {
  const proxyUrl = process.env.JIRA_HTTP_PROXY;
  return proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
}

export type JiraCredentials = {
  siteUrl: string; // ex: "https://mon-domaine.atlassian.net"
  email: string;
  apiToken: string;
};

function normalizeSiteUrl(siteUrl: string): string {
  return siteUrl.trim().replace(/\/+$/, "");
}

function authHeader(email: string, apiToken: string): string {
  return "Basic " + Buffer.from(`${email}:${apiToken}`).toString("base64");
}

// Helper partage par toutes les fonctions d'appel Jira (auth + proxy identiques).
async function jiraApiFetch(
  creds: JiraCredentials,
  path: string,
  options?: { method?: string; body?: unknown }
): Promise<UndiciResponse> {
  const siteUrl = normalizeSiteUrl(creds.siteUrl);
  return undiciFetch(`${siteUrl}${path}`, {
    method: options?.method ?? "GET",
    headers: {
      Authorization: authHeader(creds.email, creds.apiToken),
      Accept: "application/json",
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
    dispatcher: getDispatcher(),
  });
}

export type JiraConnectionTestResult =
  | { ok: true; accountName: string }
  | { ok: false; error: string };

export async function testJiraConnection(creds: JiraCredentials): Promise<JiraConnectionTestResult> {
  const siteUrl = normalizeSiteUrl(creds.siteUrl);

  let res: UndiciResponse;
  try {
    res = await undiciFetch(`${siteUrl}/rest/api/3/myself`, {
      headers: {
        Authorization: authHeader(creds.email, creds.apiToken),
        Accept: "application/json",
      },
      dispatcher: getDispatcher(),
    });
  } catch (err) {
    console.error("[jira] Echec de connexion a", siteUrl, ":", err);
    return { ok: false, error: "Impossible de joindre ce site Jira. Verifie l'URL." };
  }

  if (res.status === 401) {
    console.error("[jira] 401 Unauthorized pour", siteUrl);
    return { ok: false, error: "Email ou token invalide." };
  }
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    console.error("[jira] Statut", res.status, "pour", siteUrl, "- corps:", bodyText.slice(0, 500));
    return { ok: false, error: `Erreur Jira (${res.status}).` };
  }

  const rawText = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(rawText);
  } catch {
    console.error("[jira] Reponse non-JSON pour", siteUrl, "- corps:", rawText.slice(0, 500));
    return { ok: false, error: "Reponse Jira inattendue (probablement bloque par un WAF/challenge)." };
  }
  if (!data?.displayName) {
    console.error("[jira] JSON sans displayName pour", siteUrl, "- corps:", JSON.stringify(data).slice(0, 500));
    return { ok: false, error: "Reponse Jira inattendue." };
  }
  return { ok: true, accountName: data.displayName };
}

// Recupere et dechiffre les identifiants Jira stockes sur le workspace. Retourne null si
// Jira n'est pas (ou plus) connecte pour ce workspace.
export async function getWorkspaceJiraCredentials(workspaceId: string): Promise<JiraCredentials | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { jiraSiteUrl: true, jiraEmail: true, jiraApiTokenEncrypted: true },
  });
  if (!workspace?.jiraSiteUrl || !workspace.jiraEmail || !workspace.jiraApiTokenEncrypted) {
    return null;
  }
  return {
    siteUrl: workspace.jiraSiteUrl,
    email: workspace.jiraEmail,
    apiToken: decryptSecret(workspace.jiraApiTokenEncrypted),
  };
}

export type JiraProjectOption = { key: string; name: string };

export type JiraListResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Limite a 100 projets (MVP) : largement suffisant pour un usage interne mono-workspace.
export async function listJiraProjects(creds: JiraCredentials): Promise<JiraListResult<JiraProjectOption[]>> {
  let res: UndiciResponse;
  try {
    res = await jiraApiFetch(creds, "/rest/api/3/project/search?maxResults=100&orderBy=name");
  } catch (err) {
    console.error("[jira] Echec de listage des projets :", err);
    return { ok: false, error: "Impossible de joindre Jira pour lister les projets." };
  }
  if (!res.ok) {
    return { ok: false, error: `Erreur Jira (${res.status}) lors du listage des projets.` };
  }
  const json = await res.json().catch(() => null);
  const values = Array.isArray(json?.values) ? json.values : [];
  return {
    ok: true,
    data: values.map((p: any) => ({ key: p.key, name: p.name })),
  };
}

export type JiraIssue = {
  key: string;
  fields: Record<string, any>;
};

// Recherche paginee via le nouvel endpoint /search/jql (l'ancien /rest/api/3/search a ete
// supprime par Atlassian courant 2026). Pagination par nextPageToken : plus de "total" fourni,
// on boucle jusqu'a ce qu'aucun token ne soit renvoye.
export async function searchJiraIssues(
  creds: JiraCredentials,
  jql: string,
  fields: string[]
): Promise<JiraListResult<JiraIssue[]>> {
  const all: JiraIssue[] = [];
  let nextPageToken: string | undefined;

  while (true) {
    let res: UndiciResponse;
    try {
      res = await jiraApiFetch(creds, "/rest/api/3/search/jql", {
        method: "POST",
        body: {
          jql,
          fields,
          maxResults: 100,
          ...(nextPageToken ? { nextPageToken } : {}),
        },
      });
    } catch (err) {
      console.error("[jira] Echec de recherche d'issues :", err);
      return { ok: false, error: "Impossible de joindre Jira pour récupérer les tickets." };
    }
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      console.error("[jira] Statut", res.status, "lors de la recherche d'issues :", bodyText.slice(0, 500));
      return { ok: false, error: `Erreur Jira (${res.status}) lors de la récupération des tickets.` };
    }

    const json = await res.json().catch(() => null);
    const issues: JiraIssue[] = Array.isArray(json?.issues) ? json.issues : [];
    all.push(...issues);

    nextPageToken = json?.nextPageToken;
    if (!nextPageToken || issues.length === 0) break;
  }

  return { ok: true, data: all };
}

export type JiraDateFieldOption = { id: string; name: string; type: "date" | "datetime" };

// Filtre sur les champs de type date/datetime uniquement (les champs custom de dates
// portent des noms varies selon les instances, d'ou le choix par menu deroulant plutot
// que de deviner un ID).
export async function listJiraDateFields(creds: JiraCredentials): Promise<JiraListResult<JiraDateFieldOption[]>> {
  let res: UndiciResponse;
  try {
    res = await jiraApiFetch(creds, "/rest/api/3/field");
  } catch (err) {
    console.error("[jira] Echec de listage des champs :", err);
    return { ok: false, error: "Impossible de joindre Jira pour lister les champs." };
  }
  if (!res.ok) {
    return { ok: false, error: `Erreur Jira (${res.status}) lors du listage des champs.` };
  }
  const json = await res.json().catch(() => null);
  const fields = Array.isArray(json) ? json : [];
  return {
    ok: true,
    data: fields
      .filter((f: any) => f.schema?.type === "date" || f.schema?.type === "datetime")
      .map((f: any) => ({ id: f.id, name: f.name, type: f.schema.type as "date" | "datetime" })),
  };
}

// Ecrit les dates de debut/fin d'un item vers l'issue Jira correspondante (write-back).
// Le format envoye depend du type du champ Jira cible : "date" attend "AAAA-MM-JJ",
// "datetime" attend un ISO 8601 complet. Se trompe de format = 400 cote Jira.
export async function updateJiraIssueDates(
  creds: JiraCredentials,
  issueKey: string,
  fieldsToUpdate: {
    startFieldId: string;
    startFieldType: string | null;
    startDate: Date;
    endFieldId: string;
    endFieldType: string | null;
    endDate: Date;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  function format(date: Date, type: string | null): string {
    return type === "datetime" ? date.toISOString() : date.toISOString().slice(0, 10);
  }

  const body = {
    fields: {
      [fieldsToUpdate.startFieldId]: format(fieldsToUpdate.startDate, fieldsToUpdate.startFieldType),
      [fieldsToUpdate.endFieldId]: format(fieldsToUpdate.endDate, fieldsToUpdate.endFieldType),
    },
  };

  let res: UndiciResponse;
  try {
    res = await jiraApiFetch(creds, `/rest/api/3/issue/${issueKey}`, { method: "PUT", body });
  } catch (err) {
    console.error("[jira] Echec d'ecriture des dates sur", issueKey, ":", err);
    return { ok: false, error: "Impossible de joindre Jira pour mettre a jour les dates." };
  }
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    console.error("[jira] Statut", res.status, "lors de l'ecriture des dates sur", issueKey, ":", bodyText.slice(0, 500));
    return { ok: false, error: `Jira a refuse la mise a jour des dates (${res.status}).` };
  }
  return { ok: true };
}
