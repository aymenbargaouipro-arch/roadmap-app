"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Check, Link2 } from "lucide-react";

export function InviteLinkGenerator({ workspaceId }: { workspaceId: string }) {
  const [role, setRole] = useState("MEMBER");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    const res = await fetch(`/api/workspaces/${workspaceId}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok && data.token) {
      setLink(`${window.location.origin}/invite/${data.token}`);
      setCopied(false);
    }
  }

  async function handleCopy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <Link2 size={14} className="text-accent" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Inviter des membres</h3>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-ink-muted">Rôle</label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MEMBER">Membre</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={handleGenerate} disabled={loading}>
          {loading ? "..." : "Générer un lien"}
        </Button>
      </div>
      {link && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
          <input
            readOnly
            value={link}
            className="flex-1 bg-transparent text-xs text-ink-muted outline-none"
            onFocus={(e) => e.target.select()}
          />
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copié" : "Copier"}
          </button>
        </div>
      )}
      <p className="text-[11px] text-ink-muted">
        Ce lien est valable sans expiration. Partage-le par email, Slack, ou tout autre moyen — quiconque le
        possède peut rejoindre l'espace avec le rôle choisi.
      </p>
    </div>
  );
}
