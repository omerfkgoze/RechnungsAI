// EN 16931 BR-DEC-* rules — "the allowed maximum number of decimals for <BT-x> is 2".
// Pure string-format checks over the normalized Invoice model (values are kept
// as text precisely so these rules can see the original fractional digits).
//
// Schematron source: ConnectingEurope/eInvoicing-EN16931 @ validation-1.3.16,
// ubl/schematron/abstract/EN16931-model.sch — each is
// `string-length(substring-after(<amount>,'.')) <= 2`.

import type { Invoice } from "../types.js";
import type { Rule } from "./engine.js";
import { decimalCount } from "./math.js";

/** True when every supplied textual amount has at most 2 fractional digits. */
function maxTwoDecimals(values: (string | undefined)[]): boolean {
  return values.every((v) => decimalCount(v) <= 2);
}

type DecSpec = {
  id: string;
  bt: string;
  /** German label for BT — message is BT/BG IDs only per AC #8. */
  pick: (inv: Invoice) => (string | undefined)[];
};

const SPECS: DecSpec[] = [
  { id: "BR-DEC-01", bt: "BT-92", pick: (i) => i.documentLevelAllowances.map((a) => a.amount) },
  { id: "BR-DEC-02", bt: "BT-93", pick: (i) => i.documentLevelAllowances.map((a) => a.baseAmount) },
  { id: "BR-DEC-05", bt: "BT-99", pick: (i) => i.documentLevelCharges.map((c) => c.amount) },
  { id: "BR-DEC-06", bt: "BT-100", pick: (i) => i.documentLevelCharges.map((c) => c.baseAmount) },
  { id: "BR-DEC-09", bt: "BT-106", pick: (i) => [i.documentTotals.lineExtensionAmount] },
  { id: "BR-DEC-10", bt: "BT-107", pick: (i) => [i.documentTotals.allowanceTotalAmount] },
  { id: "BR-DEC-11", bt: "BT-108", pick: (i) => [i.documentTotals.chargeTotalAmount] },
  { id: "BR-DEC-12", bt: "BT-109", pick: (i) => [i.documentTotals.taxExclusiveAmount] },
  { id: "BR-DEC-13", bt: "BT-110", pick: (i) => [i.documentTotals.taxAmount] },
  { id: "BR-DEC-14", bt: "BT-112", pick: (i) => [i.documentTotals.taxInclusiveAmount] },
  { id: "BR-DEC-15", bt: "BT-111", pick: (i) => [i.documentTotals.taxAmountInAccountingCurrency] },
  { id: "BR-DEC-16", bt: "BT-113", pick: (i) => [i.documentTotals.prepaidAmount] },
  { id: "BR-DEC-17", bt: "BT-114", pick: (i) => [i.documentTotals.roundingAmount] },
  { id: "BR-DEC-18", bt: "BT-115", pick: (i) => [i.documentTotals.payableAmount] },
  { id: "BR-DEC-19", bt: "BT-116", pick: (i) => i.vatBreakdown.map((v) => v.taxableAmount) },
  { id: "BR-DEC-20", bt: "BT-117", pick: (i) => i.vatBreakdown.map((v) => v.taxAmount) },
  { id: "BR-DEC-23", bt: "BT-131", pick: (i) => i.invoiceLines.map((l) => l.netAmount) },
  {
    id: "BR-DEC-24",
    bt: "BT-136",
    pick: (i) => i.invoiceLines.flatMap((l) => l.lineAllowances.map((a) => a.amount)),
  },
  {
    id: "BR-DEC-25",
    bt: "BT-137",
    pick: (i) => i.invoiceLines.flatMap((l) => l.lineAllowances.map((a) => a.baseAmount)),
  },
  {
    id: "BR-DEC-27",
    bt: "BT-141",
    pick: (i) => i.invoiceLines.flatMap((l) => l.lineCharges.map((c) => c.amount)),
  },
  {
    id: "BR-DEC-28",
    bt: "BT-142",
    pick: (i) => i.invoiceLines.flatMap((l) => l.lineCharges.map((c) => c.baseAmount)),
  },
];

export const en16931DecRules: readonly Rule[] = SPECS.map((spec) => ({
  id: spec.id,
  category: "BR-DEC",
  severity: "fatal",
  citation: `EN 16931:2017 ${spec.id}`,
  summary: `The allowed maximum number of decimals for ${spec.bt} is 2.`,
  run: (inv) => {
    if (maxTwoDecimals(spec.pick(inv))) return null;
    return {
      location: { bt: spec.bt },
      message: `${spec.bt}: höchstens 2 Nachkommastellen erlaubt.`,
    };
  },
}));
