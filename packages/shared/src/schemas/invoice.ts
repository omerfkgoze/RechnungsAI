import { z } from "zod";

export function makeField<T extends z.ZodType>(payload: T) {
  return z.object({
    value: payload,
    confidence: z.number().min(0).max(1),
    reason: z.string().nullable(),
  });
}

export type ExtractedField<T> = {
  value: T;
  confidence: number;
  reason: string | null;
};

// Nulls the value when the date isn't ISO 8601 (YYYY-MM-DD) so the UI never
// tries to format a German-style string. Confidence is preserved from the AI
// because it reflects extraction quality, not format quality.
const isoDateField = z
  .object({
    value: z.string().nullable(),
    confidence: z.number().min(0).max(1),
    reason: z.string().nullable(),
  })
  .transform((field) => {
    if (field.value !== null && !/^\d{4}-\d{2}-\d{2}$/.test(field.value)) {
      return {
        value: null as null,
        confidence: field.confidence,
        reason: field.reason ?? "Datumsformat nicht erkannt.",
      };
    }
    return field;
  });

export const lineItemSchema = z.object({
  description: makeField(z.string().nullable()),
  quantity: makeField(z.number().nullable()),
  unit_price: makeField(z.number().nullable()),
  net_amount: makeField(z.number().nullable()),
  vat_rate: makeField(z.number().nullable()),
  vat_amount: makeField(z.number().nullable()),
});

export type LineItem = z.infer<typeof lineItemSchema>;

export const invoiceSchema = z.object({
  invoice_number: makeField(z.string().nullable()),
  invoice_date: isoDateField,
  supplier_name: makeField(z.string().nullable()),
  supplier_address: makeField(z.string().nullable()),
  supplier_tax_id: makeField(z.string().nullable()),
  recipient_name: makeField(z.string().nullable()),
  recipient_address: makeField(z.string().nullable()),
  line_items: z.array(lineItemSchema),
  net_total: makeField(z.number().nullable()),
  vat_total: makeField(z.number().nullable()),
  gross_total: makeField(z.number().nullable()),
  currency: makeField(z.string().nullable()),
  payment_terms: makeField(z.string().nullable()),
});

export type Invoice = z.infer<typeof invoiceSchema>;

const OVERALL_KEYS: Array<keyof Invoice> = [
  "invoice_number",
  "invoice_date",
  "supplier_name",
  "gross_total",
  "vat_total",
  "net_total",
  "currency",
];

export function overallConfidence(invoice: Invoice): number {
  const scores = OVERALL_KEYS.map(
    (k) => (invoice[k] as { confidence: number }).confidence,
  );
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}
