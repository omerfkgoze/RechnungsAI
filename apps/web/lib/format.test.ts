import { describe, expect, it } from "vitest";
import { formatEur, formatDateDe } from "./format";

describe("formatEur", () => {
  it("formats a positive number as German EUR with padded decimals", () => {
    expect(formatEur(1234.56)).toMatch(/1\.234,56\s?€/);
  });

  it("returns em-dash for null", () => {
    expect(formatEur(null)).toBe("—");
  });

  it("returns em-dash for undefined", () => {
    expect(formatEur(undefined)).toBe("—");
  });

  it("respects a non-EUR currency code", () => {
    expect(formatEur(1000, "USD")).toContain("1.000,00");
  });

  it("falls back to EUR when currency is empty string", () => {
    expect(formatEur(42, "")).toMatch(/42,00\s?€/);
  });

  it("falls back gracefully when currency code is invalid", () => {
    const out = formatEur(5, "XXXX-bogus");
    expect(out).toMatch(/5,00/);
  });
});

describe("formatDateDe", () => {
  it("formats an ISO date as dd.MM.yyyy (zero-padded)", () => {
    expect(formatDateDe("2026-04-22")).toBe("22.04.2026");
  });

  it("pads single-digit days/months", () => {
    expect(formatDateDe("2026-01-05")).toBe("05.01.2026");
  });

  it("returns em-dash for null/invalid", () => {
    expect(formatDateDe(null)).toBe("—");
    expect(formatDateDe("not-a-date")).toBe("—");
  });

  it("accepts Date objects", () => {
    expect(formatDateDe(new Date("2026-04-22T10:00:00Z"))).toBe("22.04.2026");
  });
});
