import * as Sentry from "@sentry/nextjs";
import { parseArchiveQuery } from "@/lib/archive-query";
import { searchArchivedInvoices, type ArchiveRow } from "@/app/actions/invoices";
import { ArchiveSearchFilters } from "@/components/archive/archive-search-filters";
import { ArchiveResultList } from "@/components/archive/archive-result-list";
import { ArchivePagination } from "@/components/archive/archive-pagination";
import { RetentionNotice } from "@/components/archive/retention-notice";

type RawParams = Record<string, string | string[] | undefined>;

export default async function ArchivPage({
  searchParams,
}: {
  searchParams?: Promise<RawParams>;
}) {
  const raw = searchParams ? await searchParams : {};
  const query = parseArchiveQuery(raw);

  const result = await searchArchivedInvoices(query);

  let rows: ArchiveRow[] = [];
  let total = 0;

  if (result.success) {
    rows = result.data.rows;
    total = result.data.total;
  } else {
    Sentry.captureMessage("archive page: search action failed", {
      level: "error",
      tags: { module: "gobd", action: "archive_page" },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-h2">Archiv</h1>
        <RetentionNotice />
      </div>

      <ArchiveSearchFilters />

      <ArchiveResultList rows={rows} total={total} page={query.page} pageSize={query.pageSize} />

      {total > 0 && (
        <ArchivePagination total={total} page={query.page} pageSize={query.pageSize} />
      )}
    </div>
  );
}
