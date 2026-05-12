// UBL 2.1 → normalized Invoice projection.
//
// Source format: OASIS UBL Invoice / CreditNote with the EN 16931 CIUS.
// Element naming: `cbc:` for component basic types (leaf text + attributes),
// `cac:` for component aggregate types (containers). We keep prefixes (AC #3).
//
// Projection failure posture: emit STRUCT-* violations rather than throwing.
// The rule engine still runs over the partial model. P1 §"Internal Contract":
//   "If BT-1 is missing, projection emits STRUCT-BT-1-MISSING (severity fatal)
//    and the rule engine still runs over the partial model — we report what we
//    can in one pass."

import type {
  AllowanceCharge,
  Contact,
  Delivery,
  DocumentTotals,
  Invoice,
  InvoiceLine,
  Party,
  PaymentInstructions,
  PostalAddress,
  RawObj,
  ValidationViolation,
  VatBreakdownLine,
} from "../types.js";
import {
  asArray,
  attr,
  child,
  childText,
  children,
  firstChild,
  path,
  pathText,
  text,
} from "./util.js";

export type UblProjectionResult = {
  invoice: Invoice | null;
  violations: ValidationViolation[];
};

export function projectFromUbl(raw: RawObj): UblProjectionResult {
  const violations: ValidationViolation[] = [];
  const root =
    (raw["Invoice"] as RawObj | undefined) ??
    (raw["CreditNote"] as RawObj | undefined) ??
    findRootByLocalName(raw, ["Invoice", "CreditNote"]);

  if (!root) {
    violations.push({
      ruleId: "STRUCT-UBL-ROOT-MISSING",
      category: "STRUCT",
      severity: "fatal",
      citation: "UBL 2.1 Document Root",
      message: "UBL-Wurzelelement (Invoice/CreditNote) fehlt.",
    });
    return { invoice: null, violations };
  }

  const invoiceNumber = childText(root, "cbc:ID");
  const issueDate = childText(root, "cbc:IssueDate");
  const typeCode = childText(root, "cbc:InvoiceTypeCode") ??
    childText(root, "cbc:CreditNoteTypeCode");
  const currencyCode = childText(root, "cbc:DocumentCurrencyCode");
  const accountingCurrencyCode = childText(root, "cbc:TaxCurrencyCode");
  const vatPointDate = childText(root, "cbc:TaxPointDate");
  const dueDate = childText(root, "cbc:DueDate");
  const buyerReference = childText(root, "cbc:BuyerReference");
  const customizationId = childText(root, "cbc:CustomizationID") ?? "";
  const profileId = childText(root, "cbc:ProfileID");
  const projectReference = pathText(root, "cac:ProjectReference", "cbc:ID");
  const contractReference = pathText(root, "cac:ContractDocumentReference", "cbc:ID");
  const orderReference = pathText(root, "cac:OrderReference", "cbc:ID");
  const salesOrderReference = pathText(root, "cac:OrderReference", "cbc:SalesOrderID");
  const receivingAdviceReference = pathText(
    root,
    "cac:ReceiptDocumentReference",
    "cbc:ID",
  );
  const despatchAdviceReference = pathText(
    root,
    "cac:DespatchDocumentReference",
    "cbc:ID",
  );
  const tenderReference = pathText(root, "cac:OriginatorDocumentReference", "cbc:ID");
  const invoicedObjectIdEl = firstChild(root, "cac:AdditionalDocumentReference");
  const invoicedObjectIdentifier = invoicedObjectIdEl
    ? {
        value: childText(invoicedObjectIdEl, "cbc:ID") ?? "",
        schemeId: attr(child(invoicedObjectIdEl, "cbc:ID"), "schemeID"),
      }
    : undefined;

  const periodEl = firstChild(root, "cac:InvoicePeriod");
  const invoicePeriodStart = periodEl ? childText(periodEl, "cbc:StartDate") : undefined;
  const invoicePeriodEnd = periodEl ? childText(periodEl, "cbc:EndDate") : undefined;
  const vatPointDateCode = periodEl ? childText(periodEl, "cbc:DescriptionCode") : undefined;

  const notes = children(root, "cbc:Note")
    .map((n) => text(n))
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  const seller = projectParty(
    firstChild(root, "cac:AccountingSupplierParty"),
    "supplier",
  );
  const buyer = projectParty(
    firstChild(root, "cac:AccountingCustomerParty"),
    "customer",
  );
  const payee = firstChild(root, "cac:PayeeParty")
    ? projectPartyDirect(firstChild(root, "cac:PayeeParty")!)
    : undefined;
  const taxRepresentative = firstChild(root, "cac:TaxRepresentativeParty")
    ? projectPartyDirect(firstChild(root, "cac:TaxRepresentativeParty")!)
    : undefined;

  const delivery = projectDelivery(firstChild(root, "cac:Delivery"));
  const paymentInstructions = projectPaymentInstructions(
    firstChild(root, "cac:PaymentMeans"),
    firstChild(root, "cac:PaymentTerms"),
  );
  const paymentTerms = childText(firstChild(root, "cac:PaymentTerms"), "cbc:Note");

  const acs = children(root, "cac:AllowanceCharge").map(projectUblAllowanceCharge);
  const documentLevelAllowances = acs.filter((a) => !a.isCharge);
  const documentLevelCharges = acs.filter((a) => a.isCharge);

  const documentTotals = projectUblDocumentTotals(
    firstChild(root, "cac:LegalMonetaryTotal"),
  );
  const vatBreakdown = projectUblVatBreakdown(firstChild(root, "cac:TaxTotal"));
  const invoiceLines = projectUblLines(root);

  const invoice: Invoice = {
    invoiceNumber,
    issueDate,
    typeCode,
    currencyCode,
    accountingCurrencyCode,
    vatPointDate,
    vatPointDateCode,
    dueDate,
    buyerReference,
    projectReference,
    contractReference,
    orderReference,
    salesOrderReference,
    receivingAdviceReference,
    despatchAdviceReference,
    tenderReference,
    invoicedObjectIdentifier,
    customizationId,
    profileId,
    notes,
    invoicePeriodStart,
    invoicePeriodEnd,
    seller,
    buyer,
    payee,
    taxRepresentative,
    delivery,
    paymentInstructions,
    documentLevelAllowances,
    documentLevelCharges,
    documentTotals,
    vatBreakdown,
    invoiceLines,
    paymentTerms,
  };

  return { invoice, violations };
}

function findRootByLocalName(
  raw: RawObj,
  localNames: string[],
): RawObj | undefined {
  // Defensive: when a sender includes an unusual namespace prefix on the root
  // element, fxp emits the prefixed name as the key. Try `ns:Invoice` shapes.
  for (const k of Object.keys(raw)) {
    const localIdx = k.lastIndexOf(":");
    const local = localIdx >= 0 ? k.slice(localIdx + 1) : k;
    if (localNames.includes(local) && typeof raw[k] === "object") {
      return raw[k] as RawObj;
    }
  }
  return undefined;
}

function projectParty(container: RawObj | undefined, _role: string): Party {
  if (!container) return {};
  const partyEl = firstChild(container, "cac:Party");
  if (!partyEl) return {};
  return projectPartyDirect(partyEl);
}

function projectPartyDirect(partyEl: RawObj): Party {
  const name =
    pathText(partyEl, "cac:PartyName", "cbc:Name") ??
    pathText(partyEl, "cac:PartyLegalEntity", "cbc:RegistrationName");
  const tradingName = pathText(partyEl, "cac:PartyName", "cbc:Name");
  const vatId = (() => {
    for (const scheme of children(partyEl, "cac:PartyTaxScheme")) {
      const id = childText(scheme, "cbc:CompanyID");
      const code = pathText(scheme, "cac:TaxScheme", "cbc:ID");
      if (id && (code === "VAT" || code === "VA")) return id;
    }
    return undefined;
  })();
  const taxRegId = (() => {
    for (const scheme of children(partyEl, "cac:PartyTaxScheme")) {
      const id = childText(scheme, "cbc:CompanyID");
      const code = pathText(scheme, "cac:TaxScheme", "cbc:ID");
      if (id && code && code !== "VAT" && code !== "VA") return id;
    }
    return undefined;
  })();
  const legalEntityEl = firstChild(partyEl, "cac:PartyLegalEntity");
  const legalCompanyIdEl = legalEntityEl ? child(legalEntityEl, "cbc:CompanyID") : undefined;
  const legalRegId = text(legalCompanyIdEl);
  const legalRegSchemeId = attr(legalCompanyIdEl, "schemeID");
  const address = projectAddress(firstChild(partyEl, "cac:PostalAddress"));
  const contact = projectContact(firstChild(partyEl, "cac:Contact"));
  const electronicAddressEl = child(partyEl, "cbc:EndpointID");
  const electronicAddress = electronicAddressEl
    ? {
        value: text(electronicAddressEl) ?? "",
        schemeId: attr(electronicAddressEl, "schemeID"),
      }
    : undefined;
  return {
    name,
    tradingName,
    vatId,
    taxRegId,
    legalRegId,
    legalRegSchemeId,
    address,
    contact,
    electronicAddress,
  };
}

function projectAddress(el: RawObj | undefined): PostalAddress | undefined {
  if (!el) return undefined;
  return {
    line1: childText(el, "cbc:StreetName"),
    line2: childText(el, "cbc:AdditionalStreetName"),
    line3: pathText(el, "cac:AddressLine", "cbc:Line"),
    city: childText(el, "cbc:CityName"),
    postCode: childText(el, "cbc:PostalZone"),
    countrySubdivision: childText(el, "cbc:CountrySubentity"),
    countryCode: pathText(el, "cac:Country", "cbc:IdentificationCode"),
  };
}

function projectContact(el: RawObj | undefined): Contact | undefined {
  if (!el) return undefined;
  return {
    name: childText(el, "cbc:Name"),
    phone: childText(el, "cbc:Telephone"),
    email: childText(el, "cbc:ElectronicMail"),
  };
}

function projectDelivery(el: RawObj | undefined): Delivery | undefined {
  if (!el) return undefined;
  const partyName = pathText(el, "cac:DeliveryParty", "cac:PartyName", "cbc:Name");
  const actualDate = childText(el, "cbc:ActualDeliveryDate");
  const location = projectAddress(
    firstChild(firstChild(el, "cac:DeliveryLocation"), "cac:Address"),
  );
  const locationIdEl = path(el, "cac:DeliveryLocation", "cbc:ID");
  const locationId = locationIdEl
    ? { value: text(locationIdEl) ?? "", schemeId: attr(locationIdEl, "schemeID") }
    : undefined;
  if (!partyName && !actualDate && !location && !locationId) return undefined;
  return { partyName, actualDate, location, locationId };
}

function projectPaymentInstructions(
  pmEl: RawObj | undefined,
  ptEl: RawObj | undefined,
): PaymentInstructions | undefined {
  if (!pmEl && !ptEl) return undefined;
  const meansCode = pmEl ? childText(pmEl, "cbc:PaymentMeansCode") : undefined;
  const meansText = pmEl
    ? attr(child(pmEl, "cbc:PaymentMeansCode"), "name") ?? childText(pmEl, "cbc:InstructionNote")
    : undefined;
  const paymentId = pmEl ? childText(pmEl, "cbc:PaymentID") : undefined;
  const iban = pmEl ? pathText(pmEl, "cac:PayeeFinancialAccount", "cbc:ID") : undefined;
  const accountName = pmEl
    ? pathText(pmEl, "cac:PayeeFinancialAccount", "cbc:Name")
    : undefined;
  const bicOrServiceId = pmEl
    ? pathText(
        pmEl,
        "cac:PayeeFinancialAccount",
        "cac:FinancialInstitutionBranch",
        "cbc:ID",
      )
    : undefined;
  const cardNumber = pmEl ? pathText(pmEl, "cac:CardAccount", "cbc:PrimaryAccountNumberID") : undefined;
  return { meansCode, meansText, paymentId, iban, accountName, bicOrServiceId, cardNumber };
}

function projectUblAllowanceCharge(el: RawObj): AllowanceCharge {
  const indicator = childText(el, "cbc:ChargeIndicator");
  return {
    isCharge: indicator === "true" || indicator === "1",
    amount: childText(el, "cbc:Amount") ?? "0",
    baseAmount: childText(el, "cbc:BaseAmount"),
    percentage: childText(el, "cbc:MultiplierFactorNumeric"),
    vatCategory: pathText(el, "cac:TaxCategory", "cbc:ID"),
    vatRate: pathText(el, "cac:TaxCategory", "cbc:Percent"),
    reasonCode: childText(el, "cbc:AllowanceChargeReasonCode"),
    reason: childText(el, "cbc:AllowanceChargeReason"),
  };
}

function projectUblDocumentTotals(el: RawObj | undefined): DocumentTotals {
  if (!el) return {};
  return {
    lineExtensionAmount: childText(el, "cbc:LineExtensionAmount"),
    taxExclusiveAmount: childText(el, "cbc:TaxExclusiveAmount"),
    taxInclusiveAmount: childText(el, "cbc:TaxInclusiveAmount"),
    allowanceTotalAmount: childText(el, "cbc:AllowanceTotalAmount"),
    chargeTotalAmount: childText(el, "cbc:ChargeTotalAmount"),
    prepaidAmount: childText(el, "cbc:PrepaidAmount"),
    payableAmount: childText(el, "cbc:PayableAmount"),
    roundingAmount: childText(el, "cbc:PayableRoundingAmount"),
  };
}

function projectUblVatBreakdown(taxTotalEl: RawObj | undefined): VatBreakdownLine[] {
  if (!taxTotalEl) return [];
  const lines: VatBreakdownLine[] = [];
  // Document-level tax amount aggregate
  const docTaxAmount = childText(taxTotalEl, "cbc:TaxAmount");
  // TaxSubtotal entries
  for (const sub of children(taxTotalEl, "cac:TaxSubtotal")) {
    const taxableAmount = childText(sub, "cbc:TaxableAmount") ?? "0";
    const taxAmount = childText(sub, "cbc:TaxAmount") ?? "0";
    const cat = firstChild(sub, "cac:TaxCategory");
    const category = (cat ? childText(cat, "cbc:ID") : undefined) ?? "S";
    const rate = cat ? childText(cat, "cbc:Percent") : undefined;
    const exemptionReasonCode = cat ? childText(cat, "cbc:TaxExemptionReasonCode") : undefined;
    const exemptionReason = cat ? childText(cat, "cbc:TaxExemptionReason") : undefined;
    lines.push({
      taxableAmount,
      taxAmount,
      category,
      rate,
      exemptionReasonCode,
      exemptionReason,
    });
  }
  if (lines.length === 0 && docTaxAmount !== undefined) {
    // Some senders emit only the aggregate TaxAmount. Project a single
    // unknown-category line so totals rules can still cross-check.
    lines.push({
      taxableAmount: "0",
      taxAmount: docTaxAmount,
      category: "S",
    });
  }
  return lines;
}

function projectUblLines(root: RawObj): InvoiceLine[] {
  const lineEls = [
    ...children(root, "cac:InvoiceLine"),
    ...children(root, "cac:CreditNoteLine"),
  ];
  const out: InvoiceLine[] = [];
  for (const el of lineEls) {
    const item = firstChild(el, "cac:Item");
    const price = firstChild(el, "cac:Price");
    const quantityEl = child(el, "cbc:InvoicedQuantity") ?? child(el, "cbc:CreditedQuantity");
    const itemTax = item ? firstChild(item, "cac:ClassifiedTaxCategory") : undefined;
    const lineAcs = children(el, "cac:AllowanceCharge").map(projectUblAllowanceCharge);
    out.push({
      id: childText(el, "cbc:ID") ?? "",
      note: childText(el, "cbc:Note"),
      objectId: pathText(el, "cac:DocumentReference", "cbc:ID"),
      quantity: text(quantityEl) ?? "0",
      quantityUnitCode: attr(quantityEl, "unitCode"),
      netAmount: childText(el, "cbc:LineExtensionAmount") ?? "0",
      buyerReference: childText(el, "cbc:AccountingCost"),
      buyerAccountingReference: childText(el, "cbc:AccountingCost"),
      periodStart: pathText(el, "cac:InvoicePeriod", "cbc:StartDate"),
      periodEnd: pathText(el, "cac:InvoicePeriod", "cbc:EndDate"),
      lineAllowances: lineAcs.filter((a) => !a.isCharge),
      lineCharges: lineAcs.filter((a) => a.isCharge),
      itemName: (item && childText(item, "cbc:Name")) ?? "",
      itemDescription: item ? childText(item, "cbc:Description") : undefined,
      itemSellerId: item ? pathText(item, "cac:SellersItemIdentification", "cbc:ID") : undefined,
      itemBuyerId: item ? pathText(item, "cac:BuyersItemIdentification", "cbc:ID") : undefined,
      itemStandardId: (() => {
        if (!item) return undefined;
        const idEl = path(item, "cac:StandardItemIdentification", "cbc:ID");
        if (!idEl) return undefined;
        return { value: text(idEl) ?? "", schemeId: attr(idEl, "schemeID") };
      })(),
      classifications: item
        ? children(item, "cac:CommodityClassification").map((c) => {
            const idEl = child(c, "cbc:ItemClassificationCode");
            return {
              value: text(idEl) ?? "",
              schemeId: attr(idEl, "listID"),
              schemeVersion: attr(idEl, "listVersionID"),
            };
          })
        : undefined,
      originCountry: item ? pathText(item, "cac:OriginCountry", "cbc:IdentificationCode") : undefined,
      itemAttributes: item
        ? children(item, "cac:AdditionalItemProperty").map((p) => ({
            name: childText(p, "cbc:Name") ?? "",
            value: childText(p, "cbc:Value") ?? "",
          }))
        : undefined,
      netPrice: price ? childText(price, "cbc:PriceAmount") : undefined,
      priceBaseQuantity: price ? childText(price, "cbc:BaseQuantity") : undefined,
      priceBaseQuantityUnit: price ? attr(child(price, "cbc:BaseQuantity"), "unitCode") : undefined,
      vatCategory: itemTax ? childText(itemTax, "cbc:ID") ?? "" : "",
      vatRate: itemTax ? childText(itemTax, "cbc:Percent") : undefined,
    });
  }
  // asArray retained import for typing pass — silence linter when not used.
  void asArray;
  return out;
}
