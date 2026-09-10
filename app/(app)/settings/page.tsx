import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ShieldAlert } from "lucide-react";
import { WorkspaceSettingsForm } from "@/components/workspace-settings-form";
import { JiraSettingsForm } from "@/components/jira-settings-form";

export default async function SettingsPage() {
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
          Les paramètres du workspace sont visibles uniquement par les admins.
        </p>
      </div>
    );
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: membership.workspaceId },
    select: {
      healthLateRatioRedThreshold: true,
      healthLateCountOrangeThreshold: true,
      healthBlockedItemTriggersRed: true,
      healthActiveDependencyTriggersRed: true,
      healthHighRiskTriggersRed: true,
      healthMediumRiskTriggersOrange: true,
      sprintReferenceDate: true,
      sprintDurationWeeks: true,
      sprintReferenceNumber: true,
      jiraSiteUrl: true,
      jiraEmail: true,
      jiraConnectedAt: true,
    },
  });

  // Date-only (yyyy-MM-dd) pour l'input type="date" du formulaire de sprints.
  const sprintReferenceDateStr = workspace?.sprintReferenceDate
    ? workspace.sprintReferenceDate.toISOString().slice(0, 10)
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Paramètres</h1>
        <p className="text-sm text-ink-muted">
          Seuils d'alerte de santé, appliqués à tout le workspace (dashboard, roadmaps, vue consolidée).
        </p>
      </div>

      <WorkspaceSettingsForm
        initialHealth={{
          lateRatioRedThreshold: workspace?.healthLateRatioRedThreshold ?? 20,
          lateCountOrangeThreshold: workspace?.healthLateCountOrangeThreshold ?? 1,
          blockedItemTriggersRed: workspace?.healthBlockedItemTriggersRed ?? true,
          activeDependencyTriggersRed: workspace?.healthActiveDependencyTriggersRed ?? true,
          highRiskTriggersRed: workspace?.healthHighRiskTriggersRed ?? true,
          mediumRiskTriggersOrange: workspace?.healthMediumRiskTriggersOrange ?? true,
        }}
        initialSprint={{
          referenceDate: sprintReferenceDateStr,
          durationWeeks: workspace?.sprintDurationWeeks ?? null,
          referenceNumber: workspace?.sprintReferenceNumber ?? null,
        }}
      />

      <div className="mt-2 flex flex-col gap-1 border-t border-border pt-6">
        <h2 className="text-lg font-semibold text-ink">Intégrations</h2>
        <p className="text-sm text-ink-muted">Connecte des outils externes pour synchroniser tes roadmaps.</p>
      </div>

      <JiraSettingsForm
        initial={{
          siteUrl: workspace?.jiraSiteUrl ?? null,
          email: workspace?.jiraEmail ?? null,
          connectedAt: workspace?.jiraConnectedAt ? workspace.jiraConnectedAt.toISOString() : null,
        }}
      />
    </div>
  );
}
