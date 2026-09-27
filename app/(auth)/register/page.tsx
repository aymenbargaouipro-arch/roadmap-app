"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { safeNextPath } from "@/lib/safe-redirect";

// Instance privee (audit M1) : on s'inscrit avec le lien d'invitation, dont le jeton arrive
// dans le parametre next (/invite/<jeton>). Le serveur reste seul juge du droit d'entree.
const INVITE_PATH = /^\/invite\/([A-Za-z0-9_-]{16,64})$/;

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const inviteToken = next ? (INVITE_PATH.exec(next)?.[1] ?? null) : null;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, inviteToken }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error ?? "Une erreur est survenue.");
      setLoading(false);
      return;
    }

    // Inscription par invitation : le compte a deja rejoint l'espace, le lien peut etre epuise
    // (lien Admin a usage unique). On va donc directement au dashboard, pas sur l'invitation.
    const destination = inviteToken ? "/dashboard" : next || "/dashboard";

    const signInRes = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);

    if (signInRes?.error) {
      router.push(`/login?next=${encodeURIComponent(destination)}`);
      return;
    }
    router.push(destination);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Créer un compte</CardTitle>
          <CardDescription>
            {inviteToken
              ? "Crée ton compte pour rejoindre l'espace qui t'invite."
              : "L'inscription se fait sur invitation : utilise le lien reçu de ton administrateur."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Nom</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <p className="text-xs text-ink-muted">8 caractères minimum.</p>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" disabled={loading} className="mt-1">
              {loading ? "Création..." : "Créer mon compte"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-ink-muted">
            Déjà un compte ?{" "}
            <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="text-accent hover:underline">
              Se connecter
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
