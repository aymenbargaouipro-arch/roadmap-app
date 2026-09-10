"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JiraIcon } from "@/components/jira-icon";

type SyncSummary = {
  created: number;
  updated: number;
  skippedNoDates: number;
  epics: number;
  items: number;
  hidden: number;
  dependenciesCreated: number;
  dependenciesUpdated: number;
  writebackFailures: number;
};

export function JiraSyncButton({ roadmapId }: { roadmapId: string }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SyncSummary | null>(null);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setSummary(null);
    try {
      const res = await fetch(`/api/roadmaps/${roadmapId}/sync-jira`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Erreur ${res.status}.`);
        return;
      }
      setSummary(data.summary);
      router.refresh();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        style={{ width: 30, height: 30, padding: 0, flexShrink: 0 }}
        className="border-transparent bg-white hover:bg-white/90"
        onClick={handleSync}
        disabled={syncing}
        title="Actualiser"
        aria-label="Actualiser depuis Jira"
      >
        <span style={{ width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {syncing ? <RefreshCw size={16} className="animate-spin text-ink-muted" /> : <JiraIcon size={16} />}
        </span>
      </Button>
      {error && <span className="text-xs text-status-blocked">{error}</span>}
      {summary && !error && (
        <span className="text-xs text-ink-muted">
          {summary.created} créé{summary.created > 1 ? "s" : ""}, {summary.updated} mis à jour
          {summary.skippedNoDates > 0 ? `, ${summary.skippedNoDates} ignoré(s) (dates manquantes)` : ""}
          {summary.hidden > 0 ? (
            <span className="text-status-blocked">{`, ${summary.hidden} masqué(s) (dates manquantes ou supprimé)`}</span>
          ) : (
            ""
          )}
          {summary.dependenciesCreated + summary.dependenciesUpdated > 0
            ? `, ${summary.dependenciesCreated + summary.dependenciesUpdated} dépendance(s)`
            : ""}
          {summary.writebackFailures > 0 && (
            <span className="text-status-blocked">
              {` · ${summary.writebackFailures} écriture(s) vers Jira échouée(s)`}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
