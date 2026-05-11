import { describe, expect, it } from "vitest";

import { en16931CoreRules } from "../rules/en16931-core.js";
import { buildValidInvoice, findRule } from "./_fixtures.js";

const cases: Array<{
  id: string;
  fail: ReturnType<typeof buildValidInvoice>;
}> = [
  { id: "BR-01", fail: buildValidInvoice({ customizationId: "" }) },
  { id: "BR-02", fail: buildValidInvoice({ invoiceNumber: undefined }) },
  { id: "BR-03", fail: buildValidInvoice({ issueDate: undefined }) },
  { id: "BR-04", fail: buildValidInvoice({ typeCode: undefined }) },
  { id: "BR-05", fail: buildValidInvoice({ currencyCode: undefined }) },
  { id: "BR-06", fail: buildValidInvoice({ seller: { name: undefined } }) },
  { id: "BR-07", fail: buildValidInvoice({ buyer: { name: undefined } }) },
  {
    id: "BR-08",
    fail: buildValidInvoice({ seller: { name: "X", vatId: "X", address: undefined } }),
  },
  {
    id: "BR-09",
    fail: buildValidInvoice({ seller: { address: { countryCode: undefined } } }),
  },
  {
    id: "BR-10",
    fail: buildValidInvoice({ buyer: { name: "X", address: undefined } }),
  },
  {
    id: "BR-11",
    fail: buildValidInvoice({ buyer: { address: { countryCode: undefined } } }),
  },
  {
    id: "BR-12",
    fail: buildValidInvoice({ totals: { lineExtensionAmount: undefined } }),
  },
  {
    id: "BR-13",
    fail: buildValidInvoice({ totals: { taxExclusiveAmount: undefined } }),
  },
  {
    id: "BR-14",
    fail: buildValidInvoice({ totals: { taxInclusiveAmount: undefined } }),
  },
  { id: "BR-15", fail: buildValidInvoice({ totals: { payableAmount: undefined } }) },
  { id: "BR-16", fail: buildValidInvoice({ invoiceLines: [] }) },
];

describe("EN 16931 core rules — PASS path", () => {
  for (const c of cases) {
    it(`${c.id} passes on a valid invoice`, () => {
      const rule = findRule(en16931CoreRules, c.id);
      expect(rule.run(buildValidInvoice())).toBeNull();
    });
  }
});

describe("EN 16931 core rules — FAIL path", () => {
  for (const c of cases) {
    it(`${c.id} flags a violation when the field is missing`, () => {
      const rule = findRule(en16931CoreRules, c.id);
      const hit = rule.run(c.fail);
      expect(hit).not.toBeNull();
      expect(typeof hit?.message).toBe("string");
      expect(hit?.message.length).toBeGreaterThan(0);
    });
  }
});
