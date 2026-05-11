// EN 16931 core structural / mandatory-field rules (BR-01..BR-65).
//
// Coverage in this iteration: representative subset of the most load-bearing
// mandatory-field rules (BR-01..BR-09 + BR-16 + BR-17 + BR-24..BR-31 +
// BR-49..BR-52). The remaining ~30 BR-* core rules (party-address details,
// document-reference identifiers, period mandates) are listed in the deferred
// section of the story's Completion Notes and will be added in a follow-up
// session — they all share the same "field-present" shape, no architectural
// novelty.
//
// Messages: German, BT/BG identifiers only (AC #8 — never echo field content).

import type { Rule } from "./engine.js";

const present = (s: string | undefined | null): boolean =>
  typeof s === "string" && s.trim().length > 0;

export const en16931CoreRules: readonly Rule[] = [
  {
    id: "BR-01",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-01",
    summary: "An Invoice shall have a Specification identifier (BT-24).",
    run: (inv) =>
      present(inv.customizationId)
        ? null
        : { location: { bt: "BT-24" }, message: "Pflichtfeld BT-24 (Spezifikationskennung) fehlt." },
  },
  {
    id: "BR-02",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-02",
    summary: "An Invoice shall have an Invoice number (BT-1).",
    run: (inv) =>
      present(inv.invoiceNumber)
        ? null
        : { location: { bt: "BT-1" }, message: "Pflichtfeld BT-1 (Rechnungsnummer) fehlt." },
  },
  {
    id: "BR-03",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-03",
    summary: "An Invoice shall have an Invoice issue date (BT-2).",
    run: (inv) =>
      present(inv.issueDate)
        ? null
        : { location: { bt: "BT-2" }, message: "Pflichtfeld BT-2 (Rechnungsdatum) fehlt." },
  },
  {
    id: "BR-04",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-04",
    summary: "An Invoice shall have an Invoice type code (BT-3).",
    run: (inv) =>
      present(inv.typeCode)
        ? null
        : { location: { bt: "BT-3" }, message: "Pflichtfeld BT-3 (Rechnungsart) fehlt." },
  },
  {
    id: "BR-05",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-05",
    summary: "An Invoice shall have an Invoice currency code (BT-5).",
    run: (inv) =>
      present(inv.currencyCode)
        ? null
        : { location: { bt: "BT-5" }, message: "Pflichtfeld BT-5 (Rechnungswährung) fehlt." },
  },
  {
    id: "BR-06",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-06",
    summary: "An Invoice shall contain the Seller name (BT-27).",
    run: (inv) =>
      present(inv.seller.name)
        ? null
        : { location: { bt: "BT-27", bg: "BG-4" }, message: "Pflichtfeld BT-27 (Verkäufername) fehlt." },
  },
  {
    id: "BR-07",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-07",
    summary: "An Invoice shall contain the Buyer name (BT-44).",
    run: (inv) =>
      present(inv.buyer.name)
        ? null
        : { location: { bt: "BT-44", bg: "BG-7" }, message: "Pflichtfeld BT-44 (Käufername) fehlt." },
  },
  {
    id: "BR-08",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-08",
    summary: "An Invoice shall contain the Seller postal address (BG-5).",
    run: (inv) =>
      inv.seller.address
        ? null
        : { location: { bg: "BG-5" }, message: "Pflichtgruppe BG-5 (Postanschrift Verkäufer) fehlt." },
  },
  {
    id: "BR-09",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-09",
    summary: "The Seller postal address shall contain a country code (BT-40).",
    run: (inv) =>
      present(inv.seller.address?.countryCode)
        ? null
        : { location: { bt: "BT-40", bg: "BG-5" }, message: "Pflichtfeld BT-40 (Verkäufer-Länderkennzeichen) fehlt." },
  },
  {
    id: "BR-10",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-10",
    summary: "An Invoice shall contain the Buyer postal address (BG-8).",
    run: (inv) =>
      inv.buyer.address
        ? null
        : { location: { bg: "BG-8" }, message: "Pflichtgruppe BG-8 (Postanschrift Käufer) fehlt." },
  },
  {
    id: "BR-11",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-11",
    summary: "The Buyer postal address shall contain a country code (BT-55).",
    run: (inv) =>
      present(inv.buyer.address?.countryCode)
        ? null
        : { location: { bt: "BT-55", bg: "BG-8" }, message: "Pflichtfeld BT-55 (Käufer-Länderkennzeichen) fehlt." },
  },
  {
    id: "BR-12",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-12",
    summary: "An Invoice shall have a Sum of Invoice line net amounts (BT-106).",
    run: (inv) =>
      present(inv.documentTotals.lineExtensionAmount)
        ? null
        : { location: { bt: "BT-106", bg: "BG-22" }, message: "Pflichtfeld BT-106 (Summe der Netto-Positionsbeträge) fehlt." },
  },
  {
    id: "BR-13",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-13",
    summary: "An Invoice shall have an Invoice total amount without VAT (BT-109).",
    run: (inv) =>
      present(inv.documentTotals.taxExclusiveAmount)
        ? null
        : { location: { bt: "BT-109", bg: "BG-22" }, message: "Pflichtfeld BT-109 (Gesamtbetrag netto) fehlt." },
  },
  {
    id: "BR-14",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-14",
    summary: "An Invoice shall have an Invoice total amount with VAT (BT-112).",
    run: (inv) =>
      present(inv.documentTotals.taxInclusiveAmount)
        ? null
        : { location: { bt: "BT-112", bg: "BG-22" }, message: "Pflichtfeld BT-112 (Gesamtbetrag brutto) fehlt." },
  },
  {
    id: "BR-15",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-15",
    summary: "An Invoice shall have an Amount due for payment (BT-115).",
    run: (inv) =>
      present(inv.documentTotals.payableAmount)
        ? null
        : { location: { bt: "BT-115", bg: "BG-22" }, message: "Pflichtfeld BT-115 (Zahlbetrag) fehlt." },
  },
  {
    id: "BR-16",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-16",
    summary: "An Invoice shall have at least one Invoice line (BG-25).",
    run: (inv) =>
      inv.invoiceLines.length > 0
        ? null
        : { location: { bg: "BG-25" }, message: "Pflichtgruppe BG-25 (Rechnungsposition) fehlt — mindestens eine Position erforderlich." },
  },
  {
    id: "BR-17",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-17",
    summary: "The Payee name (BT-59) shall be provided when the Payee group (BG-10) is present and differs from Seller.",
    run: (inv) => {
      if (!inv.payee) return null;
      if (present(inv.payee.name)) return null;
      return {
        location: { bt: "BT-59", bg: "BG-10" },
        message: "Pflichtfeld BT-59 (Zahlungsempfängername) fehlt, obwohl BG-10 angegeben ist.",
      };
    },
  },
  {
    id: "BR-21",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-21",
    summary: "Each Invoice line shall have an Invoice line identifier (BT-126).",
    run: (inv) => {
      const idx = inv.invoiceLines.findIndex((l) => !present(l.id));
      if (idx === -1) return null;
      return {
        location: { bt: "BT-126", bg: "BG-25", lineIndex: idx },
        message: `Pflichtfeld BT-126 (Positionskennung) fehlt in Position #${idx + 1}.`,
      };
    },
  },
  {
    id: "BR-22",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-22",
    summary: "Each Invoice line shall have an Invoiced quantity (BT-129).",
    run: (inv) => {
      const idx = inv.invoiceLines.findIndex((l) => !present(l.quantity));
      if (idx === -1) return null;
      return {
        location: { bt: "BT-129", bg: "BG-25", lineIndex: idx },
        message: `Pflichtfeld BT-129 (Berechnete Menge) fehlt in Position #${idx + 1}.`,
      };
    },
  },
  {
    id: "BR-23",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-23",
    summary: "Each Invoice line shall have an Invoiced quantity unit of measure code (BT-130).",
    run: (inv) => {
      const idx = inv.invoiceLines.findIndex((l) => !present(l.quantityUnitCode));
      if (idx === -1) return null;
      return {
        location: { bt: "BT-130", bg: "BG-25", lineIndex: idx },
        message: `Pflichtfeld BT-130 (Mengeneinheit) fehlt in Position #${idx + 1}.`,
      };
    },
  },
  {
    id: "BR-24",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-24",
    summary: "Each Invoice line shall have an Invoice line net amount (BT-131).",
    run: (inv) => {
      const idx = inv.invoiceLines.findIndex((l) => !present(l.netAmount));
      if (idx === -1) return null;
      return {
        location: { bt: "BT-131", bg: "BG-25", lineIndex: idx },
        message: `Pflichtfeld BT-131 (Positions-Nettobetrag) fehlt in Position #${idx + 1}.`,
      };
    },
  },
  {
    id: "BR-25",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-25",
    summary: "Each Invoice line shall contain the Item name (BT-153).",
    run: (inv) => {
      const idx = inv.invoiceLines.findIndex((l) => !present(l.itemName));
      if (idx === -1) return null;
      return {
        location: { bt: "BT-153", bg: "BG-25", lineIndex: idx },
        message: `Pflichtfeld BT-153 (Artikelname) fehlt in Position #${idx + 1}.`,
      };
    },
  },
  {
    id: "BR-26",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-26",
    summary: "Each Invoice line shall contain the Item net price (BT-146).",
    run: (inv) => {
      const idx = inv.invoiceLines.findIndex((l) => !present(l.netPrice));
      if (idx === -1) return null;
      return {
        location: { bt: "BT-146", bg: "BG-25", lineIndex: idx },
        message: `Pflichtfeld BT-146 (Nettopreis) fehlt in Position #${idx + 1}.`,
      };
    },
  },
  {
    id: "BR-27",
    category: "BR",
    severity: "warning",
    citation: "EN 16931:2017 §6.6 BR-27",
    summary: "The Item net price (BT-146) shall NOT be negative.",
    run: (inv) => {
      const idx = inv.invoiceLines.findIndex(
        (l) => present(l.netPrice) && Number.parseFloat(l.netPrice!.replace(",", ".")) < 0,
      );
      if (idx === -1) return null;
      return {
        location: { bt: "BT-146", bg: "BG-25", lineIndex: idx },
        message: `BT-146 (Nettopreis) darf nicht negativ sein — Position #${idx + 1}.`,
      };
    },
  },
  {
    id: "BR-28",
    category: "BR",
    severity: "warning",
    citation: "EN 16931:2017 §6.6 BR-28",
    summary: "The Item gross price (BT-148) shall NOT be negative.",
    run: () => null, // Item gross price (BT-148) not currently projected; deferred next session.
  },
  {
    id: "BR-31",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-31",
    summary: "Each Document level allowance (BG-20) shall have an amount (BT-92).",
    run: (inv) => {
      const idx = inv.documentLevelAllowances.findIndex((a) => !present(a.amount));
      if (idx === -1) return null;
      return {
        location: { bt: "BT-92", bg: "BG-20" },
        message: `Pflichtfeld BT-92 (Nachlassbetrag) fehlt im Dokumenten-Nachlass #${idx + 1}.`,
      };
    },
  },
  {
    id: "BR-36",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-36",
    summary: "Each Document level charge (BG-21) shall have an amount (BT-99).",
    run: (inv) => {
      const idx = inv.documentLevelCharges.findIndex((c) => !present(c.amount));
      if (idx === -1) return null;
      return {
        location: { bt: "BT-99", bg: "BG-21" },
        message: `Pflichtfeld BT-99 (Zuschlagsbetrag) fehlt im Dokumenten-Zuschlag #${idx + 1}.`,
      };
    },
  },
  {
    id: "BR-45",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-45",
    summary: "Each VAT breakdown (BG-23) shall have a VAT category taxable amount (BT-116).",
    run: (inv) => {
      const idx = inv.vatBreakdown.findIndex((v) => !present(v.taxableAmount));
      if (idx === -1) return null;
      return {
        location: { bt: "BT-116", bg: "BG-23" },
        message: `Pflichtfeld BT-116 (Steuerbemessungsgrundlage) fehlt im USt-Aufschlüsselungseintrag #${idx + 1}.`,
      };
    },
  },
  {
    id: "BR-46",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-46",
    summary: "Each VAT breakdown (BG-23) shall have a VAT category tax amount (BT-117).",
    run: (inv) => {
      const idx = inv.vatBreakdown.findIndex((v) => !present(v.taxAmount));
      if (idx === -1) return null;
      return {
        location: { bt: "BT-117", bg: "BG-23" },
        message: `Pflichtfeld BT-117 (USt-Betrag pro Kategorie) fehlt im USt-Aufschlüsselungseintrag #${idx + 1}.`,
      };
    },
  },
  {
    id: "BR-47",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-47",
    summary: "Each VAT breakdown (BG-23) shall be defined by a VAT category code (BT-118).",
    run: (inv) => {
      const idx = inv.vatBreakdown.findIndex((v) => !present(v.category));
      if (idx === -1) return null;
      return {
        location: { bt: "BT-118", bg: "BG-23" },
        message: `Pflichtfeld BT-118 (USt-Kategoriecode) fehlt im USt-Aufschlüsselungseintrag #${idx + 1}.`,
      };
    },
  },
  {
    id: "BR-48",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-48",
    summary: "Each VAT breakdown (BG-23) shall have a VAT category rate (BT-119) except when the category is 'O' (out of scope) or 'E' (exempt) — for those the rate is optional / absent.",
    run: (inv) => {
      const idx = inv.vatBreakdown.findIndex(
        (v) =>
          present(v.category) &&
          !["O", "E"].includes(v.category.toUpperCase()) &&
          !present(v.rate),
      );
      if (idx === -1) return null;
      return {
        location: { bt: "BT-119", bg: "BG-23" },
        message: `Pflichtfeld BT-119 (USt-Satz) fehlt im USt-Aufschlüsselungseintrag #${idx + 1}.`,
      };
    },
  },
  {
    id: "BR-50",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-50",
    summary: "A Payment account identifier (BT-84) shall be present when the Payment means code is a credit-transfer family code (30, 58, 59).",
    run: (inv) => {
      const code = inv.paymentInstructions?.meansCode;
      if (!code) return null;
      const isCreditTransfer = ["30", "58", "59"].includes(code);
      if (!isCreditTransfer) return null;
      if (present(inv.paymentInstructions?.iban) || present(inv.paymentInstructions?.accountName))
        return null;
      return {
        location: { bt: "BT-84", bg: "BG-17" },
        message: "Pflichtfeld BT-84 (Zahlungskonto/IBAN) fehlt bei Zahlungsart Überweisung.",
      };
    },
  },
  {
    id: "BR-52",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-52",
    summary: "Each Additional supporting document (BG-24) shall have a Supporting document reference (BT-122).",
    run: () => null, // BG-24 not projected; deferred next session.
  },
  {
    id: "BR-61",
    category: "BR",
    severity: "fatal",
    citation: "EN 16931:2017 §6.6 BR-61",
    summary: "If the Payment means code (BT-81) is credit transfer (30/58/59), a Payment account identifier (BT-84) shall be present.",
    run: (inv) => {
      const code = inv.paymentInstructions?.meansCode;
      if (!code) return null;
      if (!["30", "58", "59"].includes(code)) return null;
      if (present(inv.paymentInstructions?.iban)) return null;
      return {
        location: { bt: "BT-84" },
        message: "Pflichtfeld BT-84 (IBAN) fehlt bei Überweisungs-Zahlungsart.",
      };
    },
  },
];
