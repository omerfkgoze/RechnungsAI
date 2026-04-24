import type { Invoice } from "@rechnungsai/shared";
import { CORRECTABLE_FIELD_PATHS } from "@rechnungsai/shared";

export const LABELS: Record<string, string> = {
  invoice_number: "Rechnungsnummer",
  invoice_date: "Rechnungsdatum",
  supplier_name: "Lieferant",
  supplier_address: "Lieferanten-Adresse",
  supplier_tax_id: "USt-IdNr.",
  recipient_name: "Empfänger",
  recipient_address: "Empfänger-Adresse",
  net_total: "Netto",
  vat_total: "USt.",
  gross_total: "Brutto",
  currency: "Währung",
  payment_terms: "Zahlungsbedingungen",
};

export const FIELD_ORDER: Array<keyof Invoice> = [
  "invoice_number",
  "invoice_date",
  "supplier_name",
  "supplier_address",
  "supplier_tax_id",
  "recipient_name",
  "recipient_address",
  "net_total",
  "vat_total",
  "gross_total",
  "currency",
  "payment_terms",
];

export { CORRECTABLE_FIELD_PATHS };
