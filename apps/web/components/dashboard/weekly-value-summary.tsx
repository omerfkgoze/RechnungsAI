import * as Sentry from "@sentry/nextjs";
import { createServerClient } from "@/lib/supabase/server";

type WeeklySummaryData = {
  week_invoices: number;
  week_time_saved_minutes: number;
  week_vat_total: number;
  month_exported_count: number;
  month_vat_total: number;
};

const eurFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

function formatTimeSaved(minutes: number): string {
  if (minutes < 60) return `~${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `~${h}h 0min` : `~${h}h ${m}min`;
}

function getCurrentMonthLabel(): string {
  return new Date().toLocaleString("de-DE", { month: "long" });
}

async function fetchWeeklySummary(): Promise<WeeklySummaryData | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("tenant_weekly_value_summary");
  if (error) {
    console.warn("[dashboard:weekly] rpc error", error);
    Sentry.captureException(error, {
      tags: { module: "dashboard", source: "weekly_value_summary" },
    });
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    week_invoices: Number(row.week_invoices ?? 0),
    week_time_saved_minutes: Number(row.week_time_saved_minutes ?? 0),
    week_vat_total: Number(row.week_vat_total ?? 0),
    month_exported_count: Number(row.month_exported_count ?? 0),
    month_vat_total: Number(row.month_vat_total ?? 0),
  };
}

export async function WeeklyValueSummary() {
  const data = await fetchWeeklySummary();
  const monthLabel = getCurrentMonthLabel();

  const isEmpty = !data || data.week_invoices === 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
      <h3 className="text-base font-semibold text-foreground">Deine Woche auf einen Blick</h3>

      {isEmpty ? (
        <div className="flex flex-col gap-1">
          <p className="text-body-sm text-muted-foreground">
            Diese Woche noch keine Rechnungen erfasst.
          </p>
          <p className="text-body-sm text-muted-foreground">
            Lade deine erste Rechnung der Woche hoch und sieh deine Zeitersparnis.
          </p>
          {data && data.month_exported_count > 0 && (
            <p className="mt-2 text-body-sm tabular-nums text-foreground">
              Exportiert ({monthLabel}): {data.month_exported_count} Rechnungen,{" "}
              {eurFormatter.format(data.month_vat_total)}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-body-sm tabular-nums text-foreground">
            Rechnungen diese Woche: <span className="font-medium">{data.week_invoices}</span>
          </p>
          <p className="text-body-sm tabular-nums text-foreground">
            Geschätzte Zeitersparnis:{" "}
            <span className="font-medium">{formatTimeSaved(data.week_time_saved_minutes)}</span>
          </p>
          <p className="text-body-sm tabular-nums text-foreground">
            MwSt.-Vorsteuer diese Woche:{" "}
            <span className="font-medium">{eurFormatter.format(data.week_vat_total)}</span>
          </p>
          {data.month_exported_count > 0 && (
            <p className="mt-1 text-body-sm tabular-nums text-muted-foreground border-t pt-2">
              Exportiert ({monthLabel}): {data.month_exported_count} Rechnungen,{" "}
              {eurFormatter.format(data.month_vat_total)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
