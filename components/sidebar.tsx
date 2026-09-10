"use client";

import { useState } from "react";
import Link from "next/link";
import { LayoutGrid, Layers, Users, Settings, ChevronLeft, ChevronRight } from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/consolidated", label: "Vue consolidée", icon: Layers },
  { href: "/members", label: "Membres", icon: Users },
] as const;

// workspaceName n'est plus affiche dans la sidebar (deplace vers l'ecran Dashboard a la
// demande) mais reste accepte en prop pour ne pas casser l'appel depuis layout.tsx.
export function Sidebar({ workspaceName, isAdmin }: { workspaceName: string; isAdmin: boolean }) {
  void workspaceName;
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={
        "group relative flex shrink-0 flex-col border-r border-border bg-surface transition-all duration-200 " +
        (collapsed ? "w-16" : "w-60")
      }
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? "Déplier la barre latérale" : "Réduire la barre latérale"}
        className="absolute -right-3 top-4 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-ink-muted opacity-0 shadow-sm transition-opacity duration-150 pointer-events-none hover:bg-background hover:text-ink group-hover:pointer-events-auto group-hover:opacity-100"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      <div
        className={
          "flex h-14 items-center border-b border-border " +
          (collapsed ? "justify-center px-0" : "gap-2.5 px-5")
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/atlas-logo.png" alt="" className="h-7 w-7 shrink-0 rounded-lg" />
        {!collapsed && <span className="truncate text-base font-semibold text-ink">Atlas</span>}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            title={label}
            className={
              "flex items-center rounded-md py-2 text-base font-medium text-ink hover:bg-background " +
              (collapsed ? "justify-center px-0" : "gap-2.5 px-3")
            }
          >
            <Icon size={18} className="shrink-0 text-ink-muted" />
            {!collapsed && label}
          </Link>
        ))}
        {isAdmin && (
          <Link
            href="/settings"
            title="Paramètres"
            className={
              "flex items-center rounded-md py-2 text-base font-medium text-ink hover:bg-background " +
              (collapsed ? "justify-center px-0" : "gap-2.5 px-3")
            }
          >
            <Settings size={18} className="shrink-0 text-ink-muted" />
            {!collapsed && "Paramètres"}
          </Link>
        )}
      </nav>
    </aside>
  );
}
