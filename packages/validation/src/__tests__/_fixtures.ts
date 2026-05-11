// Test helpers — minimal Invoice builder and rule lookup utilities.
// Centralized so per-category tests stay focused on rule semantics, not on
// rebuilding deeply nested fixtures.

import type {
  AllowanceCharge,
  DocumentTotals,
  Invoice,
  InvoiceLine,
  Party,
  VatBreakdownLine,
} from "../types.js";

import type { Rule } from "../rules/engine.js";

const baseParty = (overrides: Partial<Party> = {}): Party => ({
  name: "Acme GmbH",
  vatId: "DE123456789",
  address: {
    line1: "Hauptstr. 1",
    city: "Berlin",
    postCode: "10115",
    countryCode: "DE",
  },
  ...overrides,
});

const baseLine = (overrides: Partial<InvoiceLine> = {}): InvoiceLine => ({
  id: "1",
  quantity: "1",
  quantityUnitCode: "PCE",
  netAmount: "100.00",
  netPrice: "100.00",
  lineAllowances: [],
  lineCharges: [],
  itemName: "Test item",
  vatCategory: "S",
  vatRate: "19",
  ...overrides,
});

const baseVat = (overrides: Partial<VatBreakdownLine> = {}): VatBreakdownLine => ({
  taxableAmount: "100.00",
  taxAmount: "19.00",
  category: "S",
  rate: "19",
  ...overrides,
});

const baseTotals = (overrides: Partial<DocumentTotals> = {}): DocumentTotals => ({
  lineExtensionAmount: "100.00",
  taxExclusiveAmount: "100.00",
  taxInclusiveAmount: "119.00",
  taxAmount: "19.00",
  payableAmount: "119.00",
  ...overrides,
});

export type InvoiceBuilderOptions = {
  invoiceNumber?: string;
  issueDate?: string;
  typeCode?: string;
  currencyCode?: string;
  buyerReference?: string;
  customizationId?: string;
  seller?: Partial<Party>;
  buyer?: Partial<Party>;
  totals?: Partial<DocumentTotals>;
  vatBreakdown?: VatBreakdownLine[];
  invoiceLines?: InvoiceLine[];
  documentLevelAllowances?: AllowanceCharge[];
  documentLevelCharges?: AllowanceCharge[];
  dueDate?: string;
  paymentTerms?: string;
  paymentInstructions?: Invoice["paymentInstructions"];
  taxRepresentative?: Party;
  payee?: Party;
};

export function buildValidInvoice(opts: InvoiceBuilderOptions = {}): Invoice {
  return {
    invoiceNumber: opts.invoiceNumber ?? "INV-2026-001",
    issueDate: opts.issueDate ?? "2026-05-11",
    typeCode: opts.typeCode ?? "380",
    currencyCode: opts.currencyCode ?? "EUR",
    buyerReference:
      opts.buyerReference ??
      "991-12345-ABC", // Leitweg-ID-shaped placeholder for de-BR-01
    customizationId:
      opts.customizationId ??
      "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0",
    notes: [],
    seller: baseParty(opts.seller),
    buyer: baseParty(opts.buyer),
    payee: opts.payee,
    taxRepresentative: opts.taxRepresentative,
    documentLevelAllowances: opts.documentLevelAllowances ?? [],
    documentLevelCharges: opts.documentLevelCharges ?? [],
    documentTotals: baseTotals(opts.totals),
    vatBreakdown:
      opts.vatBreakdown ?? [baseVat()],
    invoiceLines: opts.invoiceLines ?? [baseLine()],
    dueDate: opts.dueDate ?? "2026-06-10",
    paymentTerms: opts.paymentTerms,
    paymentInstructions: opts.paymentInstructions,
  };
}

export { baseLine, baseParty, baseTotals, baseVat };

export function findRule(rules: readonly Rule[], id: string): Rule {
  const r = rules.find((x) => x.id === id);
  if (!r) throw new Error(`Rule ${id} not found in supplied rule set`);
  return r;
}
