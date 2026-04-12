"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  ScanLine,
  Archive,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Übersicht", icon: LayoutDashboard },
  { href: "/erfassen", label: "Erfassen", icon: ScanLine },
  { href: "/archiv", label: "Archiv", icon: Archive },
  { href: "/einstellungen", label: "Einstellungen", icon: Settings },
] as const;

const STORAGE_KEY = "rechnungsai.sidebar.collapsed";

export function SidebarNav() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "1") setCollapsed(true);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <aside
      className={cn(
        "hidden lg:flex sticky top-9 h-[calc(100vh-var(--space-9))] shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground",
        "transition-[width] duration-[var(--animation-normal)]",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <nav aria-label="Hauptnavigation" className="flex flex-1 flex-col p-2">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Navigation ausklappen" : "Navigation einklappen"}
          aria-expanded={!collapsed}
          className="mb-2 flex h-9 w-full items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary-light))]"
        >
          {collapsed ? (
            <PanelLeft className="size-4" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="size-4" aria-hidden="true" />
          )}
        </button>
        <ul className="flex flex-col gap-1">
          {ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname?.startsWith(href) ?? false;
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  aria-label={label}
                  className={cn(
                    "group flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary-light))]",
                    active
                      ? "bg-primary/10 text-primary border-l-2 border-primary pl-[10px]"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    collapsed && "justify-center px-0",
                  )}
                >
                  <Icon className="size-5 shrink-0" aria-hidden="true" />
                  {!collapsed && <span>{label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
