"use client";

import { useEffect } from "react";

// Renouvellement de la session (audit M1-c). Le jeton expire apres 8 heures sans activite ;
// il n'est prolonge que lorsque le navigateur interroge /api/auth/session. Ce composant le
// fait au plus une fois toutes les 5 minutes, et seulement quand la personne est active
// (clic, clavier, retour sur l'onglet). Si la session a ete revoquee ou a expire, il renvoie
// vers la page de connexion.

const MIN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let lastPing = 0;

async function ping() {
  const now = Date.now();
  if (now - lastPing < MIN_INTERVAL_MS) return;
  lastPing = now;
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json().catch(() => null)) as { user?: unknown } | null;
    if (!data?.user) window.location.assign("/login");
  } catch {
    // Reseau indisponible : on reessaiera a la prochaine activite.
    lastPing = 0;
  }
}

export function SessionKeepAlive() {
  useEffect(() => {
    const onActivity = () => void ping();
    const onVisible = () => {
      if (document.visibilityState === "visible") void ping();
    };

    void ping();
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
