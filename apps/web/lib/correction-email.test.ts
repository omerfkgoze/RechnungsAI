import { describe, expect, it } from "vitest";
import { buildCorrectionMailto, type CorrectionViolation } from "./correction-email";

const baseViolation = (over: Partial<CorrectionViolation> = {}): CorrectionViolation => ({
  ruleId: "BR-01",
  severity: "error",
  message: "Die Rechnungsnummer fehlt.",
  ...over,
});

function decodeBody(url: string): string {
  const bodyEncoded = url.split("&body=")[1] ?? "";
  return decodeURIComponent(bodyEncoded);
}

function decodeSubject(url: string): string {
  const subjectEncoded = url.split("?subject=")[1]?.split("&")[0] ?? "";
  return decodeURIComponent(subjectEncoded);
}

describe("buildCorrectionMailto", () => {
  it("(a) all fields present, single violation → recipient + body asserted", () => {
    const url = buildCorrectionMailto({
      supplierEmail: "lieferant@beispiel.de",
      invoiceNumber: "R-2026-001",
      invoiceDateIso: "2026-05-12",
      supplierName: "Acme GmbH",
      violations: [baseViolation()],
      tenantCompanyName: "Müller GmbH",
    });
    expect(url.startsWith("mailto:lieferant@beispiel.de?subject=")).toBe(true);
    const subject = decodeSubject(url);
    expect(subject).toBe("Korrekturanfrage Rechnung R-2026-001 vom 12.05.2026");
    const body = decodeBody(url);
    expect(body).toContain("Sehr geehrte Damen und Herren,");
    expect(body).toContain("R-2026-001");
    expect(body).toContain("12.05.2026");
    expect(body).toContain("- Die Rechnungsnummer fehlt. (BR-01)");
    expect(body).toContain("Müller GmbH");
  });

  it("(b) supplierEmail = null → no recipient (mailto:?subject=…)", () => {
    const url = buildCorrectionMailto({
      supplierEmail: null,
      invoiceNumber: "X",
      invoiceDateIso: "2026-01-01",
      supplierName: null,
      violations: [],
      tenantCompanyName: "X",
    });
    expect(url.startsWith("mailto:?subject=")).toBe(true);
  });

  it("(c) 20 violations → top 15 by severity + truncation line; total visible lines = 16", () => {
    const violations: CorrectionViolation[] = [
      ...Array.from({ length: 5 }, (_, i) => baseViolation({
        ruleId: `WARN-${i.toString().padStart(2, "0")}`,
        severity: "warning",
        message: `Hinweis ${i}`,
      })),
      ...Array.from({ length: 10 }, (_, i) => baseViolation({
        ruleId: `ERR-${i.toString().padStart(2, "0")}`,
        severity: "error",
        message: `Fehler ${i}`,
      })),
      ...Array.from({ length: 5 }, (_, i) => baseViolation({
        ruleId: `FATAL-${i.toString().padStart(2, "0")}`,
        severity: "fatal",
        message: `Schwerwiegend ${i}`,
      })),
    ];

    const url = buildCorrectionMailto({
      supplierEmail: "x@y.de",
      invoiceNumber: "R-1",
      invoiceDateIso: "2026-05-12",
      supplierName: null,
      violations,
      tenantCompanyName: "T",
    });
    const body = decodeBody(url);
    const bulletLines = body.split("\n").filter((l) => l.startsWith("-"));
    // 15 violation lines + 1 truncation note.
    expect(bulletLines).toHaveLength(16);
    // Fatal entries (sorted first) appear before any "warning" lines.
    const firstFatal = bulletLines.findIndex((l) => l.includes("FATAL-"));
    const firstWarn = bulletLines.findIndex((l) => l.includes("WARN-"));
    expect(firstFatal).toBeLessThan(firstWarn === -1 ? Infinity : firstWarn);
    // Truncation suffix is the last bullet line.
    expect(bulletLines[bulletLines.length - 1]).toContain("5 weitere Punkte");
  });

  it("(d) invoiceNumber + invoiceDateIso both null → subject is plain, body uses placeholders", () => {
    const url = buildCorrectionMailto({
      supplierEmail: null,
      invoiceNumber: null,
      invoiceDateIso: null,
      supplierName: null,
      violations: [baseViolation()],
      tenantCompanyName: "Co",
    });
    expect(decodeSubject(url)).toBe("Korrekturanfrage Rechnung");
    const body = decodeBody(url);
    expect(body).toContain("[Rechnungsnummer unbekannt]");
    expect(body).toContain("[Datum unbekannt]");
  });

  it("(e) invoiceDateIso='2026-05-12' is rendered as 12.05.2026 in the body", () => {
    const url = buildCorrectionMailto({
      supplierEmail: null,
      invoiceNumber: "R",
      invoiceDateIso: "2026-05-12",
      supplierName: null,
      violations: [],
      tenantCompanyName: "Co",
    });
    expect(decodeBody(url)).toContain("12.05.2026");
  });

  it("rejects malformed supplier email and falls back to no recipient", () => {
    const url = buildCorrectionMailto({
      supplierEmail: "not-an-email",
      invoiceNumber: "R",
      invoiceDateIso: "2026-05-12",
      supplierName: null,
      violations: [],
      tenantCompanyName: "Co",
    });
    expect(url.startsWith("mailto:?subject=")).toBe(true);
  });

  it("worst-case 50 violations stays under 2000 chars after encoding", () => {
    const violations: CorrectionViolation[] = Array.from({ length: 50 }, (_, i) =>
      baseViolation({
        ruleId: `BR-${i.toString().padStart(3, "0")}`,
        severity: "error",
        // Match real EN 16931 package message length (~50 chars).
        message: "Pflichtfeld BT-XX (Beschreibung) fehlt.",
      }),
    );
    const url = buildCorrectionMailto({
      supplierEmail: "a@b.de",
      invoiceNumber: "R-2026-001",
      invoiceDateIso: "2026-05-12",
      supplierName: "Sup",
      violations,
      tenantCompanyName: "T",
    });
    expect(url.length).toBeLessThan(2000);
  });
});
