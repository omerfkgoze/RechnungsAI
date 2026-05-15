import { describe, expect, it } from "vitest";

import { projectToInvoiceData } from "../project-to-invoice-data.js";
import { RULE_SET_VERSION } from "../index.js";
import type { ValidationReport } from "../types.js";

import { baseLine, buildValidInvoice } from "./_fixtures.js";
import type { Party } from "../types.js";

function fakeReport(
  status: ValidationReport["status"],
  overrides: Partial<ValidationReport> = {},
): ValidationReport {
  return {
    status,
    profile: "ubl",
    customizationId: "urn:cen.eu:en16931:2017",
    ruleSetVersion: RULE_SET_VERSION,
    durationMs: 5,
    violations: [],
    invoice: buildValidInvoice(),
    ...overrides,
  };
}

describe("projectToInvoiceData", () => {
  it("returns null when status is invalid", () => {
    expect(projectToInvoiceData(fakeReport("invalid"))).toBeNull();
  });

  it("returns null when invoice is null (parse failure)", () => {
    expect(projectToInvoiceData(fakeReport("invalid", { invoice: null }))).toBeNull();
  });

  it("wraps each scalar field as { value, confidence: 1.0, reason: null }", () => {
    const out = projectToInvoiceData(fakeReport("valid"));
    expect(out?.invoice_number.value).toBe("INV-2026-001");
    expect(out?.invoice_number.confidence).toBe(1.0);
    expect(out?.invoice_number.reason).toBeNull();
    expect(out?.currency.value).toBe("EUR");
    expect(out?.net_total.value).toBe(100);
    expect(out?.vat_total.value).toBe(19);
    expect(out?.gross_total.value).toBe(119);
  });

  it("maps invoice lines with confidence 1.0", () => {
    const out = projectToInvoiceData(
      fakeReport("valid", {
        invoice: buildValidInvoice({
          invoiceLines: [
            baseLine({ id: "1", quantity: "2", netAmount: "200.00", netPrice: "100.00", vatRate: "19" }),
            baseLine({ id: "2", quantity: "1", netAmount: "100.00", netPrice: "100.00", vatRate: "19" }),
          ],
        }),
      }),
    );
    expect(out?.line_items).toHaveLength(2);
    expect(out?.line_items[0]?.quantity.value).toBe(2);
    expect(out?.line_items[0]?.quantity.confidence).toBe(1.0);
    expect(out?.line_items[0]?.net_amount.value).toBe(200);
    expect(out?.line_items[0]?.vat_rate.value).toBe(19);
  });

  it("projects supplier_email from seller.contact.email", () => {
    const out = projectToInvoiceData(
      fakeReport("valid", {
        invoice: buildValidInvoice({
          seller: {
            name: "Lieferant GmbH",
            address: { line1: "Hauptstr. 1", city: "Berlin", postCode: "10115", countryCode: "DE" },
            contact: { email: "lieferant@beispiel.de" },
          } as Party,
        }),
      }),
    );
    expect(out?.supplier_email.value).toBe("lieferant@beispiel.de");
    expect(out?.supplier_email.confidence).toBe(1.0);
  });

  it("projects supplier_email as null when seller.contact is missing", () => {
    const out = projectToInvoiceData(
      fakeReport("valid", {
        invoice: buildValidInvoice({
          seller: {
            name: "Lieferant GmbH",
            address: { line1: "Hauptstr. 1", city: "Berlin", postCode: "10115", countryCode: "DE" },
            contact: undefined,
          } as Party,
        }),
      }),
    );
    expect(out?.supplier_email.value).toBeNull();
    expect(out?.supplier_email.confidence).toBe(1.0);
  });

  it("works on a warning report", () => {
    const out = projectToInvoiceData(fakeReport("warning"));
    expect(out).not.toBeNull();
    expect(out?.invoice_number.value).toBe("INV-2026-001");
  });
});
