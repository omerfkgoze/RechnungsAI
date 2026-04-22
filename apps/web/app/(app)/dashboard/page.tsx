import * as Sentry from "@sentry/nextjs";
import type { Invoice } from "@rechnungsai/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/layout/empty-state";
import { createServerClient } from "@/lib/supabase/server";
import {
  aggregateStageCounts,
  PipelineHeader,
} from "@/components/dashboard/pipeline-header";
import {
  InvoiceListCard,
  type InvoiceRow,
} from "@/components/dashboard/invoice-list-card";
import { InvoiceListFilters } from "@/components/dashboard/invoice-list-filters";
import {
  ProcessingStatsRow,
  type ProcessingStats,
} from "@/components/dashboard/processing-stats-row";
import { parseDashboardQuery } from "@/lib/dashboard-query";
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABEL_DE,
  type PipelineStage,
} from "@/lib/status-labels";

const LOG = "[dashboard:load]";
const LIST_LIMIT = 100;

type RawParams = Record<string, string | string[] | undefined>;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<RawParams>;
}) {
  const raw = searchParams ? await searchParams : {};
  const query = parseDashboardQuery(raw);

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (err) {
    return renderError(err);
  }

  // Build list query with server-side filters (single source of truth — NFR5).
  let q = supabase
    .from("invoices")
    .select(
      "id, status, file_path, file_type, original_filename, invoice_data, extraction_error, extracted_at, created_at, updated_at",
    )
    .limit(LIST_LIMIT);

  if (query.status && query.status !== "all") q = q.eq("status", query.status);
  if (query.stage) {
    if (query.stage === "ready") q = q.in("status", ["ready", "review"]);
    else q = q.eq("status", query.stage);
  }
  if (query.from) q = q.gte("created_at", query.from);
  if (query.to) q = q.lte("created_at", `${query.to}T23:59:59`);
  if (query.supplier) {
    q = q.ilike("invoice_data->supplier_name->>value", `%${query.supplier}%`);
  }
  if (query.minAmount !== undefined) {
    // gross_total_value is a generated column (see migration 20260423000000)
    q = q.gte("gross_total_value", query.minAmount);
  }
  if (query.maxAmount !== undefined) {
    q = q.lte("gross_total_value", query.maxAmount);
  }

  switch (query.sort) {
    case "date_asc":
      q = q.order("created_at", { ascending: true });
      break;
    case "amount_desc":
      // gross_total_value / supplier_name_value: generated columns (migration 20260423000000)
      q = q.order("gross_total_value", { ascending: false, nullsFirst: false });
      break;
    case "amount_asc":
      q = q.order("gross_total_value", { ascending: true, nullsFirst: false });
      break;
    case "supplier_asc":
      q = q.order("supplier_name_value", {
        ascending: true,
        nullsFirst: false,
      });
      break;
    case "status":
      q = q.order("status", { ascending: true });
      break;
    default:
      q = q.order("created_at", { ascending: false });
  }

  const [listRes, stageRes, statsRes] = await Promise.all([
    q,
    supabase.rpc("invoice_stage_counts"),
    supabase.rpc("invoice_processing_stats"),
  ]);

  if (listRes.error || stageRes.error || statsRes.error) {
    const err = listRes.error ?? stageRes.error ?? statsRes.error;
    return renderError(err);
  }

  const rows = (listRes.data ?? []) as InvoiceRow[];
  const stageCounts = aggregateStageCounts(
    (stageRes.data ?? []) as Array<{
      status: InvoiceRow["status"];
      count: number;
    }>,
  );
  const statsRow = (statsRes.data?.[0] ?? {
    total_invoices: 0,
    avg_accuracy: null,
    export_history_count: 0,
  }) as ProcessingStats;

  const activeStage: PipelineStage | null = query.stage ?? null;
  const truncated = rows.length >= LIST_LIMIT;

  return (
    <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
      <section className="flex flex-col gap-4 lg:col-span-8">
        <PipelineHeader stageCounts={stageCounts} activeStage={activeStage} />

        <InvoiceListFilters />

        {truncated ? (
          <div
            role="status"
            className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-body-sm text-foreground"
          >
            Es werden die neuesten 100 Rechnungen angezeigt. Die vollständige
            Ansicht kommt mit dem Archiv.
          </div>
        ) : null}

        {rows.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState
                title="Noch keine Rechnungen"
                description="Hier erscheinen deine Rechnungen, sobald du sie erfasst hast."
              />
            </CardContent>
          </Card>
        ) : (
          <GroupedInvoiceList rows={rows} />
        )}
      </section>

      <div className="flex flex-col gap-4 lg:col-span-4">
        <Card>
          <CardHeader>
            <CardTitle>Deine Woche auf einen Blick</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-body-sm text-muted-foreground">
              Zusammenfassung startet, sobald du deine ersten Rechnungen
              verarbeitet hast.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Verarbeitungsstatistik</CardTitle>
          </CardHeader>
          <CardContent>
            <ProcessingStatsRow stats={statsRow} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Group rows by pipeline stage so "scroll to #stage-<id>" lands at a real
// anchor. `review` shows under the "Bereit" bucket per AC #1.
function GroupedInvoiceList({ rows }: { rows: InvoiceRow[] }) {
  const byStage: Record<PipelineStage, InvoiceRow[]> = {
    captured: [],
    processing: [],
    ready: [],
    exported: [],
  };
  for (const r of rows) {
    if (r.status === "review") byStage.ready.push(r);
    else if (r.status in byStage)
      byStage[r.status as PipelineStage].push(r);
  }
  const hasAny = (stage: PipelineStage) => byStage[stage].length > 0;

  return (
    <div className="flex flex-col gap-6">
      {PIPELINE_STAGES.filter(hasAny).map((stage) => (
        <section key={stage} id={`stage-${stage}`} className="flex flex-col gap-2">
          <h2 className="text-h3">
            {PIPELINE_STAGE_LABEL_DE[stage]}
            <span className="ml-2 text-caption text-muted-foreground">
              ({byStage[stage].length})
            </span>
          </h2>
          <ul className="flex flex-col gap-2">
            {byStage[stage].map((row) => (
              <li key={row.id}>
                <InvoiceListCard
                  row={{
                    ...row,
                    invoice_data: row.invoice_data as Invoice | null,
                  }}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function renderError(err: unknown) {
  console.error(LOG, err);
  Sentry.captureException(err, {
    tags: { module: "dashboard", action: "load" },
  });
  return (
    <Card>
      <CardContent>
        <p className="py-6 text-center text-destructive">
          Dashboard konnte nicht vollständig geladen werden. Bitte aktualisiere
          die Seite.
        </p>
      </CardContent>
    </Card>
  );
}
