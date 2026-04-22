import { describe, expect, it } from "vitest";
import { parseDashboardQuery } from "./dashboard-query";

describe("parseDashboardQuery", () => {
  it("happy path: all valid params pass through", () => {
    const out = parseDashboardQuery({
      status: "ready",
      supplier: "ACME",
      minAmount: "10.5",
      maxAmount: "500",
      from: "2026-01-01",
      to: "2026-12-31",
      sort: "amount_desc",
      stage: "ready",
    });
    expect(out).toEqual({
      status: "ready",
      supplier: "ACME",
      minAmount: 10.5,
      maxAmount: 500,
      from: "2026-01-01",
      to: "2026-12-31",
      sort: "amount_desc",
      stage: "ready",
    });
  });

  it("empty input returns empty object", () => {
    expect(parseDashboardQuery(undefined)).toEqual({});
    expect(parseDashboardQuery({})).toEqual({});
    expect(parseDashboardQuery(null)).toEqual({});
  });

  it("drops negative and non-numeric amounts silently", () => {
    const out = parseDashboardQuery({
      minAmount: "-5",
      maxAmount: "abc",
      status: "ready",
    });
    expect(out.minAmount).toBeUndefined();
    expect(out.maxAmount).toBeUndefined();
    expect(out.status).toBe("ready");
  });

  it("drops amount over 1_000_000", () => {
    const out = parseDashboardQuery({ maxAmount: "1000001" });
    expect(out.maxAmount).toBeUndefined();
  });

  it("drops invalid date formats", () => {
    const out = parseDashboardQuery({ from: "22.04.2026", to: "not-a-date" });
    expect(out.from).toBeUndefined();
    expect(out.to).toBeUndefined();
  });

  it("trims supplier and rejects strings >100 chars after trim", () => {
    const longName = "A".repeat(101);
    const out = parseDashboardQuery({ supplier: `  ${longName}  ` });
    expect(out.supplier).toBeUndefined();
    const ok = parseDashboardQuery({ supplier: "  ACME  " });
    expect(ok.supplier).toBe("ACME");
  });

  it("drops unknown sort value, keeps known ones", () => {
    expect(parseDashboardQuery({ sort: "bogus" }).sort).toBeUndefined();
    expect(parseDashboardQuery({ sort: "date_asc" }).sort).toBe("date_asc");
  });

  it("accepts URLSearchParams input", () => {
    const sp = new URLSearchParams({ status: "review", supplier: "Shop" });
    const out = parseDashboardQuery(sp);
    expect(out.status).toBe("review");
    expect(out.supplier).toBe("Shop");
  });
});
