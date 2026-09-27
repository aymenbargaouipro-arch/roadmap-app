import { randomBytes } from "crypto";
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { clearLoginFailures, clientIpFromHeaders, isLoginBlocked, recordLoginFailure } from "@/lib/rate-limit";

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

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
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
        if (isLoginBlocked(email, ip)) return null;

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
          recordLoginFailure(email, ip);
          return null;
        }

        clearLoginFailures(email);
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) (session.user as { id?: string }).id = token.id as string;
      return session;
    },
  },
};
