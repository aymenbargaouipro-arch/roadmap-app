export { default } from "next-auth/middleware";

// Protection des pages par NextAuth : toute page hors login/register/invite exige une session.
// La page d'invitation (/invite/<jeton>) reste accessible sans connexion : elle affiche
// elle-meme les boutons "Se connecter" et "Creer un compte" en conservant le lien d'invitation
// (parametre next). L'acceptation passe toujours par /api/invites/<jeton>/accept, qui exige
// une session.
// Le blocage de /_next/image est gere dans next.config.mjs (images.unoptimized), car cette
// route est traitee par Next.js avant le middleware.
export const config = {
  matcher: ["/((?!login|register|invite/|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
