export { default } from "next-auth/middleware";

// Protection des pages par NextAuth : toute page hors login/register exige une session.
// Le blocage de /_next/image est gere dans next.config.mjs (images.unoptimized), car cette
// route est traitee par Next.js avant le middleware.
export const config = {
  matcher: ["/((?!login|register|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
