// EN 16931 normalized invoice model + ValidationReport / ValidationViolation contract.
// Package public surface: only the types re-exported from `./index.ts` are stable.
// Internal types (Invoice, Party, …) are exported for the rule files; treat them as
// package-internal — caller code should depend only on `ValidationReport`,
// `ValidationViolation`, and `projectToInvoiceData(report)`.

export type Severity = "fatal" | "error" | "warning";

export type ViolationCategory =
  | "BR"
  | "BR-CO"
  | "BR-CL"
  | "BR-S"
  | "BR-Z"
  | "BR-E"
  | "BR-AE"
  | "BR-G"
  | "BR-IC"
  | "BR-IG"
  | "BR-IP"
  | "BR-O"
  | "BR-DEC"
  | "de-BR"
  | "STRUCT";

export type ValidationStatus = "valid" | "invalid" | "warning";

export type ViolationLocation = {
  bt?: string;
  bg?: string;
  xpath?: string;
  lineIndex?: number;
};

export type ValidationViolation = {
  ruleId: string;
  category: ViolationCategory;
  severity: Severity;
  citation: string;
  message: string;
  location?: ViolationLocation;
};

export type ValidationReport = {
  status: ValidationStatus;
  profile: "ubl" | "cii" | "unknown";
  customizationId: string;
  ruleSetVersion: string;
  durationMs: number;
  violations: ValidationViolation[];
  // Internal projection — exposed for `projectToInvoiceData`. `null` only when
  // XML parsing fails before projection (STRUCT-XML-MALFORMED).
  invoice: Invoice | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Normalized EN 16931 Invoice model
// ─────────────────────────────────────────────────────────────────────────────

export type Party = {
  name?: string; // BT-27 / BT-44
  tradingName?: string; // BT-28 / BT-45
  vatId?: string; // BT-31 / BT-48
  taxRegId?: string; // BT-32 / BT-49 (local tax registration, e.g. Steuernummer)
  legalRegId?: string; // BT-30 / BT-47 (company registration)
  address?: PostalAddress; // BG-5 / BG-8
  contact?: Contact; // BG-6 / BG-9
  electronicAddress?: { value: string; schemeId?: string }; // BT-34 / BT-49
};

export type PostalAddress = {
  line1?: string;
  line2?: string;
  line3?: string;
  city?: string;
  postCode?: string;
  countrySubdivision?: string;
  countryCode?: string; // BT-40 / BT-55 — ISO 3166-1 alpha-2
};

export type Contact = {
  name?: string;
  phone?: string;
  email?: string;
};

export type Delivery = {
  partyName?: string; // BT-70
  actualDate?: string; // BT-72 — ISO date
  location?: PostalAddress; // BG-15
  locationId?: { value: string; schemeId?: string }; // BT-71
};

export type PaymentInstructions = {
  meansCode?: string; // BT-81 — UNTDID 4461
  meansText?: string; // BT-82
  paymentId?: string; // BT-83
  iban?: string; // BT-84
  accountName?: string; // BT-85
  bicOrServiceId?: string; // BT-86
  cardNumber?: string; // BT-87
};

export type AllowanceCharge = {
  isCharge: boolean; // false = allowance (BG-20), true = charge (BG-21)
  amount: string; // BT-92 / BT-99 — stored as text to defer rounding to rule engine
  baseAmount?: string; // BT-93 / BT-100
  percentage?: string; // BT-94 / BT-101
  vatCategory?: string; // BT-95 / BT-102
  vatRate?: string; // BT-96 / BT-103
  reasonCode?: string; // BT-97 / BT-104
  reason?: string; // BT-98 / BT-105
};

export type DocumentTotals = {
  lineExtensionAmount?: string; // BT-106 — sum of line nets
  taxExclusiveAmount?: string; // BT-109 — invoice total without VAT
  taxInclusiveAmount?: string; // BT-112 — invoice total with VAT
  allowanceTotalAmount?: string; // BT-107
  chargeTotalAmount?: string; // BT-108
  taxAmount?: string; // BT-110 — sum of VAT amounts
  taxAmountInAccountingCurrency?: string; // BT-111
  prepaidAmount?: string; // BT-113
  roundingAmount?: string; // BT-114
  payableAmount?: string; // BT-115 — final amount due
};

export type VatBreakdownLine = {
  taxableAmount: string; // BT-116
  taxAmount: string; // BT-117
  category: string; // BT-118 — 'S'|'Z'|'E'|'AE'|'G'|'IC'|'IG'|'IP'|'O'|'K'|'L'|'M'
  rate?: string; // BT-119 — percent (S/Z usually present; E often absent)
  exemptionReasonCode?: string; // BT-121
  exemptionReason?: string; // BT-120
};

export type InvoiceLine = {
  id: string; // BT-126
  note?: string; // BT-127
  objectId?: string; // BT-128
  quantity: string; // BT-129
  quantityUnitCode?: string; // BT-130 — UN/ECE Rec. 20
  netAmount: string; // BT-131 — line net
  buyerReference?: string; // BT-132
  buyerAccountingReference?: string; // BT-19 (line scope variant BT-133)
  periodStart?: string; // BT-134
  periodEnd?: string; // BT-135
  lineAllowances: AllowanceCharge[]; // BG-27
  lineCharges: AllowanceCharge[]; // BG-28
  itemName: string; // BT-153
  itemDescription?: string; // BT-154
  itemSellerId?: string; // BT-155
  itemBuyerId?: string; // BT-156
  itemStandardId?: { value: string; schemeId?: string }; // BT-157
  classifications?: { value: string; schemeId?: string; schemeVersion?: string }[]; // BT-158
  originCountry?: string; // BT-159
  itemAttributes?: { name: string; value: string }[]; // BG-32
  netPrice?: string; // BT-146
  priceBaseQuantity?: string; // BT-149
  priceBaseQuantityUnit?: string; // BT-150
  vatCategory: string; // BT-151
  vatRate?: string; // BT-152
};

export type Invoice = {
  // Document header
  invoiceNumber?: string; // BT-1
  issueDate?: string; // BT-2 — ISO date
  typeCode?: string; // BT-3 — UNTDID 1001 (e.g. 380 = commercial invoice)
  currencyCode?: string; // BT-5 — ISO 4217
  accountingCurrencyCode?: string; // BT-6
  vatPointDate?: string; // BT-7
  vatPointDateCode?: string; // BT-8
  dueDate?: string; // BT-9
  buyerReference?: string; // BT-10 (Leitweg-ID for XRechnung)
  projectReference?: string; // BT-11
  contractReference?: string; // BT-12
  orderReference?: string; // BT-13
  salesOrderReference?: string; // BT-14
  receivingAdviceReference?: string; // BT-15
  despatchAdviceReference?: string; // BT-16
  tenderReference?: string; // BT-17
  invoicedObjectIdentifier?: { value: string; schemeId?: string }; // BT-18
  buyerAccountingReference?: string; // BT-19
  paymentTerms?: string; // BT-20

  customizationId: string; // BT-24
  profileId?: string; // BT-23

  precedingInvoiceRefs?: { number: string; date?: string }[]; // BG-3
  notes?: string[]; // BG-1

  invoicePeriodStart?: string; // BT-73
  invoicePeriodEnd?: string; // BT-74

  // Parties
  seller: Party; // BG-4
  buyer: Party; // BG-7
  payee?: Party; // BG-10
  taxRepresentative?: Party; // BG-11

  // Delivery
  delivery?: Delivery; // BG-13

  // Payments
  paymentInstructions?: PaymentInstructions; // BG-16

  // Allowances / charges at document level
  documentLevelAllowances: AllowanceCharge[]; // BG-20
  documentLevelCharges: AllowanceCharge[]; // BG-21

  // Totals + VAT
  documentTotals: DocumentTotals; // BG-22
  vatBreakdown: VatBreakdownLine[]; // BG-23

  // Lines
  invoiceLines: InvoiceLine[]; // BG-25
};

// Raw fxp output type — we keep the shape loose because UBL and CII paths
// project away from it immediately.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawObj = Record<string, any>;
