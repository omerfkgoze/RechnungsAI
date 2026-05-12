// XRechnung 3.0.2 CIUS — German extension rules (BR-DE-* and BR-DEX-*).
//
// Source (vendored, local working reference, not committed):
//   docs/xrechnung-3.0.2-schematron-2.5.0/schematron/{ubl,cii}/*.sch + common.sch
//   — official KoSIT 2.5.0 / XRechnung 3.0.2 Schematron. Rule IDs + assert text
//   derived from those files. Same rule-set version string as our manifest
//   (`kosit-2.5.0`).
//
// Naming reconcile (Session 6): Sessions 1–5 shipped four lowercase `de-BR-*`
// rules; those are replaced here by their canonical `BR-DE-*` IDs matched by
// assert text:
//   de-BR-01 (BT-10 Leitweg-ID mandatory) → BR-DE-15
//   de-BR-16 (seller city + post code)     → BR-DE-3 + BR-DE-4
//   de-BR-04 (seller contact email)        → BR-DE-7 (+ BG-6 group → BR-DE-2)
//   de-BR-15 (CustomizationID URN)         → BR-DE-21
//
// 25 rules carry real predicates against the normalized Invoice model. The
// remaining 21 IDs (BR-DE-18 Skonto regex, BR-DE-20/30/31 SEPA-mandate
// specifics, BR-DE-22 embedded-document filenames, BR-DE-25-a direct-debit
// mandate group, all BR-DEX-* attached-document / sub-line / third-party-payment
// rules) cannot be expressed against the current model/parsers yet — they ship
// as typed no-op stubs (same shape, no engine churn to give them a real body
// later). See `stub()` below.

import type { Rule } from "./engine.js";
import type { Invoice } from "../types.js";

const present = (s: string | undefined | null): boolean =>
  typeof s === "string" && s.trim().length > 0;

// XRechnung specification identifiers (BT-24) — CIUS, Extension, and the CVD
// (Validator-Configuration) variant. Accept a known-prefix match too: some valid
// senders append a version segment after the canonical URN.
const XR_SPEC_IDS: ReadonlySet<string> = new Set([
  "urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0",
  "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0",
  "urn:cen.eu:en16931:2017#conformant#urn:xoev-de:kosit:extension:xrechnung_3.0",
  "urn:cen.eu:en16931:2017#conformant#urn:xeinkauf.de:kosit:extension:xrechnung_3.0",
  "urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.3",
  "urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.2",
]);

const SUPPORTED_TYPE_CODES = new Set(["326", "380", "384", "389", "381", "875", "876", "877"]);

// Payment-means type codes (BT-81, UNTDID 4461) grouped by instruction kind.
const CREDIT_TRANSFER_CODES = new Set(["30", "58"]);
const PAYMENT_CARD_CODES = new Set(["48", "54", "55"]);
const DIRECT_DEBIT_CODES = new Set(["59"]);

const sellerContact = (inv: Invoice) => inv.seller.contact;

// IBAN format + ISO 7064 mod-97-10 checksum (BR-DE-19 / BR-DE-20).
function isValidIban(raw: string | undefined | null): boolean {
  if (typeof raw !== "string") return false;
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const value = code >= 65 ? (code - 55).toString() : ch; // A→10 … Z→35
    for (const d of value) remainder = (remainder * 10 + (d.charCodeAt(0) - 48)) % 97;
  }
  return remainder === 1;
}

// Stub: typed no-op rule retained for IDs whose predicate can't be expressed
// against the current model/parsers yet. Documented per-ID in the array below.
const stub = (
  id: string,
  category: Rule["category"],
  severity: Rule["severity"],
  why: string,
): Rule => ({
  id,
  category,
  severity,
  citation: `XRechnung 3.0.2 CIUS ${id} (predicate not yet implemented: ${why})`,
  summary: `Deferred stub for ${id} — ${why}.`,
  run: () => null,
});

const realRules: Rule[] = [
  // ── Seller contact group (BG-6) ────────────────────────────────────────────
  {
    id: "BR-DE-2",
    category: "BR-DE",
    severity: "fatal",
    citation: "XRechnung 3.0.2 CIUS BR-DE-2",
    summary: "Seller contact group (BG-6) must be present.",
    run: (inv) =>
      sellerContact(inv)
        ? null
        : { location: { bg: "BG-6" }, message: 'Die Gruppe "SELLER CONTACT" (BG-6) muss übermittelt werden.' },
  },
  {
    id: "BR-DE-5",
    category: "BR-DE",
    severity: "fatal",
    citation: "XRechnung 3.0.2 CIUS BR-DE-5",
    summary: "Seller contact point name (BT-41) must be present.",
    run: (inv) =>
      present(sellerContact(inv)?.name)
        ? null
        : { location: { bt: "BT-41", bg: "BG-6" }, message: 'Das Element "Seller contact point" (BT-41) muss übermittelt werden.' },
  },
  {
    id: "BR-DE-6",
    category: "BR-DE",
    severity: "fatal",
    citation: "XRechnung 3.0.2 CIUS BR-DE-6",
    summary: "Seller contact telephone number (BT-42) must be present.",
    run: (inv) =>
      present(sellerContact(inv)?.phone)
        ? null
        : { location: { bt: "BT-42", bg: "BG-6" }, message: 'Das Element "Seller contact telephone number" (BT-42) muss übermittelt werden.' },
  },
  {
    id: "BR-DE-7",
    category: "BR-DE",
    severity: "fatal",
    citation: "XRechnung 3.0.2 CIUS BR-DE-7",
    summary: "Seller contact email address (BT-43) must be present.",
    run: (inv) =>
      present(sellerContact(inv)?.email)
        ? null
        : { location: { bt: "BT-43", bg: "BG-6" }, message: 'Das Element "Seller contact email address" (BT-43) muss übermittelt werden.' },
  },
  {
    id: "BR-DE-27",
    category: "BR-DE",
    severity: "warning",
    citation: "XRechnung 3.0.2 CIUS BR-DE-27",
    summary: "Seller telephone (BT-42) should contain at least three digits.",
    run: (inv) => {
      const phone = sellerContact(inv)?.phone;
      if (!present(phone)) return null; // BR-DE-6 catches absence.
      return (phone!.match(/\d/g) ?? []).length >= 3
        ? null
        : { location: { bt: "BT-42" }, message: "In BT-42 (Telefonnummer Verkäufer) sollen mindestens drei Ziffern enthalten sein." };
    },
  },
  {
    id: "BR-DE-28",
    category: "BR-DE",
    severity: "warning",
    citation: "XRechnung 3.0.2 CIUS BR-DE-28",
    summary:
      "Seller email (BT-43) should contain exactly one '@', flanked by ≥2 non-space/non-dot chars, no leading/trailing dot.",
    run: (inv) => {
      const email = sellerContact(inv)?.email?.trim();
      if (!present(email)) return null; // BR-DE-7 catches absence.
      const ok = /^[^@\s.](?:[^@\s]*[^@\s.])?@[^@\s.](?:[^@\s]*[^@\s.])?$/.test(email!);
      return ok
        ? null
        : { location: { bt: "BT-43" }, message: "In BT-43 (E-Mail Verkäufer) soll genau ein @-Zeichen enthalten sein, das beidseitig von mindestens zwei Zeichen flankiert wird; ein Punkt darf nicht am Anfang oder Ende stehen." };
    },
  },

  // ── Seller / buyer / delivery postal address completeness ──────────────────
  {
    id: "BR-DE-3",
    category: "BR-DE",
    severity: "fatal",
    citation: "XRechnung 3.0.2 CIUS BR-DE-3",
    summary: "Seller city (BT-37) must be present.",
    run: (inv) =>
      present(inv.seller.address?.city)
        ? null
        : { location: { bt: "BT-37", bg: "BG-5" }, message: 'Das Element "Seller city" (BT-37) muss übermittelt werden.' },
  },
  {
    id: "BR-DE-4",
    category: "BR-DE",
    severity: "fatal",
    citation: "XRechnung 3.0.2 CIUS BR-DE-4",
    summary: "Seller post code (BT-38) must be present.",
    run: (inv) =>
      present(inv.seller.address?.postCode)
        ? null
        : { location: { bt: "BT-38", bg: "BG-5" }, message: 'Das Element "Seller post code" (BT-38) muss übermittelt werden.' },
  },
  {
    id: "BR-DE-8",
    category: "BR-DE",
    severity: "fatal",
    citation: "XRechnung 3.0.2 CIUS BR-DE-8",
    summary: "Buyer city (BT-52) must be present.",
    run: (inv) =>
      present(inv.buyer.address?.city)
        ? null
        : { location: { bt: "BT-52", bg: "BG-8" }, message: 'Das Element "Buyer city" (BT-52) muss übermittelt werden.' },
  },
  {
    id: "BR-DE-9",
    category: "BR-DE",
    severity: "fatal",
    citation: "XRechnung 3.0.2 CIUS BR-DE-9",
    summary: "Buyer post code (BT-53) must be present.",
    run: (inv) =>
      present(inv.buyer.address?.postCode)
        ? null
        : { location: { bt: "BT-53", bg: "BG-8" }, message: 'Das Element "Buyer post code" (BT-53) muss übermittelt werden.' },
  },
  {
    id: "BR-DE-10",
    category: "BR-DE",
    severity: "fatal",
    citation: "XRechnung 3.0.2 CIUS BR-DE-10",
    summary: "Deliver-to city (BT-77) must be present when DELIVER TO ADDRESS (BG-15) is present.",
    run: (inv) => {
      const addr = inv.delivery?.location;
      if (!addr) return null;
      return present(addr.city)
        ? null
        : { location: { bt: "BT-77", bg: "BG-15" }, message: 'Das Element "Deliver to city" (BT-77) muss übermittelt werden, wenn die Gruppe "DELIVER TO ADDRESS" (BG-15) übermittelt wird.' };
    },
  },
  {
    id: "BR-DE-11",
    category: "BR-DE",
    severity: "fatal",
    citation: "XRechnung 3.0.2 CIUS BR-DE-11",
    summary: "Deliver-to post code (BT-78) must be present when DELIVER TO ADDRESS (BG-15) is present.",
    run: (inv) => {
      const addr = inv.delivery?.location;
      if (!addr) return null;
      return present(addr.postCode)
        ? null
        : { location: { bt: "BT-78", bg: "BG-15" }, message: 'Das Element "Deliver to post code" (BT-78) muss übermittelt werden, wenn die Gruppe "DELIVER TO ADDRESS" (BG-15) übermittelt wird.' };
    },
  },

  // ── Document-level mandates ────────────────────────────────────────────────
  {
    id: "BR-DE-1",
    category: "BR-DE",
    severity: "fatal",
    citation: "XRechnung 3.0.2 CIUS BR-DE-1",
    summary: "PAYMENT INSTRUCTIONS (BG-16) must be present.",
    run: (inv) =>
      inv.paymentInstructions
        ? null
        : { location: { bg: "BG-16" }, message: 'Eine Rechnung muss Angaben zu "PAYMENT INSTRUCTIONS" (BG-16) enthalten.' },
  },
  {
    id: "BR-DE-14",
    category: "BR-DE",
    severity: "fatal",
    citation: "XRechnung 3.0.2 CIUS BR-DE-14",
    summary: "VAT category rate (BT-119) must be present on every VAT breakdown line.",
    run: (inv) => {
      const idx = inv.vatBreakdown.findIndex((l) => !present(l.rate));
      if (idx < 0) return null;
      return {
        location: { bt: "BT-119", bg: "BG-23", lineIndex: idx },
        message: `Das Element "VAT category rate" (BT-119) muss in der Umsatzsteueraufschlüsselung #${idx + 1} übermittelt werden.`,
      };
    },
  },
  {
    id: "BR-DE-15",
    category: "BR-DE",
    severity: "fatal",
    citation: "XRechnung 3.0.2 CIUS BR-DE-15",
    summary: "Buyer reference (BT-10, Leitweg-ID) must be present.",
    run: (inv) =>
      present(inv.buyerReference)
        ? null
        : { location: { bt: "BT-10" }, message: 'Das Element "Buyer reference" (BT-10 / Leitweg-ID) muss übermittelt werden.' },
  },
  {
    id: "BR-DE-16",
    category: "BR-DE",
    severity: "fatal",
    citation: "XRechnung 3.0.2 CIUS BR-DE-16",
    summary:
      "If VAT category codes S/Z/E/AE/K/G/L/M are used, seller VAT id (BT-31) or tax registration id (BT-32) or tax representative (BG-11) must be present.",
    run: (inv) => {
      const triggered = new Set(["S", "Z", "E", "AE", "K", "G", "L", "M"]);
      const used =
        inv.vatBreakdown.some((l) => triggered.has(l.category)) ||
        inv.invoiceLines.some((l) => triggered.has(l.vatCategory)) ||
        inv.documentLevelAllowances.some((a) => a.vatCategory && triggered.has(a.vatCategory)) ||
        inv.documentLevelCharges.some((a) => a.vatCategory && triggered.has(a.vatCategory));
      if (!used) return null;
      if (present(inv.seller.vatId) || present(inv.seller.taxRegId) || inv.taxRepresentative) return null;
      return {
        location: { bt: "BT-31", bg: "BG-11" },
        message:
          'Bei Verwendung der Steuercodes S, Z, E, AE, K, G, L oder M muss "Seller VAT identifier" (BT-31), "Seller tax registration identifier" (BT-32) oder "SELLER TAX REPRESENTATIVE PARTY" (BG-11) übermittelt werden.',
      };
    },
  },
  {
    id: "BR-DE-17",
    category: "BR-DE",
    severity: "warning",
    citation: "XRechnung 3.0.2 CIUS BR-DE-17",
    summary: "Invoice type code (BT-3) should be one of UNTDID 1001 codes 326/380/384/389/381/875/876/877.",
    run: (inv) => {
      if (!present(inv.typeCode)) return null; // BR-01 / structural catches absence.
      return SUPPORTED_TYPE_CODES.has(inv.typeCode!.trim())
        ? null
        : { location: { bt: "BT-3" }, message: 'Mit dem Element "Invoice type code" (BT-3) sollen nur die Codes 326, 380, 384, 389, 381, 875, 876, 877 (UNTDID 1001) übermittelt werden.' };
    },
  },
  {
    id: "BR-DE-21",
    category: "BR-DE",
    severity: "warning",
    citation: "XRechnung 3.0.2 CIUS BR-DE-21",
    summary: "Specification identifier (BT-24) should match the XRechnung standard identifier.",
    run: (inv) => {
      const id = inv.customizationId;
      if (!id) return null; // BR-01 catches missing.
      if (XR_SPEC_IDS.has(id)) return null;
      if (Array.from(XR_SPEC_IDS).some((u) => id.startsWith(u))) return null;
      return { location: { bt: "BT-24" }, message: 'Das Element "Specification identifier" (BT-24) soll der Kennung des Standards XRechnung entsprechen.' };
    },
  },
  {
    id: "BR-DE-26",
    category: "BR-DE",
    severity: "warning",
    citation: "XRechnung 3.0.2 CIUS BR-DE-26",
    summary:
      "If invoice type code (BT-3) is 384 (corrected invoice), PRECEDING INVOICE REFERENCE (BG-3) should be present at least once.",
    run: (inv) => {
      if (inv.typeCode?.trim() !== "384") return null;
      return inv.precedingInvoiceRefs && inv.precedingInvoiceRefs.length > 0
        ? null
        : { location: { bg: "BG-3", bt: "BT-3" }, message: 'Bei Code 384 (Corrected invoice) in BT-3 soll "PRECEDING INVOICE REFERENCE" (BG-3) mindestens einmal vorhanden sein.' };
    },
  },

  // ── Payment-means consistency (BT-81 ↔ BG-17/BG-18/BG-19) ──────────────────
  {
    id: "BR-DE-19",
    category: "BR-DE",
    severity: "warning",
    citation: "XRechnung 3.0.2 CIUS BR-DE-19",
    summary: "Payment account identifier (BT-84) should be a valid IBAN when BT-81 = 58 (SEPA credit transfer).",
    run: (inv) => {
      const pi = inv.paymentInstructions;
      if (!pi || pi.meansCode?.trim() !== "58") return null;
      if (!present(pi.iban)) return null; // absence is BR-DE-23-a territory.
      return isValidIban(pi.iban)
        ? null
        : { location: { bt: "BT-84", bg: "BG-17" }, message: '"Payment account identifier" (BT-84) soll eine gültige IBAN enthalten, wenn in BT-81 der Code 58 (SEPA) verwendet wird.' };
    },
  },
  {
    id: "BR-DE-23-a",
    category: "BR-DE",
    severity: "fatal",
    citation: "XRechnung 3.0.2 CIUS BR-DE-23-a",
    summary: "If BT-81 is a credit-transfer code (30, 58), CREDIT TRANSFER (BG-17) must be present.",
    run: (inv) => {
      const pi = inv.paymentInstructions;
      if (!pi || !pi.meansCode || !CREDIT_TRANSFER_CODES.has(pi.meansCode.trim())) return null;
      return present(pi.iban) || present(pi.accountName)
        ? null
        : { location: { bg: "BG-17", bt: "BT-81" }, message: 'Bei einem Überweisungs-Code (30, 58) in BT-81 muss "CREDIT TRANSFER" (BG-17) übermittelt werden.' };
    },
  },
  {
    id: "BR-DE-23-b",
    category: "BR-DE",
    severity: "fatal",
    citation: "XRechnung 3.0.2 CIUS BR-DE-23-b",
    summary: "If BT-81 is a credit-transfer code (30, 58), PAYMENT CARD INFORMATION (BG-18) and DIRECT DEBIT (BG-19) must not be present.",
    run: (inv) => {
      const pi = inv.paymentInstructions;
      if (!pi || !pi.meansCode || !CREDIT_TRANSFER_CODES.has(pi.meansCode.trim())) return null;
      return present(pi.cardNumber)
        ? { location: { bg: "BG-18", bt: "BT-81" }, message: 'Bei einem Überweisungs-Code (30, 58) in BT-81 dürfen "PAYMENT CARD INFORMATION" (BG-18) und "DIRECT DEBIT" (BG-19) nicht übermittelt werden.' }
        : null;
    },
  },
  {
    id: "BR-DE-24-a",
    category: "BR-DE",
    severity: "fatal",
    citation: "XRechnung 3.0.2 CIUS BR-DE-24-a",
    summary: "If BT-81 is a payment-card code (48, 54, 55), PAYMENT CARD INFORMATION (BG-18) must be present.",
    run: (inv) => {
      const pi = inv.paymentInstructions;
      if (!pi || !pi.meansCode || !PAYMENT_CARD_CODES.has(pi.meansCode.trim())) return null;
      return present(pi.cardNumber)
        ? null
        : { location: { bg: "BG-18", bt: "BT-81" }, message: 'Bei einem Kartenzahlungs-Code (48, 54, 55) in BT-81 muss "PAYMENT CARD INFORMATION" (BG-18) übermittelt werden.' };
    },
  },
  {
    id: "BR-DE-24-b",
    category: "BR-DE",
    severity: "fatal",
    citation: "XRechnung 3.0.2 CIUS BR-DE-24-b",
    summary: "If BT-81 is a payment-card code (48, 54, 55), CREDIT TRANSFER (BG-17) and DIRECT DEBIT (BG-19) must not be present.",
    run: (inv) => {
      const pi = inv.paymentInstructions;
      if (!pi || !pi.meansCode || !PAYMENT_CARD_CODES.has(pi.meansCode.trim())) return null;
      return present(pi.iban)
        ? { location: { bg: "BG-17", bt: "BT-81" }, message: 'Bei einem Kartenzahlungs-Code (48, 54, 55) in BT-81 dürfen "CREDIT TRANSFER" (BG-17) und "DIRECT DEBIT" (BG-19) nicht übermittelt werden.' }
        : null;
    },
  },
  {
    id: "BR-DE-25-b",
    category: "BR-DE",
    severity: "fatal",
    citation: "XRechnung 3.0.2 CIUS BR-DE-25-b",
    summary: "If BT-81 is a direct-debit code (59), CREDIT TRANSFER (BG-17) and PAYMENT CARD INFORMATION (BG-18) must not be present.",
    run: (inv) => {
      const pi = inv.paymentInstructions;
      if (!pi || !pi.meansCode || !DIRECT_DEBIT_CODES.has(pi.meansCode.trim())) return null;
      return present(pi.iban) || present(pi.cardNumber)
        ? { location: { bg: "BG-17", bt: "BT-81" }, message: 'Bei einem Lastschrift-Code (59) in BT-81 dürfen "CREDIT TRANSFER" (BG-17) und "PAYMENT CARD INFORMATION" (BG-18) nicht übermittelt werden.' }
        : null;
    },
  },
];

const stubRules: Rule[] = [
  stub("BR-DE-18", "BR-DE", "fatal", "Skonto payment-terms (BT-20) free-text micro-syntax not modeled"),
  stub("BR-DE-20", "BR-DE", "warning", "debited-account IBAN (BT-91) not in the normalized payment model"),
  stub("BR-DE-22", "BR-DE", "fatal", "embedded-document filename attributes (BT-125) not modeled"),
  stub("BR-DE-25-a", "BR-DE", "fatal", "DIRECT DEBIT mandate group (BG-19) not modeled"),
  stub("BR-DE-30", "BR-DE", "fatal", "bank-assigned creditor identifier (BT-90) not modeled"),
  stub("BR-DE-31", "BR-DE", "fatal", "debited-account identifier (BT-91) not modeled"),
  stub("BR-DEX-01", "BR-DEX", "fatal", "attached-document MIME codes (BT-125) not modeled"),
  stub("BR-DEX-02", "BR-DEX", "warning", "sub invoice lines (BG-DEX-01) not modeled"),
  stub("BR-DEX-03", "BR-DEX", "fatal", "sub invoice lines (BG-DEX-01) not modeled"),
  stub("BR-DEX-04", "BR-DEX", "fatal", "party-identification scheme id (ISO 6523 ICD) not surfaced on every BG"),
  stub("BR-DEX-05", "BR-DEX", "fatal", "scheme id (ISO 6523 ICD) not surfaced on this element"),
  stub("BR-DEX-06", "BR-DEX", "fatal", "scheme id (ISO 6523 ICD) not surfaced on this element"),
  stub("BR-DEX-07", "BR-DEX", "fatal", "endpoint EAS code list not vendored"),
  stub("BR-DEX-08", "BR-DEX", "fatal", "delivery-location scheme id (ISO 6523 ICD) not surfaced"),
  stub("BR-DEX-09", "BR-DEX", "fatal", "third-party payment amounts (BG-DEX-09) not modeled"),
  stub("BR-DEX-10", "BR-DEX", "fatal", "third-party payment group (BG-DEX-09) not modeled"),
  stub("BR-DEX-11", "BR-DEX", "fatal", "third-party payment group (BG-DEX-09) not modeled"),
  stub("BR-DEX-12", "BR-DEX", "fatal", "third-party payment group (BG-DEX-09) not modeled"),
  stub("BR-DEX-13", "BR-DEX", "fatal", "third-party payment group (BG-DEX-09) not modeled"),
  stub("BR-DEX-14", "BR-DEX", "fatal", "third-party payment group (BG-DEX-09) not modeled"),
  stub("BR-DEX-15", "BR-DEX", "warning", "CII sub invoice lines (ParentLineID) not modeled"),
];

export const xrechnungDeRules: readonly Rule[] = [...realRules, ...stubRules];
