import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }

  // Version de session du compte, recopiee dans le jeton a la connexion (audit M1-c).
  interface User {
    sessionVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    // Version de session du compte au moment de la connexion (audit M1-c).
    sessionVersion?: number;
    // Vrai quand le jeton a ete revoque : il ne donne plus acces a rien.
    revoked?: boolean;
  }
}
