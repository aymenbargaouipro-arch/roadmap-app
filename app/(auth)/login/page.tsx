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

// Instance privee (audit M1) : le lien "Creer un compte" n'est propose qu'a une personne qui
// arrive depuis une invitation.
const INVITE_PATH = /^\/invite\/[A-Za-z0-9_-]{16,64}$/;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // "next" vient des liens de l'app (ex : page d'invitation), "callbackUrl" de la redirection
  // automatique du middleware NextAuth. Les deux sont filtres par safeNextPath.
  const next = safeNextPath(searchParams.get("next") ?? searchParams.get("callbackUrl"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      setError("Email ou mot de passe incorrect.");
      return;
    }
    router.push(next || "/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Se connecter</CardTitle>
          <CardDescription>Accédez à vos roadmaps.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" disabled={loading} className="mt-1">
              {loading ? "Connexion..." : "Se connecter"}
            </Button>
          </form>
          {next && INVITE_PATH.test(next) ? (
            <p className="mt-4 text-center text-sm text-ink-muted">
              Pas encore de compte ?{" "}
              <Link href={`/register?next=${encodeURIComponent(next)}`} className="text-accent hover:underline">
                Créer un compte
              </Link>
            </p>
          ) : (
            <p className="mt-4 text-center text-sm text-ink-muted">
              Pas encore de compte ? Demande une invitation à l'administrateur de ton espace.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
