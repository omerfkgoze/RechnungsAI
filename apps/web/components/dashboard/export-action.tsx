"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  readyCount: number;
  exportedThisMonthCount?: number;
  monthLabel?: string;
  now?: Date;
  onExport?: () => void;
};

type Variant = "Dormant" | "Available" | "Prominent" | "MonthEndUrgent";

function isLastFiveDaysOfMonth(d: Date): { last: boolean; daysLeft: number } {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const daysLeft = last.getDate() - d.getDate();
  return { last: daysLeft <= 4, daysLeft };
}

export function ExportAction({
  readyCount,
  exportedThisMonthCount = 0,
  monthLabel,
  now,
  onExport,
}: Props) {
  const today = now ?? new Date();
  const { last: monthEnd, daysLeft } = isLastFiveDaysOfMonth(today);

  const variant: Variant = useMemo(() => {
    if (readyCount === 0) return "Dormant";
    if (monthEnd && readyCount > 0) return "MonthEndUrgent";
    if (readyCount >= 10) return "Prominent";
    return "Available";
  }, [readyCount, monthEnd]);

  const monthShort =
    monthLabel ??
    today.toLocaleString("de-DE", { month: "short" }).replace(".", "");

  function handleClick() {
    console.info("[export:cta] click", { readyCount });
    onExport?.();
  }

  if (variant === "Dormant") {
    return (
      <p
        data-testid="export-action"
        data-variant="Dormant"
        className="text-caption text-muted-foreground"
      >
        Exportiert: {exportedThisMonthCount} ({monthShort})
      </p>
    );
  }

  const titles: Record<Exclude<Variant, "Dormant">, string> = {
    Available: `${readyCount} Rechnung${readyCount === 1 ? "" : "en"} bereit für DATEV`,
    Prominent: `${readyCount} Rechnungen bereit → Jetzt DATEV Export erstellen`,
    MonthEndUrgent: `${readyCount} Rechnungen bereit · Monat endet in ${daysLeft + 1} Tag${daysLeft + 1 === 1 ? "" : "en"}`,
  };

  const cardClass = cn(
    "transition-colors",
    variant === "Available" && "border-muted",
    variant === "Prominent" &&
      "border-primary/40 bg-primary/5 motion-safe:animate-pulse",
    variant === "MonthEndUrgent" &&
      "border-warning/60 bg-warning/10",
  );

  return (
    <Card data-testid="export-action" data-variant={variant} className={cardClass}>
      <CardContent className="flex items-center justify-between gap-3 py-3">
        <p className="text-body-sm font-medium">
          {titles[variant]}
        </p>
        <Button
          type="button"
          variant={variant === "Available" ? "outline" : "default"}
          size="sm"
          onClick={handleClick}
          data-testid="export-action-button"
        >
          DATEV Export
        </Button>
      </CardContent>
    </Card>
  );
}
