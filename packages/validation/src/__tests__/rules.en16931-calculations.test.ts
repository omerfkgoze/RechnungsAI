import { describe, expect, it } from "vitest";

import { en16931CalculationsRules } from "../rules/en16931-calculations.js";
import { baseLine, baseVat, buildValidInvoice, findRule } from "./_fixtures.js";

describe("BR-CO-* calculation rules", () => {
  it("BR-CO-04 passes when each line has a VAT category", () => {
    const rule = findRule(en16931CalculationsRules, "BR-CO-04");
    expect(rule.run(buildValidInvoice())).toBeNull();
  });
  it("BR-CO-04 fails when a line is missing its VAT category", () => {
    const rule = findRule(en16931CalculationsRules, "BR-CO-04");
    const inv = buildValidInvoice({
      invoiceLines: [baseLine({ vatCategory: "" })],
    });
    expect(rule.run(inv)).not.toBeNull();
  });

  it("BR-CO-09 passes when seller has VAT ID", () => {
    const rule = findRule(en16931CalculationsRules, "BR-CO-09");
    expect(rule.run(buildValidInvoice())).toBeNull();
  });
  it("BR-CO-09 fails when category S/Z/AE/etc requires VAT ID and none is provided", () => {
    const rule = findRule(en16931CalculationsRules, "BR-CO-09");
    const inv = buildValidInvoice({
      seller: { name: "Acme", vatId: undefined, taxRegId: undefined, address: { countryCode: "DE" } },
    });
    expect(rule.run(inv)).not.toBeNull();
  });

  it("BR-CO-10 passes when line sum equals BT-106", () => {
    const rule = findRule(en16931CalculationsRules, "BR-CO-10");
    const inv = buildValidInvoice({
      totals: { lineExtensionAmount: "200.00", taxExclusiveAmount: "200.00", taxInclusiveAmount: "238.00", taxAmount: "38.00", payableAmount: "238.00" },
      invoiceLines: [
        baseLine({ id: "1", netAmount: "100.00" }),
        baseLine({ id: "2", netAmount: "100.00" }),
      ],
      vatBreakdown: [baseVat({ taxableAmount: "200.00", taxAmount: "38.00" })],
    });
    expect(rule.run(inv)).toBeNull();
  });
  it("BR-CO-10 fails on a 0.05 mismatch", () => {
    const rule = findRule(en16931CalculationsRules, "BR-CO-10");
    const inv = buildValidInvoice({
      totals: { lineExtensionAmount: "200.05", taxExclusiveAmount: "200.05", taxInclusiveAmount: "238.05", taxAmount: "38.00", payableAmount: "238.05" },
      invoiceLines: [
        baseLine({ id: "1", netAmount: "100.00" }),
        baseLine({ id: "2", netAmount: "100.00" }),
      ],
    });
    expect(rule.run(inv)).not.toBeNull();
  });

  it("BR-CO-13 passes when BT-109 = BT-106 − BT-107 + BT-108", () => {
    const rule = findRule(en16931CalculationsRules, "BR-CO-13");
    const inv = buildValidInvoice({
      totals: {
        lineExtensionAmount: "100.00",
        allowanceTotalAmount: "10.00",
        chargeTotalAmount: "5.00",
        taxExclusiveAmount: "95.00",
        taxInclusiveAmount: "113.05",
        taxAmount: "18.05",
        payableAmount: "113.05",
      },
    });
    expect(rule.run(inv)).toBeNull();
  });
  it("BR-CO-13 fails on totals mismatch", () => {
    const rule = findRule(en16931CalculationsRules, "BR-CO-13");
    const inv = buildValidInvoice({
      totals: {
        lineExtensionAmount: "100.00",
        allowanceTotalAmount: "10.00",
        chargeTotalAmount: "5.00",
        taxExclusiveAmount: "94.00", // 95 expected
        taxInclusiveAmount: "112.06",
        taxAmount: "18.06",
        payableAmount: "112.06",
      },
    });
    expect(rule.run(inv)).not.toBeNull();
  });

  it("BR-CO-15 passes when BT-112 = BT-109 + BT-110", () => {
    const rule = findRule(en16931CalculationsRules, "BR-CO-15");
    expect(rule.run(buildValidInvoice())).toBeNull();
  });
  it("BR-CO-15 fails on gross mismatch", () => {
    const rule = findRule(en16931CalculationsRules, "BR-CO-15");
    const inv = buildValidInvoice({
      totals: { lineExtensionAmount: "100.00", taxExclusiveAmount: "100.00", taxInclusiveAmount: "120.00", taxAmount: "19.00", payableAmount: "120.00" },
    });
    expect(rule.run(inv)).not.toBeNull();
  });

  it("BR-CO-16 passes when BT-115 = BT-112 − BT-113 + BT-114", () => {
    const rule = findRule(en16931CalculationsRules, "BR-CO-16");
    expect(rule.run(buildValidInvoice())).toBeNull();
  });
  it("BR-CO-16 fails when payable doesn't match", () => {
    const rule = findRule(en16931CalculationsRules, "BR-CO-16");
    const inv = buildValidInvoice({
      totals: { taxInclusiveAmount: "119.00", payableAmount: "120.00", lineExtensionAmount: "100.00", taxExclusiveAmount: "100.00", taxAmount: "19.00" },
    });
    expect(rule.run(inv)).not.toBeNull();
  });

  it("BR-CO-17 passes when BT-117 ≈ BT-116 × BT-119 / 100", () => {
    const rule = findRule(en16931CalculationsRules, "BR-CO-17");
    expect(rule.run(buildValidInvoice())).toBeNull();
  });
  it("BR-CO-17 fails when VAT amount doesn't match base × rate", () => {
    const rule = findRule(en16931CalculationsRules, "BR-CO-17");
    const inv = buildValidInvoice({
      vatBreakdown: [baseVat({ taxableAmount: "100.00", rate: "19", taxAmount: "20.00" })],
    });
    expect(rule.run(inv)).not.toBeNull();
  });

  it("BR-CO-18 passes when at least one VAT breakdown is present", () => {
    const rule = findRule(en16931CalculationsRules, "BR-CO-18");
    expect(rule.run(buildValidInvoice())).toBeNull();
  });
  it("BR-CO-18 fails when no VAT breakdown is present", () => {
    const rule = findRule(en16931CalculationsRules, "BR-CO-18");
    const inv = buildValidInvoice({ vatBreakdown: [] });
    expect(rule.run(inv)).not.toBeNull();
  });

  it("BR-CO-25 passes when payable is positive AND due date is present", () => {
    const rule = findRule(en16931CalculationsRules, "BR-CO-25");
    expect(rule.run(buildValidInvoice())).toBeNull();
  });
  it("BR-CO-25 fails when payable is positive but neither due date nor terms present", () => {
    const rule = findRule(en16931CalculationsRules, "BR-CO-25");
    const inv = buildValidInvoice({ dueDate: undefined, paymentTerms: undefined });
    expect(rule.run(inv)).not.toBeNull();
  });

  it("BR-CO-21 fails when document allowance has no reason or reason code", () => {
    const rule = findRule(en16931CalculationsRules, "BR-CO-21");
    const inv = buildValidInvoice({
      documentLevelAllowances: [{ isCharge: false, amount: "5.00" }],
    });
    expect(rule.run(inv)).not.toBeNull();
  });
  it("BR-CO-21 passes when document allowance carries a reason", () => {
    const rule = findRule(en16931CalculationsRules, "BR-CO-21");
    const inv = buildValidInvoice({
      documentLevelAllowances: [{ isCharge: false, amount: "5.00", reason: "Promo" }],
    });
    expect(rule.run(inv)).toBeNull();
  });

  it("BR-CO-22 fails when document charge has no reason", () => {
    const rule = findRule(en16931CalculationsRules, "BR-CO-22");
    const inv = buildValidInvoice({
      documentLevelCharges: [{ isCharge: true, amount: "5.00" }],
    });
    expect(rule.run(inv)).not.toBeNull();
  });
  it("BR-CO-22 passes when document charge carries a reason code", () => {
    const rule = findRule(en16931CalculationsRules, "BR-CO-22");
    const inv = buildValidInvoice({
      documentLevelCharges: [{ isCharge: true, amount: "5.00", reasonCode: "ABK" }],
    });
    expect(rule.run(inv)).toBeNull();
  });

  it("BR-CO-11 passes when allowance total equals sum of allowances", () => {
    const rule = findRule(en16931CalculationsRules, "BR-CO-11");
    const inv = buildValidInvoice({
      totals: { allowanceTotalAmount: "15.00", lineExtensionAmount: "100.00", taxExclusiveAmount: "85.00", taxInclusiveAmount: "101.15", taxAmount: "16.15", payableAmount: "101.15" },
      documentLevelAllowances: [
        { isCharge: false, amount: "10.00", reason: "A" },
        { isCharge: false, amount: "5.00", reason: "B" },
      ],
    });
    expect(rule.run(inv)).toBeNull();
  });
  it("BR-CO-11 fails on allowance total mismatch", () => {
    const rule = findRule(en16931CalculationsRules, "BR-CO-11");
    const inv = buildValidInvoice({
      totals: { allowanceTotalAmount: "10.00", lineExtensionAmount: "100.00", taxExclusiveAmount: "90.00", taxInclusiveAmount: "107.10", taxAmount: "17.10", payableAmount: "107.10" },
      documentLevelAllowances: [
        { isCharge: false, amount: "5.00", reason: "A" },
        { isCharge: false, amount: "5.00", reason: "B" },
      ],
    });
    // Declared 10.00, computed 10.00 — actually passes. Reframe:
    const inv2 = buildValidInvoice({
      totals: { allowanceTotalAmount: "10.00", lineExtensionAmount: "100.00", taxExclusiveAmount: "90.00", taxInclusiveAmount: "107.10", taxAmount: "17.10", payableAmount: "107.10" },
      documentLevelAllowances: [{ isCharge: false, amount: "12.00", reason: "A" }],
    });
    expect(rule.run(inv2)).not.toBeNull();
    expect(rule.run(inv)).toBeNull();
  });
});
