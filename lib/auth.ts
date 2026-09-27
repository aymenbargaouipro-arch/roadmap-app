import { randomBytes } from "crypto";
import type { NextAuthOptions, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { clearLoginFailures, clientIpFromHeaders, isLoginBlocked, recordLoginFailure } from "@/lib/rate-limit";

// Duree de vie d'une session sans activite (audit M1-c). Le jeton est renouvele tant que la
// personne utilise l'application (voir components/session-keep-alive.tsx).
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60; // 8 heures

// Empreinte factice, calculee une seule fois avec le meme cout que les vrais mots de passe
// (10) : quand l'email n'existe pas, on la compare quand meme, pour que la reponse prenne le
// meme temps qu'avec un vrai compte (audit M1, pas d'oracle de duree).
let dummyHashPromise: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  dummyHashPromise ??= bcrypt.hash(randomBytes(32).toString("hex"), 10);
  return dummyHashPromise;
}
// Calcul lance des le chargement du module, pour que la toute premiere tentative avec un email
// inconnu ne soit pas plus lente que les suivantes.
void dummyHash();

function headerReader(headers: unknown) {
  return (name: string): string | undefined => {
    const value = (headers as Record<string, unknown> | undefined)?.[name];
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.filter((v) => typeof v === "string").join(",");
    return undefined;
  };
}

// Jeton revoque (audit M1-c) : il ne porte plus aucune identite, et le reste a chaque
// renouvellement. La personne doit se reconnecter.
function revokedToken(): JWT {
  return { id: "", revoked: true };
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;
        if (typeof credentials.email !== "string" || typeof credentials.password !== "string") return null;

        const email = credentials.email.trim().toLowerCase().slice(0, 320);
        const ip = clientIpFromHeaders(headerReader(req?.headers));

        // Trop d'echecs recents pour cet email ou cette IP : refus immediat, avec exactement
        // la meme reponse qu'un mauvais mot de passe (audit M1, limitation de debit).
        if (await isLoginBlocked(email, ip)) return null;

        // Recherche insensible a la casse : "Aymen@..." et "aymen@..." designent le meme compte.
        const user = await prisma.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
        });

        let valid = false;
        if (user) {
          valid = await bcrypt.compare(credentials.password, user.passwordHash);
        } else {
          await bcrypt.compare(credentials.password, await dummyHash());
        }

        if (!user || !valid) {
          await recordLoginFailure(email, ip);
          return null;
        }

        await clearLoginFailures(email);
        return { id: user.id, email: user.email, name: user.name, sessionVersion: user.sessionVersion };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Connexion : on memorise dans le jeton la version de session du compte.
      if (user) {
        token.id = user.id;
        token.sessionVersion = user.sessionVersion ?? 0;
        return token;
      }

      // Jeton deja revoque : il le reste.
      if (token.revoked || !token.id) return revokedToken();

      // Chaque lecture de session verifie en base que le jeton n'a pas ete revoque (bouton
      // "tous les appareils", retrait d'un espace) et que le compte existe toujours.
      const current = await prisma.user.findUnique({
        where: { id: token.id },
        select: { sessionVersion: true },
      });
      if (!current || current.sessionVersion !== (token.sessionVersion ?? 0)) return revokedToken();

      return token;
    },
    async session({ session, token }) {
      // Jeton revoque : session sans utilisateur. Chaque page renvoie alors vers la connexion,
      // chaque route API repond 401, exactement comme sans session.
      if (token.revoked || !token.id) {
        return { expires: session.expires } as unknown as Session;
      }
      if (session.user) session.user.id = token.id;
      return session;
    },
  },
};
