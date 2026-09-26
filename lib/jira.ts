// Client Jira Cloud minimal. Authentification Basic (email + API token), seule methode
// supportee par Jira Cloud pour un usage serveur-a-serveur sans passer par un flow OAuth
// complet (inutile pour un usage interne mono-workspace).

import { ProxyAgent, fetch as undiciFetch, type Response as UndiciResponse } from "undici";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

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

// --- Validation de l'URL du site Jira (audit H1, SSRF) ---------------------------------------
// Sans controle, un admin pourrait saisir l'adresse d'un service interne (ou du service de
// metadonnees du serveur, 169.254.169.254) : le serveur Apex irait alors l'interroger lui-meme.
// On n'accepte donc QUE des sites Jira Cloud : https://<sous-domaine>.atlassian.net, sans
// port, identifiants, chemin, parametres ni fragment. Les sous-domaines de atlassian.net sont
// geres par Atlassian : aucune personne exterieure ne peut les faire pointer vers une adresse
// interne, ce qui rend inutile une verification DNS supplementaire (qui serait de toute facon
// faussee par le proxy d'entreprise, lequel resout les noms a notre place).

const JIRA_CLOUD_HOST = /^[a-z0-9][a-z0-9-]{0,62}\.atlassian\.net$/;

export type SiteUrlValidation = { ok: true; siteUrl: string } | { ok: false; error: string };

export function validateJiraSiteUrl(raw: string): SiteUrlValidation {
  const invalid: SiteUrlValidation = {
    ok: false,
    error: "URL Jira invalide : elle doit être de la forme https://mon-domaine.atlassian.net",
  };

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return invalid;
  }

  if (url.protocol !== "https:") return invalid;
  if (url.username || url.password) return invalid;
  if (url.port && url.port !== "443") return invalid;
  if (url.search || url.hash) return invalid;
  if (url.pathname !== "/" && url.pathname !== "") return invalid;

  const host = url.hostname.toLowerCase();
  if (!JIRA_CLOUD_HOST.test(host)) return invalid;

  return { ok: true, siteUrl: `https://${host}` };
}

// Cle de projet Jira : lettres majuscules, chiffres et "_", commencant par une lettre (audit
// M5). Ce format interdit tout guillemet ou operateur : la cle ne peut plus modifier la
// requete JQL dans laquelle elle est inseree.
const JIRA_PROJECT_KEY = /^[A-Z][A-Z0-9_]{0,49}$/;

export function isValidJiraProjectKey(key: string): boolean {
  return JIRA_PROJECT_KEY.test(key);
}

// Delai maximal d'un appel Jira, connexion comprise (audit L7).
const JIRA_TIMEOUT_MS = 15_000;

function authHeader(email: string, apiToken: string): string {
  return "Basic " + Buffer.from(`${email}:${apiToken}`).toString("base64");
}

// Helper partage par toutes les fonctions d'appel Jira (auth + proxy identiques).
// L'URL est revalidee a CHAQUE appel (et pas seulement a l'enregistrement) : une valeur
// enregistree en base avant l'ajout de ce controle ne peut donc pas contourner la regle.
// Les redirections ne sont jamais suivies : une reponse 3xx est traitee comme une erreur.
async function jiraApiFetch(
  creds: JiraCredentials,
  path: string,
  options?: { method?: string; body?: unknown }
): Promise<UndiciResponse> {
  const validation = validateJiraSiteUrl(creds.siteUrl);
  if (!validation.ok) throw new Error("URL Jira refusee par la validation.");

  const res = await undiciFetch(`${validation.siteUrl}${path}`, {
    method: options?.method ?? "GET",
    headers: {
      Authorization: authHeader(creds.email, creds.apiToken),
      Accept: "application/json",
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
    dispatcher: getDispatcher(),
    redirect: "manual",
    signal: AbortSignal.timeout(JIRA_TIMEOUT_MS),
  });

  if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`Redirection Jira refusee (statut ${res.status}).`);
  }
  return res;
}

export type JiraConnectionTestResult =
  | { ok: true; accountName: string }
  | { ok: false; error: string };

// Les corps de reponse ne sont plus journalises ici (audit H1) : seuls le site et le statut
// HTTP le sont, ce qui suffit au diagnostic sans jamais recopier un contenu recu.
export async function testJiraConnection(creds: JiraCredentials): Promise<JiraConnectionTestResult> {
  const validation = validateJiraSiteUrl(creds.siteUrl);
  if (!validation.ok) return { ok: false, error: validation.error };
  const siteUrl = validation.siteUrl;

  let res: UndiciResponse;
  try {
    res = await jiraApiFetch({ ...creds, siteUrl }, "/rest/api/3/myself");
  } catch (err) {
    console.error("[jira] Echec de connexion a", siteUrl, ":", err);
    return { ok: false, error: "Impossible de joindre ce site Jira. Vérifie l'URL." };
  }

  if (res.status === 401) {
    console.error("[jira] 401 Unauthorized pour", siteUrl);
    return { ok: false, error: "Email ou token invalide." };
  }
  if (!res.ok) {
    console.error("[jira] Statut", res.status, "pour", siteUrl);
    return { ok: false, error: `Erreur Jira (${res.status}).` };
  }

  const data: any = await res.json().catch(() => null);
  if (!data) {
    console.error("[jira] Reponse non-JSON pour", siteUrl);
    return { ok: false, error: "Réponse Jira inattendue (probablement bloquée par un WAF/challenge)." };
  }
  if (typeof data.displayName !== "string" || !data.displayName) {
    console.error("[jira] Reponse sans displayName pour", siteUrl);
    return { ok: false, error: "Réponse Jira inattendue." };
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

  // Un token illisible (cle JIRA_ENCRYPTION_KEY changee, valeur corrompue) ne doit jamais
  // faire planter la requete en cours : on le traite comme "Jira a reconnecter".
  // Le dechiffrement est lie au workspace (voir lib/crypto.ts) : un token recopie depuis un
  // autre workspace echoue ici.
  let apiToken: string;
  try {
    const result = decryptSecret(workspace.jiraApiTokenEncrypted, workspaceId);
    apiToken = result.plainText;

    // Ancien format ou ancienne cle : on rechiffre au format actuel au passage, sans jamais
    // bloquer l'appel en cours si cette mise a jour echoue.
    if (result.needsReEncryption) {
      try {
        await prisma.workspace.update({
          where: { id: workspaceId },
          data: { jiraApiTokenEncrypted: encryptSecret(apiToken, workspaceId) },
        });
        console.log("[jira] Token du workspace", workspaceId, "rechiffre au format actuel.");
      } catch (err) {
        console.error("[jira] Rechiffrement du token impossible pour le workspace", workspaceId, ":", err);
      }
    }
  } catch (err) {
    console.error("[jira] Dechiffrement du token impossible pour le workspace", workspaceId, ":", err);
    return null;
  }

  return { siteUrl: workspace.jiraSiteUrl, email: workspace.jiraEmail, apiToken };
}

// Message commun a afficher quand getWorkspaceJiraCredentials renvoie null.
export const JIRA_NOT_CONNECTED_MESSAGE =
  "Jira n'est pas connecté pour ce workspace, ou la connexion doit être refaite. Vérifie dans Paramètres.";

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
  const json: any = await res.json().catch(() => null);
  const values = Array.isArray(json?.values) ? json.values : [];
  return {
    ok: true,
    data: values
      .filter((p: any) => typeof p?.key === "string" && typeof p?.name === "string")
      .map((p: any) => ({ key: p.key, name: p.name })),
  };
}

export type JiraIssue = {
  key: string;
  fields: Record<string, any>;
};

// Recherche paginee via le nouvel endpoint /search/jql (l'ancien /rest/api/3/search a ete
// supprime par Atlassian courant 2026). Pagination par nextPageToken : plus de "total" fourni,
// on boucle jusqu'a ce qu'aucun token ne soit renvoye.
// Plafond de pages (audit L7) : au-dela, on renvoie une erreur plutot qu'un resultat partiel,
// car la synchro masquerait a tort les tickets non recuperes (vus comme "disparus de Jira").
const MAX_SEARCH_PAGES = 50; // 50 x 100 = 5000 tickets

export async function searchJiraIssues(
  creds: JiraCredentials,
  jql: string,
  fields: string[]
): Promise<JiraListResult<JiraIssue[]>> {
  const all: JiraIssue[] = [];
  let nextPageToken: string | undefined;

  for (let page = 0; ; page++) {
    if (page >= MAX_SEARCH_PAGES) {
      return {
        ok: false,
        error: `Ce projet Jira contient plus de ${MAX_SEARCH_PAGES * 100} tickets. Utilise le filtre de date du mapping pour réduire le périmètre.`,
      };
    }

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

    const json: any = await res.json().catch(() => null);
    const issues: JiraIssue[] = Array.isArray(json?.issues) ? json.issues : [];
    all.push(...issues);

    nextPageToken = typeof json?.nextPageToken === "string" ? json.nextPageToken : undefined;
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
      .filter((f: any) => typeof f?.id === "string" && (f.schema?.type === "date" || f.schema?.type === "datetime"))
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
    res = await jiraApiFetch(creds, `/rest/api/3/issue/${encodeURIComponent(issueKey)}`, { method: "PUT", body });
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

