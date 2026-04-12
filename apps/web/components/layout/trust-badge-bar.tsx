import { ShieldCheck, Lock, Server } from "lucide-react";
import { cn } from "@/lib/utils";

type TrustBadgeBarProps = {
  collapsed?: boolean;
};

export function TrustBadgeBar({ collapsed = false }: TrustBadgeBarProps) {
  return (
    <div
      role="status"
      aria-label="Vertrauenskennzeichen"
      className={cn(
        "w-full bg-primary/5 text-primary transition-[height] duration-[var(--animation-normal)]",
        collapsed ? "h-7" : "h-9",
      )}
    >
      <div className="mx-auto flex h-full max-w-[1280px] items-center gap-4 px-4 text-xs lg:px-6">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true">🇩🇪</span>
          {!collapsed && <span>Gehostet in Deutschland</span>}
        </span>
        <span aria-hidden="true" className="text-primary/30">
          ·
        </span>
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          {!collapsed && <span>GoBD</span>}
        </span>
        <span aria-hidden="true" className="text-primary/30">
          ·
        </span>
        <span className="flex items-center gap-1.5">
          <Lock className="size-3.5" aria-hidden="true" />
          {!collapsed && <span>DSGVO</span>}
        </span>
        <span aria-hidden="true" className="text-primary/30 hidden sm:inline">
          ·
        </span>
        <span className="hidden sm:flex items-center gap-1.5">
          <Server className="size-3.5" aria-hidden="true" />
          {!collapsed && <span>Hetzner DE</span>}
        </span>
      </div>
    </div>
  );
}
