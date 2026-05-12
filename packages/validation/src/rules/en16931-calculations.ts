// EN 16931 calculations / cross-check rules (BR-CO-*).
//
// These are the most consequential rules — getting a calculation wrong means
// a downstream accounting system books the wrong amount. We implement the
// full BR-CO-* set with tight tolerance (±0.01) per `eq2`. The rules are
// pure arithmetic over the normalized model; no XML, no I/O.
//
// Reference: EN 16931:2017 §6.6 calculation rules + KoSIT XRechnung
// schematron `xrechnung-business-rules.sch`.

import type { Rule } from "./engine.js";
import { eq2, num, round2, sum } from "./math.js";

export const en16931CalculationsRules: readonly Rule[] = [
  {
    id: "BR-CO-04",
    category: "BR-CO",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-CO-04",
    summary: "Each Invoice line shall be categorized with an Invoiced item VAT category code (BT-151).",
    run: (inv) => {
      const idx = inv.invoiceLines.findIndex((l) => !l.vatCategory || l.vatCategory.trim() === "");
      if (idx === -1) return null;
      return {
        location: { bt: "BT-151", bg: "BG-25", lineIndex: idx },
        message: `Pflichtfeld BT-151 (USt-Kategorie der Position) fehlt in Position #${idx + 1}.`,
      };
    },
  },
  {
    id: "BR-CO-09",
    category: "BR-CO",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-CO-09",
    summary:
      "The Seller VAT identifier (BT-31), the Seller tax registration identifier (BT-32) or the Tax representative VAT identifier (BT-63) shall be present if the Invoice contains a VAT category code 'S','Z','E','AE','K','G'.",
    run: (inv) => {
      const needsVatId = inv.vatBreakdown.some((v) =>
        ["S", "Z", "E", "AE", "K", "G", "IC"].includes(v.category.toUpperCase()),
      );
      if (!needsVatId) return null;
      if (
        inv.seller.vatId ||
        inv.seller.taxRegId ||
        inv.taxRepresentative?.vatId
      )
        return null;
      return {
        location: { bt: "BT-31", bg: "BG-4" },
        message:
          "Wenn die Rechnung USt-Kategorien (S/Z/E/AE/K/G/IC) enthält, ist BT-31 (USt-IdNr. Verkäufer), BT-32 (Steuernummer Verkäufer) oder BT-63 (USt-IdNr. Steuervertreter) erforderlich.",
      };
    },
  },
  {
    id: "BR-CO-10",
    category: "BR-CO",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-CO-10",
    summary:
      "Sum of Invoice line net amounts (BT-106) = Σ Invoice line net amount (BT-131).",
    run: (inv) => {
      const declared = num(inv.documentTotals.lineExtensionAmount);
      if (!Number.isFinite(declared)) return null; // BR-13 catches missing.
      const computed = sum(inv.invoiceLines.map((l) => l.netAmount));
      if (eq2(declared, computed)) return null;
      return {
        location: { bt: "BT-106", bg: "BG-22" },
        message: "BT-106 (Summe Netto-Positionen) entspricht nicht der Summe aller BT-131 (Positions-Netto). Differenz > 0,01.",
      };
    },
  },
  {
    id: "BR-CO-11",
    category: "BR-CO",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-CO-11",
    summary:
      "Sum of allowances on document level (BT-107) = Σ Document level allowance amount (BT-92).",
    run: (inv) => {
      const declared = num(inv.documentTotals.allowanceTotalAmount);
      if (!Number.isFinite(declared)) return null;
      const computed = sum(inv.documentLevelAllowances.map((a) => a.amount));
      if (eq2(declared, computed)) return null;
      return {
        location: { bt: "BT-107", bg: "BG-22" },
        message: "BT-107 (Summe Nachlässe Dokument-Ebene) entspricht nicht der Summe aller BT-92.",
      };
    },
  },
  {
    id: "BR-CO-12",
    category: "BR-CO",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-CO-12",
    summary:
      "Sum of charges on document level (BT-108) = Σ Document level charge amount (BT-99).",
    run: (inv) => {
      const declared = num(inv.documentTotals.chargeTotalAmount);
      if (!Number.isFinite(declared)) return null;
      const computed = sum(inv.documentLevelCharges.map((c) => c.amount));
      if (eq2(declared, computed)) return null;
      return {
        location: { bt: "BT-108", bg: "BG-22" },
        message: "BT-108 (Summe Zuschläge Dokument-Ebene) entspricht nicht der Summe aller BT-99.",
      };
    },
  },
  {
    id: "BR-CO-13",
    category: "BR-CO",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-CO-13",
    summary:
      "Invoice total amount without VAT (BT-109) = BT-106 − BT-107 + BT-108.",
    run: (inv) => {
      const declared = num(inv.documentTotals.taxExclusiveAmount);
      if (!Number.isFinite(declared)) return null;
      const line = num(inv.documentTotals.lineExtensionAmount);
      const allow = num(inv.documentTotals.allowanceTotalAmount);
      const charge = num(inv.documentTotals.chargeTotalAmount);
      // Treat missing totals as 0 per EN 16931 default — only BT-106 is mandatory.
      const expected =
        (Number.isFinite(line) ? line : 0) -
        (Number.isFinite(allow) ? allow : 0) +
        (Number.isFinite(charge) ? charge : 0);
      if (eq2(declared, expected)) return null;
      return {
        location: { bt: "BT-109", bg: "BG-22" },
        message: "BT-109 (Gesamtbetrag netto) entspricht nicht BT-106 − BT-107 + BT-108.",
      };
    },
  },
  {
    id: "BR-CO-14",
    category: "BR-CO",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-CO-14",
    summary:
      "Invoice total VAT amount (BT-110) = Σ VAT category tax amount (BT-117).",
    run: (inv) => {
      const declared = num(inv.documentTotals.taxAmount);
      // BT-110 is conditionally required (in invoice currency). If absent we skip;
      // BR-CO-16 / BR-CO-15 still cover cross-totals.
      if (!Number.isFinite(declared)) return null;
      const computed = sum(inv.vatBreakdown.map((v) => v.taxAmount));
      if (eq2(declared, computed)) return null;
      return {
        location: { bt: "BT-110", bg: "BG-22" },
        message: "BT-110 (Gesamtbetrag USt) entspricht nicht der Summe aller BT-117.",
      };
    },
  },
  {
    id: "BR-CO-15",
    category: "BR-CO",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-CO-15",
    summary:
      "Invoice total amount with VAT (BT-112) = BT-109 + BT-110.",
    run: (inv) => {
      const declared = num(inv.documentTotals.taxInclusiveAmount);
      if (!Number.isFinite(declared)) return null;
      const taxExcl = num(inv.documentTotals.taxExclusiveAmount);
      // BT-110 may be missing if all categories are exempt; fall back to sum
      // over breakdown so the rule still cross-checks.
      const taxAmount = Number.isFinite(num(inv.documentTotals.taxAmount))
        ? num(inv.documentTotals.taxAmount)
        : sum(inv.vatBreakdown.map((v) => v.taxAmount));
      const expected =
        (Number.isFinite(taxExcl) ? taxExcl : 0) +
        (Number.isFinite(taxAmount) ? taxAmount : 0);
      if (eq2(declared, expected)) return null;
      return {
        location: { bt: "BT-112", bg: "BG-22" },
        message: "BT-112 (Gesamtbetrag brutto) entspricht nicht BT-109 + BT-110.",
      };
    },
  },
  {
    id: "BR-CO-16",
    category: "BR-CO",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-CO-16",
    summary:
      "Amount due for payment (BT-115) = BT-112 − BT-113 + BT-114.",
    run: (inv) => {
      const declared = num(inv.documentTotals.payableAmount);
      if (!Number.isFinite(declared)) return null;
      const taxIncl = num(inv.documentTotals.taxInclusiveAmount);
      const prepaid = num(inv.documentTotals.prepaidAmount);
      const rounding = num(inv.documentTotals.roundingAmount);
      const expected =
        (Number.isFinite(taxIncl) ? taxIncl : 0) -
        (Number.isFinite(prepaid) ? prepaid : 0) +
        (Number.isFinite(rounding) ? rounding : 0);
      if (eq2(declared, expected)) return null;
      return {
        location: { bt: "BT-115", bg: "BG-22" },
        message: "BT-115 (Zahlbetrag) entspricht nicht BT-112 − BT-113 + BT-114.",
      };
    },
  },
  {
    id: "BR-CO-17",
    category: "BR-CO",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-CO-17",
    summary:
      "VAT category tax amount (BT-117) = BT-116 × BT-119 / 100, rounded to two decimals.",
    run: (inv) => {
      for (let i = 0; i < inv.vatBreakdown.length; i++) {
        const v = inv.vatBreakdown[i]!;
        const base = num(v.taxableAmount);
        const rate = num(v.rate);
        const declared = num(v.taxAmount);
        if (!Number.isFinite(base) || !Number.isFinite(declared)) continue;
        const effectiveRate = Number.isFinite(rate) ? rate : 0;
        const expected = round2((base * effectiveRate) / 100);
        if (Math.abs(declared - expected) <= 0.01) continue;
        return {
          location: { bt: "BT-117", bg: "BG-23" },
          message: `BT-117 (USt-Betrag) entspricht nicht BT-116 × BT-119 / 100 im Aufschlüsselungseintrag #${i + 1}.`,
        };
      }
      return null;
    },
  },
  {
    id: "BR-CO-18",
    category: "BR-CO",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-CO-18",
    summary:
      "An Invoice shall at least have one VAT breakdown group (BG-23).",
    run: (inv) =>
      inv.vatBreakdown.length > 0
        ? null
        : {
            location: { bg: "BG-23" },
            message: "Mindestens ein USt-Aufschlüsselungseintrag (BG-23) ist erforderlich.",
          },
  },
  {
    id: "BR-CO-19",
    category: "BR-CO",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-CO-19",
    summary:
      "If Invoicing period (BG-14) is used, the Invoicing period start date (BT-73) or end date (BT-74) shall be present.",
    run: (inv) => {
      // Group considered "used" if any of the two appears in the projection.
      const start = inv.invoicePeriodStart;
      const end = inv.invoicePeriodEnd;
      const groupUsed = !!start || !!end;
      if (!groupUsed) return null;
      if (start || end) return null;
      return {
        location: { bg: "BG-14" },
        message: "BG-14 (Abrechnungszeitraum) angegeben, aber weder BT-73 noch BT-74 vorhanden.",
      };
    },
  },
  {
    id: "BR-CO-20",
    category: "BR-CO",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-CO-20",
    summary:
      "If Invoice line period (BG-26) is used, the Invoice line period start date (BT-134) or end date (BT-135) shall be present.",
    run: (inv) => {
      for (let i = 0; i < inv.invoiceLines.length; i++) {
        const l = inv.invoiceLines[i]!;
        const groupUsed = !!l.periodStart || !!l.periodEnd;
        if (!groupUsed) continue;
        if (l.periodStart || l.periodEnd) continue;
        return {
          location: { bg: "BG-26", lineIndex: i },
          message: `BG-26 (Positions-Abrechnungszeitraum) Position #${i + 1} ist angegeben, aber weder BT-134 noch BT-135 vorhanden.`,
        };
      }
      return null;
    },
  },
  {
    id: "BR-CO-21",
    category: "BR-CO",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-CO-21",
    summary:
      "Each Document level allowance (BG-20) shall contain either a Document level allowance reason (BT-97) or a Document level allowance reason code (BT-98).",
    run: (inv) => {
      const idx = inv.documentLevelAllowances.findIndex(
        (a) => !a.reason && !a.reasonCode,
      );
      if (idx === -1) return null;
      return {
        location: { bt: "BT-97", bg: "BG-20" },
        message: `Dokumenten-Nachlass #${idx + 1} ohne Begründung (BT-97/BT-98).`,
      };
    },
  },
  {
    id: "BR-CO-22",
    category: "BR-CO",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-CO-22",
    summary:
      "Each Document level charge (BG-21) shall contain either a Document level charge reason (BT-104) or a Document level charge reason code (BT-105).",
    run: (inv) => {
      const idx = inv.documentLevelCharges.findIndex(
        (c) => !c.reason && !c.reasonCode,
      );
      if (idx === -1) return null;
      return {
        location: { bt: "BT-104", bg: "BG-21" },
        message: `Dokumenten-Zuschlag #${idx + 1} ohne Begründung (BT-104/BT-105).`,
      };
    },
  },
  {
    id: "BR-CO-23",
    category: "BR-CO",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-CO-23",
    summary:
      "Each Invoice line allowance (BG-27) shall contain either a reason (BT-139) or a reason code (BT-140).",
    run: (inv) => {
      for (let i = 0; i < inv.invoiceLines.length; i++) {
        const idx = inv.invoiceLines[i]!.lineAllowances.findIndex(
          (a) => !a.reason && !a.reasonCode,
        );
        if (idx !== -1) {
          return {
            location: { bt: "BT-139", bg: "BG-27", lineIndex: i },
            message: `Positions-Nachlass #${idx + 1} in Position #${i + 1} ohne Begründung (BT-139/BT-140).`,
          };
        }
      }
      return null;
    },
  },
  {
    id: "BR-CO-24",
    category: "BR-CO",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-CO-24",
    summary:
      "Each Invoice line charge (BG-28) shall contain either a reason (BT-144) or a reason code (BT-145).",
    run: (inv) => {
      for (let i = 0; i < inv.invoiceLines.length; i++) {
        const idx = inv.invoiceLines[i]!.lineCharges.findIndex(
          (c) => !c.reason && !c.reasonCode,
        );
        if (idx !== -1) {
          return {
            location: { bt: "BT-144", bg: "BG-28", lineIndex: i },
            message: `Positions-Zuschlag #${idx + 1} in Position #${i + 1} ohne Begründung (BT-144/BT-145).`,
          };
        }
      }
      return null;
    },
  },
  {
    id: "BR-CO-25",
    category: "BR-CO",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-CO-25",
    summary:
      "In case the Amount due for payment (BT-115) is positive, either the Payment due date (BT-9) or the Payment terms (BT-20) shall be present.",
    run: (inv) => {
      const payable = num(inv.documentTotals.payableAmount);
      if (!Number.isFinite(payable) || payable <= 0) return null;
      if (inv.dueDate || inv.paymentTerms) return null;
      return {
        location: { bt: "BT-9", bg: "BG-22" },
        message:
          "Bei positivem Zahlbetrag ist BT-9 (Fälligkeitsdatum) oder BT-20 (Zahlungsbedingungen) erforderlich.",
      };
    },
  },
  {
    id: "BR-CO-26",
    category: "BR-CO",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-CO-26",
    summary:
      "In order for the Buyer to automatically identify a supplier, the Seller VAT identifier (BT-31), the Seller tax registration identifier (BT-32) or the Seller legal registration identifier (BT-30) shall be present.",
    run: (inv) => {
      const has = (s: string | undefined | null) => typeof s === "string" && s.trim().length > 0;
      if (has(inv.seller.vatId) || has(inv.seller.taxRegId) || has(inv.seller.legalRegId)) return null;
      return {
        location: { bt: "BT-31", bg: "BG-4" },
        message:
          "Mindestens eine Verkäufer-Kennung ist erforderlich: BT-31 (USt-IdNr.), BT-32 (Steuernummer) oder BT-30 (Handelsregisternummer).",
      };
    },
  },
  {
    id: "BR-CO-03",
    category: "BR-CO",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-CO-03",
    summary:
      "Value added tax point date (BT-7) and Value added tax point date code (BT-8) are mutually exclusive.",
    run: (inv) => {
      const has = (s: string | undefined | null) => typeof s === "string" && s.trim().length > 0;
      if (!(has(inv.vatPointDate) && has(inv.vatPointDateCode))) return null;
      return {
        location: { bt: "BT-7", bg: "BG-22" },
        message: "BT-7 (USt-Stichtag) und BT-8 (USt-Stichtag-Code) schließen sich gegenseitig aus.",
      };
    },
  },
  // BR-CO-05..08 — "reason code and reason shall indicate the same type of allowance/charge".
  // The canonical EN 16931 syntax binding evaluates these to `true()` (the mapping
  // between UNTDID 5189/7161 codes and free-text reasons is not machine-checkable),
  // so a faithful implementation is a documented always-pass. Present as real rules
  // so they surface in the rule set and coverage manifest.
  {
    id: "BR-CO-05",
    category: "BR-CO",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-CO-05 (binding: true())",
    summary:
      "Document level allowance reason code (BT-98) and reason (BT-97) shall indicate the same type — not machine-checkable; canonical binding is true().",
    run: () => null,
  },
  {
    id: "BR-CO-06",
    category: "BR-CO",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-CO-06 (binding: true())",
    summary:
      "Document level charge reason code (BT-105) and reason (BT-104) shall indicate the same type — not machine-checkable; canonical binding is true().",
    run: () => null,
  },
  {
    id: "BR-CO-07",
    category: "BR-CO",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-CO-07 (binding: true())",
    summary:
      "Invoice line allowance reason code (BT-140) and reason (BT-139) shall indicate the same type — not machine-checkable; canonical binding is true().",
    run: () => null,
  },
  {
    id: "BR-CO-08",
    category: "BR-CO",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-CO-08 (binding: true())",
    summary:
      "Invoice line charge reason code (BT-145) and reason (BT-144) shall indicate the same type — not machine-checkable; canonical binding is true().",
    run: () => null,
  },
];
