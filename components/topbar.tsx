"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function Topbar({ userName }: { userName: string }) {
  return (
    <header className="flex h-14 items-center justify-end border-b border-border bg-surface px-6">
      <div className="flex items-center gap-3">
        <span className="text-sm text-ink-muted">{userName}</span>
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
