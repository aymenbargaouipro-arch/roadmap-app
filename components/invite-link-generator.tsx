"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Check, Link2, Ban } from "lucide-react";

type ActiveInvite = {
  id: string;
  role: "ADMIN" | "MEMBER";
  createdAt: string;
  expiresAt: string;
  maxUses: number | null;
  useCount: number;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function InviteLinkGenerator({ workspaceId }: { workspaceId: string }) {
  const [role, setRole] = useState("MEMBER");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invites, setInvites] = useState<ActiveInvite[]>([]);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/invites`);
    if (res.ok) setInvites(await res.json());
  }, [workspaceId]);

  useEffect(() => {
    loadInvites();
  }, [loadInvites]);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
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
      loadInvites();
    } else {
      setError(data.error ?? "Impossible de générer le lien.");
    }
  }

  async function handleCopy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRevoke(inviteId: string) {
    setError(null);
    const res = await fetch(`/api/workspaces/${workspaceId}/invites/${inviteId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setConfirmRevokeId(null);
    if (!res.ok) {
      setError(data.error ?? "Impossible de révoquer ce lien.");
      return;
    }
    setLink(null);
    loadInvites();
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
      {error && <p className="text-xs text-red-400">{error}</p>}
      <p className="text-[11px] text-ink-muted">
        Chaque lien est valable 7 jours. Un lien Membre peut servir à plusieurs personnes, un lien Admin ne sert
        qu'une seule fois. Copie le lien maintenant : il ne sera plus affiché ensuite, mais tu pourras le révoquer
        ci-dessous.
      </p>

      {invites.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Liens actifs ({invites.length})
          </h4>
          <ul className="divide-y divide-border rounded-md border border-border">
            {invites.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-xs">
                <span className="rounded-full bg-background px-2 py-0.5 font-medium text-ink-muted">
                  {inv.role === "ADMIN" ? "Admin" : "Membre"}
                </span>
                <span className="text-ink-muted">Créé le {formatDate(inv.createdAt)}</span>
                <span className="text-ink-muted">· expire le {formatDate(inv.expiresAt)}</span>
                <span className="text-ink-muted">
                  · {inv.useCount} utilisation{inv.useCount > 1 ? "s" : ""}
                  {inv.maxUses != null ? ` sur ${inv.maxUses}` : ""}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  {confirmRevokeId === inv.id ? (
                    <>
                      <button
                        onClick={() => handleRevoke(inv.id)}
                        className="rounded-md px-2 py-1 font-medium text-red-400 hover:bg-red-500/10"
                      >
                        Confirmer
                      </button>
                      <button
                        onClick={() => setConfirmRevokeId(null)}
                        className="rounded-md px-2 py-1 text-ink-muted hover:bg-background"
                      >
                        Annuler
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmRevokeId(inv.id)}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-ink-muted hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Ban size={12} />
                      Révoquer
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
