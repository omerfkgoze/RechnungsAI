import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`) as Error & { digest: string };
    err.digest = `NEXT_REDIRECT;${url}`;
    throw err;
  }),
}));

const sentryCaptureMock = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => sentryCaptureMock(...args),
}));

const buildExtfMock = vi.fn();
vi.mock("@rechnungsai/datev", () => ({
  buildExtfV700: (...args: unknown[]) => buildExtfMock(...args),
}));

const authGetUserMock = vi.fn();
const userSingleMock = vi.fn();
const tenantSingleMock = vi.fn();
const invoiceQueryResultMock = vi.fn();
const invoiceUpdateResultMock = vi.fn();
const datevInsertResultMock = vi.fn();
const auditInsertMock = vi.fn();

function makeChain(terminal: () => Promise<unknown>): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const ret = () => chain;
  chain.eq = ret;
  chain.in = ret;
  chain.gte = ret;
  chain.lte = ret;
  chain.order = ret;
  chain.limit = ret;
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    terminal().then(resolve, reject);
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: authGetUserMock },
    from: (table: string) => {
      if (table === "users") {
        return {
          select: () => ({ eq: () => ({ single: userSingleMock }) }),
        };
      }
      if (table === "tenants") {
        return {
          select: () => ({ eq: () => ({ single: tenantSingleMock }) }),
        };
      }
      if (table === "invoices") {
        return {
          select: () => makeChain(invoiceQueryResultMock),
          update: () => {
            const chain = makeChain(invoiceUpdateResultMock);
            (chain as { select: (...a: unknown[]) => unknown }).select = () =>
              invoiceUpdateResultMock();
            return chain;
          },
        };
      }
      if (table === "datev_exports") {
        return {
          insert: () => ({
            select: () => ({ single: datevInsertResultMock }),
          }),
        };
      }
      if (table === "audit_logs") {
        return { insert: (values: unknown) => auditInsertMock(values) };
      }
      return {};
    },
  })),
}));

import { prepareDatevExport } from "./datev";

const TENANT_ID = "00000000-0000-0000-0000-00000000aaaa";
const USER_ID = "00000000-0000-0000-0000-00000000bbbb";
const EXPORT_ID = "00000000-0000-0000-0000-00000000cccc";

const baseTenant = {
  company_name: "Müller GmbH",
  skr_plan: "SKR03",
  datev_berater_nr: "12345",
  datev_mandanten_nr: "678",
  datev_sachkontenlaenge: 4,
  datev_fiscal_year_start: 1,
  datev_default_kreditorenkonto: null,
};

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    gross_total_value: 119,
    invoice_date_value: "2026-05-03",
    invoice_number_value: "RE-1",
    supplier_name_value: "Lieferant",
    skr_code: "3400",
    bu_schluessel: 9,
    ...overrides,
  };
}

const buildOk = {
  csv: "﻿EXTF;700;...",
  rowCount: 3,
  skippedCount: 0,
  dateFrom: "20260501",
  dateTo: "20260506",
};

describe("prepareDatevExport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authGetUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    userSingleMock.mockResolvedValue({ data: { tenant_id: TENANT_ID }, error: null });
    tenantSingleMock.mockResolvedValue({ data: { ...baseTenant }, error: null });
    auditInsertMock.mockResolvedValue({ error: null });
    buildExtfMock.mockReturnValue({ ...buildOk });
    datevInsertResultMock.mockResolvedValue({ data: { id: EXPORT_ID }, error: null });
  });

  it("(a) happy path — returns rowCount, calls audit once with export_datev metadata", async () => {
    const rows = [row("a"), row("b"), row("c")];
    invoiceQueryResultMock.mockResolvedValueOnce({ data: rows, error: null });
    invoiceUpdateResultMock.mockResolvedValueOnce({
      data: rows.map((r) => ({ id: r.id })),
      error: null,
    });

    const result = await prepareDatevExport({ dateFrom: "2026-05-01", dateTo: "2026-05-06" });

    expect(result).toEqual({
      success: true,
      data: {
        missingSettings: false,
        exportId: EXPORT_ID,
        rowCount: 3,
        skippedCount: 0,
        dateFrom: "20260501",
        dateTo: "20260506",
      },
    });
    expect(auditInsertMock).toHaveBeenCalledOnce();
    const auditArg = auditInsertMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(auditArg.event_type).toBe("export_datev");
    expect((auditArg.metadata as Record<string, unknown>).format).toBe("extf-v700");
    expect((auditArg.metadata as Record<string, unknown>).row_count).toBe(3);
    expect((auditArg.metadata as Record<string, unknown>).invoice_ids).toEqual(["a", "b", "c"]);
    expect((auditArg.metadata as Record<string, unknown>).date_from).toBe("20260501");
  });

  it("(b) missing settings — returns missingSettings branch, no invoice query, no audit", async () => {
    tenantSingleMock.mockResolvedValueOnce({
      data: { ...baseTenant, datev_berater_nr: null },
      error: null,
    });
    const result = await prepareDatevExport({ dateFrom: "2026-05-01", dateTo: "2026-05-06" });
    expect(result).toEqual({
      success: true,
      data: { missingSettings: true, missingFields: ["datev_berater_nr"] },
    });
    expect(invoiceQueryResultMock).not.toHaveBeenCalled();
    expect(auditInsertMock).not.toHaveBeenCalled();
    expect(datevInsertResultMock).not.toHaveBeenCalled();
  });

  it("(c) zero rows — returns German error, no insert, no audit", async () => {
    invoiceQueryResultMock.mockResolvedValueOnce({ data: [], error: null });
    const result = await prepareDatevExport({ dateFrom: "2026-05-01", dateTo: "2026-05-06" });
    expect(result).toEqual({
      success: false,
      error: "Im gewählten Zeitraum gibt es keine freigegebenen Rechnungen für den Export.",
    });
    expect(datevInsertResultMock).not.toHaveBeenCalled();
    expect(auditInsertMock).not.toHaveBeenCalled();
  });

  it("(d) dateFrom > dateTo — Zod cross-field error in German", async () => {
    const result = await prepareDatevExport({ dateFrom: "2026-05-06", dateTo: "2026-05-01" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Startdatum darf nicht nach dem Enddatum liegen.");
    }
  });

  it("(e) auth failure — throws NEXT_REDIRECT", async () => {
    authGetUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(
      prepareDatevExport({ dateFrom: "2026-05-01", dateTo: "2026-05-06" }),
    ).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("(f) concurrent skip — only 3 of 5 transitioned, audit logs 3 actually-transitioned ids, console.warn invoked", async () => {
    const rows = [row("a"), row("b"), row("c"), row("d"), row("e")];
    invoiceQueryResultMock.mockResolvedValueOnce({ data: rows, error: null });
    buildExtfMock.mockReturnValueOnce({ ...buildOk, rowCount: 5 });
    invoiceUpdateResultMock.mockResolvedValueOnce({
      data: [{ id: "a" }, { id: "b" }, { id: "c" }],
      error: null,
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await prepareDatevExport({ dateFrom: "2026-05-01", dateTo: "2026-05-06" });

    expect(result.success).toBe(true);
    if (result.success && !result.data.missingSettings) {
      expect(result.data.rowCount).toBe(3);
    }
    expect(warnSpy).toHaveBeenCalled();
    const auditArg = auditInsertMock.mock.calls[0]![0] as Record<string, unknown>;
    expect((auditArg.metadata as Record<string, unknown>).invoice_ids).toEqual(["a", "b", "c"]);
    expect((auditArg.metadata as Record<string, unknown>).row_count).toBe(3);
    warnSpy.mockRestore();
  });

  it("(g) datev_exports insert fails — generic German error + Sentry tag module:datev", async () => {
    invoiceQueryResultMock.mockResolvedValueOnce({ data: [row("a")], error: null });
    buildExtfMock.mockReturnValueOnce({ ...buildOk, rowCount: 1 });
    datevInsertResultMock.mockResolvedValueOnce({
      data: null,
      error: { code: "XX000", message: "boom" },
    });

    const result = await prepareDatevExport({ dateFrom: "2026-05-01", dateTo: "2026-05-06" });
    expect(result).toEqual({
      success: false,
      error: "Unerwarteter Fehler. Bitte erneut versuchen.",
    });
    expect(sentryCaptureMock).toHaveBeenCalled();
    const sentryArgs = sentryCaptureMock.mock.calls[0]!;
    expect((sentryArgs[1] as { tags: { module: string; action: string } }).tags).toEqual({
      module: "datev",
      action: "prepare_export",
    });
  });

  it("(h) SKR04 tenant — buildExtfV700 receives skrPlan SKR04", async () => {
    tenantSingleMock.mockResolvedValueOnce({
      data: { ...baseTenant, skr_plan: "SKR04" },
      error: null,
    });
    invoiceQueryResultMock.mockResolvedValueOnce({ data: [row("a")], error: null });
    buildExtfMock.mockReturnValueOnce({ ...buildOk, rowCount: 1 });
    invoiceUpdateResultMock.mockResolvedValueOnce({ data: [{ id: "a" }], error: null });

    await prepareDatevExport({ dateFrom: "2026-05-01", dateTo: "2026-05-06" });
    expect(buildExtfMock).toHaveBeenCalledOnce();
    const tenantArg = buildExtfMock.mock.calls[0]![0] as { skrPlan: string };
    expect(tenantArg.skrPlan).toBe("SKR04");
  });
});
