import { describe, expect, it } from "vitest";

import { parseXml } from "../parsers/xml.js";
import { projectFromUbl } from "../parsers/ubl.js";
import { detectProfile } from "../parsers/detect.js";

const MINIMAL_UBL = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>
  <cbc:ID>INV-001</cbc:ID>
  <cbc:IssueDate>2026-05-11</cbc:IssueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>991-X1-99</cbc:BuyerReference>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0204">9999:test</cbc:EndpointID>
    <cac:PartyName><cbc:Name>Acme GmbH</cbc:Name></cac:PartyName>
    <cac:PostalAddress>
      <cbc:StreetName>Hauptstr. 1</cbc:StreetName>
      <cbc:CityName>Berlin</cbc:CityName>
      <cbc:PostalZone>10115</cbc:PostalZone>
      <cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country>
    </cac:PostalAddress>
    <cac:PartyTaxScheme>
      <cbc:CompanyID>DE123456789</cbc:CompanyID>
      <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
    </cac:PartyTaxScheme>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyName><cbc:Name>Bob KG</cbc:Name></cac:PartyName>
    <cac:PostalAddress>
      <cbc:CityName>Hamburg</cbc:CityName>
      <cbc:PostalZone>20095</cbc:PostalZone>
      <cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country>
    </cac:PostalAddress>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">100.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">100.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">119.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">119.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="EUR">19.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="EUR">100.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="EUR">19.00</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>19</cbc:Percent></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="PCE">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="EUR">100.00</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Widget</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="EUR">100.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

describe("UBL parser", () => {
  it("detects UBL profile from a minimal UBL invoice", () => {
    expect(detectProfile(MINIMAL_UBL)).toBe("ubl");
  });

  it("projects header fields", () => {
    const raw = parseXml(MINIMAL_UBL);
    const { invoice } = projectFromUbl(raw);
    expect(invoice?.invoiceNumber).toBe("INV-001");
    expect(invoice?.issueDate).toBe("2026-05-11");
    expect(invoice?.typeCode).toBe("380");
    expect(invoice?.currencyCode).toBe("EUR");
    expect(invoice?.customizationId).toContain("xrechnung_3.0");
    expect(invoice?.buyerReference).toBe("991-X1-99");
  });

  it("projects seller and buyer", () => {
    const raw = parseXml(MINIMAL_UBL);
    const { invoice } = projectFromUbl(raw);
    expect(invoice?.seller.name).toBe("Acme GmbH");
    expect(invoice?.seller.vatId).toBe("DE123456789");
    expect(invoice?.seller.address?.countryCode).toBe("DE");
    expect(invoice?.buyer.name).toBe("Bob KG");
  });

  it("projects totals + vat breakdown + lines", () => {
    const raw = parseXml(MINIMAL_UBL);
    const { invoice } = projectFromUbl(raw);
    expect(invoice?.documentTotals.taxInclusiveAmount).toBe("119.00");
    expect(invoice?.vatBreakdown).toHaveLength(1);
    expect(invoice?.vatBreakdown[0]?.category).toBe("S");
    expect(invoice?.invoiceLines).toHaveLength(1);
    expect(invoice?.invoiceLines[0]?.itemName).toBe("Widget");
    expect(invoice?.invoiceLines[0]?.quantityUnitCode).toBe("PCE");
  });

  it("surfaces STRUCT-UBL-ROOT-MISSING when the root element is absent", () => {
    const raw = parseXml(`<NotAnInvoice/>`);
    const { invoice, violations } = projectFromUbl(raw);
    expect(invoice).toBeNull();
    expect(violations.some((v) => v.ruleId === "STRUCT-UBL-ROOT-MISSING")).toBe(true);
  });

  it("does not pre-parse monetary values", () => {
    const raw = parseXml(MINIMAL_UBL);
    const { invoice } = projectFromUbl(raw);
    // Text remains textual until rule engine normalizes it.
    expect(typeof invoice?.documentTotals.taxInclusiveAmount).toBe("string");
  });
});
