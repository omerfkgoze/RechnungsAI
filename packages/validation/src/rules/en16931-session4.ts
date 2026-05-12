// EN 16931 rules implemented in Story 6.1 Session 4 — the remaining modellable
// stubs from en16931-deferred.ts:
//   - Allowance / charge mandatory fields: BR-33, BR-38, BR-41..BR-44
//   - Payment / preceding-invoice / item-attribute mandates: BR-49, BR-51,
//     BR-53, BR-54, BR-55
//   - Split-payment ("B") constraints: BR-B-01, BR-B-02
//   - IGIC ("L") VAT family: BR-AF-01..BR-AF-10
//   - IPSI ("M") VAT family: BR-AG-01..BR-AG-10
//   - Codelist: BR-CL-05 (tax currency code), BR-CL-18 (VAT category codes)
//
// Schematron source: ConnectingEurope/eInvoicing-EN16931 @ tag validation-1.3.16,
//   ubl/schematron/abstract/EN16931-model.sch + ubl/schematron/codelist/EN16931-UBL-codes.sch.
//
// Still deferred (need codelist data not yet vendored): BR-CL-11 (ISO 6523 ICD
// for registration scheme identifiers), BR-CL-22 (CEF VATEX list), BR-CL-26
// (ISO 6523 ICD for delivery location scheme identifiers).
//
// Messages: German, BT/BG identifiers only (AC #8 — never echo field content).

import type { AllowanceCharge, Invoice, VatBreakdownLine } from "../types.js";
import type { Rule } from "./engine.js";
import { num } from "./math.js";
import { isIso4217 } from "./codelists/iso4217-currency.js";
import { VAT_CATEGORIES } from "./codelists/vat-categories.js";

const present = (s: string | undefined | null): boolean =>
  typeof s === "string" && s.trim().length > 0;
const cat = (s: string | undefined | null): string => (s ?? "").trim().toUpperCase();

const hasReason = (ac: AllowanceCharge): boolean =>
  present(ac.reason) || present(ac.reasonCode);

// IGIC / IPSI are encoded either as the UNCL5305 letters L/M or the legacy
// IG/IP/"IGIC"/"IPSI" spellings (see vat-categories.ts). Treat them as aliases.
const isIgic = (c: string): boolean => c === "L" || c === "IG" || c === "IGIC";
const isIpsi = (c: string): boolean => c === "M" || c === "IP" || c === "IPSI";
const isSplitPayment = (c: string): boolean => c === "B";
const isStandard = (c: string): boolean => c === "S";

function allDocLevelCats(inv: Invoice): string[] {
  const out: string[] = [];
  for (const l of inv.invoiceLines) out.push(cat(l.vatCategory));
  for (const a of inv.documentLevelAllowances) out.push(cat(a.vatCategory));
  for (const ch of inv.documentLevelCharges) out.push(cat(ch.vatCategory));
  return out;
}
function allCatsIncludingBreakdown(inv: Invoice): string[] {
  return [...allDocLevelCats(inv), ...inv.vatBreakdown.map((v) => cat(v.category))];
}

const sellerIdForGeneralIndirect = (inv: Invoice): boolean =>
  present(inv.seller.vatId) ||
  present(inv.seller.taxRegId) ||
  present(inv.taxRepresentative?.vatId);

const nonNegRate = (s: string | undefined): boolean => {
  const n = num(s);
  return Number.isFinite(n) && n >= 0;
};

// ── IGIC / IPSI family builder ────────────────────────────────────────────────
// Both families have an identical 10-rule shape; only the category code,
// human label and rule-id prefix differ.
function buildGeneralIndirectFamily(
  prefix: "BR-AF" | "BR-AG",
  matches: (c: string) => boolean,
  label: string,
  breakdownCode: string,
): Rule[] {
  const id = (n: number) => `${prefix}-${String(n).padStart(2, "0")}`;
  const usedOnDocLevel = (inv: Invoice) => allDocLevelCats(inv).some(matches);
  const linesUsing = (inv: Invoice) =>
    inv.invoiceLines.filter((l) => matches(cat(l.vatCategory)));
  const allowancesUsing = (inv: Invoice) =>
    inv.documentLevelAllowances.filter((a) => matches(cat(a.vatCategory)));
  const chargesUsing = (inv: Invoice) =>
    inv.documentLevelCharges.filter((c) => matches(cat(c.vatCategory)));
  const breakdownsUsing = (inv: Invoice) =>
    inv.vatBreakdown.filter((v) => matches(cat(v.category)));

  return [
    {
      id: id(1),
      category: "BR",
      severity: "error",
      citation: `EN 16931:2017 §6.5 ${id(1)}`,
      summary: `If ${label} is used on a line/allowance/charge there must be a matching VAT breakdown entry.`,
      run: (inv) =>
        usedOnDocLevel(inv) && !inv.vatBreakdown.some((v) => matches(cat(v.category)))
          ? {
              location: { bg: "BG-23", bt: "BT-118" },
              message: `Bei Verwendung der Umsatzsteuerkategorie "${label}" muss die USt.-Aufschlüsselung (BG-23) einen Eintrag mit BT-118 = "${breakdownCode}" enthalten.`,
            }
          : null,
    },
    {
      id: id(2),
      category: "BR",
      severity: "error",
      citation: `EN 16931:2017 §6.5 ${id(2)}`,
      summary: `If ${label} is used on a line, the seller VAT/tax id (BT-31/BT-32) or tax representative VAT id (BT-63) must be present.`,
      run: (inv) =>
        linesUsing(inv).length > 0 && !sellerIdForGeneralIndirect(inv)
          ? {
              location: { bt: "BT-31" },
              message: `Bei Umsatzsteuerkategorie "${label}" auf einer Position muss BT-31, BT-32 oder BT-63 vorhanden sein.`,
            }
          : null,
    },
    {
      id: id(3),
      category: "BR",
      severity: "error",
      citation: `EN 16931:2017 §6.5 ${id(3)}`,
      summary: `If ${label} is used on a document level allowance, the seller VAT/tax id (BT-31/BT-32) or tax representative VAT id (BT-63) must be present.`,
      run: (inv) =>
        allowancesUsing(inv).length > 0 && !sellerIdForGeneralIndirect(inv)
          ? {
              location: { bg: "BG-20", bt: "BT-31" },
              message: `Bei Umsatzsteuerkategorie "${label}" in einem Nachlass auf Dokumentebene (BG-20) muss BT-31, BT-32 oder BT-63 vorhanden sein.`,
            }
          : null,
    },
    {
      id: id(4),
      category: "BR",
      severity: "error",
      citation: `EN 16931:2017 §6.5 ${id(4)}`,
      summary: `If ${label} is used on a document level charge, the seller VAT/tax id (BT-31/BT-32) or tax representative VAT id (BT-63) must be present.`,
      run: (inv) =>
        chargesUsing(inv).length > 0 && !sellerIdForGeneralIndirect(inv)
          ? {
              location: { bg: "BG-21", bt: "BT-31" },
              message: `Bei Umsatzsteuerkategorie "${label}" in einem Zuschlag auf Dokumentebene (BG-21) muss BT-31, BT-32 oder BT-63 vorhanden sein.`,
            }
          : null,
    },
    {
      id: id(5),
      category: "BR",
      severity: "error",
      citation: `EN 16931:2017 §6.5 ${id(5)}`,
      summary: `In a line where ${label} is used the item VAT rate (BT-152) shall be 0 or greater than 0.`,
      run: (inv) => {
        const bad = linesUsing(inv).find((l) => !nonNegRate(l.vatRate));
        return bad
          ? {
              location: { bt: "BT-152" },
              message: `Bei Umsatzsteuerkategorie "${label}" muss der Positions-USt.-Satz (BT-152) 0 oder größer sein.`,
            }
          : null;
      },
    },
    {
      id: id(6),
      category: "BR",
      severity: "error",
      citation: `EN 16931:2017 §6.5 ${id(6)}`,
      summary: `In a document level allowance where ${label} is used the VAT rate (BT-96) shall be 0 or greater than 0.`,
      run: (inv) => {
        const bad = allowancesUsing(inv).find((a) => !nonNegRate(a.vatRate));
        return bad
          ? {
              location: { bg: "BG-20", bt: "BT-96" },
              message: `Bei Umsatzsteuerkategorie "${label}" muss der USt.-Satz des Nachlasses (BT-96) 0 oder größer sein.`,
            }
          : null;
      },
    },
    {
      id: id(7),
      category: "BR",
      severity: "error",
      citation: `EN 16931:2017 §6.5 ${id(7)}`,
      summary: `In a document level charge where ${label} is used the VAT rate (BT-103) shall be 0 or greater than 0.`,
      run: (inv) => {
        const bad = chargesUsing(inv).find((c) => !nonNegRate(c.vatRate));
        return bad
          ? {
              location: { bg: "BG-21", bt: "BT-103" },
              message: `Bei Umsatzsteuerkategorie "${label}" muss der USt.-Satz des Zuschlags (BT-103) 0 oder größer sein.`,
            }
          : null;
      },
    },
    {
      id: id(8),
      category: "BR",
      severity: "error",
      citation: `EN 16931:2017 §6.5 ${id(8)}`,
      summary: `For each ${label} VAT-rate group, BT-116 shall equal Σ line nets + Σ doc charges − Σ doc allowances with the same category & rate.`,
      run: (inv) => {
        const bds = breakdownsUsing(inv);
        for (const bd of bds) {
          const r = num(bd.rate);
          const sameRate = (rate: string | undefined) =>
            Number.isFinite(r) ? num(rate) === r : !present(rate);
          let expected = 0;
          for (const l of linesUsing(inv)) if (sameRate(l.vatRate)) expected += num(l.netAmount) || 0;
          for (const c of chargesUsing(inv)) if (sameRate(c.vatRate)) expected += num(c.amount) || 0;
          for (const a of allowancesUsing(inv)) if (sameRate(a.vatRate)) expected -= num(a.amount) || 0;
          const taxable = num(bd.taxableAmount);
          if (Number.isFinite(taxable) && Math.abs(taxable - expected) > 0.01) {
            return {
              location: { bg: "BG-23", bt: "BT-116" },
              message: `Steuerbasisbetrag (BT-116) der USt.-Kategorie "${label}" stimmt nicht mit der Summe der zugehörigen Positions-/Nachlass-/Zuschlagsbeträge überein.`,
            };
          }
        }
        return null;
      },
    },
    {
      id: id(9),
      category: "BR",
      severity: "error",
      citation: `EN 16931:2017 §6.5 ${id(9)}`,
      summary: `The ${label} VAT category tax amount (BT-117) shall equal BT-116 × BT-119.`,
      run: (inv) => {
        for (const bd of breakdownsUsing(inv)) {
          const taxable = num(bd.taxableAmount);
          const rate = num(bd.rate);
          const amount = num(bd.taxAmount);
          if (!Number.isFinite(taxable) || !Number.isFinite(rate) || !Number.isFinite(amount)) continue;
          const expected = Math.round(((taxable * rate) / 100) * 100) / 100;
          if (Math.abs(expected - amount) > 0.01) {
            return {
              location: { bg: "BG-23", bt: "BT-117" },
              message: `USt.-Betrag (BT-117) der USt.-Kategorie "${label}" muss Steuerbasisbetrag (BT-116) × USt.-Satz (BT-119) entsprechen.`,
            };
          }
        }
        return null;
      },
    },
    {
      id: id(10),
      category: "BR",
      severity: "error",
      citation: `EN 16931:2017 §6.5 ${id(10)}`,
      summary: `A ${label} VAT breakdown shall not have a VAT exemption reason code (BT-121) or text (BT-120).`,
      run: (inv) => {
        const bad = breakdownsUsing(inv).find(
          (v: VatBreakdownLine) => present(v.exemptionReasonCode) || present(v.exemptionReason),
        );
        return bad
          ? {
              location: { bg: "BG-23", bt: "BT-120" },
              message: `USt.-Aufschlüsselung (BG-23) mit Kategorie "${label}" darf keinen Befreiungsgrund (BT-120/BT-121) enthalten.`,
            }
          : null;
      },
    },
  ];
}

export const en16931Session4Rules: readonly Rule[] = [
  // ── Document level allowance / charge mandatory fields ──────────────────────
  {
    id: "BR-33",
    category: "BR",
    severity: "error",
    citation: "EN 16931:2017 §6.6 BR-33",
    summary: "Each document level allowance (BG-20) shall have a reason (BT-97) or reason code (BT-98).",
    run: (inv) => {
      const bad = inv.documentLevelAllowances.find((a) => !hasReason(a));
      return bad
        ? { location: { bg: "BG-20", bt: "BT-97" }, message: "Jeder Nachlass auf Dokumentebene (BG-20) muss einen Grund (BT-97) oder Grundcode (BT-98) haben." }
        : null;
    },
  },
  {
    id: "BR-38",
    category: "BR",
    severity: "error",
    citation: "EN 16931:2017 §6.6 BR-38",
    summary: "Each document level charge (BG-21) shall have a reason (BT-104) or reason code (BT-105).",
    run: (inv) => {
      const bad = inv.documentLevelCharges.find((c) => !hasReason(c));
      return bad
        ? { location: { bg: "BG-21", bt: "BT-104" }, message: "Jeder Zuschlag auf Dokumentebene (BG-21) muss einen Grund (BT-104) oder Grundcode (BT-105) haben." }
        : null;
    },
  },
  {
    id: "BR-41",
    category: "BR",
    severity: "error",
    citation: "EN 16931:2017 §6.6 BR-41",
    summary: "Each invoice line allowance (BG-27) shall have an allowance amount (BT-136).",
    run: (inv) => {
      for (const line of inv.invoiceLines) {
        const bad = line.lineAllowances.find((a) => !Number.isFinite(num(a.amount)));
        if (bad) {
          return { location: { bg: "BG-27", bt: "BT-136", lineIndex: inv.invoiceLines.indexOf(line) }, message: "Jeder Positions-Nachlass (BG-27) muss einen Betrag (BT-136) haben." };
        }
      }
      return null;
    },
  },
  {
    id: "BR-42",
    category: "BR",
    severity: "error",
    citation: "EN 16931:2017 §6.6 BR-42",
    summary: "Each invoice line allowance (BG-27) shall have a reason (BT-139) or reason code (BT-140).",
    run: (inv) => {
      for (const line of inv.invoiceLines) {
        const bad = line.lineAllowances.find((a) => !hasReason(a));
        if (bad) {
          return { location: { bg: "BG-27", bt: "BT-139", lineIndex: inv.invoiceLines.indexOf(line) }, message: "Jeder Positions-Nachlass (BG-27) muss einen Grund (BT-139) oder Grundcode (BT-140) haben." };
        }
      }
      return null;
    },
  },
  {
    id: "BR-43",
    category: "BR",
    severity: "error",
    citation: "EN 16931:2017 §6.6 BR-43",
    summary: "Each invoice line charge (BG-28) shall have a charge amount (BT-141).",
    run: (inv) => {
      for (const line of inv.invoiceLines) {
        const bad = line.lineCharges.find((c) => !Number.isFinite(num(c.amount)));
        if (bad) {
          return { location: { bg: "BG-28", bt: "BT-141", lineIndex: inv.invoiceLines.indexOf(line) }, message: "Jeder Positions-Zuschlag (BG-28) muss einen Betrag (BT-141) haben." };
        }
      }
      return null;
    },
  },
  {
    id: "BR-44",
    category: "BR",
    severity: "error",
    citation: "EN 16931:2017 §6.6 BR-44",
    summary: "Each invoice line charge (BG-28) shall have a reason (BT-144) or reason code (BT-145).",
    run: (inv) => {
      for (const line of inv.invoiceLines) {
        const bad = line.lineCharges.find((c) => !hasReason(c));
        if (bad) {
          return { location: { bg: "BG-28", bt: "BT-144", lineIndex: inv.invoiceLines.indexOf(line) }, message: "Jeder Positions-Zuschlag (BG-28) muss einen Grund (BT-144) oder Grundcode (BT-145) haben." };
        }
      }
      return null;
    },
  },
  // ── Payment / preceding invoice / item attribute mandates ──────────────────
  {
    id: "BR-49",
    category: "BR",
    severity: "error",
    citation: "EN 16931:2017 §6.6 BR-49",
    summary: "A payment instruction (BG-16) shall specify the payment means type code (BT-81).",
    run: (inv) => {
      const p = inv.paymentInstructions;
      if (!p) return null;
      const used = present(p.meansText) || present(p.iban) || present(p.cardNumber) || present(p.paymentId);
      if (!used) return null; // empty/absent BG-16 — nothing to check
      return present(p.meansCode)
        ? null
        : { location: { bg: "BG-16", bt: "BT-81" }, message: "Eine Zahlungsanweisung (BG-16) muss den Code der Zahlungsart (BT-81) enthalten." };
    },
  },
  {
    id: "BR-51",
    category: "BR",
    severity: "warning",
    citation: "EN 16931:2017 §6.6 BR-51",
    summary: "An invoice should not include a full card PAN (BT-87) — at most first 6 + last 4 digits.",
    run: (inv) => {
      const pan = inv.paymentInstructions?.cardNumber;
      if (!present(pan)) return null;
      const digits = (pan as string).replace(/\D/g, "");
      return digits.length > 10
        ? { location: { bt: "BT-87" }, message: "Die Karten-Nummer (BT-87) darf höchstens die ersten 6 und letzten 4 Ziffern enthalten." }
        : null;
    },
  },
  {
    id: "BR-53",
    category: "BR",
    severity: "error",
    citation: "EN 16931:2017 §6.6 BR-53",
    summary: "If the VAT accounting currency code (BT-6) is present, the total VAT amount in accounting currency (BT-111) shall be provided.",
    run: (inv) =>
      present(inv.accountingCurrencyCode) && !present(inv.documentTotals.taxAmountInAccountingCurrency)
        ? { location: { bt: "BT-111" }, message: "Wenn der Code der Buchungswährung (BT-6) angegeben ist, muss der USt.-Gesamtbetrag in Buchungswährung (BT-111) vorhanden sein." }
        : null,
  },
  {
    id: "BR-54",
    category: "BR",
    severity: "error",
    citation: "EN 16931:2017 §6.6 BR-54",
    summary: "Each item attribute (BG-32) shall contain an item attribute name (BT-160) and value (BT-161).",
    run: (inv) => {
      for (const line of inv.invoiceLines) {
        const bad = (line.itemAttributes ?? []).find((a) => !present(a.name) || !present(a.value));
        if (bad) {
          return { location: { bg: "BG-32", bt: "BT-160", lineIndex: inv.invoiceLines.indexOf(line) }, message: "Jedes Artikelmerkmal (BG-32) muss einen Namen (BT-160) und einen Wert (BT-161) enthalten." };
        }
      }
      return null;
    },
  },
  {
    id: "BR-55",
    category: "BR",
    severity: "error",
    citation: "EN 16931:2017 §6.6 BR-55",
    summary: "Each preceding invoice reference (BG-3) shall contain a preceding invoice reference (BT-25).",
    run: (inv) => {
      const bad = (inv.precedingInvoiceRefs ?? []).find((r) => !present(r.number));
      return bad
        ? { location: { bg: "BG-3", bt: "BT-25" }, message: "Jeder Verweis auf eine vorausgehende Rechnung (BG-3) muss eine Rechnungsnummer (BT-25) enthalten." }
        : null;
    },
  },
  // ── Split payment ("B") ────────────────────────────────────────────────────
  {
    id: "BR-B-01",
    category: "BR",
    severity: "error",
    citation: "EN 16931:2017 §6.5 BR-B-01",
    summary: 'An invoice where the VAT category code is "Split payment" (B) shall be a domestic Italian invoice.',
    run: (inv) => {
      if (!allCatsIncludingBreakdown(inv).some(isSplitPayment)) return null;
      const sellerIt = cat(inv.seller.address?.countryCode) === "IT";
      const buyerIt = cat(inv.buyer.address?.countryCode) === "IT";
      return sellerIt && buyerIt
        ? null
        : { location: { bt: "BT-118" }, message: 'Die Umsatzsteuerkategorie "Aufgeteilte Zahlung" (B) ist nur bei einer inländischen italienischen Rechnung zulässig (BT-40 und BT-55 = IT).' };
    },
  },
  {
    id: "BR-B-02",
    category: "BR",
    severity: "error",
    citation: "EN 16931:2017 §6.5 BR-B-02",
    summary: 'An invoice that uses "Split payment" (B) shall not also use "Standard rated" (S).',
    run: (inv) => {
      const cats = allCatsIncludingBreakdown(inv);
      return cats.some(isSplitPayment) && cats.some(isStandard)
        ? { location: { bt: "BT-118" }, message: 'Eine Rechnung mit der Umsatzsteuerkategorie "Aufgeteilte Zahlung" (B) darf nicht zusätzlich die Kategorie "Regelsteuersatz" (S) verwenden.' }
        : null;
    },
  },
  // ── IGIC ("L") family ──────────────────────────────────────────────────────
  ...buildGeneralIndirectFamily("BR-AF", isIgic, "IGIC", "L"),
  // ── IPSI ("M") family ──────────────────────────────────────────────────────
  ...buildGeneralIndirectFamily("BR-AG", isIpsi, "IPSI", "M"),
  // ── Codelists ──────────────────────────────────────────────────────────────
  {
    id: "BR-CL-05",
    category: "BR-CL",
    severity: "fatal",
    citation: "EN 16931:2017 §6.5 BR-CL-05 (ISO 4217)",
    summary: "Tax currency code (BT-6) must be coded using ISO 4217 alpha-3.",
    run: (inv) =>
      present(inv.accountingCurrencyCode) && !isIso4217(cat(inv.accountingCurrencyCode))
        ? { location: { bt: "BT-6" }, message: "Der Code der Buchungswährung (BT-6) muss ein ISO-4217-Alpha-3-Code sein." }
        : null,
  },
  {
    id: "BR-CL-18",
    category: "BR-CL",
    severity: "fatal",
    citation: "EN 16931:2017 §6.5 BR-CL-18 (UNCL5305)",
    summary: "Invoice tax categories (BT-95, BT-102, BT-118, BT-151) must be coded using UNCL5305.",
    run: (inv) => {
      const all: { code: string | undefined; bt: string }[] = [];
      for (const l of inv.invoiceLines) all.push({ code: l.vatCategory, bt: "BT-151" });
      for (const a of inv.documentLevelAllowances) all.push({ code: a.vatCategory, bt: "BT-95" });
      for (const c of inv.documentLevelCharges) all.push({ code: c.vatCategory, bt: "BT-102" });
      for (const v of inv.vatBreakdown) all.push({ code: v.category, bt: "BT-118" });
      const bad = all.find((e) => present(e.code) && !VAT_CATEGORIES.has(cat(e.code)));
      return bad
        ? { location: { bt: bad.bt }, message: `Der Umsatzsteuerkategorie-Code (${bad.bt}) muss aus der Codeliste UNCL5305 stammen.` }
        : null;
    },
  },
];
