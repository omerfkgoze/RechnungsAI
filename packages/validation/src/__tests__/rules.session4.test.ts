// PASS + FAIL coverage for the rules implemented in Story 6.1 Session 4
// (en16931-session4.ts): BR-33, BR-38, BR-41..BR-44, BR-49, BR-51, BR-53,
// BR-54, BR-55, BR-B-01/02, BR-AF-01..10, BR-AG-01..10, BR-CL-05, BR-CL-18.

import { describe, expect, it } from "vitest";

import { en16931Session4Rules } from "../rules/en16931-session4.js";
import type { AllowanceCharge, Invoice, InvoiceLine } from "../types.js";
import { baseLine, baseVat, buildValidInvoice, findRule } from "./_fixtures.js";

const r = (id: string) => findRule(en16931Session4Rules, id);

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
const lineWith = (o: Partial<InvoiceLine> = {}): InvoiceLine => baseLine(o);

describe("BR-33 / BR-38 — document level allowance/charge reason", () => {
  it("PASS BR-33: allowance with reason", () => {
    expect(r("BR-33").run(buildValidInvoice({ documentLevelAllowances: [allowance()] }))).toBeNull();
  });
  it("PASS BR-33: allowance with reasonCode only", () => {
    expect(
      r("BR-33").run(buildValidInvoice({ documentLevelAllowances: [allowance({ reason: undefined, reasonCode: "95" })] })),
    ).toBeNull();
  });
  it("FAIL BR-33: allowance with neither reason nor code", () => {
    expect(
      r("BR-33").run(buildValidInvoice({ documentLevelAllowances: [allowance({ reason: undefined, reasonCode: undefined })] })),
    ).not.toBeNull();
  });
  it("PASS BR-38: charge with reason", () => {
    expect(r("BR-38").run(buildValidInvoice({ documentLevelCharges: [charge()] }))).toBeNull();
  });
  it("FAIL BR-38: charge with neither", () => {
    expect(
      r("BR-38").run(buildValidInvoice({ documentLevelCharges: [charge({ reason: undefined, reasonCode: undefined })] })),
    ).not.toBeNull();
  });
});

describe("BR-41..BR-44 — invoice line allowance/charge", () => {
  it("PASS: line with valid allowance + charge", () => {
    const inv = buildValidInvoice({
      invoiceLines: [lineWith({ lineAllowances: [allowance()], lineCharges: [charge()] })],
    });
    for (const id of ["BR-41", "BR-42", "BR-43", "BR-44"]) expect(r(id).run(inv)).toBeNull();
  });
  it("PASS: no line allowances/charges", () => {
    const inv = buildValidInvoice();
    for (const id of ["BR-41", "BR-42", "BR-43", "BR-44"]) expect(r(id).run(inv)).toBeNull();
  });
  it("FAIL BR-41: line allowance without amount", () => {
    const inv = buildValidInvoice({ invoiceLines: [lineWith({ lineAllowances: [allowance({ amount: "" })] })] });
    expect(r("BR-41").run(inv)).not.toBeNull();
  });
  it("FAIL BR-42: line allowance without reason", () => {
    const inv = buildValidInvoice({ invoiceLines: [lineWith({ lineAllowances: [allowance({ reason: undefined, reasonCode: undefined })] })] });
    expect(r("BR-42").run(inv)).not.toBeNull();
  });
  it("FAIL BR-43: line charge without amount", () => {
    const inv = buildValidInvoice({ invoiceLines: [lineWith({ lineCharges: [charge({ amount: "x" })] })] });
    expect(r("BR-43").run(inv)).not.toBeNull();
  });
  it("FAIL BR-44: line charge without reason", () => {
    const inv = buildValidInvoice({ invoiceLines: [lineWith({ lineCharges: [charge({ reason: undefined, reasonCode: undefined })] })] });
    expect(r("BR-44").run(inv)).not.toBeNull();
  });
});

describe("BR-49 — payment means type code", () => {
  it("PASS: no payment instructions", () => {
    expect(r("BR-49").run(buildValidInvoice())).toBeNull();
  });
  it("PASS: payment instruction with means code", () => {
    expect(r("BR-49").run(buildValidInvoice({ paymentInstructions: { meansCode: "58", iban: "DE89..." } }))).toBeNull();
  });
  it("FAIL: payment instruction with IBAN but no means code", () => {
    expect(r("BR-49").run(buildValidInvoice({ paymentInstructions: { iban: "DE89..." } }))).not.toBeNull();
  });
});

describe("BR-51 — full card PAN", () => {
  it("PASS: no card number", () => {
    expect(r("BR-51").run(buildValidInvoice())).toBeNull();
  });
  it("PASS: masked card number (<=10 digits)", () => {
    expect(r("BR-51").run(buildValidInvoice({ paymentInstructions: { meansCode: "48", cardNumber: "401200******1234" } }))).toBeNull();
  });
  it("FAIL: full 16-digit PAN", () => {
    expect(r("BR-51").run(buildValidInvoice({ paymentInstructions: { meansCode: "48", cardNumber: "4012001234561234" } }))).not.toBeNull();
  });
});

describe("BR-53 — VAT amount in accounting currency", () => {
  it("PASS: no accounting currency code", () => {
    expect(r("BR-53").run(buildValidInvoice())).toBeNull();
  });
  it("PASS: accounting currency + BT-111 present", () => {
    const inv: Invoice = { ...buildValidInvoice(), accountingCurrencyCode: "USD" };
    inv.documentTotals.taxAmountInAccountingCurrency = "20.00";
    expect(r("BR-53").run(inv)).toBeNull();
  });
  it("FAIL: accounting currency without BT-111", () => {
    const inv: Invoice = { ...buildValidInvoice(), accountingCurrencyCode: "USD" };
    expect(r("BR-53").run(inv)).not.toBeNull();
  });
});

describe("BR-54 — item attributes", () => {
  it("PASS: no item attributes", () => {
    expect(r("BR-54").run(buildValidInvoice())).toBeNull();
  });
  it("PASS: complete item attribute", () => {
    expect(r("BR-54").run(buildValidInvoice({ invoiceLines: [lineWith({ itemAttributes: [{ name: "Farbe", value: "Blau" }] })] }))).toBeNull();
  });
  it("FAIL: item attribute missing value", () => {
    expect(r("BR-54").run(buildValidInvoice({ invoiceLines: [lineWith({ itemAttributes: [{ name: "Farbe", value: "" }] })] }))).not.toBeNull();
  });
});

describe("BR-55 — preceding invoice reference", () => {
  it("PASS: no preceding refs", () => {
    expect(r("BR-55").run(buildValidInvoice())).toBeNull();
  });
  it("PASS: preceding ref with number", () => {
    const inv: Invoice = { ...buildValidInvoice(), precedingInvoiceRefs: [{ number: "INV-2025-009", date: "2025-12-01" }] };
    expect(r("BR-55").run(inv)).toBeNull();
  });
  it("FAIL: preceding ref without number", () => {
    const inv: Invoice = { ...buildValidInvoice(), precedingInvoiceRefs: [{ number: "", date: "2025-12-01" }] };
    expect(r("BR-55").run(inv)).not.toBeNull();
  });
});

describe("BR-B-01 / BR-B-02 — split payment", () => {
  it("PASS: no split-payment category", () => {
    expect(r("BR-B-01").run(buildValidInvoice())).toBeNull();
    expect(r("BR-B-02").run(buildValidInvoice())).toBeNull();
  });
  it("PASS BR-B-01: split payment with IT seller + buyer", () => {
    const inv = buildValidInvoice({
      seller: { address: { countryCode: "IT", city: "Roma" } },
      buyer: { address: { countryCode: "IT", city: "Milano" } },
      invoiceLines: [lineWith({ vatCategory: "B" })],
      vatBreakdown: [baseVat({ category: "B" })],
    });
    expect(r("BR-B-01").run(inv)).toBeNull();
  });
  it("FAIL BR-B-01: split payment with DE seller", () => {
    const inv = buildValidInvoice({
      invoiceLines: [lineWith({ vatCategory: "B" })],
      vatBreakdown: [baseVat({ category: "B" })],
    });
    expect(r("BR-B-01").run(inv)).not.toBeNull();
  });
  it("FAIL BR-B-02: split payment mixed with standard", () => {
    const inv = buildValidInvoice({
      seller: { address: { countryCode: "IT", city: "Roma" } },
      buyer: { address: { countryCode: "IT", city: "Milano" } },
      invoiceLines: [lineWith({ vatCategory: "B" }), lineWith({ id: "2", vatCategory: "S" })],
      vatBreakdown: [baseVat({ category: "B" }), baseVat({ category: "S" })],
    });
    expect(r("BR-B-02").run(inv)).not.toBeNull();
  });
});

describe("BR-AF-* (IGIC) / BR-AG-* (IPSI) families", () => {
  const igicLine = (rate = "7") => lineWith({ vatCategory: "L", vatRate: rate, netAmount: "100.00" });
  const ipsiLine = (rate = "10") => lineWith({ vatCategory: "M", vatRate: rate, netAmount: "100.00" });

  it("PASS BR-AF-*: clean IGIC invoice", () => {
    const inv = buildValidInvoice({
      seller: { vatId: "ES12345678Z", taxRegId: "ES-X" },
      invoiceLines: [igicLine()],
      vatBreakdown: [baseVat({ category: "L", rate: "7", taxableAmount: "100.00", taxAmount: "7.00" })],
      totals: { taxExclusiveAmount: "100.00", taxInclusiveAmount: "107.00", taxAmount: "7.00", payableAmount: "107.00", lineExtensionAmount: "100.00" },
    });
    for (let n = 1; n <= 10; n++) expect(r(`BR-AF-${String(n).padStart(2, "0")}`).run(inv)).toBeNull();
  });
  it("PASS BR-AG-*: clean IPSI invoice", () => {
    const inv = buildValidInvoice({
      seller: { vatId: "ES12345678Z" },
      invoiceLines: [ipsiLine()],
      vatBreakdown: [baseVat({ category: "M", rate: "10", taxableAmount: "100.00", taxAmount: "10.00" })],
      totals: { taxExclusiveAmount: "100.00", taxInclusiveAmount: "110.00", taxAmount: "10.00", payableAmount: "110.00", lineExtensionAmount: "100.00" },
    });
    for (let n = 1; n <= 10; n++) expect(r(`BR-AG-${String(n).padStart(2, "0")}`).run(inv)).toBeNull();
  });
  it("PASS BR-AF/AG-*: no IGIC/IPSI used at all", () => {
    const inv = buildValidInvoice();
    for (let n = 1; n <= 10; n++) {
      expect(r(`BR-AF-${String(n).padStart(2, "0")}`).run(inv)).toBeNull();
      expect(r(`BR-AG-${String(n).padStart(2, "0")}`).run(inv)).toBeNull();
    }
  });
  it("FAIL BR-AF-01: IGIC line without IGIC breakdown", () => {
    const inv = buildValidInvoice({
      seller: { vatId: "ES12345678Z" },
      invoiceLines: [igicLine()],
      vatBreakdown: [baseVat({ category: "S", rate: "19" })],
    });
    expect(r("BR-AF-01").run(inv)).not.toBeNull();
  });
  it("FAIL BR-AF-02: IGIC line without seller VAT/tax id", () => {
    const inv = buildValidInvoice({
      seller: { vatId: undefined, taxRegId: undefined, name: "X" },
      invoiceLines: [igicLine()],
      vatBreakdown: [baseVat({ category: "L", rate: "7" })],
    });
    expect(r("BR-AF-02").run(inv)).not.toBeNull();
  });
  it("FAIL BR-AF-05: IGIC line with negative VAT rate", () => {
    const inv = buildValidInvoice({
      seller: { vatId: "ES12345678Z" },
      invoiceLines: [igicLine("-1")],
      vatBreakdown: [baseVat({ category: "L", rate: "7" })],
    });
    expect(r("BR-AF-05").run(inv)).not.toBeNull();
  });
  it("FAIL BR-AF-08: IGIC breakdown taxable amount mismatch", () => {
    const inv = buildValidInvoice({
      seller: { vatId: "ES12345678Z" },
      invoiceLines: [igicLine("7")],
      vatBreakdown: [baseVat({ category: "L", rate: "7", taxableAmount: "999.00", taxAmount: "69.93" })],
    });
    expect(r("BR-AF-08").run(inv)).not.toBeNull();
  });
  it("FAIL BR-AF-09: IGIC breakdown tax amount mismatch", () => {
    const inv = buildValidInvoice({
      seller: { vatId: "ES12345678Z" },
      invoiceLines: [igicLine("7")],
      vatBreakdown: [baseVat({ category: "L", rate: "7", taxableAmount: "100.00", taxAmount: "50.00" })],
    });
    expect(r("BR-AF-09").run(inv)).not.toBeNull();
  });
  it("FAIL BR-AF-10: IGIC breakdown with exemption reason", () => {
    const inv = buildValidInvoice({
      seller: { vatId: "ES12345678Z" },
      invoiceLines: [igicLine("7")],
      vatBreakdown: [baseVat({ category: "L", rate: "7", taxableAmount: "100.00", taxAmount: "7.00", exemptionReason: "x" })],
    });
    expect(r("BR-AF-10").run(inv)).not.toBeNull();
  });
  it("FAIL BR-AG-01: IPSI line without IPSI breakdown", () => {
    const inv = buildValidInvoice({
      seller: { vatId: "ES12345678Z" },
      invoiceLines: [ipsiLine()],
      vatBreakdown: [baseVat({ category: "S", rate: "19" })],
    });
    expect(r("BR-AG-01").run(inv)).not.toBeNull();
  });
});

describe("BR-CL-05 / BR-CL-18 — codelists", () => {
  it("PASS BR-CL-05: no accounting currency", () => {
    expect(r("BR-CL-05").run(buildValidInvoice())).toBeNull();
  });
  it("PASS BR-CL-05: valid accounting currency", () => {
    expect(r("BR-CL-05").run({ ...buildValidInvoice(), accountingCurrencyCode: "USD" })).toBeNull();
  });
  it("FAIL BR-CL-05: bogus accounting currency", () => {
    expect(r("BR-CL-05").run({ ...buildValidInvoice(), accountingCurrencyCode: "XYZ" })).not.toBeNull();
  });
  it("PASS BR-CL-18: standard categories", () => {
    expect(r("BR-CL-18").run(buildValidInvoice())).toBeNull();
  });
  it("FAIL BR-CL-18: unknown category code on a line", () => {
    const inv = buildValidInvoice({ invoiceLines: [lineWith({ vatCategory: "QQ" })], vatBreakdown: [baseVat({ category: "S" })] });
    expect(r("BR-CL-18").run(inv)).not.toBeNull();
  });
});
