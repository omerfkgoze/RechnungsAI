// PASS + FAIL coverage for the rules implemented in Session 2 (rule-coverage
// push): BR-18/19/20/56/57 (conditional structural mandates), BR-29/30 (period
// ordering), BR-32/37 (allowance/charge reason), BR-62/63/64/65 (scheme
// identifiers), BR-CO-26 (seller identification).

import { describe, expect, it } from "vitest";

import { isUneceRec20Unit } from "../rules/codelists/unece-rec20-units.js";
import { en16931CoreRules } from "../rules/en16931-core.js";
import { en16931CalculationsRules } from "../rules/en16931-calculations.js";
import type { AllowanceCharge, InvoiceLine, Party } from "../types.js";
import { baseLine, buildValidInvoice, findRule } from "./_fixtures.js";

const core = (id: string) => findRule(en16931CoreRules, id);
const calc = (id: string) => findRule(en16931CalculationsRules, id);

const fullTaxRep: Party = {
  name: "Steuervertreter GmbH",
  vatId: "DE999999999",
  address: { line1: "Vertreterweg 2", city: "Köln", postCode: "50667", countryCode: "DE" },
};

const allowance = (o: Partial<AllowanceCharge> = {}): AllowanceCharge => ({
  isCharge: false,
  amount: "5.00",
  reason: "Rabatt",
  ...o,
});
const charge = (o: Partial<AllowanceCharge> = {}): AllowanceCharge => ({
  isCharge: true,
  amount: "5.00",
  reason: "Versand",
  ...o,
});

describe("BR-18/19/20/56 — Seller tax representative (BG-11)", () => {
  it("PASS: no tax representative present", () => {
    const inv = buildValidInvoice();
    for (const id of ["BR-18", "BR-19", "BR-20", "BR-56"]) expect(core(id).run(inv)).toBeNull();
  });
  it("PASS: complete tax representative", () => {
    const inv = buildValidInvoice({ taxRepresentative: fullTaxRep });
    for (const id of ["BR-18", "BR-19", "BR-20", "BR-56"]) expect(core(id).run(inv)).toBeNull();
  });
  it("FAIL BR-18: tax rep without name", () => {
    const inv = buildValidInvoice({ taxRepresentative: { ...fullTaxRep, name: undefined } });
    expect(core("BR-18").run(inv)).not.toBeNull();
  });
  it("FAIL BR-19: tax rep without address", () => {
    const inv = buildValidInvoice({ taxRepresentative: { ...fullTaxRep, address: undefined } });
    expect(core("BR-19").run(inv)).not.toBeNull();
  });
  it("FAIL BR-20: tax rep address without country code", () => {
    const inv = buildValidInvoice({ taxRepresentative: { ...fullTaxRep, address: { city: "Köln" } } });
    expect(core("BR-20").run(inv)).not.toBeNull();
  });
  it("FAIL BR-56: tax rep without VAT id", () => {
    const inv = buildValidInvoice({ taxRepresentative: { ...fullTaxRep, vatId: undefined } });
    expect(core("BR-56").run(inv)).not.toBeNull();
  });
});

describe("BR-57 — Deliver to country code (BT-80)", () => {
  it("PASS: no delivery location", () => {
    expect(core("BR-57").run(buildValidInvoice())).toBeNull();
  });
  it("PASS: delivery location with country code", () => {
    const inv = buildValidInvoice();
    inv.delivery = { location: { city: "Hamburg", countryCode: "DE" } };
    expect(core("BR-57").run(inv)).toBeNull();
  });
  it("FAIL: delivery location without country code", () => {
    const inv = buildValidInvoice();
    inv.delivery = { location: { city: "Hamburg" } };
    expect(core("BR-57").run(inv)).not.toBeNull();
  });
});

describe("BR-29 — Invoicing period ordering (BT-73/BT-74)", () => {
  it("PASS: no period / valid range", () => {
    expect(core("BR-29").run(buildValidInvoice())).toBeNull();
    const inv = buildValidInvoice();
    inv.invoicePeriodStart = "2026-01-01";
    inv.invoicePeriodEnd = "2026-01-31";
    expect(core("BR-29").run(inv)).toBeNull();
  });
  it("FAIL: end before start", () => {
    const inv = buildValidInvoice();
    inv.invoicePeriodStart = "2026-02-01";
    inv.invoicePeriodEnd = "2026-01-01";
    expect(core("BR-29").run(inv)).not.toBeNull();
  });
});

describe("BR-30 — Invoice line period ordering (BT-134/BT-135)", () => {
  it("PASS: line with valid range", () => {
    const ln: InvoiceLine = baseLine({ periodStart: "2026-01-01", periodEnd: "2026-01-31" });
    expect(core("BR-30").run(buildValidInvoice({ invoiceLines: [ln] }))).toBeNull();
  });
  it("FAIL: line end before start", () => {
    const ln: InvoiceLine = baseLine({ periodStart: "2026-02-01", periodEnd: "2026-01-01" });
    expect(core("BR-30").run(buildValidInvoice({ invoiceLines: [ln] }))).not.toBeNull();
  });
});

describe("BR-32 — Document level allowance reason (BT-97/BT-98)", () => {
  it("PASS: allowance with reason", () => {
    expect(core("BR-32").run(buildValidInvoice({ documentLevelAllowances: [allowance()] }))).toBeNull();
  });
  it("PASS: allowance with reason code only", () => {
    expect(
      core("BR-32").run(buildValidInvoice({ documentLevelAllowances: [allowance({ reason: undefined, reasonCode: "95" })] })),
    ).toBeNull();
  });
  it("FAIL: allowance with neither reason nor code", () => {
    expect(
      core("BR-32").run(buildValidInvoice({ documentLevelAllowances: [allowance({ reason: undefined, reasonCode: undefined })] })),
    ).not.toBeNull();
  });
});

describe("BR-37 — Document level charge reason (BT-104/BT-105)", () => {
  it("PASS: charge with reason", () => {
    expect(core("BR-37").run(buildValidInvoice({ documentLevelCharges: [charge()] }))).toBeNull();
  });
  it("FAIL: charge with neither reason nor code", () => {
    expect(
      core("BR-37").run(buildValidInvoice({ documentLevelCharges: [charge({ reason: undefined, reasonCode: undefined })] })),
    ).not.toBeNull();
  });
});

describe("BR-62/63 — electronic address scheme identifiers (BT-34/BT-49)", () => {
  it("PASS: no electronic address", () => {
    expect(core("BR-62").run(buildValidInvoice())).toBeNull();
    expect(core("BR-63").run(buildValidInvoice())).toBeNull();
  });
  it("PASS: electronic address with scheme id", () => {
    const inv = buildValidInvoice();
    inv.seller.electronicAddress = { value: "seller@x.de", schemeId: "EM" };
    inv.buyer.electronicAddress = { value: "buyer@y.de", schemeId: "EM" };
    expect(core("BR-62").run(inv)).toBeNull();
    expect(core("BR-63").run(inv)).toBeNull();
  });
  it("FAIL BR-62: seller electronic address without scheme id", () => {
    const inv = buildValidInvoice();
    inv.seller.electronicAddress = { value: "seller@x.de" };
    expect(core("BR-62").run(inv)).not.toBeNull();
  });
  it("FAIL BR-63: buyer electronic address without scheme id", () => {
    const inv = buildValidInvoice();
    inv.buyer.electronicAddress = { value: "buyer@y.de" };
    expect(core("BR-63").run(inv)).not.toBeNull();
  });
});

describe("BR-64/65 — item identifier scheme identifiers (BT-157/BT-158)", () => {
  it("PASS: no item standard id / classification", () => {
    expect(core("BR-64").run(buildValidInvoice())).toBeNull();
    expect(core("BR-65").run(buildValidInvoice())).toBeNull();
  });
  it("PASS: with scheme ids", () => {
    const ln = baseLine({
      itemStandardId: { value: "4012345678901", schemeId: "0160" },
      classifications: [{ value: "65000000", schemeId: "TST" }],
    });
    expect(core("BR-64").run(buildValidInvoice({ invoiceLines: [ln] }))).toBeNull();
    expect(core("BR-65").run(buildValidInvoice({ invoiceLines: [ln] }))).toBeNull();
  });
  it("FAIL BR-64: item standard id without scheme id", () => {
    const ln = baseLine({ itemStandardId: { value: "4012345678901" } });
    expect(core("BR-64").run(buildValidInvoice({ invoiceLines: [ln] }))).not.toBeNull();
  });
  it("FAIL BR-65: classification without scheme id", () => {
    const ln = baseLine({ classifications: [{ value: "65000000" }] });
    expect(core("BR-65").run(buildValidInvoice({ invoiceLines: [ln] }))).not.toBeNull();
  });
});

describe("UN/ECE Rec. 20 unit codes — BR-CL-23 codelist regression", () => {
  // Real ZUGFeRD/CII invoices commonly use "NAR" (number of articles); it was
  // missing from the set and produced a BR-CL-23 false positive on conformant
  // invoices (found via docs/orgaMAX_Beispielrechnung_ZUGFeRD.pdf).
  it("accepts NAR and the common count codes", () => {
    for (const c of ["NAR", "NPR", "NPT", "NPL", "NMP", "NCL", "NBB", "C62", "H87", "PCE"]) {
      expect(isUneceRec20Unit(c), `expected ${c} to be a valid unit code`).toBe(true);
    }
  });
  it("still rejects nonsense codes", () => {
    expect(isUneceRec20Unit("ZZZ-NOPE")).toBe(false);
    expect(isUneceRec20Unit(undefined)).toBe(false);
  });
});

describe("BR-CO-26 — seller identification (BT-30/31/32)", () => {
  it("PASS: seller has VAT id", () => {
    expect(calc("BR-CO-26").run(buildValidInvoice())).toBeNull();
  });
  it("PASS: seller has only tax registration id", () => {
    expect(
      calc("BR-CO-26").run(buildValidInvoice({ seller: { vatId: undefined, taxRegId: "151/815/08156" } })),
    ).toBeNull();
  });
  it("FAIL: seller has none of BT-30/31/32", () => {
    expect(
      calc("BR-CO-26").run(buildValidInvoice({ seller: { vatId: undefined, taxRegId: undefined, legalRegId: undefined } })),
    ).not.toBeNull();
  });
});
