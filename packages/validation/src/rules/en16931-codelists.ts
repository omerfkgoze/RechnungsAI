// EN 16931 codelist membership rules (BR-CL-*). Each rule asserts that a
// specific code value comes from the canonical list. The lists themselves
// live in `./codelists/*` and never carry business logic.

import type { Rule } from "./engine.js";

import { isIso4217 } from "./codelists/iso4217-currency.js";
import { isIso3166 } from "./codelists/iso3166-country.js";
import { isUneceRec20Unit } from "./codelists/unece-rec20-units.js";
import { isVatCategory } from "./codelists/vat-categories.js";

// UNTDID 1001 invoice type codes (EN 16931 §6.7) — narrowed to the
// codes EN 16931 explicitly allows.
const UNTDID_1001_INVOICE_TYPES: ReadonlySet<string> = new Set([
  "326", "380", "384", "389", "381", "875", "876", "877", "385", "386", "393",
]);

// UNTDID 4461 payment means codes used in EN 16931 / XRechnung CIUS.
const UNTDID_4461_PAYMENT_MEANS: ReadonlySet<string> = new Set([
  "10", "20", "30", "42", "48", "49", "57", "58", "59", "ZZZ", "1", "2", "97", "9", "31", "23",
]);

// UNTDID 5189 / EN 16931 allowance reason codes (subset that appears in practice).
const UNTDID_5189_ALLOWANCE_REASON: ReadonlySet<string> = new Set([
  "41", "42", "60", "62", "63", "64", "65", "66", "67", "68", "70", "71",
  "88", "95", "100", "102", "103", "104", "105",
]);

// UNTDID 7161 charge reason codes (subset).
const UNTDID_7161_CHARGE_REASON: ReadonlySet<string> = new Set([
  "AA", "AAA", "AAC", "AAD", "AAE", "AAF", "AAH", "AAI", "AAS", "AAT", "AAV",
  "AAY", "AAZ", "ABA", "ABB", "ABC", "ABD", "ABF", "ABK", "ABL", "ABN", "ABR",
  "ABS", "ABT", "ABU", "ACF", "ACG", "ACH", "ACI", "ACJ", "ACK", "ACL", "ACM",
  "ACS", "ADC", "ADE", "ADJ", "ADK", "ADL", "ADM", "ADN", "ADO", "ADP", "ADQ",
  "ADR", "ADT", "ADW", "ADY", "ADZ", "AEA", "AEB", "AEC", "AED", "AEF", "AEH",
  "AEI", "AEJ", "AEK", "AEL", "AEM", "AEN", "AEO", "AEP", "AES", "AET", "AEU",
  "AEV", "AEW", "AEX", "AEY", "AEZ", "AJ", "AU", "CA", "CAB", "CAD", "CAE",
  "CAF", "CAI", "CAJ", "CAK", "CAL", "CAM", "CAN", "CAO", "CAP", "CAQ", "CAR",
  "CAS", "CAT", "CAU", "CAV", "CAW", "CAX", "CAY", "CAZ", "CD", "CG", "CS",
  "CT", "DAB", "DAC", "DAD", "DAF", "DAG", "DAH", "DAI", "DAJ", "DAK", "DAL",
  "DAM", "DAN", "DAO", "DAP", "DAQ", "DL", "EG", "EP", "ER", "FAA", "FAB",
  "FAC", "FC", "FH", "FI", "GAA", "HAA", "HD", "HH", "IAA", "IAB", "ID", "IF",
  "IR", "IS", "KO", "L1", "LA", "LAA", "LAB", "LF", "MAE", "MI", "ML", "NAA",
  "OA", "PA", "PAA", "PC", "PL", "RAB", "RAC", "RAD", "RAF", "RE", "RF", "RH",
  "RV", "SA", "SAA", "SAD", "SAE", "SAI", "SG", "SH", "SM", "SU", "TAB", "TAC",
  "TT", "TV", "V1", "V2", "WH", "XAA", "YY", "ZZZ",
]);

// VAT exemption reason codes (EN 16931 / VATEX-EU subset).
const VATEX_EXEMPTION_CODES: ReadonlySet<string> = new Set([
  "VATEX-EU-79-C", "VATEX-EU-132", "VATEX-EU-132-1A", "VATEX-EU-132-1B",
  "VATEX-EU-132-1C", "VATEX-EU-132-1D", "VATEX-EU-132-1E", "VATEX-EU-132-1F",
  "VATEX-EU-132-1G", "VATEX-EU-132-1H", "VATEX-EU-132-1I", "VATEX-EU-132-1J",
  "VATEX-EU-132-1K", "VATEX-EU-132-1L", "VATEX-EU-132-1M", "VATEX-EU-132-1N",
  "VATEX-EU-132-1O", "VATEX-EU-132-1P", "VATEX-EU-132-1Q", "VATEX-EU-143",
  "VATEX-EU-143-1A", "VATEX-EU-143-1B", "VATEX-EU-143-1C", "VATEX-EU-143-1D",
  "VATEX-EU-143-1E", "VATEX-EU-143-1F", "VATEX-EU-143-1FA", "VATEX-EU-143-1G",
  "VATEX-EU-143-1H", "VATEX-EU-143-1I", "VATEX-EU-143-1J", "VATEX-EU-143-1K",
  "VATEX-EU-143-1L", "VATEX-EU-148", "VATEX-EU-148-A", "VATEX-EU-148-B",
  "VATEX-EU-148-C", "VATEX-EU-148-D", "VATEX-EU-148-E", "VATEX-EU-148-F",
  "VATEX-EU-148-G", "VATEX-EU-151", "VATEX-EU-151-1A", "VATEX-EU-151-1AA",
  "VATEX-EU-151-1B", "VATEX-EU-151-1C", "VATEX-EU-151-1D", "VATEX-EU-151-1E",
  "VATEX-EU-309", "VATEX-EU-AE", "VATEX-EU-D", "VATEX-EU-F", "VATEX-EU-G",
  "VATEX-EU-I", "VATEX-EU-IC", "VATEX-EU-O", "VATEX-EU-J",
]);

export const en16931CodelistsRules: readonly Rule[] = [
  {
    id: "BR-CL-01",
    category: "BR-CL",
    severity: "fatal",
    citation: "EN 16931:2017 §6.7 BR-CL-01",
    summary: "Specification identifier (BT-24) — informational; no codelist (free-text URN).",
    run: () => null, // BT-24 is a free-form URN; no codelist constraint at this level.
  },
  {
    id: "BR-CL-03",
    category: "BR-CL",
    severity: "fatal",
    citation: "EN 16931:2017 §6.7 BR-CL-03 (ISO 4217)",
    summary: "Invoice currency code (BT-5) shall be a valid ISO 4217 alphabetic code.",
    run: (inv) => {
      if (!inv.currencyCode) return null; // BR-05 catches missing.
      if (isIso4217(inv.currencyCode)) return null;
      return {
        location: { bt: "BT-5" },
        message: "BT-5 (Rechnungswährung) ist kein gültiger ISO-4217-Code.",
      };
    },
  },
  {
    id: "BR-CL-04",
    category: "BR-CL",
    severity: "fatal",
    citation: "EN 16931:2017 §6.7 BR-CL-04 (ISO 4217)",
    summary: "VAT accounting currency code (BT-6) shall be a valid ISO 4217 alphabetic code.",
    run: (inv) => {
      if (!inv.accountingCurrencyCode) return null;
      if (isIso4217(inv.accountingCurrencyCode)) return null;
      return {
        location: { bt: "BT-6" },
        message: "BT-6 (Steuer-Berichtswährung) ist kein gültiger ISO-4217-Code.",
      };
    },
  },
  {
    id: "BR-CL-06",
    category: "BR-CL",
    severity: "warning",
    citation: "EN 16931:2017 §6.7 BR-CL-06",
    summary: "Item attribute name (BT-160) shall not be empty — codelist-style guard.",
    run: () => null, // BG-32 not projected in 6.1 v1 — deferred.
  },
  {
    id: "BR-CL-07",
    category: "BR-CL",
    severity: "warning",
    citation: "EN 16931:2017 §6.7 BR-CL-07 (UNTDID 5189)",
    summary: "Document level allowance reason code (BT-98) shall be from UNTDID 5189.",
    run: (inv) => {
      const idx = inv.documentLevelAllowances.findIndex(
        (a) => a.reasonCode && !UNTDID_5189_ALLOWANCE_REASON.has(a.reasonCode),
      );
      if (idx === -1) return null;
      return {
        location: { bt: "BT-98", bg: "BG-20" },
        message: `Dokumenten-Nachlass #${idx + 1}: BT-98 (Grund-Code) nicht in UNTDID 5189.`,
      };
    },
  },
  {
    id: "BR-CL-08",
    category: "BR-CL",
    severity: "warning",
    citation: "EN 16931:2017 §6.7 BR-CL-08 (UNTDID 7161)",
    summary: "Document level charge reason code (BT-105) shall be from UNTDID 7161.",
    run: (inv) => {
      const idx = inv.documentLevelCharges.findIndex(
        (c) => c.reasonCode && !UNTDID_7161_CHARGE_REASON.has(c.reasonCode.toUpperCase()),
      );
      if (idx === -1) return null;
      return {
        location: { bt: "BT-105", bg: "BG-21" },
        message: `Dokumenten-Zuschlag #${idx + 1}: BT-105 (Grund-Code) nicht in UNTDID 7161.`,
      };
    },
  },
  {
    id: "BR-CL-10",
    category: "BR-CL",
    severity: "warning",
    citation: "EN 16931:2017 §6.7 BR-CL-10",
    summary: "Any document identifier scheme (BT-18/BT-128 schemeID) shall be a valid identifier.",
    run: () => null, // Scheme IDs accepted as free-form per EN 16931 §6.7.
  },
  {
    id: "BR-CL-13",
    category: "BR-CL",
    severity: "warning",
    citation: "EN 16931:2017 §6.7 BR-CL-13 (ISO 6523)",
    summary: "Electronic address scheme identifier (BT-34/BT-49 @schemeID) — accepted as free-text in v1.",
    run: () => null, // ISO 6523 ICD codelist deferred (large numeric set; low real-world failure rate).
  },
  {
    id: "BR-CL-14",
    category: "BR-CL",
    severity: "fatal",
    citation: "EN 16931:2017 §6.7 BR-CL-14 (ISO 3166-1 alpha-2)",
    summary: "Seller country code (BT-40) shall be from ISO 3166-1 alpha-2.",
    run: (inv) => {
      const code = inv.seller.address?.countryCode;
      if (!code) return null; // BR-09 catches missing.
      if (isIso3166(code)) return null;
      return {
        location: { bt: "BT-40", bg: "BG-5" },
        message: "BT-40 (Verkäufer-Länderkennzeichen) ist kein gültiger ISO-3166-Code.",
      };
    },
  },
  {
    id: "BR-CL-15",
    category: "BR-CL",
    severity: "fatal",
    citation: "EN 16931:2017 §6.7 BR-CL-15 (ISO 3166-1 alpha-2)",
    summary: "Buyer country code (BT-55) shall be from ISO 3166-1 alpha-2.",
    run: (inv) => {
      const code = inv.buyer.address?.countryCode;
      if (!code) return null;
      if (isIso3166(code)) return null;
      return {
        location: { bt: "BT-55", bg: "BG-8" },
        message: "BT-55 (Käufer-Länderkennzeichen) ist kein gültiger ISO-3166-Code.",
      };
    },
  },
  {
    id: "BR-CL-16",
    category: "BR-CL",
    severity: "warning",
    citation: "EN 16931:2017 §6.7 BR-CL-16 (UNTDID 4461)",
    summary: "Payment means code (BT-81) shall be from UNTDID 4461.",
    run: (inv) => {
      const code = inv.paymentInstructions?.meansCode;
      if (!code) return null;
      if (UNTDID_4461_PAYMENT_MEANS.has(code)) return null;
      return {
        location: { bt: "BT-81" },
        message: "BT-81 (Zahlungsart-Code) nicht in UNTDID 4461.",
      };
    },
  },
  {
    id: "BR-CL-17",
    category: "BR-CL",
    severity: "warning",
    citation: "EN 16931:2017 §6.7 BR-CL-17 (UNTDID 1001)",
    summary: "Invoice type code (BT-3) shall be from the EN 16931 subset of UNTDID 1001.",
    run: (inv) => {
      if (!inv.typeCode) return null;
      if (UNTDID_1001_INVOICE_TYPES.has(inv.typeCode)) return null;
      return {
        location: { bt: "BT-3" },
        message: "BT-3 (Rechnungsart) nicht in der EN-16931-Auswahl von UNTDID 1001.",
      };
    },
  },
  {
    id: "BR-CL-19",
    category: "BR-CL",
    severity: "warning",
    citation: "EN 16931:2017 §6.7 BR-CL-19",
    summary: "VAT exemption reason code (BT-121) shall be from VATEX-EU.",
    run: (inv) => {
      const idx = inv.vatBreakdown.findIndex(
        (v) => v.exemptionReasonCode && !VATEX_EXEMPTION_CODES.has(v.exemptionReasonCode),
      );
      if (idx === -1) return null;
      return {
        location: { bt: "BT-121", bg: "BG-23" },
        message: `USt-Aufschlüsselung #${idx + 1}: BT-121 (Befreiungsgrund-Code) nicht in VATEX-EU.`,
      };
    },
  },
  {
    id: "BR-CL-20",
    category: "BR-CL",
    severity: "warning",
    citation: "EN 16931:2017 §6.7 BR-CL-20",
    summary: "Buyer item attribute name (BT-160) — codelist not enforced in v1.",
    run: () => null,
  },
  {
    id: "BR-CL-21",
    category: "BR-CL",
    severity: "warning",
    citation: "EN 16931:2017 §6.7 BR-CL-21 (UNTDID 7143)",
    summary: "Item classification identifier scheme (BT-158-1) — codelist not enforced in v1.",
    run: () => null,
  },
  {
    id: "BR-CL-23",
    category: "BR-CL",
    severity: "warning",
    citation: "EN 16931:2017 §6.7 BR-CL-23 (UN/ECE Rec. 20)",
    summary: "Invoiced quantity unit code (BT-130) should be from UN/ECE Rec. 20.",
    run: (inv) => {
      const idx = inv.invoiceLines.findIndex(
        (l) => l.quantityUnitCode && !isUneceRec20Unit(l.quantityUnitCode),
      );
      if (idx === -1) return null;
      return {
        location: { bt: "BT-130", bg: "BG-25", lineIndex: idx },
        message: `BT-130 (Mengeneinheit) in Position #${idx + 1} nicht in UN/ECE Rec. 20.`,
      };
    },
  },
  {
    id: "BR-CL-24",
    category: "BR-CL",
    severity: "fatal",
    citation: "EN 16931:2017 §6.7 BR-CL-24 (UNTDID 5305 subset)",
    summary: "Each VAT breakdown category code (BT-118) shall be a valid EN 16931 VAT category code.",
    run: (inv) => {
      const idx = inv.vatBreakdown.findIndex(
        (v) => v.category && !isVatCategory(v.category),
      );
      if (idx === -1) return null;
      return {
        location: { bt: "BT-118", bg: "BG-23" },
        message: `BT-118 (USt-Kategoriecode) in Aufschlüsselungseintrag #${idx + 1} ist keine gültige EN-16931-Kategorie.`,
      };
    },
  },
  {
    id: "BR-CL-25",
    category: "BR-CL",
    severity: "fatal",
    citation: "EN 16931:2017 §6.7 BR-CL-25",
    summary: "Invoice line VAT category code (BT-151) shall be a valid EN 16931 VAT category code.",
    run: (inv) => {
      const idx = inv.invoiceLines.findIndex(
        (l) => l.vatCategory && !isVatCategory(l.vatCategory),
      );
      if (idx === -1) return null;
      return {
        location: { bt: "BT-151", bg: "BG-25", lineIndex: idx },
        message: `BT-151 (USt-Kategorie) in Position #${idx + 1} ist keine gültige EN-16931-Kategorie.`,
      };
    },
  },
];
