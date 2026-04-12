"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, LayoutDashboard, ScanLine, Archive, Settings } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Übersicht", icon: LayoutDashboard },
  { href: "/erfassen", label: "Erfassen", icon: ScanLine },
  { href: "/archiv", label: "Archiv", icon: Archive },
  { href: "/einstellungen", label: "Einstellungen", icon: Settings },
] as const;

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(href + "/");
}

export function MobileMenuSheet() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Menü öffnen"
        className={cn(
          "fixed right-3 top-[calc(var(--trust-bar-height,36px)+8px)] z-40 flex size-10 items-center justify-center rounded-full bg-card text-foreground shadow-md lg:hidden",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary-light))]",
        )}
      >
        <Menu className="size-5" aria-hidden="true" />
      </SheetTrigger>
      <SheetContent side="right" className="w-72">
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
        </SheetHeader>
        <nav aria-label="Hauptnavigation" className="flex flex-col gap-1 p-4">
          {ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <SheetClose
                key={href}
                nativeButton={false}
                render={
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary-light))]",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-accent",
                    )}
                  >
                    <Icon className="size-5 shrink-0" aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                }
              />
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
