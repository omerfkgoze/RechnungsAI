import { describe, expect, it } from "vitest";
import { parseArchiveQuery, PAGE_SIZE } from "./archive-query";

describe("parseArchiveQuery", () => {
  it("returns defaults when called with null", () => {
    const result = parseArchiveQuery(null);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(PAGE_SIZE);
    expect(result.dateFrom).toBeUndefined();
    expect(result.supplier).toBeUndefined();
  });

  it("drops bad dateFrom and keeps valid dateTo", () => {
    const result = parseArchiveQuery({ dateFrom: "not-a-date", dateTo: "2026-12-31" });
    expect(result.dateFrom).toBeUndefined();
    expect(result.dateTo).toBe("2026-12-31");
  });

  it("drops bad amount and keeps valid counterpart", () => {
    const result = parseArchiveQuery({ minAmount: "abc", maxAmount: "500" });
    expect(result.minAmount).toBeUndefined();
    expect(result.maxAmount).toBe(500);
  });

  it("coerces bad page to default 1", () => {
    const result = parseArchiveQuery({ page: "abc" });
    expect(result.page).toBe(1);
  });

  it("truncates supplier to 100 chars maximum", () => {
    const long = "x".repeat(200);
    const result = parseArchiveQuery({ supplier: long });
    expect(result.supplier).toBeUndefined();
  });

  it("accepts 4-digit fiscalYear and rejects non-4-digit", () => {
    const ok = parseArchiveQuery({ fiscalYear: "2025" });
    expect(ok.fiscalYear).toBe(2025);

    const bad = parseArchiveQuery({ fiscalYear: "25" });
    expect(bad.fiscalYear).toBeUndefined();
  });
});
