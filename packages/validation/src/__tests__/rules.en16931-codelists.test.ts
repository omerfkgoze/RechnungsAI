import { describe, expect, it } from "vitest";

import { en16931CodelistsRules } from "../rules/en16931-codelists.js";
import { baseLine, baseVat, buildValidInvoice, findRule } from "./_fixtures.js";

describe("BR-CL-* codelist rules", () => {
  it("BR-CL-03 passes for EUR", () => {
    expect(findRule(en16931CodelistsRules, "BR-CL-03").run(buildValidInvoice())).toBeNull();
  });
  it("BR-CL-03 fails for unknown currency", () => {
    expect(
      findRule(en16931CodelistsRules, "BR-CL-03").run(
        buildValidInvoice({ currencyCode: "XYZ" }),
      ),
    ).not.toBeNull();
  });

  it("BR-CL-04 passes when accounting currency absent or valid", () => {
    expect(findRule(en16931CodelistsRules, "BR-CL-04").run(buildValidInvoice())).toBeNull();
  });
  it("BR-CL-04 fails for unknown accounting currency", () => {
    const inv = buildValidInvoice();
    inv.accountingCurrencyCode = "ZZZZ";
    expect(findRule(en16931CodelistsRules, "BR-CL-04").run(inv)).not.toBeNull();
  });

  it("BR-CL-14 passes for ISO seller country", () => {
    expect(findRule(en16931CodelistsRules, "BR-CL-14").run(buildValidInvoice())).toBeNull();
  });
  it("BR-CL-14 fails for non-ISO seller country", () => {
    expect(
      findRule(en16931CodelistsRules, "BR-CL-14").run(
        buildValidInvoice({ seller: { address: { countryCode: "ZZ" } } }),
      ),
    ).not.toBeNull();
  });

  it("BR-CL-15 passes for ISO buyer country", () => {
    expect(findRule(en16931CodelistsRules, "BR-CL-15").run(buildValidInvoice())).toBeNull();
  });
  it("BR-CL-15 fails for non-ISO buyer country", () => {
    expect(
      findRule(en16931CodelistsRules, "BR-CL-15").run(
        buildValidInvoice({ buyer: { address: { countryCode: "ZZ" } } }),
      ),
    ).not.toBeNull();
  });

  it("BR-CL-17 passes for invoice type 380", () => {
    expect(findRule(en16931CodelistsRules, "BR-CL-17").run(buildValidInvoice())).toBeNull();
  });
  it("BR-CL-17 fails for invoice type 9999", () => {
    expect(
      findRule(en16931CodelistsRules, "BR-CL-17").run(
        buildValidInvoice({ typeCode: "9999" }),
      ),
    ).not.toBeNull();
  });

  it("BR-CL-23 passes for PCE unit", () => {
    expect(findRule(en16931CodelistsRules, "BR-CL-23").run(buildValidInvoice())).toBeNull();
  });
  it("BR-CL-23 fails for invented unit", () => {
    const inv = buildValidInvoice({
      invoiceLines: [baseLine({ quantityUnitCode: "FOO" })],
    });
    expect(findRule(en16931CodelistsRules, "BR-CL-23").run(inv)).not.toBeNull();
  });

  it("BR-CL-24 passes for valid VAT category 'S'", () => {
    expect(findRule(en16931CodelistsRules, "BR-CL-24").run(buildValidInvoice())).toBeNull();
  });
  it("BR-CL-24 fails for invented VAT category", () => {
    const inv = buildValidInvoice({
      vatBreakdown: [baseVat({ category: "Q" })],
    });
    expect(findRule(en16931CodelistsRules, "BR-CL-24").run(inv)).not.toBeNull();
  });

  it("BR-CL-25 fails for invalid line VAT category", () => {
    const inv = buildValidInvoice({
      invoiceLines: [baseLine({ vatCategory: "Q" })],
    });
    expect(findRule(en16931CodelistsRules, "BR-CL-25").run(inv)).not.toBeNull();
  });
  it("BR-CL-25 passes for valid line VAT category 'Z'", () => {
    const inv = buildValidInvoice({
      invoiceLines: [baseLine({ vatCategory: "Z" })],
    });
    expect(findRule(en16931CodelistsRules, "BR-CL-25").run(inv)).toBeNull();
  });

  it("BR-CL-16 passes for known payment means code 30 (credit transfer)", () => {
    const inv = buildValidInvoice({
      paymentInstructions: { meansCode: "30", iban: "DE00100100100100100100" },
    });
    expect(findRule(en16931CodelistsRules, "BR-CL-16").run(inv)).toBeNull();
  });
  it("BR-CL-16 fails for unknown payment means code", () => {
    const inv = buildValidInvoice({
      paymentInstructions: { meansCode: "ZZ-INVALID" },
    });
    expect(findRule(en16931CodelistsRules, "BR-CL-16").run(inv)).not.toBeNull();
  });
});
