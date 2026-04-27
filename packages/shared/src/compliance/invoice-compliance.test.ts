import { describe, it, expect } from "vitest";
import { runComplianceChecks } from "./invoice-compliance.js";
import type { Invoice } from "../schemas/invoice.js";

const TODAY_ISO = new Date().toISOString().slice(0, 10);

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    invoice_number: { value: "RE-2024-001", confidence: 1, reason: null },
    invoice_date: { value: TODAY_ISO, confidence: 1, reason: null },
    supplier_name: { value: "Test GmbH", confidence: 1, reason: null },
    supplier_address: { value: "Teststraße 1, 10115 Berlin", confidence: 1, reason: null },
    supplier_tax_id: { value: "DE123456789", confidence: 1, reason: null },
    recipient_name: { value: "Empfänger GmbH", confidence: 1, reason: null },
    recipient_address: { value: "Empfängerstraße 2, 20095 Hamburg", confidence: 1, reason: null },
    line_items: [],
    net_total: { value: 100, confidence: 1, reason: null },
    vat_total: { value: 19, confidence: 1, reason: null },
    gross_total: { value: 119, confidence: 1, reason: null },
    currency: { value: "EUR", confidence: 1, reason: null },
    payment_terms: { value: null, confidence: 1, reason: null },
    ...overrides,
  };
}

describe("runComplianceChecks", () => {
  it("returns empty array for a fully compliant invoice", () => {
    expect(runComplianceChecks(makeInvoice())).toHaveLength(0);
  });

  // missing_ust_id — positive (fires)
  it("fires missing_ust_id when supplier_tax_id is null", () => {
    const invoice = makeInvoice({ supplier_tax_id: { value: null, confidence: 1, reason: null } });
    const warnings = runComplianceChecks(invoice);
    expect(warnings.some((w) => w.code === "missing_ust_id")).toBe(true);
  });

  // missing_ust_id — negative (no fire for valid DE ID)
  it("does not fire missing_ust_id for valid DE123456789", () => {
    const invoice = makeInvoice({ supplier_tax_id: { value: "DE123456789", confidence: 1, reason: null } });
    const warnings = runComplianceChecks(invoice);
    expect(warnings.some((w) => w.code === "missing_ust_id")).toBe(false);
  });

  // missing_ust_id — fires for empty string
  it("fires missing_ust_id when supplier_tax_id is empty string", () => {
    const invoice = makeInvoice({ supplier_tax_id: { value: "", confidence: 1, reason: null } });
    const warnings = runComplianceChecks(invoice);
    expect(warnings.some((w) => w.code === "missing_ust_id")).toBe(true);
  });

  // invalid_invoice_date — positive (null date)
  it("fires invalid_invoice_date when invoice_date is null", () => {
    const invoice = makeInvoice({ invoice_date: { value: null, confidence: 1, reason: null } });
    const warnings = runComplianceChecks(invoice);
    expect(warnings.some((w) => w.code === "invalid_invoice_date")).toBe(true);
  });

  // invalid_invoice_date — past >18 months fires
  it("fires invalid_invoice_date for a date more than 18 months ago", () => {
    const pastDate = new Date();
    pastDate.setMonth(pastDate.getMonth() - 20);
    const invoice = makeInvoice({ invoice_date: { value: pastDate.toISOString().slice(0, 10), confidence: 1, reason: null } });
    const warnings = runComplianceChecks(invoice);
    expect(warnings.some((w) => w.code === "invalid_invoice_date")).toBe(true);
  });

  // invalid_invoice_date — negative (today is valid)
  it("does not fire invalid_invoice_date for today's date", () => {
    const invoice = makeInvoice({ invoice_date: { value: TODAY_ISO, confidence: 1, reason: null } });
    const warnings = runComplianceChecks(invoice);
    expect(warnings.some((w) => w.code === "invalid_invoice_date")).toBe(false);
  });

  // missing_invoice_number — positive
  it("fires missing_invoice_number when invoice_number is null", () => {
    const invoice = makeInvoice({ invoice_number: { value: null, confidence: 1, reason: null } });
    const warnings = runComplianceChecks(invoice);
    expect(warnings.some((w) => w.code === "missing_invoice_number")).toBe(true);
  });

  // missing_invoice_number — negative
  it("does not fire missing_invoice_number when invoice_number is set", () => {
    const invoice = makeInvoice({ invoice_number: { value: "RE-001", confidence: 1, reason: null } });
    const warnings = runComplianceChecks(invoice);
    expect(warnings.some((w) => w.code === "missing_invoice_number")).toBe(false);
  });

  // missing_supplier_name — positive
  it("fires missing_supplier_name when supplier_name is null", () => {
    const invoice = makeInvoice({ supplier_name: { value: null, confidence: 1, reason: null } });
    const warnings = runComplianceChecks(invoice);
    expect(warnings.some((w) => w.code === "missing_supplier_name")).toBe(true);
  });

  // missing_supplier_name — negative
  it("does not fire missing_supplier_name when supplier_name is set", () => {
    const invoice = makeInvoice({ supplier_name: { value: "ACME GmbH", confidence: 1, reason: null } });
    const warnings = runComplianceChecks(invoice);
    expect(warnings.some((w) => w.code === "missing_supplier_name")).toBe(false);
  });

  // missing_gross_total — positive
  it("fires missing_gross_total when gross_total is null", () => {
    const invoice = makeInvoice({ gross_total: { value: null, confidence: 1, reason: null } });
    const warnings = runComplianceChecks(invoice);
    expect(warnings.some((w) => w.code === "missing_gross_total")).toBe(true);
  });

  // missing_gross_total — negative
  it("does not fire missing_gross_total when gross_total is set", () => {
    const invoice = makeInvoice({ gross_total: { value: 119, confidence: 1, reason: null } });
    const warnings = runComplianceChecks(invoice);
    expect(warnings.some((w) => w.code === "missing_gross_total")).toBe(false);
  });

  // vat_total_mismatch — outside 2-cent tolerance
  it("fires vat_total_mismatch when net+vat differs from gross by more than 0.02 EUR", () => {
    const invoice = makeInvoice({
      net_total: { value: 100, confidence: 1, reason: null },
      vat_total: { value: 19, confidence: 1, reason: null },
      gross_total: { value: 120, confidence: 1, reason: null },
      currency: { value: "EUR", confidence: 1, reason: null },
    });
    const warnings = runComplianceChecks(invoice);
    expect(warnings.some((w) => w.code === "vat_total_mismatch")).toBe(true);
  });

  // vat_total_mismatch — within 2-cent tolerance (no fire)
  it("does not fire vat_total_mismatch when difference is within 0.02 EUR tolerance", () => {
    const invoice = makeInvoice({
      net_total: { value: 100, confidence: 1, reason: null },
      vat_total: { value: 19, confidence: 1, reason: null },
      gross_total: { value: 119.01, confidence: 1, reason: null },
      currency: { value: "EUR", confidence: 1, reason: null },
    });
    const warnings = runComplianceChecks(invoice);
    expect(warnings.some((w) => w.code === "vat_total_mismatch")).toBe(false);
  });

  // vat_total_mismatch — skipped for non-EUR currency
  it("does not fire vat_total_mismatch for non-EUR currency even with mismatch", () => {
    const invoice = makeInvoice({
      net_total: { value: 100, confidence: 1, reason: null },
      vat_total: { value: 19, confidence: 1, reason: null },
      gross_total: { value: 120, confidence: 1, reason: null },
      currency: { value: "USD", confidence: 1, reason: null },
    });
    const warnings = runComplianceChecks(invoice);
    expect(warnings.some((w) => w.code === "vat_total_mismatch")).toBe(false);
  });
});
