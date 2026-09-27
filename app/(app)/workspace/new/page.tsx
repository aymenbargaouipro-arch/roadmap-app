import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkWorkspaceCreation } from "@/lib/instance-access";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { WorkspaceCreateForm } from "@/components/workspace-create-form";

// Page vers laquelle sont renvoyes les comptes sans espace. Sur une instance privee (audit M1),
// le formulaire de creation n'apparait que pour l'amorcage (aucun espace dans l'instance) ;
// sinon, la page explique comment rejoindre un espace.
export default async function NewWorkspacePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const check = await checkWorkspaceCreation(prisma, session.user.id);
  if (!check.allowed && check.reason === "already_member") redirect("/dashboard");

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>{check.allowed ? "Créer votre espace de travail" : "Aucun espace de travail"}</CardTitle>
          <CardDescription>
            {check.allowed
              ? "Un espace regroupe les roadmaps de votre programme. Vous pourrez inviter votre équipe ensuite."
              : "Ton compte n'est rattaché à aucun espace. Cette instance Apex est privée : demande une invitation à l'administrateur d'un espace, puis ouvre le lien reçu."}
          </CardDescription>
        </CardHeader>
        {check.allowed && (
          <CardContent>
            <WorkspaceCreateForm />
          </CardContent>
        )}
      </Card>
    </div>
  );
}
