import Link from "next/link";
import { Flag, TriangleAlert } from "lucide-react";
import { HealthBadge } from "@/components/status-badge";
import { DEFAULT_ROADMAP_COLOR, withAlpha } from "@/lib/roadmap-theme";
import type { Health } from "@/lib/health";

type RiskLike = { title: string; status: string; impact: string; probability: string };
type MilestoneLike = { title: string; date: Date };
type ItemLike = { status: string; progress: number; updatedAt: Date };

export type RoadmapCardProps = {
  id: string;
  name: string;
  health: Health;
  items: ItemLike[];
  risks: RiskLike[];
  milestones: MilestoneLike[];
  color: string | null;
  icon: string | null;
  logoUrl: string | null;
};

const RISK_SCORE: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

// Avatar generique en attendant la vraie couleur/icone d'equipe (chantier de
// personnalisation par roadmap, pas encore livre) : initiales du nom d'equipe, ton accent
// neutre. Sera remplace automatiquement une fois la personnalisation disponible.
function pickInitials(name: string): string {
  const team = name.split("·")[0].trim();
  return team.slice(0, 2).toUpperCase() || "?";
}

function pickTopRisk(risks: RiskLike[]): RiskLike | null {
  const open = risks.filter((r) => r.status === "OPEN");
  if (open.length === 0) return null;
  return open.reduce((best, r) => {
    const score = (RISK_SCORE[r.impact] ?? 0) + (RISK_SCORE[r.probability] ?? 0);
    const bestScore = (RISK_SCORE[best.impact] ?? 0) + (RISK_SCORE[best.probability] ?? 0);
    return score > bestScore ? r : best;
  }, open[0]);
}

function pickNextMilestone(milestones: MilestoneLike[]): MilestoneLike | null {
  const now = new Date();
  const upcoming = milestones
    .filter((m) => m.date >= now)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  return upcoming[0] ?? null;
}

function relativeDays(date: Date): string {
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
  if (days === 0) return "aujourd'hui";
  return `il y a ${days} j`;
}

export function RoadmapCard({ id, name, health, items, risks, milestones, color, icon, logoUrl }: RoadmapCardProps) {
  const initials = pickInitials(name);
  const displayColor = color ?? DEFAULT_ROADMAP_COLOR;
  const avgProgress =
    items.length > 0 ? Math.round(items.reduce((sum, i) => sum + i.progress, 0) / items.length) : 0;

  const statusCounts = {
    todo: items.filter((i) => i.status === "TODO").length,
    inProgress: items.filter((i) => i.status === "IN_PROGRESS").length,
    blocked: items.filter((i) => i.status === "BLOCKED").length,
    done: items.filter((i) => i.status === "DONE").length,
  };

  const topRisk = pickTopRisk(risks);
  const nextMilestone = pickNextMilestone(milestones);
  const lastUpdated = items.length > 0 ? new Date(Math.max(...items.map((i) => i.updatedAt.getTime()))) : null;

  return (
    <Link href={`/roadmaps/${id}`}>
      <div className="flex h-full flex-col gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent/40">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm"
              style={{ backgroundColor: withAlpha(displayColor, "26") }}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                icon ?? initials
              )}
            </span>
            <span className="truncate text-sm font-semibold text-ink">{name}</span>
          </div>
          <div className="shrink-0">
            <HealthBadge health={health} />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
            <span>Avancement</span>
            <span>{avgProgress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-background">
            <div className="h-full rounded-full" style={{ width: `${avgProgress}%`, backgroundColor: displayColor }} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          <span className="text-ink-muted">{statusCounts.todo} à faire</span>
          <span className="text-status-progress">{statusCounts.inProgress} en cours</span>
          <span className="text-status-blocked">{statusCounts.blocked} bloqué</span>
          <span className="text-accent">{statusCounts.done} terminé</span>
        </div>

        <div className="mt-auto flex flex-col gap-1.5 border-t border-border pt-3 text-xs">
          <div className="flex items-center gap-1.5 text-ink-muted">
            <Flag size={12} className="shrink-0" />
            {nextMilestone ? (
              <span className="truncate">
                {nextMilestone.title} ·{" "}
                {nextMilestone.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
              </span>
            ) : (
              <span>Aucun jalon à venir</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-ink-muted">
            <TriangleAlert size={12} className="shrink-0" />
            {topRisk ? <span className="truncate">{topRisk.title}</span> : <span>Aucun risque ouvert</span>}
          </div>
          {lastUpdated && <p className="text-[11px] text-ink-muted">Mis à jour {relativeDays(lastUpdated)}</p>}
        </div>
      </div>
    </Link>
  );
}
