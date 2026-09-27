"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { LogOut, MonitorSmartphone } from "lucide-react";

// Barre du haut. "Tous les appareils" (audit M1-c) revoque toutes les sessions du compte,
// y compris celle-ci ; un second clic de confirmation evite un declenchement par erreur.
export function Topbar({ userName }: { userName: string }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // La demande de confirmation s'annule seule apres 5 secondes.
  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 5000);
    return () => clearTimeout(timer);
  }, [confirming]);

  async function handleSignOutEverywhere() {
    if (!confirming) {
      setError(null);
      setConfirming(true);
      return;
    }
    setBusy(true);
    const res = await fetch("/api/account/sessions", { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) {
      setBusy(false);
      setConfirming(false);
      setError("Échec, réessaie.");
      return;
    }
    await signOut({ callbackUrl: "/login" });
  }

  return (
    <header className="flex h-14 items-center justify-end border-b border-border bg-surface px-6">
      <div className="flex items-center gap-3">
        <span className="text-sm text-ink-muted">{userName}</span>
        {error && <span className="text-xs text-red-400">{error}</span>}
        <button
          onClick={handleSignOutEverywhere}
          disabled={busy}
          title="Fermer toutes tes sessions ouvertes, sur tous tes appareils"
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm hover:bg-background disabled:opacity-50 ${
            confirming ? "text-red-400 hover:text-red-300" : "text-ink-muted hover:text-ink"
          }`}
        >
          <MonitorSmartphone size={14} />
          {busy ? "..." : confirming ? "Confirmer : tout déconnecter" : "Tous les appareils"}
        </button>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-ink-muted hover:bg-background hover:text-ink"
        >
          <LogOut size={14} />
          Déconnexion
        </button>
      </div>
    </header>
  );
}
