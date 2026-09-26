"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, UserMinus } from "lucide-react";

export type MemberRow = {
  userId: string;
  name: string;
  email: string;
  role: "ADMIN" | "MEMBER";
};

export function MemberList({
  workspaceId,
  currentUserId,
  members,
}: {
  workspaceId: string;
  currentUserId: string;
  members: MemberRow[];
}) {
  const router = useRouter();
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changeRole(userId: string, role: string) {
    setBusyUserId(userId);
    setError(null);
    const res = await fetch(`/api/workspaces/${workspaceId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyUserId(null);
    if (!res.ok) {
      setError(data.error ?? "Impossible de changer le rôle.");
      return;
    }
    // Si on vient de se retirer soi-meme les droits d'admin, la page Membres n'est plus
    // accessible : le rafraichissement affichera le message "Reserve aux administrateurs".
    router.refresh();
  }

  async function removeMember(userId: string) {
    setBusyUserId(userId);
    setError(null);
    const res = await fetch(`/api/workspaces/${workspaceId}/members/${userId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusyUserId(null);
    setConfirmRemoveId(null);
    if (!res.ok) {
      setError(data.error ?? "Impossible de retirer ce membre.");
      return;
    }
    if (userId === currentUserId) {
      router.push("/dashboard");
    }
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Membres actuels ({members.length})
        </h2>
      </div>
      {error && <p className="border-b border-border px-5 py-2 text-xs text-red-400">{error}</p>}
      <ul className="divide-y divide-border">
        {members.map((m) => {
          const isSelf = m.userId === currentUserId;
          const busy = busyUserId === m.userId;
          return (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <User size={14} className="text-ink-muted" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {m.name}
                  {isSelf && <span className="ml-1.5 text-xs font-normal text-ink-muted">(toi)</span>}
                </p>
                <p className="truncate text-xs text-ink-muted">{m.email}</p>
              </div>

              <Select value={m.role} onValueChange={(v) => changeRole(m.userId, v)} disabled={busy}>
                <SelectTrigger className="h-8 w-[110px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER">Membre</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>

              {confirmRemoveId === m.userId ? (
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-ink-muted">
                    {isSelf ? "Quitter l'espace ?" : "Retirer ? Ses items seront désassignés."}
                  </span>
                  <button
                    onClick={() => removeMember(m.userId)}
                    disabled={busy}
                    className="rounded-md px-2 py-1 font-medium text-red-400 hover:bg-red-500/10"
                  >
                    Confirmer
                  </button>
                  <button
                    onClick={() => setConfirmRemoveId(null)}
                    className="rounded-md px-2 py-1 text-ink-muted hover:bg-background"
                  >
                    Annuler
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmRemoveId(m.userId)}
                  disabled={busy}
                  title={isSelf ? "Quitter l'espace" : "Retirer de l'espace"}
                  className="rounded-md p-1.5 text-ink-muted hover:bg-red-500/10 hover:text-red-400"
                >
                  <UserMinus size={14} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
