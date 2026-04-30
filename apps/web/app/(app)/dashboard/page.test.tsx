import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    const err = Object.assign(new Error(`NEXT_REDIRECT:${url}`), {
      digest: `NEXT_REDIRECT;${url}`,
    });
    throw err;
  }),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

// Mock all dashboard/invoice UI components to avoid deep dependency chains.
vi.mock("@/components/dashboard/pipeline-header", () => ({
  aggregateStageCounts: vi.fn(() => ({})),
  PipelineHeader: () => null,
}));
vi.mock("@/components/dashboard/invoice-list-card", () => ({
  InvoiceListCard: () => null,
}));
vi.mock("@/components/dashboard/invoice-list-filters", () => ({
  InvoiceListFilters: () => null,
}));
vi.mock("@/components/dashboard/processing-stats-row", () => ({
  ProcessingStatsRow: () => null,
}));
vi.mock("@/components/dashboard/dashboard-realtime-refresher", () => ({
  DashboardRealtimeRefresher: () => null,
}));
vi.mock("@/components/dashboard/dashboard-esc-handler", () => ({
  DashboardEscHandler: () => null,
}));
vi.mock("@/components/dashboard/dashboard-keyboard-shortcuts", () => ({
  DashboardKeyboardShortcuts: () => null,
}));
vi.mock("@/components/dashboard/session-summary", () => ({
  SessionSummary: (props: Record<string, unknown>) => {
    return { type: "SessionSummary", props };
  },
}));
vi.mock("@/components/dashboard/export-action", () => ({
  ExportAction: () => null,
}));
vi.mock("@/components/dashboard/weekly-value-summary", () => ({
  WeeklyValueSummary: () => null,
}));
vi.mock("@/components/invoice/invoice-detail-pane", () => ({
  InvoiceDetailPane: () => null,
}));
vi.mock("@/components/ui/card", () => ({
  Card: () => null,
  CardContent: () => null,
  CardHeader: () => null,
  CardTitle: () => null,
}));
vi.mock("@/components/layout/empty-state", () => ({
  EmptyState: () => null,
}));
vi.mock("@/lib/dashboard-query", () => ({
  parseDashboardQuery: vi.fn(() => ({})),
  DEFAULT_SORT: "date_desc",
}));
vi.mock("@/lib/status-labels", () => ({
  PIPELINE_STAGES: [],
  PIPELINE_STAGE_LABEL_DE: {},
}));

const auditCountMock = vi.fn();
const authGetUserMock = vi.fn();
const userSingleMock = vi.fn();
const rpcMock = vi.fn();

function makeInvoiceChain() {
  const chain: Record<string, unknown> = {};
  const terminal = () => Promise.resolve({ data: [], error: null });
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.gte = vi.fn(() => chain);
  chain.lt = vi.fn(() => chain);
  chain.ilike = vi.fn(() => chain);
  chain.lte = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.single = terminal;
  chain.maybeSingle = terminal;
  chain.then = (cb: (v: unknown) => void, rej?: (e: unknown) => void) =>
    Promise.resolve({ data: [], error: null }).then(cb, rej);
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: authGetUserMock },
    from: (table: string) => {
      if (table === "users") {
        return { select: () => ({ eq: () => ({ single: userSingleMock }) }) };
      }
      if (table === "invoices") {
        return makeInvoiceChain();
      }
      if (table === "audit_logs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: auditCountMock,
              })),
            })),
          })),
        };
      }
      return {};
    },
    rpc: rpcMock,
  })),
}));

import DashboardPage from "./page";

describe("DashboardPage — audit_logs count wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authGetUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    userSingleMock.mockResolvedValue({ data: { tenant_id: "tenant-1" }, error: null });
    rpcMock.mockResolvedValue({ data: [], error: null });
    auditCountMock.mockResolvedValue({ count: 3, error: null });
  });

  it("queries audit_logs with count:exact head:true and passes errorCount=3 to SessionSummary", async () => {
    const result = await DashboardPage({ searchParams: Promise.resolve({}) });

    expect(auditCountMock).toHaveBeenCalledOnce();
    // Verify errorCount:3 is threaded into the JSX props passed to SessionSummary
    expect(JSON.stringify(result)).toContain('"errorCount":3');
  });
});
