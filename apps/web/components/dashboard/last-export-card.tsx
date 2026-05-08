// P17 — Recovery surface for accidentally-closed export dialogs.
// Renders a card with re-download + mailto links for the tenant's most recent
// non-expired `datev_exports` row. TTL is 24h (P16); after that the card
// disappears automatically. The route handler is RLS-scoped, idempotent, and
// emits no audit row, so re-downloads are safe.

import { Download, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { buildSteuerberaterMailto, formatDateRangeGerman } from "@/lib/datev-export";

type Props = {
  exportId: string;
  rowCount: number;
  dateFromCompact: string;
  dateToCompact: string;
  createdAtIso: string;
  tenantCompanyName: string;
};

function compactToIso(compact: string): string {
  // "20260501" → "2026-05-01"
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function formatRelativeDe(createdAtIso: string, nowMs: number): string {
  const createdMs = Date.parse(createdAtIso);
  const diffMin = Math.max(0, Math.floor((nowMs - createdMs) / 60_000));
  if (diffMin < 1) return "gerade eben";
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std.`;
  const diffD = Math.floor(diffH / 24);
  return `vor ${diffD} Tag${diffD === 1 ? "" : "en"}`;
}

export function LastExportCard({
  exportId,
  rowCount,
  dateFromCompact,
  dateToCompact,
  createdAtIso,
  tenantCompanyName,
}: Props) {
  const fromIso = compactToIso(dateFromCompact);
  const toIso = compactToIso(dateToCompact);
  const rangeLabel = formatDateRangeGerman(fromIso, toIso);
  const relativeLabel = formatRelativeDe(createdAtIso, Date.now());
  const mailtoHref = buildSteuerberaterMailto({
    dateFromIso: fromIso,
    dateToIso: toIso,
    tenantCompanyName,
  });
  const downloadHref = `/api/export/datev/${exportId}`;

  return (
    <Card aria-label="Letzter DATEV-Export">
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col">
          <p className="text-body-sm font-medium">Letzter Export</p>
          <p className="text-caption text-muted-foreground">
            {rangeLabel} · {rowCount}{" "}
            {rowCount === 1 ? "Rechnung" : "Rechnungen"} · {relativeLabel}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-shrink-0">
          <Button
            nativeButton={false}
            variant="outline"
            className="w-full sm:w-auto"
            render={<a href={mailtoHref} />}
          >
            <Mail className="mr-1 h-4 w-4" aria-hidden="true" />
            An Steuerberater senden
          </Button>
          <Button
            nativeButton={false}
            className="w-full sm:w-auto"
            render={<a href={downloadHref} />}
          >
            <Download className="mr-1 h-4 w-4" aria-hidden="true" />
            Erneut herunterladen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
