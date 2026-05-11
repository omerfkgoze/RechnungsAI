import { describe, expect, it } from "vitest";

import { xrechnungDeRules } from "../rules/xrechnung-de.js";
import { buildValidInvoice, findRule } from "./_fixtures.js";

describe("XRechnung CIUS — de-BR-* rules", () => {
  it("de-BR-01 passes when Leitweg-ID is present", () => {
    expect(findRule(xrechnungDeRules, "de-BR-01").run(buildValidInvoice())).toBeNull();
  });
  it("de-BR-01 fails when buyer reference (Leitweg-ID) is missing", () => {
    const inv = buildValidInvoice({ buyerReference: undefined });
    expect(findRule(xrechnungDeRules, "de-BR-01").run(inv)).not.toBeNull();
  });

  it("de-BR-15 passes for a known XRechnung CustomizationID URN", () => {
    expect(findRule(xrechnungDeRules, "de-BR-15").run(buildValidInvoice())).toBeNull();
  });
  it("de-BR-15 fails for an unrecognized URN", () => {
    const inv = buildValidInvoice({ customizationId: "urn:something:else" });
    expect(findRule(xrechnungDeRules, "de-BR-15").run(inv)).not.toBeNull();
  });

  it("de-BR-16 fails when seller postcode is missing", () => {
    const inv = buildValidInvoice({
      seller: { name: "X", vatId: "DE1", address: { line1: "X", city: "Berlin", countryCode: "DE" } },
    });
    expect(findRule(xrechnungDeRules, "de-BR-16").run(inv)).not.toBeNull();
  });
  it("de-BR-16 passes when seller address is complete", () => {
    expect(findRule(xrechnungDeRules, "de-BR-16").run(buildValidInvoice())).toBeNull();
  });

  it("de-BR-04 fails when neither electronic address nor email is present on seller", () => {
    const inv = buildValidInvoice({
      seller: { name: "X", vatId: "DE1", address: { countryCode: "DE", city: "B", postCode: "1" }, electronicAddress: undefined, contact: undefined },
    });
    expect(findRule(xrechnungDeRules, "de-BR-04").run(inv)).not.toBeNull();
  });
  it("de-BR-04 passes when seller has an electronic address", () => {
    const inv = buildValidInvoice({
      seller: {
        name: "X",
        vatId: "DE1",
        address: { countryCode: "DE", city: "B", postCode: "1" },
        electronicAddress: { value: "9999:test", schemeId: "0204" },
      },
    });
    expect(findRule(xrechnungDeRules, "de-BR-04").run(inv)).toBeNull();
  });
});
