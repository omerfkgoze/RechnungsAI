import { describe, expect, it } from "vitest";
import { LABELS, FIELD_ORDER, CORRECTABLE_FIELD_PATHS } from "./invoice-fields";

describe("LABELS", () => {
  it("has a label for all 13 top-level fields", () => {
    expect(Object.keys(LABELS)).toHaveLength(13);
    expect(LABELS.invoice_number).toBe("Rechnungsnummer");
    expect(LABELS.gross_total).toBe("Brutto");
    expect(LABELS.supplier_email).toBe("Lieferant E-Mail");
  });

  it("all FIELD_ORDER keys have a LABELS entry", () => {
    for (const key of FIELD_ORDER) {
      expect(LABELS[key as string]).toBeDefined();
    }
  });

  it("uses German display names", () => {
    expect(LABELS.supplier_name).toBe("Lieferant");
    expect(LABELS.vat_total).toBe("USt.");
  });
});

describe("FIELD_ORDER", () => {
  it("has exactly 13 entries", () => {
    expect(FIELD_ORDER).toHaveLength(13);
  });

  it("starts with invoice_number and ends with payment_terms", () => {
    expect(FIELD_ORDER[0]).toBe("invoice_number");
    expect(FIELD_ORDER[FIELD_ORDER.length - 1]).toBe("payment_terms");
  });

  it("contains gross_total", () => {
    expect(FIELD_ORDER).toContain("gross_total");
  });
});

describe("CORRECTABLE_FIELD_PATHS", () => {
  it("contains all 13 top-level fields", () => {
    const topLevel = [
      "invoice_number", "invoice_date", "supplier_name", "supplier_address",
      "supplier_tax_id", "supplier_email", "recipient_name", "recipient_address",
      "net_total", "vat_total", "gross_total", "currency", "payment_terms",
    ];
    for (const f of topLevel) {
      expect(CORRECTABLE_FIELD_PATHS).toContain(f);
    }
  });

  it("contains line_items sub-fields for first line item", () => {
    expect(CORRECTABLE_FIELD_PATHS).toContain("line_items.0.description");
    expect(CORRECTABLE_FIELD_PATHS).toContain("line_items.0.quantity");
    expect(CORRECTABLE_FIELD_PATHS).toContain("line_items.0.unit_price");
    expect(CORRECTABLE_FIELD_PATHS).toContain("line_items.0.vat_rate");
  });

  it("snapshot: adding or removing a path is a deliberate change", () => {
    // 13 top-level + 20 line items × 6 sub-fields = 133. Any change breaks this assertion.
    expect(CORRECTABLE_FIELD_PATHS.length).toBe(133);
  });
});
