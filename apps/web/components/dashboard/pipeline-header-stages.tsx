"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_INDICATOR,
  PIPELINE_STAGE_LABEL_DE,
  PIPELINE_STAGE_LABEL_SHORT_DE,
  type PipelineStage,
} from "@/lib/status-labels";

type Props = {
  stageCounts: Record<PipelineStage, number>;
  activeStage: PipelineStage | null;
  allZero: boolean;
};

function triggerHaptic() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(10);
  }
}

export function PipelineHeaderStages({
  stageCounts,
  activeStage,
  allZero,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onStageClick = useCallback(
    (stage: PipelineStage) => {
      triggerHaptic();
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (activeStage === stage) {
        params.delete("stage");
      } else {
        params.set("stage", stage);
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
      if (typeof document !== "undefined") {
        const el = document.getElementById(`stage-${stage}`);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [activeStage, pathname, router, searchParams],
  );

  // Escape clears the stage filter, but only when the user is not typing into
  // an input/textarea/select (follows 2.3 post-review LOW #7 guard).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (!searchParams?.get("stage")) return;
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("stage");
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathname, router, searchParams]);

  return (
    <ul className="grid grid-cols-4 gap-1 sm:gap-2">
      {PIPELINE_STAGES.map((stage) => {
        const count = stageCounts[stage];
        const isActive = activeStage === stage;
        const labelFull = PIPELINE_STAGE_LABEL_DE[stage];
        const labelShort = PIPELINE_STAGE_LABEL_SHORT_DE[stage];
        const indicator = PIPELINE_STAGE_INDICATOR[stage];
        const emphasis =
          stage === "ready" && count > 0 ? "font-bold subtle-pulse" : "";
        const shimmer =
          stage === "processing" && count > 0
            ? "animate-pulse motion-reduce:animate-none"
            : "";
        const dim = allZero ? "text-muted-foreground" : "";
        return (
          <li key={stage}>
            <button
              type="button"
              onClick={() => onStageClick(stage)}
              aria-label={`${labelFull}: ${count} Rechnungen`}
              aria-current={isActive ? "true" : undefined}
              className={cn(
                "flex w-full flex-col items-center gap-1 rounded-lg px-2 py-3 text-center transition-transform active:scale-[1.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                isActive ? "bg-secondary" : "hover:bg-muted/40",
              )}
            >
              <span aria-hidden className="text-lg leading-none">
                {indicator}
              </span>
              <span className="text-caption">
                <span className="sm:hidden">{labelShort}</span>
                <span className="hidden sm:inline">{labelFull}</span>
              </span>
              <span
                data-testid={`stage-count-${stage}`}
                className={cn(
                  "tabular-nums text-body",
                  dim,
                  emphasis,
                  shimmer,
                )}
              >
                {count}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
