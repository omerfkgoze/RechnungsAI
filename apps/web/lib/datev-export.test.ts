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

  // P19 — month label reflects the actual range, not a single midpoint month.
  it("single-month range — single month label", () => {
    const url = buildSteuerberaterMailto({
      dateFromIso: "2026-05-01",
      dateToIso: "2026-05-31",
      tenantCompanyName: "X",
    });
    const subject = decodeURIComponent(url.split("?subject=")[1]!.split("&")[0]!);
    expect(subject).toBe("DATEV Export Mai 2026 X");
  });

  it("cross-month same-year range — both months separated by en-dash", () => {
    const url = buildSteuerberaterMailto({
      dateFromIso: "2026-04-25",
      dateToIso: "2026-05-04",
      tenantCompanyName: "X",
    });
    const subject = decodeURIComponent(url.split("?subject=")[1]!.split("&")[0]!);
    expect(subject).toBe("DATEV Export April–Mai 2026 X");
  });

  it("cross-year range — fully-qualified labels on each side", () => {
    const url = buildSteuerberaterMailto({
      dateFromIso: "2026-12-15",
      dateToIso: "2027-01-15",
      tenantCompanyName: "X",
    });
    const subject = decodeURIComponent(url.split("?subject=")[1]!.split("&")[0]!);
    expect(subject).toBe("DATEV Export Dezember 2026–Januar 2027 X");
  });
});
