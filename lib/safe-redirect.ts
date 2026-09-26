// Destination de redirection apres connexion ou inscription (parametre "next", ou
// "callbackUrl" ajoute par NextAuth quand il renvoie vers /login).
// Seules les pages internes de l'application sont acceptees : un lien piege du type
// /login?next=https://site-externe ne peut donc pas renvoyer l'utilisateur vers un autre site
// apres sa connexion (redirection ouverte).
export function safeNextPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  let candidate = raw.trim();
  if (!candidate || candidate.length > 2000) return null;

  // NextAuth transmet une adresse complete (http://localhost:3000/invite/...). On la ramene a
  // un chemin, uniquement si elle pointe vers l'application elle-meme.
  if (!candidate.startsWith("/")) {
    if (typeof window === "undefined") return null;
    try {
      const url = new URL(candidate);
      if (url.origin !== window.location.origin) return null;
      candidate = url.pathname + url.search + url.hash;
    } catch {
      return null;
    }
  }

  // "//site" et "/\site" seraient compris par le navigateur comme une autre adresse.
  if (candidate.startsWith("//") || candidate.includes("\\")) return null;
  // Caracteres de controle (retours a la ligne, tabulations...) refuses.
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return null;

  return candidate;
}
