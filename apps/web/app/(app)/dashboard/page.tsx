import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
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
import { DashboardRealtimeRefresher } from "@/components/dashboard/dashboard-realtime-refresher";
import { DashboardEscHandler } from "@/components/dashboard/dashboard-esc-handler";
import { DashboardKeyboardShortcuts } from "@/components/dashboard/dashboard-keyboard-shortcuts";
import { SessionSummary } from "@/components/dashboard/session-summary";
import { ExportAction } from "@/components/dashboard/export-action";
import { WeeklyValueSummary } from "@/components/dashboard/weekly-value-summary";
import { InvoiceDetailPane } from "@/components/invoice/invoice-detail-pane";
import { DEFAULT_SORT, parseDashboardQuery } from "@/lib/dashboard-query";
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
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const selectedId =
    typeof raw?.selected === "string" && UUID_RE.test(raw.selected) ? raw.selected : null;

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (err) {
    return renderError(err);
  }

  // Resolve tenant for defense-in-depth — every other query in the codebase
  // layers an explicit tenant filter on top of RLS.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?returnTo=/dashboard");
  const { data: userRow, error: userErr } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (userErr || !userRow) redirect("/login?returnTo=/dashboard");
  const tenantId = userRow.tenant_id;

  // Detect conflicting filters — status + stage both set with mismatching
  // buckets would silently return zero rows.
  const conflict =
    query.status &&
    query.status !== "all" &&
    query.stage &&
    !(
      query.status === query.stage ||
      (query.stage === "ready" &&
        (query.status === "ready" || query.status === "review"))
    );

  // Build list query with server-side filters (single source of truth — NFR5).
  let q = supabase
    .from("invoices")
    .select(
      "id, status, file_path, file_type, original_filename, invoice_data, extraction_error, extracted_at, created_at, updated_at, approved_at, approved_by, approval_method",
    )
    .eq("tenant_id", tenantId)
    .limit(LIST_LIMIT);

  if (query.status && query.status !== "all") q = q.eq("status", query.status);
  if (query.stage && !conflict) {
    if (query.stage === "ready") q = q.in("status", ["ready", "review"]);
    else q = q.eq("status", query.stage);
  }
  if (query.from) q = q.gte("created_at", query.from);
  if (query.to) {
    // End-exclusive next-day bound at UTC midnight so we include the full
    // `to` day regardless of DB timezone configuration.
    const next = new Date(`${query.to}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    q = q.lt("created_at", next.toISOString());
  }
  if (query.supplier) {
    // Escape LIKE wildcards so `%` and `_` in user input match literally.
    const escaped = query.supplier.replace(/[\\%_]/g, (c) => `\\${c}`);
    q = q.ilike("invoice_data->supplier_name->>value", `%${escaped}%`);
  }
  if (query.minAmount !== undefined) {
    // gross_total_value is a generated column (see migration 20260423000000)
    q = q.gte("gross_total_value", query.minAmount);
  }
  if (query.maxAmount !== undefined) {
    q = q.lte("gross_total_value", query.maxAmount);
  }

  const effectiveSort = query.sort ?? DEFAULT_SORT;
  switch (effectiveSort) {
    case "confidence":
      // review queue first (review_priority_key=0), then ready (=1); within each
      // group: green → amber → red → null (confidence_sort_key 0..3).
      // Tie-break by created_at desc for stable pagination.
      q = q
        .order("review_priority_key", { ascending: true, nullsFirst: false })
        .order("confidence_sort_key", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
      break;
    case "date_asc":
      q = q.order("created_at", { ascending: true }).order("id", { ascending: true });
      break;
    case "amount_desc":
      // gross_total_value / supplier_name_value: generated columns (migration 20260423000000)
      q = q
        .order("gross_total_value", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false });
      break;
    case "amount_asc":
      q = q
        .order("gross_total_value", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true });
      break;
    case "supplier_asc":
      q = q
        .order("supplier_name_value", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true });
      break;
    case "status":
      q = q.order("status", { ascending: true }).order("id", { ascending: false });
      break;
    case "date_desc":
    default:
      q = q.order("created_at", { ascending: false }).order("id", { ascending: false });
  }

  // Fetch selected invoice for split-view pane (lg+ only; hidden via CSS on mobile).
  let selectedInvoice: {
    id: string;
    status: InvoiceRow["status"];
    invoice_data: Invoice | null;
    extraction_error: string | null;
    updated_at: string;
    skr_code: string | null;
    bu_schluessel: number | null;
    categorization_confidence: number | null;
    approved_at: string | null;
    approved_by: string | null;
    approval_method: string | null;
  } | null = null;
  let selectedSkrPlan = "skr03";
  let selectedRecentSkrCodes: string[] = [];

  if (selectedId) {
    const { data } = await supabase
      .from("invoices")
      .select("id, status, invoice_data, extraction_error, updated_at, skr_code, bu_schluessel, categorization_confidence, approved_at, approved_by, approval_method")
      .eq("id", selectedId)
      .eq("tenant_id", tenantId)
      .single();
    if (data) {
      selectedInvoice = {
        ...data,
        invoice_data: (data.invoice_data as unknown as Invoice | null) ?? null,
        skr_code: data.skr_code ?? null,
        bu_schluessel: data.bu_schluessel ?? null,
        categorization_confidence: data.categorization_confidence ?? null,
        approved_at: data.approved_at ?? null,
        approved_by: data.approved_by ?? null,
        approval_method: data.approval_method ?? null,
      };

      const invoiceData = data.invoice_data as Invoice | null;
      const supplierName = invoiceData?.supplier_name?.value ?? null;

      const [tenantRes, recentRes] = await Promise.all([
        supabase.from("tenants").select("skr_plan").eq("id", tenantId).single(),
        supplierName
          ? supabase
              .from("categorization_corrections")
              .select("corrected_code")
              .eq("tenant_id", tenantId)
              .eq("supplier_name", supplierName)
              .order("created_at", { ascending: false })
              .limit(10)
          : Promise.resolve({ data: [] }),
      ]);

      selectedSkrPlan = tenantRes.data?.skr_plan ?? "skr03";

      const seenCodes = new Set<string>();
      for (const row of (recentRes.data ?? [])) {
        const code = (row as { corrected_code: string }).corrected_code;
        if (!seenCodes.has(code)) {
          seenCodes.add(code);
          selectedRecentSkrCodes.push(code);
        }
        if (selectedRecentSkrCodes.length >= 3) break;
      }
    }
  }

  const [listRes, stageRes, statsRes] = await Promise.all([
    q,
    supabase.rpc("invoice_stage_counts"),
    supabase.rpc("invoice_processing_stats"),
  ]);

  if (listRes.error || stageRes.error || statsRes.error) {
    const err = listRes.error ?? stageRes.error ?? statsRes.error;
    return renderError(err, { conflict });
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

  // SessionSummary + ExportAction inputs. review/ready are tenant-wide totals
  // from `invoice_stage_counts` RPC (raw status counts, before the UI fold).
  const stageRows = (stageRes.data ?? []) as Array<{
    status: InvoiceRow["status"];
    count: number | bigint;
  }>;
  const rawCount = (s: string) => {
    const r = stageRows.find((x) => x.status === s);
    if (!r) return 0;
    return typeof r.count === "bigint" ? Number(r.count) : r.count;
  };
  const reviewCount = rawCount("review");
  const readyCount = rawCount("ready");
  const exportedCount = rawCount("exported");
  const sessionStartMs = Date.now();

  const { count: auditErrorCount, error: errorCountErr } = await supabase
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("event_type", "field_edit")
    .gte("created_at", new Date(sessionStartMs).toISOString());

  if (errorCountErr) {
    console.error("[dashboard:audit-count]", errorCountErr);
    Sentry.captureException(errorCountErr, {
      tags: { module: "gobd", action: "audit_count" },
    });
  }
  const errorCount = auditErrorCount ?? 0;

  return (
    <>
      <DashboardRealtimeRefresher tenantId={tenantId} />
      <DashboardKeyboardShortcuts />
      {selectedInvoice && <DashboardEscHandler />}
      <div className={selectedInvoice ? "grid gap-4 lg:grid-cols-[380px_1fr] lg:gap-6" : "grid gap-4 lg:grid-cols-12 lg:gap-6"}>
        <section className={selectedInvoice ? "flex flex-col gap-4 w-full lg:w-[380px] shrink-0" : "flex flex-col gap-4 lg:col-span-8"}>
          <PipelineHeader stageCounts={stageCounts} activeStage={activeStage} />

          <SessionSummary
            reviewCount={reviewCount}
            readyCount={readyCount}
            invoiceCount={rows.length}
            errorCount={errorCount}
            streakWeeks={0}
            sessionStartMs={sessionStartMs}
          />

          <ExportAction
            readyCount={readyCount}
            exportedThisMonthCount={exportedCount}
          />

          <InvoiceListFilters />

          {conflict ? (
            <div
              role="status"
              className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-body-sm text-foreground"
            >
              Status- und Stage-Filter widersprechen sich. Stage-Filter wird
              ignoriert.
            </div>
          ) : null}

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
            <GroupedInvoiceList rows={rows} selectedId={selectedId} />
          )}
        </section>

        {selectedInvoice ? (
          <aside
            className="hidden lg:block overflow-y-auto"
            style={{ height: "calc(100vh - 8rem)" }}
          >
            <InvoiceDetailPane
              invoiceId={selectedInvoice.id}
              status={selectedInvoice.status}
              invoice={selectedInvoice.invoice_data}
              extractionError={selectedInvoice.extraction_error}
              updatedAt={selectedInvoice.updated_at}
              isExported={selectedInvoice.status === "exported"}
              skrCode={selectedInvoice.skr_code}
              buSchluessel={selectedInvoice.bu_schluessel}
              categorizationConfidence={selectedInvoice.categorization_confidence}
              skrPlan={selectedSkrPlan}
              recentSkrCodes={selectedRecentSkrCodes}
              approvedAt={selectedInvoice.approved_at}
              approvedBy={selectedInvoice.approved_by}
              approvalMethod={selectedInvoice.approval_method}
            />
          </aside>
        ) : (
          <div className="flex flex-col gap-4 lg:col-span-4">
            <WeeklyValueSummary />

            <section aria-label="Verarbeitungsstatistik" className="flex flex-col gap-3">
              <h2 className="text-h3">Verarbeitungsstatistik</h2>
              <ProcessingStatsRow stats={statsRow} />
            </section>
          </div>
        )}
      </div>
    </>
  );
}

// Group rows by pipeline stage so "scroll to #stage-<id>" lands at a real
// anchor. `review` shows under the "Bereit" bucket per AC #1.
function GroupedInvoiceList({ rows, selectedId }: { rows: InvoiceRow[]; selectedId?: string | null }) {
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
                  isSelected={row.id === selectedId}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// Known-benign PostgREST codes that should not be forwarded to Sentry: empty
// single-row results, permission denied (auth will redirect separately).
const BENIGN_PG_CODES = new Set(["PGRST116"]);

function isBenignError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && BENIGN_PG_CODES.has(code);
}

function renderError(err: unknown, _opts?: { conflict?: boolean }) {
  console.error(LOG, err);
  if (!isBenignError(err)) {
    Sentry.captureException(err, {
      tags: { module: "dashboard", action: "load" },
    });
  }
  // Preserve the overall page shell so the right-column widgets remain visible
  // on partial degradation (Dev Notes — "partial degradation").
  return (
    <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
      <section className="flex flex-col gap-4 lg:col-span-8">
        <Card>
          <CardContent>
            <p className="py-6 text-center text-destructive">
              Dashboard konnte nicht vollständig geladen werden. Bitte
              aktualisiere die Seite.
            </p>
          </CardContent>
        </Card>
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
      </div>
    </div>
  );
}
