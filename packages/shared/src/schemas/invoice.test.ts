import { describe, expect, it } from "vitest";
import {
  invoiceSchema,
  lineItemSchema,
  makeField,
  overallConfidence,
  type Invoice,
} from "./invoice.js";
import { z } from "zod";

function field<T>(value: T, confidence: number, reason: string | null = null) {
  return { value, confidence, reason };
}

function baseInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    invoice_number: field("R-2024-001", 0.98),
    invoice_date: field("2024-03-15", 0.97),
    supplier_name: field("ACME GmbH", 0.99),
    supplier_address: field("Musterweg 1, 10115 Berlin", 0.9),
    supplier_tax_id: field("DE123456789", 0.96),
    recipient_name: field("Muster AG", 0.98),
    recipient_address: field("Beispielstr. 2, 20095 Hamburg", 0.92),
    line_items: [],
    net_total: field(100, 0.97),
    vat_total: field(19, 0.97),
    gross_total: field(119, 0.98),
    currency: field("EUR", 0.99),
    payment_terms: field("Zahlbar innerhalb von 14 Tagen", 0.8),
    ...overrides,
  };
}

describe("makeField", () => {
  it("validates envelope shape", () => {
    const schema = makeField(z.string().nullable());
    expect(
      schema.parse({ value: "x", confidence: 0.5, reason: null }),
    ).toEqual({ value: "x", confidence: 0.5, reason: null });
  });

  it("rejects confidence > 1", () => {
    const schema = makeField(z.string());
    expect(() =>
      schema.parse({ value: "x", confidence: 1.5, reason: null }),
    ).toThrow();
  });
});

describe("invoiceSchema", () => {
  it("parses a fully populated invoice", () => {
    const inv = baseInvoice();
    expect(invoiceSchema.parse(inv)).toBeTruthy();
  });

  it("parses a fully-null invoice with zero confidence", () => {
    const inv = baseInvoice({
      invoice_number: field(null, 0),
      invoice_date: field(null, 0),
      supplier_name: field(null, 0),
      supplier_address: field(null, 0),
      supplier_tax_id: field(null, 0),
      recipient_name: field(null, 0),
      recipient_address: field(null, 0),
      net_total: field(null, 0),
      vat_total: field(null, 0),
      gross_total: field(null, 0),
      currency: field(null, 0),
      payment_terms: field(null, 0),
    });
    const parsed = invoiceSchema.parse(inv);
    expect(parsed.invoice_number.value).toBeNull();
  });

  it("coerces malformed invoice_date to null via transform", () => {
    const inv = baseInvoice({
      invoice_date: field("15.03.2024" as string, 0.5),
    });
    const parsed = invoiceSchema.parse(inv);
    expect(parsed.invoice_date.value).toBeNull();
  });

  it("preserves valid ISO date", () => {
    const inv = baseInvoice({ invoice_date: field("2026-04-17", 0.9) });
    const parsed = invoiceSchema.parse(inv);
    expect(parsed.invoice_date.value).toBe("2026-04-17");
  });

  it("accepts line items with per-subfield confidence", () => {
    const li = {
      description: field("Leistung A", 0.9),
      quantity: field(2, 0.95),
      unit_price: field(50, 0.95),
      net_amount: field(100, 0.95),
      vat_rate: field(0.19, 0.99),
      vat_amount: field(19, 0.95),
    };
    expect(lineItemSchema.parse(li)).toBeTruthy();
  });
});

describe("overallConfidence", () => {
  it("returns the mean of the seven scalar keys", () => {
    // 7 keys: invoice_number(0.99), invoice_date(0.97), supplier_name(0.99),
    // gross_total(0.4), vat_total(0.97), net_total(0.97), currency(0.99)
    const inv = baseInvoice({
      invoice_number: field("X", 0.99),
      gross_total: field(1, 0.4),
    });
    const expected = (0.99 + 0.97 + 0.99 + 0.4 + 0.97 + 0.97 + 0.99) / 7;
    expect(overallConfidence(inv)).toBeCloseTo(expected);
  });

  it("ignores line_items and non-listed fields", () => {
    const inv = baseInvoice({
      payment_terms: field("X", 0.1),
      supplier_address: field("X", 0.1),
    });
    expect(overallConfidence(inv)).toBeGreaterThanOrEqual(0.9);
  });
});
