import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import { createServerClient } from "@/lib/supabase/server";
import { WeeklyValueSummary } from "./weekly-value-summary";

type MockRpcResult =
  | { data: object; error: null }
  | { data: null; error: { message: string } };

function mockRpcWith(result: MockRpcResult) {
  (createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    rpc: vi.fn().mockResolvedValue(result),
  });
}

describe("WeeklyValueSummary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("(a) renders zero-state message when week_invoices=0", async () => {
    mockRpcWith({
      data: [{
        week_invoices: 0,
        week_time_saved_minutes: 0,
        week_vat_total: 0,
        month_exported_count: 0,
        month_vat_total: 0,
      }],
      error: null,
    });
    const jsx = await WeeklyValueSummary();
    render(jsx);
    expect(screen.getByText("Diese Woche noch keine Rechnungen erfasst.")).toBeTruthy();
    expect(screen.getByText("Lade deine erste Rechnung der Woche hoch und sieh deine Zeitersparnis.")).toBeTruthy();
  });

  it("(b) renders all 3 week lines plus month line for non-zero data", async () => {
    mockRpcWith({
      data: [{
        week_invoices: 3,
        week_time_saved_minutes: 36,
        week_vat_total: 57,
        month_exported_count: 5,
        month_vat_total: 95,
      }],
      error: null,
    });
    const jsx = await WeeklyValueSummary();
    render(jsx);
    expect(screen.getByText(/Rechnungen diese Woche/)).toBeTruthy();
    expect(screen.getByText(/Geschätzte Zeitersparnis/)).toBeTruthy();
    expect(screen.getByText(/MwSt.-Vorsteuer diese Woche/)).toBeTruthy();
    expect(screen.getByText(/Exportiert/)).toBeTruthy();
  });

  it("(c) tabular-nums class is applied to data rows", async () => {
    mockRpcWith({
      data: [{
        week_invoices: 2,
        week_time_saved_minutes: 24,
        week_vat_total: 38,
        month_exported_count: 0,
        month_vat_total: 0,
      }],
      error: null,
    });
    const jsx = await WeeklyValueSummary();
    const { container } = render(jsx);
    const tabularEls = container.querySelectorAll(".tabular-nums");
    expect(tabularEls.length).toBeGreaterThan(0);
  });

  it("(d) hides month line when month_exported_count=0 and week_invoices>0", async () => {
    mockRpcWith({
      data: [{
        week_invoices: 1,
        week_time_saved_minutes: 12,
        week_vat_total: 19,
        month_exported_count: 0,
        month_vat_total: 0,
      }],
      error: null,
    });
    const jsx = await WeeklyValueSummary();
    render(jsx);
    expect(screen.queryByText(/Exportiert/)).toBeNull();
  });
});
