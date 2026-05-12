// EN 16931 VAT category-specific rules — full per-category matrix for the
// categories the normalized model supports: S (Standard), Z (Zero), E (Exempt),
// AE (Reverse charge), G (Export outside EU), IC (Intra-community), O (Not
// subject to VAT).
//
// Schematron source: ConnectingEurope/eInvoicing-EN16931 @ validation-1.3.16,
// ubl/schematron/abstract/EN16931-model.sch (BR-S/Z/E/AE/G/IC/O-*).
//
// Most families share the same 10-rule shape (01 breakdown presence, 02-04
// seller/buyer identifiers when the category is used on a line/allowance/charge,
// 05-07 VAT-rate constraint, 08 taxable-amount = sum formula, 09 VAT amount
// constraint, 10 exemption-reason constraint). A small declarative table drives
// a generic rule builder; the few genuinely special rules (BR-S-08 per-rate,
// BR-O-11..14) are written out.

import type {
  AllowanceCharge,
  Invoice,
  InvoiceLine,
  VatBreakdownLine,
} from "../types.js";
import type { Rule } from "./engine.js";
import { num } from "./math.js";

const cat = (s: string | undefined | null): string => (s ?? "").trim().toUpperCase();
const present = (s: string | undefined | null): boolean =>
  typeof s === "string" && s.trim().length > 0;
const hasRate = (s: string | undefined | null): boolean => present(s) && Number.isFinite(num(s));

function linesOf(inv: Invoice, c: string): InvoiceLine[] {
  return inv.invoiceLines.filter((l) => cat(l.vatCategory) === c);
}
function allowancesOf(inv: Invoice, c: string): AllowanceCharge[] {
  return inv.documentLevelAllowances.filter((a) => cat(a.vatCategory) === c);
}
function chargesOf(inv: Invoice, c: string): AllowanceCharge[] {
  return inv.documentLevelCharges.filter((ch) => cat(ch.vatCategory) === c);
}
function usesCategory(inv: Invoice, c: string): boolean {
  return (
    linesOf(inv, c).length > 0 || allowancesOf(inv, c).length > 0 || chargesOf(inv, c).length > 0
  );
}
function breakdownsOf(inv: Invoice, c: string): VatBreakdownLine[] {
  return inv.vatBreakdown.filter((v) => cat(v.category) === c);
}

// Seller/buyer identifier presence per the VAT-category rule wording.
const sellerStd = (inv: Invoice): boolean =>
  present(inv.seller.vatId) || present(inv.seller.taxRegId) || present(inv.taxRepresentative?.vatId);
const sellerOrRep = (inv: Invoice): boolean =>
  present(inv.seller.vatId) || present(inv.taxRepresentative?.vatId);
const buyerVatOrLegal = (inv: Invoice): boolean =>
  present(inv.buyer.vatId) || present(inv.buyer.legalRegId);
const anyVatIdPresent = (inv: Invoice): boolean =>
  present(inv.seller.vatId) || present(inv.taxRepresentative?.vatId) || present(inv.buyer.vatId);

type RateKind = "zero" | "positive" | "absent";
type TaxAmtKind = "zero" | "rateTimesBase";
type SellerKind = "std" | "stdAndBuyer" | "sellerOrRep" | "sellerOrRepAndBuyer" | "forbidden";

type Family = {
  code: string; // BT-118 / BT-151 value, e.g. "S"
  prefix: string; // rule prefix, e.g. "BR-S"
  breakdown: "atLeastOne" | "one";
  rate: RateKind;
  taxAmount: TaxAmtKind;
  exemption: "required" | "forbidden";
  seller: SellerKind;
  /** Rule numbers to SKIP because they are implemented elsewhere or written out below. */
  skip: ReadonlySet<number>;
};

const FAMILIES: Family[] = [
  {
    code: "S", prefix: "BR-S", breakdown: "atLeastOne", rate: "positive",
    taxAmount: "rateTimesBase", exemption: "forbidden", seller: "std",
    skip: new Set([1, 8]), // BR-S-01, BR-S-08 already in this file
  },
  {
    code: "Z", prefix: "BR-Z", breakdown: "one", rate: "zero",
    taxAmount: "zero", exemption: "forbidden", seller: "std",
    skip: new Set([1, 9]), // BR-Z-01, BR-Z-09 already in this file
  },
  {
    code: "E", prefix: "BR-E", breakdown: "one", rate: "zero",
    taxAmount: "zero", exemption: "required", seller: "std",
    skip: new Set([1, 10]), // BR-E-01, BR-E-10 already in this file
  },
  {
    code: "AE", prefix: "BR-AE", breakdown: "one", rate: "zero",
    taxAmount: "zero", exemption: "required", seller: "stdAndBuyer",
    skip: new Set([1, 9, 10]), // BR-AE-01, BR-AE-09, BR-AE-10 already in this file
  },
  {
    code: "G", prefix: "BR-G", breakdown: "one", rate: "zero",
    taxAmount: "zero", exemption: "required", seller: "sellerOrRep",
    skip: new Set<number>(),
  },
  {
    code: "IC", prefix: "BR-IC", breakdown: "one", rate: "zero",
    taxAmount: "zero", exemption: "required", seller: "sellerOrRepAndBuyer",
    skip: new Set([1]), // BR-IC-01 already in this file
  },
  {
    code: "O", prefix: "BR-O", breakdown: "one", rate: "absent",
    taxAmount: "zero", exemption: "required", seller: "forbidden",
    skip: new Set<number>(),
  },
];

const pad = (n: number): string => String(n).padStart(2, "0");

function sellerCheck(kind: SellerKind, inv: Invoice): boolean {
  switch (kind) {
    case "std": return sellerStd(inv);
    case "stdAndBuyer": return sellerStd(inv) && buyerVatOrLegal(inv);
    case "sellerOrRep": return sellerOrRep(inv);
    case "sellerOrRepAndBuyer": return sellerOrRep(inv) && present(inv.buyer.vatId);
    case "forbidden": return !anyVatIdPresent(inv);
  }
}

function rateOk(kind: RateKind, rate: string | undefined): boolean {
  switch (kind) {
    case "zero": return !hasRate(rate) || num(rate) === 0;
    case "positive": return hasRate(rate) && num(rate) > 0;
    case "absent": return !hasRate(rate);
  }
}

const C = (id: string): Rule["category"] => {
  // Map prefix to ViolationCategory.
  const m: Record<string, Rule["category"]> = {
    "BR-S": "BR-S", "BR-Z": "BR-Z", "BR-E": "BR-E", "BR-AE": "BR-AE",
    "BR-G": "BR-G", "BR-IC": "BR-IC", "BR-O": "BR-O",
  };
  const key = id.replace(/-\d+$/, "");
  return m[key] ?? "BR";
};

function buildFamily(f: Family): Rule[] {
  const rules: Rule[] = [];
  const id = (n: number) => `${f.prefix}-${pad(n)}`;
  const sev: Rule["severity"] = "fatal";

  const add = (n: number, summary: string, run: Rule["run"]) => {
    if (f.skip.has(n)) return;
    rules.push({ id: id(n), category: C(id(n)), severity: sev, citation: `EN 16931:2017 ${id(n)}`, summary, run });
  };

  // 01 — breakdown presence
  add(1, `An Invoice using VAT category '${f.code}' shall contain ${f.breakdown === "atLeastOne" ? "at least one" : "exactly one"} BG-23 with BT-118='${f.code}'.`, (inv) => {
    if (!usesCategory(inv, f.code)) return null;
    const n = breakdownsOf(inv, f.code).length;
    const ok = f.breakdown === "atLeastOne" ? n >= 1 : n === 1;
    if (ok) return null;
    return { location: { bg: "BG-23" }, message: `USt-Kategorie '${f.code}' verwendet, aber BG-23/BT-118='${f.code}' fehlt oder ist nicht eindeutig.` };
  });

  // 02/03/04 — seller (and maybe buyer) identifiers required when used on line / allowance / charge
  const sellerMsg = f.seller === "forbidden"
    ? `Bei USt-Kategorie '${f.code}' dürfen BT-31, BT-63 und BT-48 nicht vorhanden sein.`
    : `Bei USt-Kategorie '${f.code}' muss eine USt-/Steuer-Identifikation (BT-31/BT-32/BT-63${f.seller.includes("AndBuyer") || f.seller === "stdAndBuyer" ? " sowie BT-48/BT-47" : ""}) vorhanden sein.`;
  add(2, `Invoice line with VAT category '${f.code}' ⇒ required seller/buyer identifiers.`, (inv) => {
    if (linesOf(inv, f.code).length === 0) return null;
    return sellerCheck(f.seller, inv) ? null : { location: { bg: "BG-25" }, message: sellerMsg };
  });
  add(3, `Document level allowance with VAT category '${f.code}' ⇒ required seller/buyer identifiers.`, (inv) => {
    if (allowancesOf(inv, f.code).length === 0) return null;
    return sellerCheck(f.seller, inv) ? null : { location: { bg: "BG-20" }, message: sellerMsg };
  });
  add(4, `Document level charge with VAT category '${f.code}' ⇒ required seller/buyer identifiers.`, (inv) => {
    if (chargesOf(inv, f.code).length === 0) return null;
    return sellerCheck(f.seller, inv) ? null : { location: { bg: "BG-21" }, message: sellerMsg };
  });

  // 05/06/07 — VAT rate constraint on line / allowance / charge
  const rateWord = f.rate === "zero" ? "muss 0 sein" : f.rate === "positive" ? "muss > 0 sein" : "darf nicht vorhanden sein";
  add(5, `Invoice line VAT rate constraint for category '${f.code}'.`, (inv) => {
    const bad = linesOf(inv, f.code).findIndex((l) => !rateOk(f.rate, l.vatRate));
    if (bad === -1) return null;
    return { location: { bt: "BT-152", bg: "BG-25", lineIndex: bad }, message: `BT-152 (USt-Satz) ${rateWord} bei BT-151='${f.code}'.` };
  });
  add(6, `Document level allowance VAT rate constraint for category '${f.code}'.`, (inv) => {
    const bad = allowancesOf(inv, f.code).findIndex((a) => !rateOk(f.rate, a.vatRate));
    if (bad === -1) return null;
    return { location: { bt: "BT-96", bg: "BG-20" }, message: `BT-96 (USt-Satz) ${rateWord} bei BT-95='${f.code}'.` };
  });
  add(7, `Document level charge VAT rate constraint for category '${f.code}'.`, (inv) => {
    const bad = chargesOf(inv, f.code).findIndex((ch) => !rateOk(f.rate, ch.vatRate));
    if (bad === -1) return null;
    return { location: { bt: "BT-103", bg: "BG-21" }, message: `BT-103 (USt-Satz) ${rateWord} bei BT-102='${f.code}'.` };
  });

  // 08 — VAT category taxable amount = sum of line nets − allowances + charges (category-wide)
  add(8, `VAT breakdown taxable amount (BT-116) for category '${f.code}' equals Σ line nets − Σ allowances + Σ charges.`, (inv) => {
    const bds = breakdownsOf(inv, f.code);
    if (bds.length === 0) return null;
    const lineNet = linesOf(inv, f.code).reduce((acc, l) => acc + num(l.netAmount), 0);
    const alw = allowancesOf(inv, f.code).reduce((acc, a) => acc + num(a.amount), 0);
    const chg = chargesOf(inv, f.code).reduce((acc, ch) => acc + num(ch.amount), 0);
    const expected = lineNet - alw + chg;
    const declared = bds.reduce((acc, b) => acc + num(b.taxableAmount), 0);
    if (!Number.isFinite(declared)) return null;
    if (Math.abs(declared - expected) <= 0.01) return null;
    return { location: { bt: "BT-116", bg: "BG-23" }, message: `BT-116 (USt-Bemessungsgrundlage '${f.code}') stimmt nicht mit Σ Positionen − Nachlässe + Zuschläge überein.` };
  });

  // 09 — VAT category tax amount constraint
  if (f.taxAmount === "zero") {
    add(9, `VAT category tax amount (BT-117) for category '${f.code}' shall be 0.`, (inv) => {
      const i = breakdownsOf(inv, f.code).findIndex((b) => num(b.taxAmount) !== 0);
      if (i === -1) return null;
      return { location: { bt: "BT-117", bg: "BG-23" }, message: `BT-117 (USt-Betrag) muss 0 sein bei BT-118='${f.code}' — Aufschlüsselung #${i + 1}.` };
    });
  } else {
    add(9, `VAT category tax amount (BT-117) = BT-116 × BT-119 / 100 for category '${f.code}'.`, (inv) => {
      const i = breakdownsOf(inv, f.code).findIndex((b) => {
        const taxable = num(b.taxableAmount);
        const rate = num(b.rate);
        const taxAmt = num(b.taxAmount);
        if (!Number.isFinite(taxable) || !Number.isFinite(rate) || !Number.isFinite(taxAmt)) return false;
        return Math.abs(taxAmt - (taxable * rate) / 100) > 0.01;
      });
      if (i === -1) return null;
      return { location: { bt: "BT-117", bg: "BG-23" }, message: `BT-117 (USt-Betrag) ≠ BT-116 × BT-119 / 100 — Aufschlüsselung #${i + 1}.` };
    });
  }

  // 10 — exemption reason constraint
  if (f.exemption === "required") {
    add(10, `VAT breakdown with category '${f.code}' shall carry BT-120 or BT-121.`, (inv) => {
      const i = breakdownsOf(inv, f.code).findIndex((b) => !present(b.exemptionReasonCode) && !present(b.exemptionReason));
      if (i === -1) return null;
      return { location: { bt: "BT-120", bg: "BG-23" }, message: `BG-23 (USt-Kategorie '${f.code}') benötigt BT-120 (Befreiungsgrund) oder BT-121 (Code) — Aufschlüsselung #${i + 1}.` };
    });
  } else {
    add(10, `VAT breakdown with category '${f.code}' shall NOT carry BT-120 or BT-121.`, (inv) => {
      const i = breakdownsOf(inv, f.code).findIndex((b) => present(b.exemptionReasonCode) || present(b.exemptionReason));
      if (i === -1) return null;
      return { location: { bt: "BT-120", bg: "BG-23" }, message: `BG-23 (USt-Kategorie '${f.code}') darf BT-120/BT-121 nicht enthalten — Aufschlüsselung #${i + 1}.` };
    });
  }

  return rules;
}

// ─── Rules that don't fit the generic shape ──────────────────────────────────

const specialRules: Rule[] = [
  // BR-IC-11 — actual delivery date (BT-72) or invoicing period (BG-14) must not be blank when 'IC' is used in a breakdown
  {
    id: "BR-IC-11", category: "BR-IC", severity: "fatal", citation: "EN 16931:2017 BR-IC-11",
    summary: "Invoice with a BG-23 'IC' breakdown shall have BT-72 (actual delivery date) or BG-14 (invoicing period).",
    run: (inv) => {
      if (breakdownsOf(inv, "IC").length === 0) return null;
      const hasDate = present(inv.delivery?.actualDate);
      const hasPeriod = present(inv.invoicePeriodStart) || present(inv.invoicePeriodEnd);
      if (hasDate || hasPeriod) return null;
      return { location: { bt: "BT-72", bg: "BG-14" }, message: "Bei USt-Kategorie 'IC' muss BT-72 (Lieferdatum) oder BG-14 (Abrechnungszeitraum) vorhanden sein." };
    },
  },
  // BR-IC-12 — deliver-to country code (BT-80) must not be blank when 'IC' is used in a breakdown
  {
    id: "BR-IC-12", category: "BR-IC", severity: "fatal", citation: "EN 16931:2017 BR-IC-12",
    summary: "Invoice with a BG-23 'IC' breakdown shall have BT-80 (deliver-to country code).",
    run: (inv) => {
      if (breakdownsOf(inv, "IC").length === 0) return null;
      if (present(inv.delivery?.location?.countryCode)) return null;
      return { location: { bt: "BT-80", bg: "BG-15" }, message: "Bei USt-Kategorie 'IC' muss BT-80 (Lieferland) vorhanden sein." };
    },
  },
  // BR-O-11 — invoice with an 'O' breakdown shall not contain other breakdown groups
  {
    id: "BR-O-11", category: "BR-O", severity: "fatal", citation: "EN 16931:2017 BR-O-11",
    summary: "Invoice with a BG-23 'O' breakdown shall not contain other BG-23 groups.",
    run: (inv) => {
      if (breakdownsOf(inv, "O").length === 0) return null;
      const others = inv.vatBreakdown.some((v) => cat(v.category) !== "O");
      if (!others) return null;
      return { location: { bg: "BG-23" }, message: "Eine Rechnung mit BG-23/BT-118='O' darf keine weiteren BG-23-Gruppen enthalten." };
    },
  },
  // BR-O-12 — no invoice line with category != 'O'
  {
    id: "BR-O-12", category: "BR-O", severity: "fatal", citation: "EN 16931:2017 BR-O-12",
    summary: "Invoice with a BG-23 'O' breakdown shall not contain an invoice line with BT-151 ≠ 'O'.",
    run: (inv) => {
      if (breakdownsOf(inv, "O").length === 0) return null;
      const bad = inv.invoiceLines.findIndex((l) => cat(l.vatCategory) !== "O");
      if (bad === -1) return null;
      return { location: { bt: "BT-151", bg: "BG-25", lineIndex: bad }, message: "Bei einer 'O'-Rechnung darf keine Position eine andere USt-Kategorie (BT-151) als 'O' haben." };
    },
  },
  // BR-O-13 — no document level allowance with category != 'O'
  {
    id: "BR-O-13", category: "BR-O", severity: "fatal", citation: "EN 16931:2017 BR-O-13",
    summary: "Invoice with a BG-23 'O' breakdown shall not contain a BG-20 with BT-95 ≠ 'O'.",
    run: (inv) => {
      if (breakdownsOf(inv, "O").length === 0) return null;
      if (!inv.documentLevelAllowances.some((a) => cat(a.vatCategory) !== "O")) return null;
      return { location: { bt: "BT-95", bg: "BG-20" }, message: "Bei einer 'O'-Rechnung darf kein Nachlass (BT-95) eine andere USt-Kategorie als 'O' haben." };
    },
  },
  // BR-O-14 — no document level charge with category != 'O'
  {
    id: "BR-O-14", category: "BR-O", severity: "fatal", citation: "EN 16931:2017 BR-O-14",
    summary: "Invoice with a BG-23 'O' breakdown shall not contain a BG-21 with BT-102 ≠ 'O'.",
    run: (inv) => {
      if (breakdownsOf(inv, "O").length === 0) return null;
      if (!inv.documentLevelCharges.some((ch) => cat(ch.vatCategory) !== "O")) return null;
      return { location: { bt: "BT-102", bg: "BG-21" }, message: "Bei einer 'O'-Rechnung darf kein Zuschlag (BT-102) eine andere USt-Kategorie als 'O' haben." };
    },
  },
];

// ─── Pre-existing rules kept verbatim (referenced by Session 1 tests) ────────

const present2 = present;

const baselineRules: readonly Rule[] = [
  {
    id: "BR-S-01",
    category: "BR-S",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-S-01",
    summary:
      "An Invoice that contains an Invoice line, a Document level allowance or a Document level charge with VAT category 'Standard rated' shall contain in the VAT breakdown at least one VAT category code equal to 'S'.",
    run: (inv) => {
      const usesS =
        inv.invoiceLines.some((l) => l.vatCategory.toUpperCase() === "S") ||
        inv.documentLevelAllowances.some((a) => a.vatCategory?.toUpperCase() === "S") ||
        inv.documentLevelCharges.some((c) => c.vatCategory?.toUpperCase() === "S");
      if (!usesS) return null;
      const inBreakdown = inv.vatBreakdown.some((v) => v.category.toUpperCase() === "S");
      if (inBreakdown) return null;
      return {
        location: { bg: "BG-23" },
        message:
          "USt-Kategorie 'S' verwendet, aber kein BG-23-Aufschlüsselungseintrag mit BT-118='S' vorhanden.",
      };
    },
  },
  {
    id: "BR-S-08",
    category: "BR-S",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-S-08",
    summary:
      "For each VAT breakdown with category 'S', the VAT category taxable amount (BT-116) shall equal the sum of Invoice line net amounts (BT-131) plus document level charges (BT-99) minus document level allowances (BT-92) where the category is 'S' and the rate matches.",
    run: (inv) => {
      const sLines = inv.vatBreakdown.filter((v) => v.category.toUpperCase() === "S");
      for (const breakdown of sLines) {
        const rate = num(breakdown.rate);
        if (!Number.isFinite(rate)) continue;
        const lineNet = inv.invoiceLines
          .filter((l) => l.vatCategory.toUpperCase() === "S" && num(l.vatRate) === rate)
          .reduce((acc, l) => acc + num(l.netAmount), 0);
        const charges = inv.documentLevelCharges
          .filter((c) => c.vatCategory?.toUpperCase() === "S" && num(c.vatRate) === rate)
          .reduce((acc, c) => acc + num(c.amount), 0);
        const allowances = inv.documentLevelAllowances
          .filter((a) => a.vatCategory?.toUpperCase() === "S" && num(a.vatRate) === rate)
          .reduce((acc, a) => acc + num(a.amount), 0);
        const expected = lineNet + charges - allowances;
        const declared = num(breakdown.taxableAmount);
        if (!Number.isFinite(declared)) continue;
        if (Math.abs(declared - expected) <= 0.01) continue;
        return {
          location: { bt: "BT-116", bg: "BG-23" },
          message: `BT-116 (USt-Bemessungsgrundlage 'S') stimmt nicht mit der Summe der Positionen+Zuschläge−Nachlässe überein.`,
        };
      }
      return null;
    },
  },
  {
    id: "BR-Z-01",
    category: "BR-Z",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-Z-01",
    summary:
      "An Invoice using VAT category 'Z' shall have at least one BG-23 breakdown with BT-118='Z'.",
    run: (inv) => {
      const usesZ = inv.invoiceLines.some((l) => l.vatCategory.toUpperCase() === "Z");
      if (!usesZ) return null;
      const ok = inv.vatBreakdown.some((v) => v.category.toUpperCase() === "Z");
      if (ok) return null;
      return {
        location: { bg: "BG-23" },
        message: "USt-Kategorie 'Z' verwendet, aber kein BG-23 mit BT-118='Z' vorhanden.",
      };
    },
  },
  {
    id: "BR-Z-09",
    category: "BR-Z",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-Z-09",
    summary: "For VAT category 'Z', the VAT category rate (BT-119) shall be 0.",
    run: (inv) => {
      const idx = inv.vatBreakdown.findIndex(
        (v) => v.category.toUpperCase() === "Z" && num(v.rate) !== 0,
      );
      if (idx === -1) return null;
      return {
        location: { bt: "BT-119", bg: "BG-23" },
        message: `BT-119 (USt-Satz) muss bei BT-118='Z' gleich 0 sein — Aufschlüsselung #${idx + 1}.`,
      };
    },
  },
  {
    id: "BR-E-01",
    category: "BR-E",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-E-01",
    summary:
      "An Invoice using VAT category 'E' shall have at least one BG-23 breakdown with BT-118='E'.",
    run: (inv) => {
      const usesE = inv.invoiceLines.some((l) => l.vatCategory.toUpperCase() === "E");
      if (!usesE) return null;
      const ok = inv.vatBreakdown.some((v) => v.category.toUpperCase() === "E");
      if (ok) return null;
      return {
        location: { bg: "BG-23" },
        message: "USt-Kategorie 'E' verwendet, aber kein BG-23 mit BT-118='E' vorhanden.",
      };
    },
  },
  {
    id: "BR-E-10",
    category: "BR-E",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-E-10",
    summary:
      "A VAT breakdown with category 'E' shall include either the VAT exemption reason code (BT-121) or the VAT exemption reason text (BT-120).",
    run: (inv) => {
      const idx = inv.vatBreakdown.findIndex(
        (v) =>
          v.category.toUpperCase() === "E" &&
          !present2(v.exemptionReasonCode) &&
          !present2(v.exemptionReason),
      );
      if (idx === -1) return null;
      return {
        location: { bt: "BT-120", bg: "BG-23" },
        message: `BG-23 (USt-Kategorie 'E') benötigt BT-120 (Befreiungsgrund) oder BT-121 (Code) — Aufschlüsselung #${idx + 1}.`,
      };
    },
  },
  {
    id: "BR-AE-01",
    category: "BR-AE",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-AE-01",
    summary:
      "An Invoice using VAT category 'AE' (reverse charge) shall have at least one BG-23 breakdown with BT-118='AE'.",
    run: (inv) => {
      const usesAe = inv.invoiceLines.some((l) => l.vatCategory.toUpperCase() === "AE");
      if (!usesAe) return null;
      const ok = inv.vatBreakdown.some((v) => v.category.toUpperCase() === "AE");
      if (ok) return null;
      return {
        location: { bg: "BG-23" },
        message: "USt-Kategorie 'AE' verwendet, aber kein BG-23 mit BT-118='AE' vorhanden.",
      };
    },
  },
  {
    id: "BR-AE-09",
    category: "BR-AE",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-AE-09",
    summary: "For category 'AE', the VAT category tax amount (BT-117) shall be 0.",
    run: (inv) => {
      const idx = inv.vatBreakdown.findIndex(
        (v) => v.category.toUpperCase() === "AE" && num(v.taxAmount) !== 0,
      );
      if (idx === -1) return null;
      return {
        location: { bt: "BT-117", bg: "BG-23" },
        message: `BT-117 (USt-Betrag) muss bei BT-118='AE' gleich 0 sein — Aufschlüsselung #${idx + 1}.`,
      };
    },
  },
  {
    id: "BR-AE-10",
    category: "BR-AE",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-AE-10",
    summary:
      "A VAT breakdown with category 'AE' shall include either the VAT exemption reason code (BT-121) or text (BT-120).",
    run: (inv) => {
      const idx = inv.vatBreakdown.findIndex(
        (v) =>
          v.category.toUpperCase() === "AE" &&
          !present2(v.exemptionReasonCode) &&
          !present2(v.exemptionReason),
      );
      if (idx === -1) return null;
      return {
        location: { bt: "BT-120", bg: "BG-23" },
        message: `BG-23 (USt-Kategorie 'AE') benötigt BT-120 oder BT-121 — Aufschlüsselung #${idx + 1}.`,
      };
    },
  },
  {
    id: "BR-IC-01",
    category: "BR-IC",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-IC-01",
    summary:
      "An Invoice using category 'IC' shall have at least one BG-23 with BT-118='IC'.",
    run: (inv) => {
      const usesIc = inv.invoiceLines.some((l) => l.vatCategory.toUpperCase() === "IC");
      if (!usesIc) return null;
      const ok = inv.vatBreakdown.some((v) => v.category.toUpperCase() === "IC");
      if (ok) return null;
      return {
        location: { bg: "BG-23" },
        message: "USt-Kategorie 'IC' verwendet, aber kein BG-23 mit BT-118='IC' vorhanden.",
      };
    },
  },
];

export const en16931VatRules: readonly Rule[] = [
  ...baselineRules,
  ...FAMILIES.flatMap(buildFamily),
  ...specialRules,
];
