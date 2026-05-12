// End-to-end smoke against `validateEN16931` using the synthetic UBL fixture.
// The full KoSIT-corpus integration test (per AC #29 tier "Integration") is
// deferred to the follow-up session — it requires the vendored corpus from
// itplr-kosit/xrechnung-testsuite, which lands in Task 1.

import { describe, expect, it } from "vitest";

import { RULE_SET_VERSION, validateEN16931 } from "../index.js";

const VALID_UBL = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>
  <cbc:ID>INV-001</cbc:ID>
  <cbc:IssueDate>2026-05-11</cbc:IssueDate>
  <cbc:DueDate>2026-06-11</cbc:DueDate>
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
    <cac:Contact>
      <cbc:Name>Vertrieb</cbc:Name>
      <cbc:Telephone>+49 30 1234567</cbc:Telephone>
      <cbc:ElectronicMail>info@acme.example</cbc:ElectronicMail>
    </cac:Contact>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyName><cbc:Name>Bob KG</cbc:Name></cac:PartyName>
    <cac:PostalAddress>
      <cbc:CityName>Hamburg</cbc:CityName>
      <cbc:PostalZone>20095</cbc:PostalZone>
      <cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country>
    </cac:PostalAddress>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>
    <cac:PayeeFinancialAccount>
      <cbc:ID>DE89370400440532013000</cbc:ID>
      <cbc:Name>Acme GmbH</cbc:Name>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
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

describe("validateEN16931 end-to-end smoke", () => {
  it("rejects oversized XML with STRUCT-XML-TOO-LARGE", () => {
    const big = "x".repeat(10 * 1024 * 1024 + 1);
    const r = validateEN16931(big);
    expect(r.status).toBe("invalid");
    expect(r.violations[0]?.ruleId).toBe("STRUCT-XML-TOO-LARGE");
  });

  it("rejects unknown profile with STRUCT-PROFILE-UNKNOWN", () => {
    const r = validateEN16931("<RandomXml/>");
    expect(r.status).toBe("invalid");
    expect(r.profile).toBe("unknown");
    expect(r.violations[0]?.ruleId).toBe("STRUCT-PROFILE-UNKNOWN");
  });

  it("validates a complete UBL invoice as valid (or warning at worst)", () => {
    const r = validateEN16931(VALID_UBL, { ruleSet: "xrechnung" });
    const fatals = r.violations.filter((v) => v.severity === "fatal" || v.severity === "error");
    expect(fatals).toEqual([]);
    expect(r.profile).toBe("ubl");
    expect(r.customizationId).toContain("xrechnung_3.0");
    expect(r.ruleSetVersion).toBe(RULE_SET_VERSION);
  });

  it("flags BR-CO-15 when gross total is inconsistent with net + tax", () => {
    const bad = VALID_UBL.replace(
      "<cbc:TaxInclusiveAmount currencyID=\"EUR\">119.00</cbc:TaxInclusiveAmount>",
      "<cbc:TaxInclusiveAmount currencyID=\"EUR\">150.00</cbc:TaxInclusiveAmount>",
    );
    const r = validateEN16931(bad);
    expect(r.violations.some((v) => v.ruleId === "BR-CO-15")).toBe(true);
  });

  it("reports durationMs as a non-negative number", () => {
    const r = validateEN16931(VALID_UBL);
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });
});
