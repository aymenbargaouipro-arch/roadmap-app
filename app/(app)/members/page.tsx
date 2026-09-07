import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InviteLinkGenerator } from "@/components/invite-link-generator";
import { ShieldAlert, User } from "lucide-react";

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
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Membres</h1>
        <p className="text-sm text-ink-muted">Gère les accès à ton espace de travail.</p>
      </div>

      <InviteLinkGenerator workspaceId={membership.workspaceId} />

      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Membres actuels ({members.length})
          </h2>
        </div>
        <ul className="divide-y divide-border">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-5 py-3.5">
              <User size={14} className="text-ink-muted" />
              <div className="flex-1">
                <p className="text-sm font-medium text-ink">{m.user.name}</p>
                <p className="text-xs text-ink-muted">{m.user.email}</p>
              </div>
              <span className="rounded-full bg-background px-2.5 py-0.5 text-xs font-medium text-ink-muted">
                {m.role === "ADMIN" ? "Admin" : "Membre"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
