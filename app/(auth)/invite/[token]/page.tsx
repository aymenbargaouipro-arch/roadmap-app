import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AcceptInviteButton } from "@/components/accept-invite-button";

export default async function InvitePage({ params }: { params: { token: string } }) {
  const invite = await prisma.invite.findUnique({
    where: { token: params.token },
    include: { workspace: true },
  });

  const session = await getServerSession(authOptions);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{invite ? `Rejoindre ${invite.workspace.name}` : "Invitation invalide"}</CardTitle>
          <CardDescription>
            {invite
              ? `Vous êtes invité à rejoindre cet espace en tant que ${invite.role === "ADMIN" ? "administrateur" : "membre"}.`
              : "Ce lien d'invitation n'existe plus ou a été mal copié."}
          </CardDescription>
        </CardHeader>
        {invite && (
          <CardContent>
            {session?.user ? (
              <AcceptInviteButton token={params.token} />
            ) : (
              <div className="flex flex-col gap-2">
                <Link
                  href={`/login?next=/invite/${params.token}`}
                  className="rounded-md bg-accent px-4 py-2 text-center text-sm font-medium text-accent-foreground hover:bg-accent-hover"
                >
                  Se connecter
                </Link>
                <Link
                  href={`/register?next=/invite/${params.token}`}
                  className="rounded-md border border-border bg-surface px-4 py-2 text-center text-sm font-medium text-ink hover:bg-background"
                >
                  Créer un compte
                </Link>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
