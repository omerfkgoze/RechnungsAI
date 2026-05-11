// CII (Cross-Industry Invoice) D16B / Factur-X / ZUGFeRD inner XML → Invoice.
//
// CII uses different element names than UBL. The root is `rsm:CrossIndustryInvoice`
// with three main children:
//   rsm:ExchangedDocumentContext   → CustomizationID, ProfileID, BusinessProcessSpecifiedDocumentContextParameter
//   rsm:ExchangedDocument          → BT-1 ID, BT-3 TypeCode, BT-2 IssueDateTime, BG-1 IncludedNote
//   rsm:SupplyChainTradeTransaction
//     ├─ ram:IncludedSupplyChainTradeLineItem (×N)    — BG-25 lines
//     ├─ ram:ApplicableHeaderTradeAgreement           — parties, references
//     ├─ ram:ApplicableHeaderTradeDelivery            — BG-13
//     └─ ram:ApplicableHeaderTradeSettlement          — currency, totals, VAT, payment
//
// Prefixes: rsm (root namespace), ram (reusable aggregate), udt (unqualified data type), qdt.

import type {
  AllowanceCharge,
  DocumentTotals,
  Invoice,
  InvoiceLine,
  Party,
  PostalAddress,
  PaymentInstructions,
  RawObj,
  ValidationViolation,
  VatBreakdownLine,
} from "../types.js";
import {
  attr,
  child,
  childText,
  children,
  firstChild,
  path,
  pathText,
  text,
} from "./util.js";

export type CiiProjectionResult = {
  invoice: Invoice | null;
  violations: ValidationViolation[];
};

export function projectFromCii(raw: RawObj): CiiProjectionResult {
  const violations: ValidationViolation[] = [];
  const root =
    (raw["rsm:CrossIndustryInvoice"] as RawObj | undefined) ??
    findRootByLocalName(raw, ["CrossIndustryInvoice"]);

  if (!root) {
    violations.push({
      ruleId: "STRUCT-CII-ROOT-MISSING",
      category: "STRUCT",
      severity: "fatal",
      citation: "CII D16B Document Root",
      message: "CII-Wurzelelement (CrossIndustryInvoice) fehlt.",
    });
    return { invoice: null, violations };
  }

  const docContext = firstChild(root, "rsm:ExchangedDocumentContext");
  const customizationId =
    pathText(docContext, "ram:GuidelineSpecifiedDocumentContextParameter", "ram:ID") ??
    "";
  const profileId = pathText(
    docContext,
    "ram:BusinessProcessSpecifiedDocumentContextParameter",
    "ram:ID",
  );

  const exDoc = firstChild(root, "rsm:ExchangedDocument");
  const invoiceNumber = childText(exDoc, "ram:ID");
  const typeCode = childText(exDoc, "ram:TypeCode");
  const issueDate = parseCiiDateTime(
    pathText(exDoc, "ram:IssueDateTime", "udt:DateTimeString"),
  );
  const notes = children(exDoc, "ram:IncludedNote")
    .map((n) => childText(n, "ram:Content"))
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  const tx = firstChild(root, "rsm:SupplyChainTradeTransaction");
  const agreement = tx ? firstChild(tx, "ram:ApplicableHeaderTradeAgreement") : undefined;
  const delivery = tx ? firstChild(tx, "ram:ApplicableHeaderTradeDelivery") : undefined;
  const settlement = tx ? firstChild(tx, "ram:ApplicableHeaderTradeSettlement") : undefined;

  const buyerReference = agreement ? childText(agreement, "ram:BuyerReference") : undefined;
  const seller = projectCiiParty(firstChild(agreement, "ram:SellerTradeParty"));
  const buyer = projectCiiParty(firstChild(agreement, "ram:BuyerTradeParty"));
  const taxRepresentative = firstChild(agreement, "ram:TaxRepresentativeTradeParty")
    ? projectCiiParty(firstChild(agreement, "ram:TaxRepresentativeTradeParty"))
    : undefined;
  const payee = settlement && firstChild(settlement, "ram:PayeeTradeParty")
    ? projectCiiParty(firstChild(settlement, "ram:PayeeTradeParty"))
    : undefined;

  const projectReference = pathText(agreement, "ram:SpecifiedProcuringProject", "ram:ID");
  const contractReference = pathText(
    agreement,
    "ram:ContractReferencedDocument",
    "ram:IssuerAssignedID",
  );
  const orderReference = pathText(
    agreement,
    "ram:BuyerOrderReferencedDocument",
    "ram:IssuerAssignedID",
  );
  const salesOrderReference = pathText(
    agreement,
    "ram:SellerOrderReferencedDocument",
    "ram:IssuerAssignedID",
  );

  const actualDeliveryDate = parseCiiDateTime(
    pathText(
      delivery,
      "ram:ActualDeliverySupplyChainEvent",
      "ram:OccurrenceDateTime",
      "udt:DateTimeString",
    ),
  );
  const receivingAdviceReference = pathText(
    delivery,
    "ram:ReceivingAdviceReferencedDocument",
    "ram:IssuerAssignedID",
  );
  const despatchAdviceReference = pathText(
    delivery,
    "ram:DespatchAdviceReferencedDocument",
    "ram:IssuerAssignedID",
  );
  const deliveryAddress = projectCiiAddress(
    firstChild(firstChild(delivery, "ram:ShipToTradeParty"), "ram:PostalTradeAddress"),
  );
  const deliveryPartyName = pathText(delivery, "ram:ShipToTradeParty", "ram:Name");

  const currencyCode = settlement
    ? childText(settlement, "ram:InvoiceCurrencyCode")
    : undefined;
  const accountingCurrencyCode = settlement
    ? childText(settlement, "ram:TaxCurrencyCode")
    : undefined;
  const paymentTerms = settlement
    ? pathText(settlement, "ram:SpecifiedTradePaymentTerms", "ram:Description")
    : undefined;
  const dueDate = settlement
    ? parseCiiDateTime(
        pathText(
          settlement,
          "ram:SpecifiedTradePaymentTerms",
          "ram:DueDateDateTime",
          "udt:DateTimeString",
        ),
      )
    : undefined;
  const vatPointDate = settlement
    ? parseCiiDateTime(
        pathText(
          settlement,
          "ram:ApplicableTradeTax",
          "ram:TaxPointDate",
          "udt:DateString",
        ),
      )
    : undefined;
  const vatPointDateCode = settlement
    ? pathText(settlement, "ram:ApplicableTradeTax", "ram:DueDateTypeCode")
    : undefined;

  const settlementAcs = settlement
    ? children(settlement, "ram:SpecifiedTradeAllowanceCharge").map(projectCiiAllowanceCharge)
    : [];
  const documentLevelAllowances = settlementAcs.filter((a) => !a.isCharge);
  const documentLevelCharges = settlementAcs.filter((a) => a.isCharge);

  const documentTotals = projectCiiDocumentTotals(
    firstChild(settlement, "ram:SpecifiedTradeSettlementHeaderMonetarySummation"),
  );
  const vatBreakdown = settlement ? projectCiiVatBreakdown(settlement) : [];
  const paymentInstructions = settlement
    ? projectCiiPaymentInstructions(settlement)
    : undefined;
  const invoicePeriodStart = settlement
    ? parseCiiDateTime(
        pathText(
          settlement,
          "ram:BillingSpecifiedPeriod",
          "ram:StartDateTime",
          "udt:DateTimeString",
        ),
      )
    : undefined;
  const invoicePeriodEnd = settlement
    ? parseCiiDateTime(
        pathText(
          settlement,
          "ram:BillingSpecifiedPeriod",
          "ram:EndDateTime",
          "udt:DateTimeString",
        ),
      )
    : undefined;

  const invoiceLines = tx ? projectCiiLines(tx) : [];

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
    customizationId,
    profileId,
    notes,
    invoicePeriodStart,
    invoicePeriodEnd,
    seller,
    buyer,
    payee,
    taxRepresentative,
    delivery:
      actualDeliveryDate || deliveryAddress || deliveryPartyName
        ? {
            partyName: deliveryPartyName,
            actualDate: actualDeliveryDate,
            location: deliveryAddress,
          }
        : undefined,
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

function findRootByLocalName(raw: RawObj, localNames: string[]): RawObj | undefined {
  for (const k of Object.keys(raw)) {
    const localIdx = k.lastIndexOf(":");
    const local = localIdx >= 0 ? k.slice(localIdx + 1) : k;
    if (localNames.includes(local) && typeof raw[k] === "object") {
      return raw[k] as RawObj;
    }
  }
  return undefined;
}

function parseCiiDateTime(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // CII uses udt:DateTimeString with @format="102" → YYYYMMDD
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return value;
}

function projectCiiParty(partyEl: RawObj | undefined): Party {
  if (!partyEl) return {};
  const name = childText(partyEl, "ram:Name") ?? pathText(partyEl, "ram:SpecifiedLegalOrganization", "ram:TradingBusinessName");
  const tradingName = pathText(partyEl, "ram:SpecifiedLegalOrganization", "ram:TradingBusinessName");
  let vatId: string | undefined;
  let taxRegId: string | undefined;
  for (const reg of children(partyEl, "ram:SpecifiedTaxRegistration")) {
    const id = childText(reg, "ram:ID");
    const scheme = attr(child(reg, "ram:ID"), "schemeID");
    if (id && scheme === "VA") vatId = id;
    else if (id) taxRegId = id;
  }
  const legalRegId = pathText(partyEl, "ram:SpecifiedLegalOrganization", "ram:ID");
  const address = projectCiiAddress(firstChild(partyEl, "ram:PostalTradeAddress"));
  const contactEl = firstChild(partyEl, "ram:DefinedTradeContact");
  const contact = contactEl
    ? {
        name: childText(contactEl, "ram:PersonName"),
        phone: pathText(contactEl, "ram:TelephoneUniversalCommunication", "ram:CompleteNumber"),
        email: pathText(contactEl, "ram:EmailURIUniversalCommunication", "ram:URIID"),
      }
    : undefined;
  const electronicAddressEl = child(partyEl, "ram:URIUniversalCommunication");
  const electronicAddress = electronicAddressEl
    ? {
        value: childText(electronicAddressEl, "ram:URIID") ?? "",
        schemeId: attr(child(electronicAddressEl, "ram:URIID"), "schemeID"),
      }
    : undefined;
  return {
    name,
    tradingName,
    vatId,
    taxRegId,
    legalRegId,
    address,
    contact,
    electronicAddress,
  };
}

function projectCiiAddress(el: RawObj | undefined): PostalAddress | undefined {
  if (!el) return undefined;
  return {
    line1: childText(el, "ram:LineOne"),
    line2: childText(el, "ram:LineTwo"),
    line3: childText(el, "ram:LineThree"),
    city: childText(el, "ram:CityName"),
    postCode: childText(el, "ram:PostcodeCode"),
    countrySubdivision: childText(el, "ram:CountrySubDivisionName"),
    countryCode: childText(el, "ram:CountryID"),
  };
}

function projectCiiAllowanceCharge(el: RawObj): AllowanceCharge {
  const indicator = pathText(el, "ram:ChargeIndicator", "udt:Indicator");
  return {
    isCharge: indicator === "true" || indicator === "1",
    amount: childText(el, "ram:ActualAmount") ?? "0",
    baseAmount: childText(el, "ram:BasisAmount"),
    percentage: childText(el, "ram:CalculationPercent"),
    vatCategory: pathText(el, "ram:CategoryTradeTax", "ram:CategoryCode"),
    vatRate: pathText(el, "ram:CategoryTradeTax", "ram:RateApplicablePercent"),
    reasonCode: childText(el, "ram:ReasonCode"),
    reason: childText(el, "ram:Reason"),
  };
}

function projectCiiDocumentTotals(el: RawObj | undefined): DocumentTotals {
  if (!el) return {};
  return {
    lineExtensionAmount: childText(el, "ram:LineTotalAmount"),
    taxExclusiveAmount: childText(el, "ram:TaxBasisTotalAmount"),
    taxInclusiveAmount: childText(el, "ram:GrandTotalAmount"),
    allowanceTotalAmount: childText(el, "ram:AllowanceTotalAmount"),
    chargeTotalAmount: childText(el, "ram:ChargeTotalAmount"),
    prepaidAmount: childText(el, "ram:TotalPrepaidAmount"),
    payableAmount: childText(el, "ram:DuePayableAmount"),
    roundingAmount: childText(el, "ram:RoundingAmount"),
    taxAmount: (() => {
      // CII gross-tax-amount lives at SettlementMonetarySummation.TaxTotalAmount,
      // possibly carrying currencyID. Some senders emit multiple (one per currency).
      const totals = children(el, "ram:TaxTotalAmount");
      if (totals.length === 0) {
        const t = childText(el, "ram:TaxTotalAmount");
        return t;
      }
      return text(totals[0]);
    })(),
  };
}

function projectCiiVatBreakdown(settlement: RawObj): VatBreakdownLine[] {
  const lines: VatBreakdownLine[] = [];
  for (const tax of children(settlement, "ram:ApplicableTradeTax")) {
    lines.push({
      taxableAmount: childText(tax, "ram:BasisAmount") ?? "0",
      taxAmount: childText(tax, "ram:CalculatedAmount") ?? "0",
      category: childText(tax, "ram:CategoryCode") ?? "S",
      rate: childText(tax, "ram:RateApplicablePercent"),
      exemptionReasonCode: childText(tax, "ram:ExemptionReasonCode"),
      exemptionReason: childText(tax, "ram:ExemptionReason"),
    });
  }
  return lines;
}

function projectCiiPaymentInstructions(
  settlement: RawObj,
): PaymentInstructions | undefined {
  const pm = firstChild(settlement, "ram:SpecifiedTradeSettlementPaymentMeans");
  if (!pm) return undefined;
  return {
    meansCode: childText(pm, "ram:TypeCode"),
    meansText: childText(pm, "ram:Information"),
    iban: pathText(pm, "ram:PayeePartyCreditorFinancialAccount", "ram:IBANID"),
    accountName: pathText(pm, "ram:PayeePartyCreditorFinancialAccount", "ram:AccountName"),
    bicOrServiceId: pathText(pm, "ram:PayeeSpecifiedCreditorFinancialInstitution", "ram:BICID"),
    cardNumber: pathText(pm, "ram:ApplicableTradeSettlementFinancialCard", "ram:ID"),
  };
}

function projectCiiLines(tx: RawObj): InvoiceLine[] {
  const out: InvoiceLine[] = [];
  for (const line of children(tx, "ram:IncludedSupplyChainTradeLineItem")) {
    const lineDoc = firstChild(line, "ram:AssociatedDocumentLineDocument");
    const product = firstChild(line, "ram:SpecifiedTradeProduct");
    const agreement = firstChild(line, "ram:SpecifiedLineTradeAgreement");
    const delivery = firstChild(line, "ram:SpecifiedLineTradeDelivery");
    const settlement = firstChild(line, "ram:SpecifiedLineTradeSettlement");
    const monetary = settlement
      ? firstChild(settlement, "ram:SpecifiedTradeSettlementLineMonetarySummation")
      : undefined;
    const tax = settlement ? firstChild(settlement, "ram:ApplicableTradeTax") : undefined;
    const lineAcs = settlement
      ? children(settlement, "ram:SpecifiedTradeAllowanceCharge").map(projectCiiAllowanceCharge)
      : [];
    const quantityEl = delivery
      ? child(delivery, "ram:BilledQuantity") ?? child(delivery, "ram:ChargeFreeQuantity")
      : undefined;
    const grossPrice = agreement
      ? firstChild(agreement, "ram:GrossPriceProductTradePrice")
      : undefined;
    const netPrice = agreement
      ? firstChild(agreement, "ram:NetPriceProductTradePrice")
      : undefined;
    const noteText = lineDoc
      ? pathText(lineDoc, "ram:IncludedNote", "ram:Content")
      : undefined;

    out.push({
      id: lineDoc ? (childText(lineDoc, "ram:LineID") ?? "") : "",
      note: noteText,
      objectId: agreement
        ? pathText(agreement, "ram:AdditionalReferencedDocument", "ram:IssuerAssignedID")
        : undefined,
      quantity: text(quantityEl) ?? "0",
      quantityUnitCode: attr(quantityEl, "unitCode"),
      netAmount: monetary ? (childText(monetary, "ram:LineTotalAmount") ?? "0") : "0",
      buyerReference: settlement
        ? pathText(settlement, "ram:ReceivableSpecifiedTradeAccountingAccount", "ram:ID")
        : undefined,
      periodStart: settlement
        ? parseCiiDateTime(
            pathText(
              settlement,
              "ram:BillingSpecifiedPeriod",
              "ram:StartDateTime",
              "udt:DateTimeString",
            ),
          )
        : undefined,
      periodEnd: settlement
        ? parseCiiDateTime(
            pathText(
              settlement,
              "ram:BillingSpecifiedPeriod",
              "ram:EndDateTime",
              "udt:DateTimeString",
            ),
          )
        : undefined,
      lineAllowances: lineAcs.filter((a) => !a.isCharge),
      lineCharges: lineAcs.filter((a) => a.isCharge),
      itemName: product ? (childText(product, "ram:Name") ?? "") : "",
      itemDescription: product ? childText(product, "ram:Description") : undefined,
      itemSellerId: product ? childText(product, "ram:SellerAssignedID") : undefined,
      itemBuyerId: product ? childText(product, "ram:BuyerAssignedID") : undefined,
      itemStandardId: (() => {
        if (!product) return undefined;
        const idEl = child(product, "ram:GlobalID");
        if (!idEl) return undefined;
        return { value: text(idEl) ?? "", schemeId: attr(idEl, "schemeID") };
      })(),
      classifications: product
        ? children(product, "ram:DesignatedProductClassification").map((c) => {
            const codeEl = child(c, "ram:ClassCode");
            return {
              value: text(codeEl) ?? "",
              schemeId: attr(codeEl, "listID"),
              schemeVersion: attr(codeEl, "listVersionID"),
            };
          })
        : undefined,
      originCountry: product ? pathText(product, "ram:OriginTradeCountry", "ram:ID") : undefined,
      itemAttributes: product
        ? children(product, "ram:ApplicableProductCharacteristic").map((c) => ({
            name: childText(c, "ram:Description") ?? "",
            value: childText(c, "ram:Value") ?? "",
          }))
        : undefined,
      netPrice: netPrice ? childText(netPrice, "ram:ChargeAmount") : grossPrice ? childText(grossPrice, "ram:ChargeAmount") : undefined,
      priceBaseQuantity: netPrice ? childText(netPrice, "ram:BasisQuantity") : undefined,
      priceBaseQuantityUnit: netPrice ? attr(child(netPrice, "ram:BasisQuantity"), "unitCode") : undefined,
      vatCategory: tax ? (childText(tax, "ram:CategoryCode") ?? "") : "",
      vatRate: tax ? childText(tax, "ram:RateApplicablePercent") : undefined,
    });
  }
  return out;
}
