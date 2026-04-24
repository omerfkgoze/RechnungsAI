import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfidenceIndicator } from "@/components/invoice/confidence-indicator";
import { EmptyState } from "@/components/layout/empty-state";

export type ProcessingStats = {
  total_invoices: number;
  avg_accuracy: number | null;
  export_history_count: number;
};

export function ProcessingStatsRow({ stats }: { stats: ProcessingStats }) {
  if (stats.total_invoices === 0) {
    return (
      <EmptyState
        title="Noch keine Statistik"
        description="Statistik wird verfügbar, sobald Rechnungen verarbeitet wurden."
      />
    );
  }
  // Supabase-js may surface numeric as a string for precision-sensitive
  // drivers; coerce defensively so we don't render `NaN%`.
  const accuracyRaw =
    stats.avg_accuracy === null ? null : Number(stats.avg_accuracy);
  const accuracyPct =
    accuracyRaw === null || !Number.isFinite(accuracyRaw)
      ? null
      : Math.round(accuracyRaw * 100);
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Rechnungen gesamt</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-amount-lg">{stats.total_invoices}</p>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>KI-Genauigkeit</CardTitle>
        </CardHeader>
        <CardContent>
          {accuracyPct === null ? (
            <>
              <p className="text-amount-lg">—</p>
              <p className="mt-1 text-caption text-muted-foreground">
                Noch keine Extraktionen
              </p>
            </>
          ) : (
            <>
              <p className="text-amount-lg">{accuracyPct}%</p>
              <div className="mt-2">
                <ConfidenceIndicator
                  variant="bar"
                  confidence={accuracyRaw ?? 0}
                  fieldName="KI-Gesamtgenauigkeit"
                  explanation={null}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Exportierte Rechnungen</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-amount-lg">{stats.export_history_count}</p>
        </CardContent>
      </Card>
    </div>
  );
}
