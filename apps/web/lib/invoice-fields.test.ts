import { describe, expect, it } from "vitest";
import { LABELS, FIELD_ORDER, CORRECTABLE_FIELD_PATHS } from "./invoice-fields";

describe("LABELS", () => {
  it("has a label for all 12 top-level fields", () => {
    expect(Object.keys(LABELS)).toHaveLength(12);
    expect(LABELS.invoice_number).toBe("Rechnungsnummer");
    expect(LABELS.gross_total).toBe("Brutto");
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
  it("has exactly 12 entries", () => {
    expect(FIELD_ORDER).toHaveLength(12);
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
  it("contains all 12 top-level fields", () => {
    const topLevel = [
      "invoice_number", "invoice_date", "supplier_name", "supplier_address",
      "supplier_tax_id", "recipient_name", "recipient_address", "net_total",
      "vat_total", "gross_total", "currency", "payment_terms",
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

  it("snapshot: adding a new path is a deliberate change", () => {
    // Guard against accidental reduction of the allow-list.
    expect(CORRECTABLE_FIELD_PATHS.length).toBeGreaterThanOrEqual(132);
  });
});
