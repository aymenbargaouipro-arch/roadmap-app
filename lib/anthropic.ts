const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

export type HierarchyMapping = {
  typeColumn: number | null;
  epicValues: string[];
  subItemValues: string[];
};

export type MainSheetMapping = {
  headerRowIndex: number;
  mapping: {
    title: number | null;
    startDate: number | null;
    endDate: number | null;
    status: number | null;
    progress: number | null;
    owner: number | null;
    isMilestone: number | null;
  };
  dateFormat: string;
  statusValueMap: Record<string, string>;
  milestoneTruthyValues: string[];
  hierarchy: HierarchyMapping;
};

export type SimpleMapping = {
  headerRowIndex: number;
  mapping: { title: number | null; date: number | null };
  dateFormat: string;
};

function sanitizeRawRows(rawRows: unknown[][]): unknown[][] {
  return rawRows.map((row) =>
    row.map((cell) => {
      if (typeof cell === "string" && cell.length > 200) return cell.slice(0, 200) + "…";
      if (cell instanceof Date) return cell.toISOString();
      return cell;
    })
  );
}

async function callClaude(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY manquante : ajoute ta cle dans le fichier .env.");
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Erreur API Claude (${res.status}) : ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const text: string =
    data.content
      ?.map((block: { type: string; text?: string }) => (block.type === "text" ? block.text ?? "" : ""))
      .join("") ?? "";

  if (!text.trim()) {
    throw new Error("Reponse vide de l'API Claude.");
  }

  return text;
}

function extractJson<T>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error("La reponse de l'IA n'etait pas un JSON valide, reessaie.");
  }
}

export async function mapMainSheet(rawRows: unknown[][]): Promise<MainSheetMapping> {
  const sample = sanitizeRawRows(rawRows);

  const prompt = `Tu es un assistant qui analyse un fichier Excel de roadmap projet, souvent construit a la main (avec une ligne de titre de document, des lignes de sprints/periodes, des en-tetes fusionnes) pour preparer son import dans une application de suivi.

Voici les ${sample.length} premieres lignes du fichier, chaque ligne etant un tableau de valeurs de cellules dans l'ordre des colonnes (index 0 = premiere colonne) :
${JSON.stringify(sample, null, 2)}

Ta tache, en trois etapes :

1. Identifie l'index (0-based, position dans le tableau ci-dessus) de la ligne qui contient les VRAIS en-tetes de colonnes (ex: "Titre", "Debut", "Fin", "Statut"...). Ce n'est PAS forcement la ligne 0 : il y a souvent une ligne de titre de document et/ou des lignes de sprints/periodes au-dessus du vrai en-tete.

2. Une fois cette ligne d'en-tete identifiee, indique l'INDEX DE COLONNE (0-based, meme indexation que les tableaux ci-dessus, PAS le nom de la colonne) qui correspond a chacun de ces champs d'une tache :
   - title : titre / nom de la tache (souvent une colonne "nom", "epic / phase", "tache", "titre"...)
   - startDate : date de debut
   - endDate : date de fin
   - status : statut d'avancement (peut contenir des emojis/icones devant le texte, ex: "⏳En cours")
   - progress : pourcentage d'avancement (0-100), seulement si une colonne dediee existe clairement
   - owner : personne responsable / assignee, seulement si une colonne dediee existe clairement
   - isMilestone : colonne qui indiquerait qu'une ligne est un jalon plutot qu'une tache, seulement si une colonne est CLAIREMENT dediee a ca (ex: nommee "Jalon", "Milestone", ou un indicateur booleen explicite). IMPORTANT : une colonne "Type" qui distingue Epic/User Story/Tache/Phase n'est PAS une colonne isMilestone : cette colonne-la est traitee separement au point 3 ci-dessous. Dans le doute, laisse isMilestone a null : une ligne de regroupement mal geree est moins grave qu'un jalon fantome avec une date inventee.

3. Cherche une colonne qui distingue un NIVEAU DE REGROUPEMENT (souvent nommee "Type", "Categorie" ou "Niveau"), avec des valeurs comme "Epic"/"Phase"/"Groupe" d'un cote, et "User Story"/"Tache"/"Sous-tache" de l'autre. Si une telle colonne existe clairement :
   - typeColumn : son index de colonne (0-based)
   - epicValues : liste des valeurs brutes EXACTES (telles qu'ecrites dans les donnees) qui designent une ligne de regroupement (Epic/Phase/...)
   - subItemValues : liste des valeurs brutes EXACTES qui designent une ligne detail (User Story/Tache/...)
   Si aucune colonne de ce type n'existe clairement, mets typeColumn a null et les deux listes vides : le code utilisera alors automatiquement la numerotation du titre (ex "3" vs "3.1") comme repli, tu n'as rien d'autre a faire dans ce cas.

Reponds UNIQUEMENT avec un objet JSON strictement valide, sans texte autour, sans balises markdown, exactement dans ce format :
{
  "headerRowIndex": <index de la ligne d'en-tete>,
  "mapping": {
    "title": <index de colonne ou null>,
    "startDate": <index de colonne ou null>,
    "endDate": <index de colonne ou null>,
    "status": <index de colonne ou null>,
    "progress": <index de colonne ou null>,
    "owner": <index de colonne ou null>,
    "isMilestone": <index de colonne ou null>
  },
  "dateFormat": "<dd/MM/yyyy | dd/MM/yy | MM/dd/yyyy | yyyy-MM-dd | dd-MM-yyyy | unknown>",
  "statusValueMap": { "<valeur brute de statut visible dans les lignes de donnees, icone/emoji compris>": "<TODO, IN_PROGRESS, BLOCKED ou DONE>" },
  "milestoneTruthyValues": ["<valeurs brutes signifiant vrai dans la colonne isMilestone, sinon []>"],
  "hierarchy": {
    "typeColumn": <index de colonne ou null>,
    "epicValues": ["<valeur brute>", ...] ,
    "subItemValues": ["<valeur brute>", ...]
  }
}

Couvre dans "statusValueMap" toutes les valeurs de statut distinctes visibles dans les lignes situees APRES la ligne d'en-tete, en gardant la valeur brute exacte (icone/emoji inclus) comme cle.`;

  const text = await callClaude(prompt);
  const parsed = extractJson<MainSheetMapping>(text);

  // Garde-fou : si le modele omet le champ hierarchy ou le renvoie mal forme, on retombe
  // sur le repli numerotation plutot que de planter l'import.
  if (!parsed.hierarchy || typeof parsed.hierarchy !== "object") {
    parsed.hierarchy = { typeColumn: null, epicValues: [], subItemValues: [] };
  } else {
    parsed.hierarchy.epicValues = Array.isArray(parsed.hierarchy.epicValues) ? parsed.hierarchy.epicValues : [];
    parsed.hierarchy.subItemValues = Array.isArray(parsed.hierarchy.subItemValues)
      ? parsed.hierarchy.subItemValues
      : [];
  }

  return parsed;
}

export async function mapMilestoneSheet(rawRows: unknown[][]): Promise<SimpleMapping> {
  const sample = sanitizeRawRows(rawRows);

  const prompt = `Tu analyses une feuille Excel listant des jalons (milestones) d'une roadmap projet.

Voici les ${sample.length} premieres lignes, chaque ligne etant un tableau de cellules (index 0 = premiere colonne) :
${JSON.stringify(sample, null, 2)}

1. Identifie l'index (0-based) de la ligne d'en-tete (pas forcement la ligne 0).
2. Identifie l'index de colonne (0-based) pour "title" (titre du jalon) et "date" (sa date).

Reponds UNIQUEMENT avec ce JSON, sans texte autour, sans balises markdown :
{
  "headerRowIndex": <index de la ligne d'en-tete>,
  "mapping": { "title": <index de colonne ou null>, "date": <index de colonne ou null> },
  "dateFormat": "<dd/MM/yyyy | dd/MM/yy | MM/dd/yyyy | yyyy-MM-dd | dd-MM-yyyy | unknown>"
}`;

  const text = await callClaude(prompt);
  return extractJson<SimpleMapping>(text);
}

// --- Import depuis une image (extraction vision) ---------------------------------------------
//
// Contrairement a l'Excel, il n'existe pas de parsing deterministe des pixels d'une image :
// le modele doit lui-meme produire la grille de cellules en sortie (rawRows), en plus du
// mapping. Un seul appel fait extraction + mapping + hierarchie, pour ne pas payer deux fois
// le cout de la grille (une fois en sortie du 1er appel, une fois en entree du 2e).
//
// Tout ce qui suit ce point (transformation deterministe des lignes, detection Epic/US par
// numerotation, validation des dates, matching owner) reste dans lib/import-transform.ts,
// exactement le meme code que pour l'Excel : le modele ne fait jamais la transformation finale,
// seulement l'extraction + le mapping, comme pour l'Excel.
//
// Deux mises en page tres differentes doivent etre gerees par le meme prompt :
// - TABLEAU : grille de texte classique, un peu comme une capture d'Excel.
// - CHRONOLOGIQUE (Gantt / swimlane) : des barres colorees positionnees sous un axe de dates,
//   avec des etiquettes de categorie a gauche qui ne sont PAS des donnees mais des regroupements
//   visuels. Teste sur Bubble Plan et Roadmunk : sans instruction dediee, le modele confond les
//   etiquettes de categorie avec les taches elles-memes et ignore les barres (et leurs dates).

const MAX_IMAGE_ROWS = 200;
const MAX_IMAGE_COLUMNS = 30;
const VISION_MAX_TOKENS = 6000;

export type ImageExtractionResult = {
  viewType?: "table" | "timeline";
  headerRowIndex: number;
  rawRows: unknown[][];
  mapping: MainSheetMapping["mapping"];
  dateFormat: string;
  statusValueMap: Record<string, string>;
  milestoneTruthyValues: string[];
  hierarchy: HierarchyMapping;
  truncated: boolean;
};

async function callClaudeVision(prompt: string, base64Data: string, mediaType: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY manquante : ajoute ta cle dans le fichier .env.");
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: VISION_MAX_TOKENS,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
            { type: "text", text: prompt },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Erreur API Claude (${res.status}) : ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const text: string =
    data.content
      ?.map((block: { type: string; text?: string }) => (block.type === "text" ? block.text ?? "" : ""))
      .join("") ?? "";

  if (!text.trim()) {
    throw new Error("Reponse vide de l'API Claude.");
  }

  return text;
}

export async function extractAndMapFromImage(base64Data: string, mediaType: string): Promise<ImageExtractionResult> {
  const currentYear = new Date().getFullYear();

  const prompt = `Tu es un assistant qui extrait le contenu d'une image montrant une roadmap ou un planning projet, pour preparer son import dans une application de suivi.

ETAPE 0 - Identifie d'abord le type de mise en page :
- "table" : une grille de texte classique (comme une capture d'Excel), lignes et colonnes nettes, une valeur par cellule.
- "timeline" : une vue Gantt/swimlane, avec des barres colorees ayant une duree, positionnees sous un axe de dates/periodes en haut (ex Q1/Q2/Q3, Janvier/Fevrier/Mars), et des etiquettes de categorie a gauche (ex "MILESTONES", "OPERATIONS", "DELIVERABLES").

Le traitement differe fortement selon le cas, suis exactement les instructions correspondantes.

=== CAS "table" ===

1. Reconstruis le contenu sous forme d'un tableau de lignes, chaque ligne etant un tableau de valeurs de cellules (texte), dans l'ordre logique de lecture (haut vers bas). Inclus la ligne d'en-tete si elle existe.
2. Identifie l'index (0-based) de la ligne d'en-tete si elle existe (sinon 0).
3. Mapping de colonnes (index 0-based) : title, startDate, endDate, status, progress (si colonne dediee), owner (si colonne dediee), isMilestone (uniquement si signal clair et dedie).
4. Hierarchie Epic/sous-item : colonne "Type" explicite avec des valeurs Epic/Phase vs User Story/Tache, OU numerotation dans le titre ("3 - Nom" pour un Epic, "3.1 Nom" pour un sous-item), OU mise en forme visuelle (indentation, gras, taille de police, fond colore) si aucun signal textuel n'existe. Si le signal est visuel, ajoute une colonne supplementaire a la fin de chaque ligne avec "Epic" ou "SousItem" (ou "" si non concerne), et indique son index dans hierarchy.typeColumn avec epicValues=["Epic"], subItemValues=["SousItem"].

=== CAS "timeline" ===

0bis. Une vue "timeline" n'a PAS de ligne d'en-tete (aucune ligne du type "Titre / Debut / Fin / Statut" n'existe visuellement) : mets systematiquement headerRowIndex a -1 dans ce cas, ce qui signifie "toutes les lignes de rawRows sont directement des donnees". Ne cherche jamais une ligne d'en-tete qui n'existe pas dans une vue timeline.

1. VERIFIE EN PREMIER, AVANT TOUTE AUTRE REGLE : une categorie explicitement nommee "Milestones"/"Jalons" (ou equivalent) NE DOIT JAMAIS devenir un Epic, quelle que soit la regle 2 ci-dessous. Ses lignes (ex "Release 1.1", ou tout marqueur isole SANS barre de duree comme une etoile/losange/triangle/drapeau positionne sur l'axe temporel) doivent etre extraites comme JALONS et non comme taches : ajoute une colonne isMilestone dediee (valeur "OUI"/"NON") si necessaire, indique-la dans mapping.isMilestone avec milestoneTruthyValues=["OUI"]. Cette categorie ne recoit NI ligne Epic (regle 2) NI marquage "SousItem" (regle 5) : elle est entierement traitee par isMilestone, en dehors du mecanisme de hierarchie. N'emets JAMAIS de ligne pour le nom de la categorie elle-meme (ex "Milestones", "Jalons") : seuls les jalons individuels qu'elle contient (ex "Release 1.1") deviennent des lignes. La date du jalon suit la meme regle de precision qu'au point 4.

2. Chaque AUTRE etiquette de categorie a gauche (c'est a dire toutes celles qui ne sont PAS une categorie Milestones/Jalons deja traitee au point 1 ; ex "OPERATIONS", "DELIVERABLES", "RESEARCH") DOIT devenir une ligne a part entiere dans rawRows : son titre = le nom de la categorie, tous les autres champs (dates, statut, progress, owner) a null, positionnee juste AVANT les barres qui lui appartiennent. Cette ligne sert d'ancrage necessaire au regroupement Epic (point 5) : sans elle, ses sous-items ne peuvent pas etre rattaches, ne l'omets jamais.

3. Si une categorie contient elle-meme des sous-lignes qui ne contiennent QU'un nom de personne (aucune barre coloree avec une duree dessus, juste un nom, ex "ALEX", "CARLY" sous "DELIVERABLES") : N'EMETS JAMAIS DE LIGNE dans rawRows pour cette ligne-nom elle-meme, meme si elle ressemble a une sous-tache. Utilise UNIQUEMENT ce nom comme valeur du champ owner pour toutes les barres situees sous cette ligne-nom, jusqu'a la ligne-nom suivante ou la fin de la categorie. Une ligne-nom ne doit jamais apparaitre comme owner d'elle-meme dans rawRows : elle n'existe que pour renseigner le owner des lignes qui suivent.

4. Chaque BARRE coloree ayant une duree horizontale devient une ligne dans rawRows. Le titre = le texte ecrit sur la barre (ou juste a cote si le texte deborde ou est tronque). Si un pourcentage accompagne le titre (entre parentheses, ex "Design Goals and Specs (30%)") OU si une barre de progression separee avec un pourcentage ecrit dessous/dedans est visible sous la tache, extrais cette valeur dans une colonne progress dediee que tu ajoutes si besoin, et retire un eventuel "(XX%)" du titre extrait.

5. Dates : deduis la date de debut et de fin de chaque barre a partir de sa position horizontale par rapport aux en-tetes de periodes (trimestre/mois/annee) en haut de l'image. Precision attendue : au niveau de la periode affichee (debut = premier jour de la periode ou demarre la barre, fin = dernier jour de la periode ou elle se termine), jamais au jour pres puisque rien ne l'indique precisement. Si l'annee n'est pas visible dans les en-tetes, utilise l'annee ${currentYear} par defaut. Utilise directement le format yyyy-MM-dd pour dateFormat et pour les valeurs de date que tu extrais.

6. Hierarchie Epic/sous-item (ne s'applique JAMAIS a la categorie Milestones/Jalons du point 1) : marque la ligne de categorie du point 2 avec la valeur "Epic", et TOUTES les barres qui s'y trouvent (quelle que soit la ligne-nom de personne sous laquelle elles sont, point 3) avec la valeur "SousItem", sur un seul niveau. Si une barre a elle-meme une sous-barre visuellement rattachee (ex un chevron d'expansion et une ligne juste en dessous), marque aussi cette sous-barre "SousItem" directement rattachee a la meme categorie, au meme niveau que les autres : ne tente pas de representer un 3e niveau, l'application n'en gere qu'un seul (Epic -> sous-item). Ajoute une colonne supplementaire a la fin de chaque ligne avec "Epic", "SousItem", ou "" pour les lignes non concernees (ex une ligne de jalon du point 1), indique son index dans hierarchy.typeColumn avec epicValues=["Epic"], subItemValues=["SousItem"].

=== Regle commune aux deux cas ===

IMPORTANT : toutes les lignes de rawRows doivent avoir EXACTEMENT le meme nombre de colonnes et le meme sens pour chaque position (ex: si la colonne 0 est le titre pour une ligne, elle doit etre le titre pour TOUTES les lignes, meme logique pour chaque colonne suivante). Si une valeur est absente pour une ligne donnee, mets null a cet endroit precis plutot que de decaler les colonnes suivantes.

Ne devine JAMAIS un texte que tu ne lis pas clairement : si une valeur est illisible, mets null plutot que d'inventer. Limite-toi a au maximum ${MAX_IMAGE_ROWS} lignes et ${MAX_IMAGE_COLUMNS} colonnes ; si l'image semble en contenir davantage, extrais les ${MAX_IMAGE_ROWS} premieres et indique truncated:true.

Reponds UNIQUEMENT avec un objet JSON strictement valide, sans texte autour, sans balises markdown, exactement dans ce format :
{
  "viewType": "table" ou "timeline",
  "rawRows": [["...", "...", ...], ...],
  "truncated": <true ou false>,
  "headerRowIndex": <index, ou -1 si la vue est timeline et n'a pas de ligne d'en-tete>,
  "mapping": {
    "title": <index ou null>,
    "startDate": <index ou null>,
    "endDate": <index ou null>,
    "status": <index ou null>,
    "progress": <index ou null>,
    "owner": <index ou null>,
    "isMilestone": <index ou null>
  },
  "dateFormat": "<dd/MM/yyyy | dd/MM/yy | MM/dd/yyyy | yyyy-MM-dd | dd-MM-yyyy | unknown>",
  "statusValueMap": { "<valeur brute de statut>": "<TODO, IN_PROGRESS, BLOCKED ou DONE>" },
  "milestoneTruthyValues": ["<valeurs brutes signifiant vrai pour isMilestone, sinon []>"],
  "hierarchy": {
    "typeColumn": <index ou null>,
    "epicValues": ["..."],
    "subItemValues": ["..."]
  }
}`;

  const text = await callClaudeVision(prompt, base64Data, mediaType);
  const parsed = extractJson<ImageExtractionResult>(text);

  if (!Array.isArray(parsed.rawRows)) {
    throw new Error("L'extraction n'a pas renvoye de tableau de lignes exploitable.");
  }

  // Garde-fous : on ne fait jamais confiance a 100% aux limites annoncees par le modele
  // lui-meme, meme si le prompt les demande explicitement.
  parsed.rawRows = parsed.rawRows
    .slice(0, MAX_IMAGE_ROWS)
    .map((row) => (Array.isArray(row) ? row.slice(0, MAX_IMAGE_COLUMNS) : []));

  if (!parsed.hierarchy || typeof parsed.hierarchy !== "object") {
    parsed.hierarchy = { typeColumn: null, epicValues: [], subItemValues: [] };
  } else {
    parsed.hierarchy.epicValues = Array.isArray(parsed.hierarchy.epicValues) ? parsed.hierarchy.epicValues : [];
    parsed.hierarchy.subItemValues = Array.isArray(parsed.hierarchy.subItemValues)
      ? parsed.hierarchy.subItemValues
      : [];
  }

  return parsed;
}
