import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ImportWizard } from "@/components/import-wizard";

export default async function ImportPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) redirect("/workspace/new");

  const roadmaps = await prisma.roadmap.findMany({
    where: { workspaceId: membership.workspaceId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const members = await prisma.membership.findMany({
    where: { workspaceId: membership.workspaceId },
    select: { user: { select: { id: true, name: true } } },
    orderBy: { user: { name: "asc" } },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Importer une roadmap</h1>
        <p className="text-sm text-ink-muted">
          Charge un fichier Excel ou une image, l'IA identifie les colonnes et tu valides avant création.
        </p>
      </div>
      <ImportWizard roadmaps={roadmaps} members={members.map((m) => ({ id: m.user.id, name: m.user.name }))} />
    </div>
  );
}
