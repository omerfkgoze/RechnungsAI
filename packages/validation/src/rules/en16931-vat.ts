// EN 16931 VAT category-specific rules (BR-S-*, BR-Z-*, BR-E-*, BR-AE-*,
// BR-G-*, BR-IC-*, BR-IG-*, BR-IP-*, BR-O-*).
//
// Coverage in this iteration: the high-value subset that catches the common
// supplier mistakes — each category gets the "rate present" and "exemption
// reason required when applicable" pair. The full per-category matrix
// (~50 rules) is deferred to the follow-up session.

import type { Rule } from "./engine.js";
import { num } from "./math.js";

const present = (s: string | undefined | null): boolean =>
  typeof s === "string" && s.trim().length > 0;

export const en16931VatRules: readonly Rule[] = [
  // ─── BR-S-* — Standard rate
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

  // ─── BR-Z-* — Zero rated
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
    summary:
      "For VAT category 'Z', the VAT category rate (BT-119) shall be 0.",
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

  // ─── BR-E-* — Exempt
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
          !present(v.exemptionReasonCode) &&
          !present(v.exemptionReason),
      );
      if (idx === -1) return null;
      return {
        location: { bt: "BT-120", bg: "BG-23" },
        message: `BG-23 (USt-Kategorie 'E') benötigt BT-120 (Befreiungsgrund) oder BT-121 (Code) — Aufschlüsselung #${idx + 1}.`,
      };
    },
  },

  // ─── BR-AE-* — Reverse charge
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
    summary:
      "For category 'AE', the VAT category tax amount (BT-117) shall be 0.",
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
          !present(v.exemptionReasonCode) &&
          !present(v.exemptionReason),
      );
      if (idx === -1) return null;
      return {
        location: { bt: "BT-120", bg: "BG-23" },
        message: `BG-23 (USt-Kategorie 'AE') benötigt BT-120 oder BT-121 — Aufschlüsselung #${idx + 1}.`,
      };
    },
  },

  // ─── BR-IC-* — Intra-Community (alias)
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
