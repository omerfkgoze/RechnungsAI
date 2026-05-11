import { describe, expect, it } from "vitest";

import { parseXml } from "../parsers/xml.js";
import { projectFromCii } from "../parsers/cii.js";
import { detectProfile } from "../parsers/detect.js";

const MINIMAL_CII = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>RE-2026-007</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">20260511</udt:DateTimeString></ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>1</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>Widget</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice><ram:ChargeAmount>100.00</ram:ChargeAmount></ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="PCE">1</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>19</ram:RateApplicablePercent></ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>100.00</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>991-X1-99</ram:BuyerReference>
      <ram:SellerTradeParty>
        <ram:Name>Acme GmbH</ram:Name>
        <ram:PostalTradeAddress>
          <ram:LineOne>Hauptstr. 1</ram:LineOne>
          <ram:PostcodeCode>10115</ram:PostcodeCode>
          <ram:CityName>Berlin</ram:CityName>
          <ram:CountryID>DE</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">DE123456789</ram:ID></ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>Bob KG</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>20095</ram:PostcodeCode>
          <ram:CityName>Hamburg</ram:CityName>
          <ram:CountryID>DE</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>19.00</ram:CalculatedAmount>
        <ram:BasisAmount>100.00</ram:BasisAmount>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>19</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>100.00</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>100.00</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">19.00</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>119.00</ram:GrandTotalAmount>
        <ram:DuePayableAmount>119.00</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

describe("CII parser", () => {
  it("detects CII profile from a minimal CII invoice", () => {
    expect(detectProfile(MINIMAL_CII)).toBe("cii");
  });

  it("projects header + parties + totals + lines", () => {
    const raw = parseXml(MINIMAL_CII);
    const { invoice } = projectFromCii(raw);
    expect(invoice?.invoiceNumber).toBe("RE-2026-007");
    expect(invoice?.typeCode).toBe("380");
    expect(invoice?.issueDate).toBe("2026-05-11");
    expect(invoice?.currencyCode).toBe("EUR");
    expect(invoice?.seller.name).toBe("Acme GmbH");
    expect(invoice?.seller.vatId).toBe("DE123456789");
    expect(invoice?.buyer.address?.postCode).toBe("20095");
    expect(invoice?.documentTotals.taxInclusiveAmount).toBe("119.00");
    expect(invoice?.documentTotals.payableAmount).toBe("119.00");
    expect(invoice?.invoiceLines).toHaveLength(1);
    expect(invoice?.invoiceLines[0]?.itemName).toBe("Widget");
    expect(invoice?.invoiceLines[0]?.vatCategory).toBe("S");
  });

  it("emits STRUCT-CII-ROOT-MISSING when root element is absent", () => {
    const raw = parseXml(`<NotCii/>`);
    const { invoice, violations } = projectFromCii(raw);
    expect(invoice).toBeNull();
    expect(violations.some((v) => v.ruleId === "STRUCT-CII-ROOT-MISSING")).toBe(true);
  });

  it("parses udt:DateTimeString format='102' as ISO YYYY-MM-DD", () => {
    const raw = parseXml(MINIMAL_CII);
    const { invoice } = projectFromCii(raw);
    expect(invoice?.issueDate).toBe("2026-05-11");
  });
});
