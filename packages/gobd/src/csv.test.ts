import { describe, expect, it } from "vitest";
import { buildSummaryCsv, buildAuditTrailCsv, type SummaryRow, type AuditTrailRow } from "./csv.js";

const baseSummaryRow: SummaryRow = {
  id: "inv-001",
  supplier: "Muster GmbH",
  invoice_number: "RE-2026-001",
  invoice_date: "2026-01-15",
  gross_total: 1234.56,
  skr_code: "4200",
  bu_schluessel: null,
  status: "ready",
  approved_at: null,
  sha256: "abc123",
  verification_status: "verified",
};

describe("buildSummaryCsv", () => {
  it("starts with UTF-8 BOM (0xFEFF)", () => {
    const csv = buildSummaryCsv([baseSummaryRow]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("uses semicolon as delimiter", () => {
    const csv = buildSummaryCsv([baseSummaryRow]);
    const firstDataLine = csv.split("\r\n")[1];
    expect(firstDataLine).toContain(";");
    const fields = firstDataLine!.split(";");
    expect(fields.length).toBeGreaterThan(5);
  });

  it("quote-escapes fields containing semicolons or double-quotes", () => {
    const row: SummaryRow = {
      ...baseSummaryRow,
      supplier: 'Müller; Söhne "GmbH"',
    };
    const csv = buildSummaryCsv([row]);
    expect(csv).toContain('"Müller; Söhne ""GmbH"""');
  });

  it("formats gross_total as German locale number (1234.56 → 1.234,56)", () => {
    const csv = buildSummaryCsv([{ ...baseSummaryRow, gross_total: 1234.56 }]);
    expect(csv).toContain("1.234,56");
  });
});

describe("buildAuditTrailCsv", () => {
  const baseAuditRow: AuditTrailRow = {
    id: "aud-001",
    invoice_id: "inv-001",
    actor_user_id: "user-1",
    event_type: "field_edit",
    field_name: "supplier_name",
    old_value: "Alt GmbH",
    new_value: "Neu GmbH",
    metadata: { source: "manual" },
    created_at: "2026-01-15T10:00:00Z",
  };

  it("starts with UTF-8 BOM", () => {
    const csv = buildAuditTrailCsv([baseAuditRow]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("whitelists audit-relevant metadata and strips PII fields", () => {
    const row: AuditTrailRow = {
      ...baseAuditRow,
      // Only whitelisted keys (e.g. confidence_score) survive; "source" is stripped.
      metadata: { confidence_score: 0.95, source: "manual" },
    };
    const csv = buildAuditTrailCsv([row]);
    // confidence_score is whitelisted → appears in JSON
    expect(csv).toContain("confidence_score");
    // "source" is not in the whitelist → stripped
    expect(csv).not.toContain("source");
    // The JSON cell is quote-escaped (contains " → doubled)
    expect(csv).toContain('"{""confidence_score"":0.95}"');
  });

  it("handles null field_name and old_value as empty strings", () => {
    const row: AuditTrailRow = { ...baseAuditRow, field_name: null, old_value: null };
    const csv = buildAuditTrailCsv([row]);
    const dataLine = csv.split("\r\n")[1]!;
    const fields = dataLine.split(";");
    // field_name is index 4, old_value is index 5
    expect(fields[4]).toBe("");
    expect(fields[5]).toBe("");
  });
});
