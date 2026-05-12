// PASS + FAIL coverage for the BR-DEC-* rules (max 2 fractional digits per
// monetary BT). One representative PASS (a fully valid invoice) plus a FAIL
// per rule that perturbs exactly the BT it guards.

import { describe, expect, it } from "vitest";

import { en16931DecRules } from "../rules/en16931-dec.js";
import { decimalCount } from "../rules/math.js";
import type { AllowanceCharge } from "../types.js";
import { baseLine, baseVat, buildValidInvoice, findRule } from "./_fixtures.js";

const dec = (id: string) => findRule(en16931DecRules, id);

const alw = (o: Partial<AllowanceCharge> = {}): AllowanceCharge => ({
  isCharge: false,
  amount: "5.00",
  baseAmount: "100.00",
  reason: "Rabatt",
  ...o,
});
const chg = (o: Partial<AllowanceCharge> = {}): AllowanceCharge => ({
  isCharge: true,
  amount: "5.00",
  baseAmount: "100.00",
  reason: "Versand",
  ...o,
});

describe("decimalCount helper", () => {
  it("counts fractional digits, comma-tolerant; -1 for empty", () => {
    expect(decimalCount("100.00")).toBe(2);
    expect(decimalCount("100")).toBe(0);
    expect(decimalCount("1.234")).toBe(3);
    expect(decimalCount("1,5")).toBe(1);
    expect(decimalCount("")).toBe(-1);
    expect(decimalCount(undefined)).toBe(-1);
  });
});

describe("BR-DEC-* — every rule passes on a clean invoice", () => {
  it("PASS: all BR-DEC rules null on a valid invoice with allowances/charges", () => {
    const inv = buildValidInvoice({
      documentLevelAllowances: [alw()],
      documentLevelCharges: [chg()],
      totals: {
        lineExtensionAmount: "100.00",
        allowanceTotalAmount: "5.00",
        chargeTotalAmount: "5.00",
        taxExclusiveAmount: "100.00",
        taxAmount: "19.00",
        taxAmountInAccountingCurrency: "19.00",
        taxInclusiveAmount: "119.00",
        prepaidAmount: "0.00",
        roundingAmount: "0.00",
        payableAmount: "119.00",
      },
      invoiceLines: [baseLine({ lineAllowances: [alw()], lineCharges: [chg()] })],
    });
    for (const r of en16931DecRules) expect(r.run(inv), r.id).toBeNull();
  });
});

describe("BR-DEC-* — FAIL paths", () => {
  it("FAIL BR-DEC-01: BT-92 with 3 decimals", () => {
    expect(dec("BR-DEC-01").run(buildValidInvoice({ documentLevelAllowances: [alw({ amount: "5.001" })] }))).not.toBeNull();
  });
  it("FAIL BR-DEC-02: BT-93 with 3 decimals", () => {
    expect(dec("BR-DEC-02").run(buildValidInvoice({ documentLevelAllowances: [alw({ baseAmount: "100.123" })] }))).not.toBeNull();
  });
  it("FAIL BR-DEC-05: BT-99 with 3 decimals", () => {
    expect(dec("BR-DEC-05").run(buildValidInvoice({ documentLevelCharges: [chg({ amount: "5.001" })] }))).not.toBeNull();
  });
  it("FAIL BR-DEC-06: BT-100 with 3 decimals", () => {
    expect(dec("BR-DEC-06").run(buildValidInvoice({ documentLevelCharges: [chg({ baseAmount: "100.123" })] }))).not.toBeNull();
  });
  it("FAIL BR-DEC-09: BT-106", () => {
    expect(dec("BR-DEC-09").run(buildValidInvoice({ totals: { lineExtensionAmount: "100.001" } }))).not.toBeNull();
  });
  it("FAIL BR-DEC-10: BT-107", () => {
    expect(dec("BR-DEC-10").run(buildValidInvoice({ totals: { allowanceTotalAmount: "1.001" } }))).not.toBeNull();
  });
  it("FAIL BR-DEC-11: BT-108", () => {
    expect(dec("BR-DEC-11").run(buildValidInvoice({ totals: { chargeTotalAmount: "1.001" } }))).not.toBeNull();
  });
  it("FAIL BR-DEC-12: BT-109", () => {
    expect(dec("BR-DEC-12").run(buildValidInvoice({ totals: { taxExclusiveAmount: "100.001" } }))).not.toBeNull();
  });
  it("FAIL BR-DEC-13: BT-110", () => {
    expect(dec("BR-DEC-13").run(buildValidInvoice({ totals: { taxAmount: "19.001" } }))).not.toBeNull();
  });
  it("FAIL BR-DEC-14: BT-112", () => {
    expect(dec("BR-DEC-14").run(buildValidInvoice({ totals: { taxInclusiveAmount: "119.001" } }))).not.toBeNull();
  });
  it("FAIL BR-DEC-15: BT-111", () => {
    expect(dec("BR-DEC-15").run(buildValidInvoice({ totals: { taxAmountInAccountingCurrency: "19.001" } }))).not.toBeNull();
  });
  it("FAIL BR-DEC-16: BT-113", () => {
    expect(dec("BR-DEC-16").run(buildValidInvoice({ totals: { prepaidAmount: "1.001" } }))).not.toBeNull();
  });
  it("FAIL BR-DEC-17: BT-114", () => {
    expect(dec("BR-DEC-17").run(buildValidInvoice({ totals: { roundingAmount: "0.001" } }))).not.toBeNull();
  });
  it("FAIL BR-DEC-18: BT-115", () => {
    expect(dec("BR-DEC-18").run(buildValidInvoice({ totals: { payableAmount: "119.001" } }))).not.toBeNull();
  });
  it("FAIL BR-DEC-19: BT-116", () => {
    expect(dec("BR-DEC-19").run(buildValidInvoice({ vatBreakdown: [baseVat({ taxableAmount: "100.001" })] }))).not.toBeNull();
  });
  it("FAIL BR-DEC-20: BT-117", () => {
    expect(dec("BR-DEC-20").run(buildValidInvoice({ vatBreakdown: [baseVat({ taxAmount: "19.001" })] }))).not.toBeNull();
  });
  it("FAIL BR-DEC-23: BT-131", () => {
    expect(dec("BR-DEC-23").run(buildValidInvoice({ invoiceLines: [baseLine({ netAmount: "100.001" })] }))).not.toBeNull();
  });
  it("FAIL BR-DEC-24: BT-136", () => {
    expect(dec("BR-DEC-24").run(buildValidInvoice({ invoiceLines: [baseLine({ lineAllowances: [alw({ amount: "5.001" })] })] }))).not.toBeNull();
  });
  it("FAIL BR-DEC-25: BT-137", () => {
    expect(dec("BR-DEC-25").run(buildValidInvoice({ invoiceLines: [baseLine({ lineAllowances: [alw({ baseAmount: "100.123" })] })] }))).not.toBeNull();
  });
  it("FAIL BR-DEC-27: BT-141", () => {
    expect(dec("BR-DEC-27").run(buildValidInvoice({ invoiceLines: [baseLine({ lineCharges: [chg({ amount: "5.001" })] })] }))).not.toBeNull();
  });
  it("FAIL BR-DEC-28: BT-142", () => {
    expect(dec("BR-DEC-28").run(buildValidInvoice({ invoiceLines: [baseLine({ lineCharges: [chg({ baseAmount: "100.123" })] })] }))).not.toBeNull();
  });
});
