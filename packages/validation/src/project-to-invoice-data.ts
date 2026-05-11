// Map the normalized Invoice (the package's internal model) to the
// AI-extraction InvoiceData shape used elsewhere in the app
// (`@rechnungsai/shared` → `Invoice` from `schemas/invoice.ts`).
//
// Each scalar field is wrapped as `{ value: <string>, confidence: 1.0, reason: null }`
// because structured XML data is by construction high-confidence (P4 spike §8
// open question 4: validated XML invoices skip the human review queue).
//
// Returns `null` if `report.status === 'invalid'` OR `report.invoice` is null
// (parse failure). The caller falls back to AI extraction in that case (D5).

import type { Invoice as InvoiceData, LineItem } from "@rechnungsai/shared";

import type { ValidationReport } from "./types.js";
import { num } from "./rules/engine.js";

type Field<T> = { value: T; confidence: number; reason: string | null };

function field<T>(value: T): Field<T> {
  return { value, confidence: 1.0, reason: null };
}

function numericField(text: string | undefined): Field<number | null> {
  if (text === undefined || text === null) return field<number | null>(null);
  const n = num(text);
  return field<number | null>(Number.isFinite(n) ? n : null);
}

function stringField(text: string | undefined): Field<string | null> {
  if (text === undefined || text === null) return field<string | null>(null);
  const trimmed = text.trim();
  return field<string | null>(trimmed.length > 0 ? trimmed : null);
}

export function projectToInvoiceData(report: ValidationReport): InvoiceData | null {
  if (report.status === "invalid") return null;
  const inv = report.invoice;
  if (!inv) return null;

  const supplierAddress = formatAddress(inv.seller.address);
  const recipientAddress = formatAddress(inv.buyer.address);

  const lineItems: LineItem[] = inv.invoiceLines.map((l) => ({
    description: stringField(l.itemName || l.itemDescription),
    quantity: numericField(l.quantity),
    unit_price: numericField(l.netPrice),
    net_amount: numericField(l.netAmount),
    vat_rate: numericField(l.vatRate),
    vat_amount: (() => {
      const base = num(l.netAmount);
      const rate = num(l.vatRate);
      if (!Number.isFinite(base) || !Number.isFinite(rate)) return field<number | null>(null);
      return field<number | null>(Math.round(base * rate) / 100);
    })(),
  }));

  return {
    invoice_number: stringField(inv.invoiceNumber),
    invoice_date: stringField(inv.issueDate),
    supplier_name: stringField(inv.seller.name),
    supplier_address: stringField(supplierAddress),
    supplier_tax_id: stringField(inv.seller.vatId ?? inv.seller.taxRegId),
    recipient_name: stringField(inv.buyer.name),
    recipient_address: stringField(recipientAddress),
    line_items: lineItems,
    net_total: numericField(inv.documentTotals.taxExclusiveAmount),
    vat_total: numericField(inv.documentTotals.taxAmount),
    gross_total: numericField(inv.documentTotals.taxInclusiveAmount),
    currency: stringField(inv.currencyCode),
    payment_terms: stringField(inv.paymentTerms),
  };
}

function formatAddress(
  addr:
    | {
        line1?: string;
        line2?: string;
        line3?: string;
        city?: string;
        postCode?: string;
        countryCode?: string;
      }
    | undefined,
): string | undefined {
  if (!addr) return undefined;
  const parts: string[] = [];
  if (addr.line1) parts.push(addr.line1);
  if (addr.line2) parts.push(addr.line2);
  if (addr.line3) parts.push(addr.line3);
  const cityLine = [addr.postCode, addr.city].filter(Boolean).join(" ");
  if (cityLine) parts.push(cityLine);
  if (addr.countryCode) parts.push(addr.countryCode);
  return parts.length > 0 ? parts.join(", ") : undefined;
}
