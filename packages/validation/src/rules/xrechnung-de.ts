// XRechnung CIUS — German extension rules (de-BR-*).
//
// Source: KoSIT XRechnung Schematron (xrechnung-business-rules.sch), narrowed
// to the rules every CIUS sender violates at least sometimes:
//   - de-BR-01: BT-10 (BuyerReference / Leitweg-ID) mandatory
//   - de-BR-04: Seller email present
//   - de-BR-15: CustomizationID matches one of the recognized XRechnung URNs
//
// Further de-BR-* rules (~20) cover address completeness on seller/buyer, IBAN
// well-formedness, etc. Deferred to next session — they share the structural
// "field present" / "matches regex" shape, no new rule mechanics.

import type { Rule } from "./engine.js";

const present = (s: string | undefined | null): boolean =>
  typeof s === "string" && s.trim().length > 0;

const KNOWN_XRECHNUNG_URNS: ReadonlySet<string> = new Set([
  "urn:cen.eu:en16931:2017",
  "urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0",
  "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0",
  "urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.3",
  "urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.2",
  "urn:cen.eu:en16931:2017#conformant#urn:xoev-de:kosit:extension:xrechnung_3.0",
  "urn:cen.eu:en16931:2017#conformant#urn:xeinkauf.de:kosit:extension:xrechnung_3.0",
]);

export const xrechnungDeRules: readonly Rule[] = [
  {
    id: "de-BR-01",
    category: "de-BR",
    severity: "fatal",
    citation: "XRechnung 3.0 CIUS de-BR-01",
    summary:
      "Buyer reference (BT-10, Leitweg-ID) is mandatory under XRechnung CIUS.",
    run: (inv) =>
      present(inv.buyerReference)
        ? null
        : {
            location: { bt: "BT-10" },
            message: "Pflichtfeld BT-10 (Leitweg-ID/Käuferreferenz) fehlt — unter XRechnung CIUS erforderlich.",
          },
  },
  {
    id: "de-BR-04",
    category: "de-BR",
    severity: "warning",
    citation: "XRechnung 3.0 CIUS de-BR-04",
    summary:
      "Seller electronic address (BT-34) or contact email should be present.",
    run: (inv) => {
      if (present(inv.seller.electronicAddress?.value)) return null;
      if (present(inv.seller.contact?.email)) return null;
      return {
        location: { bt: "BT-34", bg: "BG-4" },
        message:
          "BT-34 (Elektronische Adresse Verkäufer) oder Kontakt-E-Mail des Verkäufers sollte vorhanden sein.",
      };
    },
  },
  {
    id: "de-BR-15",
    category: "de-BR",
    severity: "fatal",
    citation: "XRechnung 3.0 CIUS de-BR-15",
    summary:
      "CustomizationID (BT-24) shall be one of the recognized XRechnung URNs.",
    run: (inv) => {
      if (!inv.customizationId) return null; // BR-01 catches missing.
      if (KNOWN_XRECHNUNG_URNS.has(inv.customizationId)) return null;
      // Some valid CIUS variants carry version suffixes after a `+` — accept
      // a known-prefix match as a softer guard.
      const knownPrefixMatch = Array.from(KNOWN_XRECHNUNG_URNS).some((urn) =>
        inv.customizationId.startsWith(urn),
      );
      if (knownPrefixMatch) return null;
      return {
        location: { bt: "BT-24" },
        message: "BT-24 (Spezifikationskennung) entspricht keiner bekannten XRechnung-CIUS-URN.",
      };
    },
  },
  {
    id: "de-BR-16",
    category: "de-BR",
    severity: "warning",
    citation: "XRechnung 3.0 CIUS de-BR-16",
    summary:
      "Seller postal address shall include city (BT-37) and post code (BT-38).",
    run: (inv) => {
      const a = inv.seller.address;
      if (!a) return null; // BR-08 catches missing.
      if (present(a.city) && present(a.postCode)) return null;
      return {
        location: { bt: "BT-37", bg: "BG-5" },
        message: "Verkäufer-Postanschrift sollte BT-37 (Ort) und BT-38 (Postleitzahl) enthalten.",
      };
    },
  },
];
