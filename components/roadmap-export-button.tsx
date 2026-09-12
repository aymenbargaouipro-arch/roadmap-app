"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

export function RoadmapExportButton({ roadmapId, roadmapName }: { roadmapId: string; roadmapName: string }) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function safeFileName(): string {
    return roadmapName.replace(/[^\w\-]+/g, "_").slice(0, 60) || "roadmap";
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleExcelExport() {
    setError(null);
    setExporting(true);
    try {
      const res = await fetch(`/api/roadmaps/${roadmapId}/export`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Erreur ${res.status} lors de l'export.`);
        setExporting(false);
        return;
      }
      const blob = await res.blob();
      downloadBlob(blob, `${safeFileName()}.xlsx`);
      setExporting(false);
    } catch {
      setError("Erreur réseau lors de l'export.");
      setExporting(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleExcelExport}
        disabled={exporting}
        style={{ width: 30, height: 30, padding: 0, flexShrink: 0 }}
        className="flex items-center justify-center rounded-md border border-border bg-surface text-ink-muted transition-colors hover:bg-background disabled:opacity-50"
        title={exporting ? "Génération..." : "Télécharger Excel"}
      >
        {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
      </button>

      {error && (
        <p className="absolute left-0 top-full z-50 mt-1 w-56 rounded-md border border-status-blocked/40 bg-surface p-2 text-[11px] text-status-blocked">
          {error}
        </p>
      )}
    </div>
  );
}
