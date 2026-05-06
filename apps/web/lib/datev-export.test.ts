import { describe, expect, it } from "vitest";
import { buildSteuerberaterMailto, formatDateRangeGerman } from "./datev-export";

describe("formatDateRangeGerman", () => {
  it("month-only range", () => {
    expect(formatDateRangeGerman("2026-05-01", "2026-05-06")).toBe("01.05.2026 – 06.05.2026");
  });

  it("cross-month range", () => {
    expect(formatDateRangeGerman("2026-04-25", "2026-05-10")).toBe("25.04.2026 – 10.05.2026");
  });

  it("full-year range", () => {
    expect(formatDateRangeGerman("2026-01-01", "2026-12-31")).toBe("01.01.2026 – 31.12.2026");
  });
});

describe("buildSteuerberaterMailto", () => {
  it("URL-encodes umlaut tenant name in subject", () => {
    const url = buildSteuerberaterMailto({
      dateFromIso: "2026-05-01",
      dateToIso: "2026-05-06",
      tenantCompanyName: "Müller GmbH",
    });
    expect(url.startsWith("mailto:?subject=")).toBe(true);
    expect(url).toContain(encodeURIComponent("Müller GmbH"));
    expect(url).toContain(encodeURIComponent("Mai 2026"));
    // Body contains the German date range with the en-dash.
    expect(decodeURIComponent(url.split("&body=")[1]!)).toContain("01.05.2026 – 06.05.2026");
  });
});
