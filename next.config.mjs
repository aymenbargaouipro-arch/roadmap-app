/** @type {import('next').NextConfig} */

// --- Verification des secrets au demarrage (audit I4) ---------------------------------------
// Avec un NEXTAUTH_SECRET faible ou laisse a sa valeur d'exemple, n'importe qui pourrait
// fabriquer un jeton de session valide et se faire passer pour un autre utilisateur. L'app
// refuse donc de demarrer dans ce cas, plutot que de tourner silencieusement sans protection.
// Ce fichier est lu par "npm run dev", "npm run build" et "npm run start".
const MIN_SECRET_LENGTH = 32;

function checkSecrets() {
  const problems = [];
  const nextAuthSecret = process.env.NEXTAUTH_SECRET ?? "";
  if (!nextAuthSecret) {
    problems.push("NEXTAUTH_SECRET est absent.");
  } else if (/change-me/i.test(nextAuthSecret)) {
    problems.push("NEXTAUTH_SECRET a encore sa valeur d'exemple.");
  } else if (nextAuthSecret.length < MIN_SECRET_LENGTH) {
    problems.push(`NEXTAUTH_SECRET est trop court (${MIN_SECRET_LENGTH} caracteres minimum).`);
  }

  // Facultatif (sert uniquement a l'integration Jira), mais robuste s'il est defini.
  const jiraKey = process.env.JIRA_ENCRYPTION_KEY;
  if (jiraKey && (/change-me/i.test(jiraKey) || jiraKey.length < MIN_SECRET_LENGTH)) {
    problems.push(`JIRA_ENCRYPTION_KEY est trop faible (${MIN_SECRET_LENGTH} caracteres aleatoires minimum).`);
  }

  if (problems.length > 0) {
    throw new Error(
      "\n\n[Apex] Demarrage refuse, configuration de securite insuffisante :\n  - " +
        problems.join("\n  - ") +
        "\nCorrige le fichier .env (voir .env.example), puis relance.\n"
    );
  }
}

checkSecrets();

// En-tetes de securite HTTP (audit M4), envoyes sur toutes les reponses de l'application.
//
// Content-Security-Policy : liste des sources autorisees pour chaque type de ressource.
// - Tout est limite a l'origine de l'app ('self') : aucun script, style, police ou appel
//   reseau vers un site tiers n'est possible depuis le navigateur (les appels Anthropic et
//   Jira sont faits cote serveur, ils ne sont pas concernes).
// - 'unsafe-inline' reste necessaire pour les scripts : Next.js 14 injecte des petits scripts
//   en ligne dans chaque page. Le supprimer demanderait un systeme de "nonce" par requete,
//   a reconsiderer lors de la montee de version Next.js (bloc 9).
// - 'unsafe-eval' et les websockets ne sont autorises qu'en developpement (rechargement a
//   chaud de Next.js), jamais en production.
// - data: et blob: pour les images : logos de roadmap stockes en base64, export Excel.
const isDev = process.env.NODE_ENV === "development";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // Force le HTTPS pendant 2 ans une fois le site servi en HTTPS (ignore par les
  // navigateurs sur http://localhost, donc sans effet en local).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Interdit d'afficher Apex dans une iframe d'un autre site (clickjacking). Doublon de
  // frame-ancestors pour les anciens navigateurs.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig = {
  reactStrictMode: true,
  // Ne revele plus "X-Powered-By: Next.js" (et donc la version du framework) aux visiteurs.
  poweredByHeader: false,
  // Desactive l'optimiseur d'images integre (route /_next/image, audit H3) : Next.js repond
  // alors 404 sur cette route, qui est traitee AVANT le middleware et ne peut donc pas etre
  // bloquee par lui. L'application n'utilise pas next/image, aucun effet visible.
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
