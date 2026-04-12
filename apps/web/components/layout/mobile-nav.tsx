"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ScanLine, Archive } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Übersicht", icon: LayoutDashboard, ariaLabel: "Zur Übersicht" },
  { href: "/archiv", label: "Archiv", icon: Archive, ariaLabel: "Zum Archiv" },
] as const;

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 h-16 border-t border-border bg-card lg:hidden"
    >
      <ul className="relative mx-auto grid h-full max-w-md grid-cols-3 items-center gap-2 px-4">
        {/* Dashboard */}
        <li className="flex items-center justify-center">
          <NavLink
            href={ITEMS[0].href}
            label={ITEMS[0].label}
            ariaLabel={ITEMS[0].ariaLabel}
            Icon={ITEMS[0].icon}
            active={pathname?.startsWith(ITEMS[0].href) ?? false}
          />
        </li>

        {/* Erfassen FAB (center) */}
        <li className="flex items-center justify-center">
          <Link
            href="/erfassen"
            aria-label="Rechnung erfassen"
            className={cn(
              "-mt-4 flex size-14 flex-col items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary-light))] focus-visible:ring-offset-2",
              "transition-transform duration-[var(--animation-fast)] active:scale-95",
            )}
          >
            <ScanLine className="size-6" aria-hidden="true" />
            <span className="sr-only">Erfassen</span>
          </Link>
        </li>

        {/* Archiv */}
        <li className="flex items-center justify-center">
          <NavLink
            href={ITEMS[1].href}
            label={ITEMS[1].label}
            ariaLabel={ITEMS[1].ariaLabel}
            Icon={ITEMS[1].icon}
            active={pathname?.startsWith(ITEMS[1].href) ?? false}
          />
        </li>
      </ul>
      <p className="pointer-events-none absolute inset-x-0 bottom-1 text-center text-[10px] font-medium leading-none text-primary">
        Erfassen
      </p>
    </nav>
  );
}

function NavLink({
  href,
  label,
  ariaLabel,
  Icon,
  active,
}: {
  href: string;
  label: string;
  ariaLabel: string;
  Icon: typeof LayoutDashboard;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-12 min-w-[48px] flex-col items-center justify-center gap-0.5 rounded-md px-3 text-[11px] font-medium",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary-light))]",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}
