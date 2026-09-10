"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JiraIcon } from "@/components/jira-icon";

export function ConsolidatedJiraSyncButton({ roadmapIds }: { roadmapIds: string[] }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleSyncAll() {
    setSyncing(true);
    setResult(null);

    const settled = await Promise.allSettled(
      roadmapIds.map((id) => fetch(`/api/roadmaps/${id}/sync-jira`, { method: "POST" }).then((r) => r.json()))
    );

    let created = 0;
    let updated = 0;
    let hidden = 0;
    let dependencies = 0;
    let failed = 0;
    for (const s of settled) {
      if (s.status === "fulfilled" && !s.value.error) {
        created += s.value.summary?.created ?? 0;
        updated += s.value.summary?.updated ?? 0;
        hidden += s.value.summary?.hidden ?? 0;
        dependencies += (s.value.summary?.dependenciesCreated ?? 0) + (s.value.summary?.dependenciesUpdated ?? 0);
      } else {
        failed += 1;
      }
    }

    const parts = [`${created} créé${created > 1 ? "s" : ""}`, `${updated} mis à jour`];
    if (dependencies > 0) parts.push(`${dependencies} dépendance(s)`);
    if (hidden > 0) parts.push(`${hidden} masqué(s) (Jira)`);
    if (failed > 0) parts.push(`${failed} roadmap${failed > 1 ? "s" : ""} en échec`);
    setResult(parts.join(", "));

    setSyncing(false);
    router.refresh();
  }

  if (roadmapIds.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        style={{ width: 30, height: 30, padding: 0, flexShrink: 0 }}
        className="border-transparent bg-white hover:bg-white/90"
        onClick={handleSyncAll}
        disabled={syncing}
        title="Actualiser"
        aria-label={`Actualiser Jira (${roadmapIds.length} roadmap${roadmapIds.length > 1 ? "s" : ""})`}
      >
        <span style={{ width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {syncing ? <RefreshCw size={16} className="animate-spin text-ink-muted" /> : <JiraIcon size={16} />}
        </span>
      </Button>
      {result && <span className="text-xs text-ink-muted">{result}</span>}
    </div>
  );
}
