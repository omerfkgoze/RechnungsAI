import { describe, expect, it } from "vitest";
import { applyGermanDateMask, formatEur, formatDateDe, isoToGermanDateInput, parseGermanDate, safeCurrency, parseGermanDecimal, formatValue } from "./format";

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

describe("parseGermanDate", () => {
  it("parses TT.MM.JJJJ to ISO YYYY-MM-DD", () => {
    expect(parseGermanDate("22.04.2026")).toBe("2026-04-22");
  });

  it("parses single-digit day/month with dot separator", () => {
    expect(parseGermanDate("5.1.2026")).toBe("2026-01-05");
  });

  it("accepts hyphen separator (DD-MM-YYYY)", () => {
    expect(parseGermanDate("22-04-2026")).toBe("2026-04-22");
  });

  it("accepts slash separator (DD/MM/YYYY)", () => {
    expect(parseGermanDate("22/04/2026")).toBe("2026-04-22");
  });

  it("accepts ISO YYYY-MM-DD as input", () => {
    expect(parseGermanDate("2026-04-22")).toBe("2026-04-22");
  });

  it("rejects MM/DD/YYYY ambiguous American interpretation (treats as DD.MM)", () => {
    // 03.15.2026 → day=3, month=15 → invalid month
    expect(parseGermanDate("03.15.2026")).toBeNull();
  });

  it("rejects impossible calendar dates", () => {
    expect(parseGermanDate("31.02.2026")).toBeNull();
    expect(parseGermanDate("32.01.2026")).toBeNull();
    expect(parseGermanDate("00.01.2026")).toBeNull();
  });

  it("rejects garbage input", () => {
    expect(parseGermanDate("")).toBeNull();
    expect(parseGermanDate("not-a-date")).toBeNull();
    expect(parseGermanDate("22.04")).toBeNull();
  });
});

describe("applyGermanDateMask (active mask)", () => {
  it("injects '.' immediately after DD and MM when the user is typing", () => {
    expect(applyGermanDateMask("1", "")).toBe("1");
    expect(applyGermanDateMask("15", "1")).toBe("15.");
    expect(applyGermanDateMask("15.0", "15.")).toBe("15.0");
    expect(applyGermanDateMask("15.03", "15.0")).toBe("15.03.");
    expect(applyGermanDateMask("15.03.2", "15.03.")).toBe("15.03.2");
    expect(applyGermanDateMask("15.03.2026", "15.03.202")).toBe("15.03.2026");
  });

  it("does NOT re-inject the separator the user just deleted (backspace)", () => {
    expect(applyGermanDateMask("15.03", "15.03.")).toBe("15.03");
    expect(applyGermanDateMask("15", "15.")).toBe("15");
  });

  it("is idempotent when next equals prev (no input event)", () => {
    expect(applyGermanDateMask("15.03.2026", "15.03.2026")).toBe("15.03.2026");
    expect(applyGermanDateMask("", "")).toBe("");
  });

  it("strips non-digit characters and other separators (paste)", () => {
    expect(applyGermanDateMask("15-03-2026", "")).toBe("15.03.2026");
    expect(applyGermanDateMask("15/03/2026", "")).toBe("15.03.2026");
    expect(applyGermanDateMask("15a03b2026", "")).toBe("15.03.2026");
  });

  it("caps at 8 digits (TT.MM.JJJJ) — extra digits are discarded", () => {
    expect(applyGermanDateMask("150320261234", "")).toBe("15.03.2026");
  });

  it("paste of partial DD+MM auto-injects trailing '.'", () => {
    expect(applyGermanDateMask("1503", "")).toBe("15.03.");
  });
});

describe("isoToGermanDateInput", () => {
  it("converts ISO to TT.MM.JJJJ", () => {
    expect(isoToGermanDateInput("2026-04-22")).toBe("22.04.2026");
  });

  it("returns empty string for null/undefined/empty/invalid", () => {
    expect(isoToGermanDateInput(null)).toBe("");
    expect(isoToGermanDateInput(undefined)).toBe("");
    expect(isoToGermanDateInput("")).toBe("");
    expect(isoToGermanDateInput("22.04.2026")).toBe("");
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
