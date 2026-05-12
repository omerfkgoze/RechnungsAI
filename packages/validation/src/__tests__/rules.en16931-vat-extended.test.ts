// PASS + FAIL coverage for the per-category VAT rule matrix added in Session 3
// (BR-S/Z/E/AE/G/IC/O-* generic families + BR-IC-11/12, BR-O-11..14) and the
// BR-CO-03 / BR-CO-05..08 rules in en16931-calculations.ts.
//
// Strategy: for each family, build a valid invoice that *uses* that category and
// assert every rule of the family passes; then a targeted FAIL per rule shape.

import { describe, expect, it } from "vitest";

import { en16931CalculationsRules } from "../rules/en16931-calculations.js";
import { en16931VatRules } from "../rules/en16931-vat.js";
import type { AllowanceCharge, Invoice, InvoiceLine, VatBreakdownLine } from "../types.js";
import { buildValidInvoice, findRule } from "./_fixtures.js";

const vat = (id: string) => findRule(en16931VatRules, id);
const calc = (id: string) => findRule(en16931CalculationsRules, id);

// Build a valid single-line invoice that uses VAT category `code`.
function invFor(code: string, rate: string, opts: { exemption?: boolean } = {}): Invoice {
  const line: InvoiceLine = {
    id: "1", quantity: "1", quantityUnitCode: "PCE", netAmount: "100.00", netPrice: "100.00",
    lineAllowances: [], lineCharges: [], itemName: "Item", vatCategory: code,
    vatRate: code === "O" ? undefined : rate,
  };
  const bd: VatBreakdownLine = {
    taxableAmount: "100.00",
    taxAmount: code === "S" ? "19.00" : "0.00",
    category: code,
    rate: code === "O" ? undefined : rate,
    exemptionReasonCode: opts.exemption ? "vatex-eu-ae" : undefined,
    exemptionReason: opts.exemption ? "Reverse charge" : undefined,
  };
  return buildValidInvoice({
    invoiceLines: [line],
    vatBreakdown: [bd],
    totals: { lineExtensionAmount: "100.00", taxExclusiveAmount: "100.00", taxAmount: bd.taxAmount, taxInclusiveAmount: code === "S" ? "119.00" : "100.00", payableAmount: code === "S" ? "119.00" : "100.00" },
    seller: { vatId: "DE123456789", legalRegId: "HRB 1" },
    buyer: { vatId: "DE987654321", legalRegId: "HRB 2" },
    // delivery info so BR-IC-11/12 pass when code === 'IC'
    ...(code === "IC" ? {} : {}),
  });
}

// For IC we additionally need delivery date + deliver-to country code.
function invForIC(): Invoice {
  const i = invFor("IC", "0", { exemption: true });
  i.delivery = { actualDate: "2026-05-01", location: { countryCode: "FR" } };
  return i;
}

// O needs NO VAT identifiers anywhere.
function invForO(): Invoice {
  const i = invFor("O", "0", { exemption: true });
  i.seller = { name: "Acme", address: { line1: "x", city: "B", postCode: "1", countryCode: "DE" } };
  i.buyer = { name: "Beta", address: { line1: "y", city: "M", postCode: "2", countryCode: "DE" } };
  i.taxRepresentative = undefined;
  return i;
}

const allow = (o: Partial<AllowanceCharge> = {}): AllowanceCharge => ({ isCharge: false, amount: "10.00", reason: "Rabatt", ...o });
const chg = (o: Partial<AllowanceCharge> = {}): AllowanceCharge => ({ isCharge: true, amount: "10.00", reason: "Versand", ...o });

const FAMILY_RATES: Record<string, string> = { S: "19", Z: "0", E: "0", AE: "0", G: "0", IC: "0", O: "0" };
const FAMILY_IDS: Record<string, string[]> = {
  S: ["BR-S-02", "BR-S-03", "BR-S-04", "BR-S-05", "BR-S-06", "BR-S-07", "BR-S-09", "BR-S-10"],
  Z: ["BR-Z-02", "BR-Z-03", "BR-Z-04", "BR-Z-05", "BR-Z-06", "BR-Z-07", "BR-Z-08", "BR-Z-10"],
  E: ["BR-E-02", "BR-E-03", "BR-E-04", "BR-E-05", "BR-E-06", "BR-E-07", "BR-E-08", "BR-E-09"],
  AE: ["BR-AE-02", "BR-AE-03", "BR-AE-04", "BR-AE-05", "BR-AE-06", "BR-AE-07", "BR-AE-08"],
  G: ["BR-G-01", "BR-G-02", "BR-G-03", "BR-G-04", "BR-G-05", "BR-G-06", "BR-G-07", "BR-G-08", "BR-G-09", "BR-G-10"],
  IC: ["BR-IC-02", "BR-IC-03", "BR-IC-04", "BR-IC-05", "BR-IC-06", "BR-IC-07", "BR-IC-08", "BR-IC-09", "BR-IC-10", "BR-IC-11", "BR-IC-12"],
  O: ["BR-O-01", "BR-O-02", "BR-O-03", "BR-O-04", "BR-O-05", "BR-O-06", "BR-O-07", "BR-O-08", "BR-O-09", "BR-O-10", "BR-O-11", "BR-O-12", "BR-O-13", "BR-O-14"],
};

describe("VAT category families — PASS on a clean invoice using that category", () => {
  for (const code of Object.keys(FAMILY_IDS)) {
    it(`PASS: all '${code}' family rules null`, () => {
      const inv = code === "IC" ? invForIC() : code === "O" ? invForO() : invFor(code, FAMILY_RATES[code], { exemption: code !== "S" && code !== "Z" });
      for (const id of FAMILY_IDS[code]) expect(vat(id).run(inv), id).toBeNull();
    });
  }
  it("PASS: a default valid invoice triggers no S/Z/E/AE/G/IC/O violations", () => {
    const inv = buildValidInvoice();
    for (const r of en16931VatRules) expect(r.run(inv), r.id).toBeNull();
  });
});

describe("VAT category families — FAIL paths (representative per rule shape)", () => {
  it("FAIL BR-S-05: standard-rated line with VAT rate 0", () => {
    const inv = invFor("S", "19");
    inv.invoiceLines[0].vatRate = "0";
    expect(vat("BR-S-05").run(inv)).not.toBeNull();
  });
  it("FAIL BR-S-06: standard-rated doc allowance with rate 0", () => {
    const inv = invFor("S", "19");
    inv.documentLevelAllowances = [allow({ vatCategory: "S", vatRate: "0" })];
    expect(vat("BR-S-06").run(inv)).not.toBeNull();
  });
  it("FAIL BR-S-07: standard-rated doc charge with rate 0", () => {
    const inv = invFor("S", "19");
    inv.documentLevelCharges = [chg({ vatCategory: "S", vatRate: "0" })];
    expect(vat("BR-S-07").run(inv)).not.toBeNull();
  });
  it("FAIL BR-S-09: BT-117 ≠ BT-116 × BT-119 / 100", () => {
    const inv = invFor("S", "19");
    inv.vatBreakdown[0].taxAmount = "5.00";
    expect(vat("BR-S-09").run(inv)).not.toBeNull();
  });
  it("FAIL BR-S-10: standard-rated breakdown carrying an exemption reason", () => {
    const inv = invFor("S", "19");
    inv.vatBreakdown[0].exemptionReason = "Nope";
    expect(vat("BR-S-10").run(inv)).not.toBeNull();
  });
  it("FAIL BR-S-02/03/04: standard-rated usage without any seller identifier", () => {
    const base = invFor("S", "19");
    base.seller = { name: "Acme", address: { line1: "x", city: "B", postCode: "1", countryCode: "DE" } };
    base.taxRepresentative = undefined;
    expect(vat("BR-S-02").run(base)).not.toBeNull();
    const a = invFor("S", "19"); a.seller = { name: "Acme" }; a.taxRepresentative = undefined; a.documentLevelAllowances = [allow({ vatCategory: "S", vatRate: "19" })];
    expect(vat("BR-S-03").run(a)).not.toBeNull();
    const c = invFor("S", "19"); c.seller = { name: "Acme" }; c.taxRepresentative = undefined; c.documentLevelCharges = [chg({ vatCategory: "S", vatRate: "19" })];
    expect(vat("BR-S-04").run(c)).not.toBeNull();
  });

  it("FAIL BR-Z-05: zero-rated line with non-zero rate", () => {
    const inv = invFor("Z", "0"); inv.invoiceLines[0].vatRate = "7";
    expect(vat("BR-Z-05").run(inv)).not.toBeNull();
  });
  it("FAIL BR-Z-08: zero-rated taxable amount mismatch", () => {
    const inv = invFor("Z", "0"); inv.vatBreakdown[0].taxableAmount = "50.00";
    expect(vat("BR-Z-08").run(inv)).not.toBeNull();
  });
  it("FAIL BR-Z-10: zero-rated breakdown with exemption reason", () => {
    const inv = invFor("Z", "0"); inv.vatBreakdown[0].exemptionReasonCode = "X";
    expect(vat("BR-Z-10").run(inv)).not.toBeNull();
  });

  it("FAIL BR-E-08: exempt taxable amount mismatch", () => {
    const inv = invFor("E", "0", { exemption: true }); inv.vatBreakdown[0].taxableAmount = "80.00";
    expect(vat("BR-E-08").run(inv)).not.toBeNull();
  });
  it("FAIL BR-E-09: exempt VAT amount non-zero", () => {
    const inv = invFor("E", "0", { exemption: true }); inv.vatBreakdown[0].taxAmount = "1.00";
    expect(vat("BR-E-09").run(inv)).not.toBeNull();
  });

  it("FAIL BR-AE-05: reverse-charge line with non-zero rate", () => {
    const inv = invFor("AE", "0", { exemption: true }); inv.invoiceLines[0].vatRate = "19";
    expect(vat("BR-AE-05").run(inv)).not.toBeNull();
  });
  it("FAIL BR-AE-08: reverse-charge taxable amount mismatch", () => {
    const inv = invFor("AE", "0", { exemption: true }); inv.vatBreakdown[0].taxableAmount = "10.00";
    expect(vat("BR-AE-08").run(inv)).not.toBeNull();
  });
  it("FAIL BR-AE-02: reverse-charge line without buyer identifier", () => {
    const inv = invFor("AE", "0", { exemption: true }); inv.buyer = { name: "Beta" };
    expect(vat("BR-AE-02").run(inv)).not.toBeNull();
  });

  it("FAIL BR-G-01: 'G' used but no matching breakdown", () => {
    const inv = invFor("G", "0", { exemption: true }); inv.vatBreakdown = [{ taxableAmount: "100.00", taxAmount: "0.00", category: "S", rate: "19" }];
    expect(vat("BR-G-01").run(inv)).not.toBeNull();
  });
  it("FAIL BR-G-02: 'G' line without seller VAT/rep id", () => {
    const inv = invFor("G", "0", { exemption: true }); inv.seller = { name: "Acme" }; inv.taxRepresentative = undefined;
    expect(vat("BR-G-02").run(inv)).not.toBeNull();
  });
  it("FAIL BR-G-09: 'G' VAT amount non-zero", () => {
    const inv = invFor("G", "0", { exemption: true }); inv.vatBreakdown[0].taxAmount = "2.00";
    expect(vat("BR-G-09").run(inv)).not.toBeNull();
  });
  it("FAIL BR-G-10: 'G' breakdown without exemption reason", () => {
    const inv = invFor("G", "0"); // no exemption
    expect(vat("BR-G-10").run(inv)).not.toBeNull();
  });

  it("FAIL BR-IC-02: 'IC' line without buyer VAT id", () => {
    const inv = invForIC(); inv.buyer = { name: "Beta", legalRegId: "HRB 2" };
    expect(vat("BR-IC-02").run(inv)).not.toBeNull();
  });
  it("FAIL BR-IC-11: 'IC' breakdown but no delivery date / invoicing period", () => {
    const inv = invForIC(); inv.delivery = { location: { countryCode: "FR" } }; inv.invoicePeriodStart = undefined; inv.invoicePeriodEnd = undefined;
    expect(vat("BR-IC-11").run(inv)).not.toBeNull();
  });
  it("FAIL BR-IC-12: 'IC' breakdown but no deliver-to country code", () => {
    const inv = invForIC(); inv.delivery = { actualDate: "2026-05-01" };
    expect(vat("BR-IC-12").run(inv)).not.toBeNull();
  });

  it("FAIL BR-O-02: 'O' line but a VAT identifier is present", () => {
    const inv = invForO(); inv.seller = { name: "Acme", vatId: "DE1" };
    expect(vat("BR-O-02").run(inv)).not.toBeNull();
  });
  it("FAIL BR-O-05: 'O' line with a VAT rate", () => {
    const inv = invForO(); inv.invoiceLines[0].vatRate = "0";
    expect(vat("BR-O-05").run(inv)).not.toBeNull();
  });
  it("FAIL BR-O-09: 'O' VAT amount non-zero", () => {
    const inv = invForO(); inv.vatBreakdown[0].taxAmount = "1.00";
    expect(vat("BR-O-09").run(inv)).not.toBeNull();
  });
  it("FAIL BR-O-10: 'O' breakdown without exemption reason", () => {
    const inv = invForO(); inv.vatBreakdown[0].exemptionReason = undefined; inv.vatBreakdown[0].exemptionReasonCode = undefined;
    expect(vat("BR-O-10").run(inv)).not.toBeNull();
  });
  it("FAIL BR-O-11: 'O' breakdown alongside another breakdown group", () => {
    const inv = invForO(); inv.vatBreakdown.push({ taxableAmount: "0.00", taxAmount: "0.00", category: "S", rate: "19" });
    expect(vat("BR-O-11").run(inv)).not.toBeNull();
  });
  it("FAIL BR-O-12: 'O' breakdown with a non-'O' line", () => {
    const inv = invForO(); inv.invoiceLines.push({ ...inv.invoiceLines[0], id: "2", vatCategory: "S", vatRate: "19" });
    expect(vat("BR-O-12").run(inv)).not.toBeNull();
  });
  it("FAIL BR-O-13: 'O' breakdown with a non-'O' doc allowance", () => {
    const inv = invForO(); inv.documentLevelAllowances = [allow({ vatCategory: "S", vatRate: "19" })];
    expect(vat("BR-O-13").run(inv)).not.toBeNull();
  });
  it("FAIL BR-O-14: 'O' breakdown with a non-'O' doc charge", () => {
    const inv = invForO(); inv.documentLevelCharges = [chg({ vatCategory: "S", vatRate: "19" })];
    expect(vat("BR-O-14").run(inv)).not.toBeNull();
  });
});

describe("BR-CO-03 / BR-CO-05..08", () => {
  it("PASS BR-CO-03: BT-7 and BT-8 not both present", () => {
    expect(calc("BR-CO-03").run(buildValidInvoice())).toBeNull();
    const i = buildValidInvoice(); i.vatPointDate = "2026-05-01";
    expect(calc("BR-CO-03").run(i)).toBeNull();
  });
  it("FAIL BR-CO-03: BT-7 and BT-8 both present", () => {
    const i = buildValidInvoice(); i.vatPointDate = "2026-05-01"; i.vatPointDateCode = "5";
    expect(calc("BR-CO-03").run(i)).not.toBeNull();
  });
  it("BR-CO-05..08: always-pass (canonical binding is true())", () => {
    const i = buildValidInvoice();
    for (const id of ["BR-CO-05", "BR-CO-06", "BR-CO-07", "BR-CO-08"]) expect(calc(id).run(i)).toBeNull();
  });
});
