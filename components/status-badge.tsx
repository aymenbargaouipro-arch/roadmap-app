import { cn } from "@/lib/utils";

const ITEM_STATUS_LABELS: Record<string, string> = {
  TODO: "À faire",
  IN_PROGRESS: "En cours",
  BLOCKED: "Bloqué",
  DONE: "Terminé",
};

const ITEM_STATUS_COLORS: Record<string, string> = {
  TODO: "bg-status-todo/20 text-status-todo",
  IN_PROGRESS: "bg-status-progress/20 text-status-progress",
  BLOCKED: "bg-status-blocked/20 text-status-blocked",
  DONE: "bg-status-done/20 text-status-done",
};

export function ItemStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        ITEM_STATUS_COLORS[status]
      )}
    >
      {ITEM_STATUS_LABELS[status] ?? status}
    </span>
  );
}

const RISK_LEVEL_LABELS: Record<string, string> = {
  LOW: "Faible",
  MEDIUM: "Moyen",
  HIGH: "Fort",
};

export function RiskLevelBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    LOW: "bg-status-todo/20 text-status-todo",
    MEDIUM: "bg-status-progress/20 text-status-progress",
    HIGH: "bg-status-blocked/20 text-status-blocked",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        colors[level]
      )}
    >
      {RISK_LEVEL_LABELS[level] ?? level}
    </span>
  );
}

export function HealthBadge({ health }: { health: "green" | "orange" | "red" }) {
  const config = {
    green: { label: "Sain", classes: "bg-status-done/20 text-status-done" },
    orange: { label: "À surveiller", classes: "bg-status-progress/20 text-status-progress" },
    red: { label: "Critique", classes: "bg-status-blocked/20 text-status-blocked" },
  }[health];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        config.classes
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {config.label}
    </span>
  );
}
