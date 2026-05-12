// XRechnung 3.0.2 CIUS — BR-DE-* / BR-DEX-* rules.
// Naming reconciled in Session 6: the four legacy `de-BR-*` rules are now their
// canonical `BR-DE-*` IDs; the remaining IDs from the vendored Schematron ship
// as real rules (where the model supports the predicate) or typed no-op stubs.

import { describe, expect, it } from "vitest";

import { xrechnungDeRules } from "../rules/xrechnung-de.js";
import { buildValidInvoice, findRule } from "./_fixtures.js";

const rule = (id: string) => findRule(xrechnungDeRules, id);

describe("XRechnung CIUS — seller contact group (BG-6)", () => {
  it("BR-DE-2 passes when seller contact is present", () => {
    expect(rule("BR-DE-2").run(buildValidInvoice())).toBeNull();
  });
  it("BR-DE-2 fails when seller contact is missing", () => {
    const inv = buildValidInvoice({ seller: { contact: undefined } });
    expect(rule("BR-DE-2").run(inv)).not.toBeNull();
  });

  it("BR-DE-5 fails when seller contact name is missing", () => {
    const inv = buildValidInvoice({ seller: { contact: { phone: "030 1", email: "a@b.cd" } } });
    expect(rule("BR-DE-5").run(inv)).not.toBeNull();
  });
  it("BR-DE-6 fails when seller contact phone is missing", () => {
    const inv = buildValidInvoice({ seller: { contact: { name: "X", email: "a@b.cd" } } });
    expect(rule("BR-DE-6").run(inv)).not.toBeNull();
  });
  it("BR-DE-7 fails when seller contact email is missing", () => {
    const inv = buildValidInvoice({ seller: { contact: { name: "X", phone: "030 12345" } } });
    expect(rule("BR-DE-7").run(inv)).not.toBeNull();
  });
  it("BR-DE-5/6/7 pass on the conformant fixture", () => {
    const inv = buildValidInvoice();
    expect(rule("BR-DE-5").run(inv)).toBeNull();
    expect(rule("BR-DE-6").run(inv)).toBeNull();
    expect(rule("BR-DE-7").run(inv)).toBeNull();
  });

  it("BR-DE-27 fails when seller phone has fewer than three digits", () => {
    const inv = buildValidInvoice({ seller: { contact: { name: "X", phone: "ab-1", email: "a@b.cd" } } });
    expect(rule("BR-DE-27").run(inv)).not.toBeNull();
  });
  it("BR-DE-27 passes for a normal phone number", () => {
    expect(rule("BR-DE-27").run(buildValidInvoice())).toBeNull();
  });
  it("BR-DE-28 fails for a malformed email (no @)", () => {
    const inv = buildValidInvoice({ seller: { contact: { name: "X", phone: "030 12345", email: "not-an-email" } } });
    expect(rule("BR-DE-28").run(inv)).not.toBeNull();
  });
  it("BR-DE-28 fails when a dot directly flanks the @", () => {
    const inv = buildValidInvoice({ seller: { contact: { name: "X", phone: "030 12345", email: "a.@b.cd" } } });
    expect(rule("BR-DE-28").run(inv)).not.toBeNull();
  });
  it("BR-DE-28 passes for a well-formed email", () => {
    expect(rule("BR-DE-28").run(buildValidInvoice())).toBeNull();
  });
});

describe("XRechnung CIUS — postal address completeness", () => {
  it("BR-DE-3 fails when seller city is missing", () => {
    const inv = buildValidInvoice({ seller: { address: { postCode: "10115", countryCode: "DE" } } });
    expect(rule("BR-DE-3").run(inv)).not.toBeNull();
  });
  it("BR-DE-4 fails when seller post code is missing", () => {
    const inv = buildValidInvoice({ seller: { address: { city: "Berlin", countryCode: "DE" } } });
    expect(rule("BR-DE-4").run(inv)).not.toBeNull();
  });
  it("BR-DE-8 fails when buyer city is missing", () => {
    const inv = buildValidInvoice({ buyer: { address: { postCode: "20095", countryCode: "DE" } } });
    expect(rule("BR-DE-8").run(inv)).not.toBeNull();
  });
  it("BR-DE-9 fails when buyer post code is missing", () => {
    const inv = buildValidInvoice({ buyer: { address: { city: "Hamburg", countryCode: "DE" } } });
    expect(rule("BR-DE-9").run(inv)).not.toBeNull();
  });
  it("BR-DE-3/4/8/9 pass on the conformant fixture", () => {
    const inv = buildValidInvoice();
    for (const id of ["BR-DE-3", "BR-DE-4", "BR-DE-8", "BR-DE-9"]) {
      expect(rule(id).run(inv)).toBeNull();
    }
  });

  it("BR-DE-10/11 are inert when DELIVER TO ADDRESS is absent", () => {
    const inv = buildValidInvoice();
    expect(rule("BR-DE-10").run(inv)).toBeNull();
    expect(rule("BR-DE-11").run(inv)).toBeNull();
  });
  it("BR-DE-10 fails when deliver-to address present but city missing", () => {
    const inv = buildValidInvoice({ delivery: { location: { postCode: "12345", countryCode: "DE" } } });
    expect(rule("BR-DE-10").run(inv)).not.toBeNull();
  });
  it("BR-DE-11 fails when deliver-to address present but post code missing", () => {
    const inv = buildValidInvoice({ delivery: { location: { city: "Köln", countryCode: "DE" } } });
    expect(rule("BR-DE-11").run(inv)).not.toBeNull();
  });
  it("BR-DE-10/11 pass when deliver-to address is complete", () => {
    const inv = buildValidInvoice({ delivery: { location: { city: "Köln", postCode: "50667", countryCode: "DE" } } });
    expect(rule("BR-DE-10").run(inv)).toBeNull();
    expect(rule("BR-DE-11").run(inv)).toBeNull();
  });
});

describe("XRechnung CIUS — document-level mandates", () => {
  it("BR-DE-1 passes when payment instructions present", () => {
    expect(rule("BR-DE-1").run(buildValidInvoice())).toBeNull();
  });
  it("BR-DE-1 fails when payment instructions absent", () => {
    expect(rule("BR-DE-1").run(buildValidInvoice({ paymentInstructions: undefined }))).not.toBeNull();
  });

  it("BR-DE-14 fails when a VAT breakdown line has no rate", () => {
    const inv = buildValidInvoice({ vatBreakdown: [{ taxableAmount: "100.00", taxAmount: "0.00", category: "E" }] });
    expect(rule("BR-DE-14").run(inv)).not.toBeNull();
  });
  it("BR-DE-14 passes when every VAT breakdown line has a rate", () => {
    expect(rule("BR-DE-14").run(buildValidInvoice())).toBeNull();
  });

  it("BR-DE-15 fails when Leitweg-ID (BT-10) is missing", () => {
    expect(rule("BR-DE-15").run(buildValidInvoice({ buyerReference: undefined }))).not.toBeNull();
  });
  it("BR-DE-15 passes when Leitweg-ID present", () => {
    expect(rule("BR-DE-15").run(buildValidInvoice())).toBeNull();
  });

  it("BR-DE-16 fails when S is used but seller has no VAT id / tax reg id / tax rep", () => {
    const inv = buildValidInvoice({ seller: { name: "Acme", vatId: undefined, taxRegId: undefined, address: { city: "B", postCode: "1", countryCode: "DE" }, contact: { name: "x", phone: "030 111", email: "a@b.cd" } } });
    expect(rule("BR-DE-16").run(inv)).not.toBeNull();
  });
  it("BR-DE-16 passes when seller VAT id is present", () => {
    expect(rule("BR-DE-16").run(buildValidInvoice())).toBeNull();
  });
  it("BR-DE-16 passes when only O-category is used (not triggered)", () => {
    const inv = buildValidInvoice({
      seller: { name: "Acme", vatId: undefined, taxRegId: undefined, address: { city: "B", postCode: "1", countryCode: "DE" }, contact: { name: "x", phone: "030 111", email: "a@b.cd" } },
      vatBreakdown: [{ taxableAmount: "100.00", taxAmount: "0.00", category: "O", rate: "0" }],
      invoiceLines: [],
    });
    expect(rule("BR-DE-16").run(inv)).toBeNull();
  });

  it("BR-DE-17 warns on an unsupported invoice type code", () => {
    expect(rule("BR-DE-17").run(buildValidInvoice({ typeCode: "393" }))).not.toBeNull();
  });
  it("BR-DE-17 passes for code 380", () => {
    expect(rule("BR-DE-17").run(buildValidInvoice())).toBeNull();
  });

  it("BR-DE-21 warns on a non-XRechnung specification identifier", () => {
    expect(rule("BR-DE-21").run(buildValidInvoice({ customizationId: "urn:something:else" }))).not.toBeNull();
  });
  it("BR-DE-21 passes for the XRechnung 3.0 URN", () => {
    expect(rule("BR-DE-21").run(buildValidInvoice())).toBeNull();
  });

  it("BR-DE-26 warns when type code 384 but no preceding invoice reference", () => {
    expect(rule("BR-DE-26").run(buildValidInvoice({ typeCode: "384" }))).not.toBeNull();
  });
  it("BR-DE-26 is inert for a normal invoice (type 380)", () => {
    expect(rule("BR-DE-26").run(buildValidInvoice())).toBeNull();
  });
});

describe("XRechnung CIUS — payment-means consistency", () => {
  it("BR-DE-19 warns on an invalid IBAN when BT-81 = 58", () => {
    const inv = buildValidInvoice({ paymentInstructions: { meansCode: "58", iban: "DE00000000000000000000", accountName: "x" } });
    expect(rule("BR-DE-19").run(inv)).not.toBeNull();
  });
  it("BR-DE-19 passes for a valid IBAN (default fixture, BT-81 = 58)", () => {
    expect(rule("BR-DE-19").run(buildValidInvoice())).toBeNull();
  });

  it("BR-DE-23-a fails when BT-81 = 30 but no payee financial account", () => {
    const inv = buildValidInvoice({ paymentInstructions: { meansCode: "30" } });
    expect(rule("BR-DE-23-a").run(inv)).not.toBeNull();
  });
  it("BR-DE-23-a passes with iban present and BT-81 = 58", () => {
    expect(rule("BR-DE-23-a").run(buildValidInvoice())).toBeNull();
  });
  it("BR-DE-23-b fails when BT-81 = 30 and a card number is present", () => {
    const inv = buildValidInvoice({ paymentInstructions: { meansCode: "30", iban: "DE89370400440532013000", cardNumber: "1234" } });
    expect(rule("BR-DE-23-b").run(inv)).not.toBeNull();
  });

  it("BR-DE-24-a fails when BT-81 = 48 but no card account", () => {
    const inv = buildValidInvoice({ paymentInstructions: { meansCode: "48" } });
    expect(rule("BR-DE-24-a").run(inv)).not.toBeNull();
  });
  it("BR-DE-24-a passes when BT-81 = 54 and a card number is present", () => {
    const inv = buildValidInvoice({ paymentInstructions: { meansCode: "54", cardNumber: "************1234" } });
    expect(rule("BR-DE-24-a").run(inv)).toBeNull();
  });
  it("BR-DE-24-b fails when BT-81 = 48 and an iban is present", () => {
    const inv = buildValidInvoice({ paymentInstructions: { meansCode: "48", cardNumber: "1234", iban: "DE89370400440532013000" } });
    expect(rule("BR-DE-24-b").run(inv)).not.toBeNull();
  });

  it("BR-DE-25-b fails when BT-81 = 59 and an iban is present", () => {
    const inv = buildValidInvoice({ paymentInstructions: { meansCode: "59", iban: "DE89370400440532013000" } });
    expect(rule("BR-DE-25-b").run(inv)).not.toBeNull();
  });
  it("BR-DE-25-b passes when BT-81 = 59 and neither iban nor card present", () => {
    const inv = buildValidInvoice({ paymentInstructions: { meansCode: "59" } });
    expect(rule("BR-DE-25-b").run(inv)).toBeNull();
  });
});

describe("XRechnung CIUS — deferred stubs", () => {
  const stubIds = [
    "BR-DE-18", "BR-DE-20", "BR-DE-22", "BR-DE-25-a", "BR-DE-30", "BR-DE-31",
    "BR-DEX-01", "BR-DEX-02", "BR-DEX-03", "BR-DEX-04", "BR-DEX-05", "BR-DEX-06",
    "BR-DEX-07", "BR-DEX-08", "BR-DEX-09", "BR-DEX-10", "BR-DEX-11", "BR-DEX-12",
    "BR-DEX-13", "BR-DEX-14", "BR-DEX-15",
  ];
  it("every deferred stub is present and is a no-op", () => {
    for (const id of stubIds) {
      expect(rule(id).run(buildValidInvoice())).toBeNull();
    }
  });
  it("all 46 XRechnung rule IDs are exposed exactly once", () => {
    const ids = xrechnungDeRules.map((r) => r.id);
    expect(ids.length).toBe(46);
    expect(new Set(ids).size).toBe(46);
  });
});
