import { describe, it, expect } from "vitest";
import {
  buildExtfV700,
  formatAmount,
  formatBelegdatum,
  formatBuSchluessel,
  padAccount,
  sanitizeBelegfeld1,
  gegenKonto,
  computeWjBeginn,
} from "./extf-v700.js";
import type { DatevTenantConfig, DatevBookingRow } from "../types.js";

const baseConfig: DatevTenantConfig = {
  beraterNr: "12345",
  mandantenNr: "67890",
  sachkontenlaenge: 4,
  fiscalYearStart: 1,
  skrPlan: "SKR03",
  defaultKreditorenkonto: null,
};

const baseRow: DatevBookingRow = {
  gross_total: 1190.0,
  invoice_date: "2024-02-21",
  invoice_number: "RE-2024/001",
  supplier: "Muster GmbH",
  skr_code: "4940",
  bu_schluessel: 9,
};

describe("formatAmount", () => {
  it("formats with comma decimal separator", () => {
    expect(formatAmount(1234.56)).toBe("1234,56");
  });

  it("preserves trailing zero", () => {
    expect(formatAmount(0.1)).toBe("0,10");
  });

  it("uses absolute value (always positive)", () => {
    expect(formatAmount(-500.0)).toBe("500,00");
  });
});

describe("formatBelegdatum", () => {
  it("returns DDMM (day first, then month)", () => {
    expect(formatBelegdatum("2024-02-21")).toBe("2102");
  });

  it("does NOT return MMDD", () => {
    expect(formatBelegdatum("2024-02-21")).not.toBe("0221");
  });
});

describe("padAccount", () => {
  it("no padding when code already meets length", () => {
    expect(padAccount("4940", 4)).toBe("4940");
  });

  it("left-pads with zero when length is greater", () => {
    expect(padAccount("8400", 5)).toBe("08400");
  });
});

describe("formatBuSchluessel", () => {
  it("returns numeric string for non-zero codes", () => {
    expect(formatBuSchluessel(9)).toBe("9");
  });

  it("returns empty string for 0", () => {
    expect(formatBuSchluessel(0)).toBe("");
  });

  it("returns empty string for null", () => {
    expect(formatBuSchluessel(null)).toBe("");
  });
});

describe("gegenKonto", () => {
  it("returns SKR03 fallback when no defaultKreditorenkonto and SKR03", () => {
    expect(gegenKonto({ ...baseConfig, skrPlan: "SKR03", defaultKreditorenkonto: null })).toBe(
      "70000",
    );
  });

  it("returns SKR04 fallback when no defaultKreditorenkonto and SKR04", () => {
    expect(gegenKonto({ ...baseConfig, skrPlan: "SKR04", defaultKreditorenkonto: null })).toBe(
      "10000",
    );
  });

  it("returns configured defaultKreditorenkonto when set", () => {
    expect(gegenKonto({ ...baseConfig, defaultKreditorenkonto: "70500" })).toBe("70500");
  });
});

describe("sanitizeBelegfeld1", () => {
  it("allows alphanumeric and permitted special chars including - and /", () => {
    expect(sanitizeBelegfeld1("RE-2024/001")).toBe("RE-2024/001");
  });

  it("strips spaces (illegal chars)", () => {
    expect(sanitizeBelegfeld1("RE 2024")).toBe("RE2024");
  });

  it("truncates to max 36 chars", () => {
    const long = "A".repeat(40);
    expect(sanitizeBelegfeld1(long)).toHaveLength(36);
  });

  it("returns empty string for null", () => {
    expect(sanitizeBelegfeld1(null)).toBe("");
  });
});

describe("computeWjBeginn", () => {
  it("Jan fiscal start, March reference → current year", () => {
    expect(computeWjBeginn(1, new Date("2024-03-15"))).toBe("20240101");
  });

  it("Jul fiscal start, March reference → previous year (March is before July)", () => {
    expect(computeWjBeginn(7, new Date("2024-03-15"))).toBe("20230701");
  });

  it("Jul fiscal start, August reference → current year (August is after July)", () => {
    expect(computeWjBeginn(7, new Date("2024-08-01"))).toBe("20240701");
  });
});

describe("buildExtfV700", () => {
  it("CSV starts with UTF-8 BOM (charCode 0xFEFF)", () => {
    const result = buildExtfV700(baseConfig, [baseRow]);
    expect(result.csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("uses CRLF line endings", () => {
    const result = buildExtfV700(baseConfig, [baseRow]);
    expect(result.csv).toContain("\r\n");
  });

  it("has no bare LF outside of CRLF", () => {
    const result = buildExtfV700(baseConfig, [baseRow]);
    const withoutCRLF = result.csv.replace(/\r\n/g, "");
    expect(withoutCRLF).not.toContain("\n");
  });

  it("uses semicolon as field delimiter in data rows", () => {
    const result = buildExtfV700(baseConfig, [baseRow]);
    const lines = result.csv.split("\r\n").filter((l) => l.length > 0);
    // data row is line index 2 (0: header, 1: column labels, 2: first data row)
    expect(lines[2]).toContain(";");
  });

  it("with 3 valid rows: rowCount=3, skippedCount=0, 5 non-empty lines", () => {
    const rows = [baseRow, baseRow, baseRow];
    const result = buildExtfV700(baseConfig, rows);
    expect(result.rowCount).toBe(3);
    expect(result.skippedCount).toBe(0);
    const lines = result.csv.split("\r\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(5); // EXTF header + column labels + 3 data rows
  });

  it("with 1 null gross_total row: skippedCount=1, that row not in CSV", () => {
    const skippedRow: DatevBookingRow = { ...baseRow, gross_total: 0 };
    const result = buildExtfV700(baseConfig, [skippedRow]);
    expect(result.skippedCount).toBe(1);
    expect(result.rowCount).toBe(0);
    const lines = result.csv.split("\r\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(2); // only EXTF header + column labels
  });

  it("with empty rows: rowCount=0, CSV still has header + column label rows", () => {
    const result = buildExtfV700(baseConfig, []);
    expect(result.rowCount).toBe(0);
    const lines = result.csv.split("\r\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);
  });

  it("header field 11 (beraterNr) is at correct semicolon position in line 1", () => {
    const result = buildExtfV700(baseConfig, [baseRow]);
    const line1 = result.csv.split("\r\n")[0]!;
    // Remove BOM character before splitting
    const withoutBOM = line1.slice(1);
    const fields = withoutBOM.split(";");
    expect(fields[10]).toBe(baseConfig.beraterNr);
  });

  it("formula injection guard: supplier starting with = gets ' prefix", () => {
    const maliciousRow: DatevBookingRow = { ...baseRow, supplier: "=MALICIOUS()" };
    const result = buildExtfV700(baseConfig, [maliciousRow]);
    const lines = result.csv.split("\r\n").filter((l) => l.length > 0);
    const dataRow = lines[2]!;
    expect(dataRow).toContain("'=MALICIOUS()");
  });

  it("skips rows with non-finite gross_total", () => {
    const invalidRow: DatevBookingRow = { ...baseRow, gross_total: NaN };
    const result = buildExtfV700(baseConfig, [invalidRow]);
    expect(result.skippedCount).toBe(1);
    expect(result.rowCount).toBe(0);
  });

  it("skips rows with falsy invoice_date", () => {
    const invalidRow: DatevBookingRow = { ...baseRow, invoice_date: "" };
    const result = buildExtfV700(baseConfig, [invalidRow]);
    expect(result.skippedCount).toBe(1);
  });

  it("does NOT skip rows with null skr_code", () => {
    const rowWithNullSkr: DatevBookingRow = { ...baseRow, skr_code: null };
    const result = buildExtfV700(baseConfig, [rowWithNullSkr]);
    expect(result.rowCount).toBe(1);
    expect(result.skippedCount).toBe(0);
  });
});
