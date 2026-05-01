"use client";

import { useState } from "react";
import { EmptyState } from "@/components/layout/empty-state";
import { formatDateDe, formatEur } from "@/lib/format";
import type { ArchiveRow } from "@/app/actions/invoices";
import { AuditExportButton } from "./audit-export-button";

type ArchiveResultListProps = {
  rows: ArchiveRow[];
  total: number;
  page: number;
  pageSize: number;
};

function sha256Short(hash: string | null): string | null {
  if (!hash || hash.length < 8) return null;
  return `…${hash.slice(-8)}`;
}

function statusLabelDe(status: string): string {
  const map: Record<string, string> = {
    captured: "Erfasst",
    processing: "Verarbeitung",
    ready: "Bereit",
    review: "Zur Prüfung",
    exported: "Exportiert",
  };
  return map[status] ?? status;
}

export function ArchiveResultList({ rows, total, page, pageSize }: ArchiveResultListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Keine Rechnungen gefunden"
        description="Versuche einen anderen Suchbegriff oder Zeitraum."
      />
    );
  }

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  const allSelected = rows.length > 0 && selectedIds.size === rows.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-body-sm text-muted-foreground">
          {total} {total === 1 ? "Rechnung" : "Rechnungen"} gefunden
        </span>
        <AuditExportButton selectedIds={Array.from(selectedIds)} />
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="min-w-full text-body-sm">
          <thead className="border-b bg-card">
            <tr>
              <th className="px-3 py-2 text-left">
                <input
                  type="checkbox"
                  aria-label="Alle auswählen"
                  checked={allSelected}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-3 py-2 text-left">Lieferant</th>
              <th className="px-3 py-2 text-left">Belegdatum</th>
              <th className="px-3 py-2 text-right">Brutto</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">SHA-256</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const invoiceDate = row.invoice_date_value
                ? formatDateDe(row.invoice_date_value)
                : null;
              const uploadDate = formatDateDe(row.created_at);
              const hashChip = sha256Short(row.sha256);

              return (
                <tr
                  key={row.id}
                  className="border-b last:border-0 hover:bg-muted/40 data-[selected=true]:bg-primary/5"
                  data-selected={selectedIds.has(row.id)}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Rechnung ${row.original_filename} auswählen`}
                      checked={selectedIds.has(row.id)}
                      onChange={() => toggleRow(row.id)}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">
                    {row.supplier_name_value ?? "Unbekannter Lieferant"}
                  </td>
                  <td className="px-3 py-2">
                    {invoiceDate ?? (
                      <>
                        {uploadDate}{" "}
                        <span className="text-caption text-muted-foreground">(Hochgeladen)</span>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.gross_total_value !== null
                      ? formatEur(row.gross_total_value)
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-caption">
                      {statusLabelDe(row.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-caption text-muted-foreground">
                    {hashChip ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
