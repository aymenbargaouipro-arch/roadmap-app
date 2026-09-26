import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InviteLinkGenerator } from "@/components/invite-link-generator";
import { MemberList } from "@/components/member-list";
import { ShieldAlert } from "lucide-react";

export default async function MembersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) redirect("/workspace/new");

  if (membership.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface py-20 text-center">
        <ShieldAlert className="mb-3 text-ink-muted" size={28} />
        <h2 className="text-base font-medium text-ink">Réservé aux administrateurs</h2>
        <p className="mt-1 max-w-sm text-sm text-ink-muted">
          Seuls les admins de l'espace peuvent gérer les membres et générer des invitations.
        </p>
      </div>
    );
  }

  const members = await prisma.membership.findMany({
    where: { workspaceId: membership.workspaceId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Membres</h1>
        <p className="text-sm text-ink-muted">Gère les accès à ton espace de travail.</p>
      </div>

      <InviteLinkGenerator workspaceId={membership.workspaceId} />

      <MemberList
        workspaceId={membership.workspaceId}
        currentUserId={session.user.id}
        members={members.map((m) => ({
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
          role: m.role,
        }))}
      />
    </div>
  );
}

