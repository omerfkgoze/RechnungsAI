import { EmptyState } from "@/components/layout/empty-state";
import type { ArchiveRow } from "@/app/actions/invoices";
import { ArchiveSelectionLayer } from "./archive-selection-layer";

type ArchiveResultListProps = {
  rows: ArchiveRow[];
  total: number;
  page: number;
  pageSize: number;
};

export function ArchiveResultList({ rows, total }: ArchiveResultListProps) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Keine Rechnungen gefunden"
        description="Versuche einen anderen Suchbegriff oder Zeitraum."
      />
    );
  }

  return <ArchiveSelectionLayer rows={rows} total={total} />;
}
