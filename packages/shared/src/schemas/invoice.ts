import { z } from "zod";

export function makeField<T extends z.ZodTypeAny>(payload: T) {
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

const isoDatePayload = z
  .string()
  .nullable()
  .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null));

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
  invoice_date: makeField(isoDatePayload),
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

export function overallConfidence(invoice: Invoice): number {
  return Math.min(
    invoice.invoice_number.confidence,
    invoice.invoice_date.confidence,
    invoice.supplier_name.confidence,
    invoice.gross_total.confidence,
    invoice.vat_total.confidence,
    invoice.net_total.confidence,
    invoice.currency.confidence,
  );
}
