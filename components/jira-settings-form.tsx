"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, XCircle } from "lucide-react";

type Initial = {
  siteUrl: string | null;
  email: string | null;
  connectedAt: string | null;
};

export function JiraSettingsForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [siteUrl, setSiteUrl] = useState(initial.siteUrl ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [apiToken, setApiToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(Boolean(initial.connectedAt));

  async function handleConnect() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/jira", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl, email, apiToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Erreur ${res.status}.`);
        return;
      }
      setConnected(true);
      setApiToken("");
      router.refresh();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/jira", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Erreur ${res.status}.`);
        return;
      }
      setConnected(false);
      setSiteUrl("");
      setEmail("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl rounded-lg border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Connexion Jira</h2>
        {connected ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-status-done">
            <CheckCircle2 size={14} />
            Connecté
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted">
            <XCircle size={14} />
            Non connecté
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="jira-site">URL du site Jira</Label>
          <Input
            id="jira-site"
            placeholder="https://mon-domaine.atlassian.net"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="jira-email">Email du compte Jira</Label>
          <Input id="jira-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="jira-token">API Token</Label>
          <Input
            id="jira-token"
            type="password"
            placeholder={connected ? "••••••••  (laisser vide pour ne pas changer)" : ""}
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
          />
          <a
            href="https://id.atlassian.com/manage-profile/security/api-tokens"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-accent hover:underline"
          >
            Créer un token sur id.atlassian.com
          </a>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-status-blocked/40 bg-status-blocked/10 px-3 py-2 text-xs text-status-blocked">
          {error}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button onClick={handleConnect} disabled={saving || !siteUrl || !email || !apiToken}>
          {saving ? "Vérification..." : connected ? "Mettre à jour" : "Connecter"}
        </Button>
        {connected && (
          <Button variant="outline" onClick={handleDisconnect} disabled={saving}>
            Déconnecter
          </Button>
        )}
      </div>
    </div>
  );
}
