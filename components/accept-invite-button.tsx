"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/invites/${token}/accept`, { method: "POST" });
    const data = await res.json().catch(() => ({}));

    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Impossible de rejoindre cet espace.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleAccept} disabled={loading}>
        {loading ? "..." : "Rejoindre l'espace"}
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
