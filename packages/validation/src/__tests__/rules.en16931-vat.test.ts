import { describe, expect, it } from "vitest";

import { en16931VatRules } from "../rules/en16931-vat.js";
import { baseLine, baseVat, buildValidInvoice, findRule } from "./_fixtures.js";

describe("EN 16931 VAT-category rules", () => {
  it("BR-S-01 passes when standard-rated lines have a matching S breakdown", () => {
    expect(findRule(en16931VatRules, "BR-S-01").run(buildValidInvoice())).toBeNull();
  });
  it("BR-S-01 fails when a line uses S but no S breakdown exists", () => {
    const inv = buildValidInvoice({
      invoiceLines: [baseLine({ vatCategory: "S", vatRate: "19" })],
      vatBreakdown: [baseVat({ category: "E", rate: undefined, taxAmount: "0" })],
    });
    expect(findRule(en16931VatRules, "BR-S-01").run(inv)).not.toBeNull();
  });

  it("BR-Z-09 fails when category Z has non-zero rate", () => {
    const inv = buildValidInvoice({
      vatBreakdown: [baseVat({ category: "Z", rate: "5", taxAmount: "0" })],
    });
    expect(findRule(en16931VatRules, "BR-Z-09").run(inv)).not.toBeNull();
  });
  it("BR-Z-09 passes when category Z has zero rate", () => {
    const inv = buildValidInvoice({
      vatBreakdown: [baseVat({ category: "Z", rate: "0", taxAmount: "0" })],
    });
    expect(findRule(en16931VatRules, "BR-Z-09").run(inv)).toBeNull();
  });

  it("BR-E-10 fails when category E has no exemption reason", () => {
    const inv = buildValidInvoice({
      vatBreakdown: [baseVat({ category: "E", rate: undefined, taxAmount: "0" })],
    });
    expect(findRule(en16931VatRules, "BR-E-10").run(inv)).not.toBeNull();
  });
  it("BR-E-10 passes when category E has exemption reason text", () => {
    const inv = buildValidInvoice({
      vatBreakdown: [
        baseVat({ category: "E", rate: undefined, taxAmount: "0", exemptionReason: "Steuerfrei nach §4 UStG" }),
      ],
    });
    expect(findRule(en16931VatRules, "BR-E-10").run(inv)).toBeNull();
  });

  it("BR-AE-09 fails when category AE has non-zero tax amount", () => {
    const inv = buildValidInvoice({
      vatBreakdown: [baseVat({ category: "AE", rate: undefined, taxAmount: "10.00" })],
    });
    expect(findRule(en16931VatRules, "BR-AE-09").run(inv)).not.toBeNull();
  });
  it("BR-AE-09 passes when category AE has zero tax amount", () => {
    const inv = buildValidInvoice({
      vatBreakdown: [
        baseVat({ category: "AE", rate: undefined, taxAmount: "0", exemptionReason: "Reverse charge" }),
      ],
    });
    expect(findRule(en16931VatRules, "BR-AE-09").run(inv)).toBeNull();
  });
});
