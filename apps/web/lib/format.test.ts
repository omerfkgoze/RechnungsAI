import { describe, expect, it } from "vitest";
import { formatEur, formatDateDe, safeCurrency, parseGermanDecimal, formatValue } from "./format";

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

describe("safeCurrency", () => {
  it("returns valid 3-letter uppercase codes as-is", () => {
    expect(safeCurrency("EUR")).toBe("EUR");
    expect(safeCurrency("USD")).toBe("USD");
    expect(safeCurrency("CHF")).toBe("CHF");
  });

  it("falls back to EUR for invalid/empty/null", () => {
    expect(safeCurrency(null)).toBe("EUR");
    expect(safeCurrency(undefined)).toBe("EUR");
    expect(safeCurrency("")).toBe("EUR");
    expect(safeCurrency("eu")).toBe("EUR");
    expect(safeCurrency("EURO")).toBe("EUR");
  });
});

describe("parseGermanDecimal", () => {
  it("parses German-locale amount 1.234,56 to 1234.56", () => {
    expect(parseGermanDecimal("1.234,56")).toBe(1234.56);
  });

  it("parses machine format 1234.56 to 1234.56", () => {
    expect(parseGermanDecimal("1234.56")).toBe(1234.56);
  });

  it("parses integer 42 to 42", () => {
    expect(parseGermanDecimal("42")).toBe(42);
  });

  it("parses negative amounts", () => {
    expect(parseGermanDecimal("-100,50")).toBe(-100.5);
  });

  it("returns null for empty string", () => {
    expect(parseGermanDecimal("")).toBeNull();
  });

  it("returns null for non-numeric input", () => {
    expect(parseGermanDecimal("abc")).toBeNull();
    expect(parseGermanDecimal("12.34.56")).toBeNull();
  });
});

describe("formatValue", () => {
  it("returns em-dash for null value", () => {
    expect(formatValue("supplier_name", null)).toBe("—");
  });

  it("formats net_total as currency", () => {
    const out = formatValue("net_total", 1000, "EUR");
    expect(out).toMatch(/1\.000,00/);
  });

  it("formats invoice_date as German date", () => {
    expect(formatValue("invoice_date", "2026-04-22")).toBe("22.04.2026");
  });

  it("formats text fields as string", () => {
    expect(formatValue("supplier_name", "ACME GmbH")).toBe("ACME GmbH");
  });
});
