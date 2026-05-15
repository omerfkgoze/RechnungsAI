// EN 16931 codelist rules that depend on externally-vendored code sets:
//   - BR-CL-11 — company legal registration scheme id (BT-30-1 / BT-47-1) ⊂ ISO/IEC 6523 ICD
//   - BR-CL-22 — VAT exemption reason code (BT-121)               ⊂ CEF VATEX
//   - BR-CL-26 — deliver-to location identifier scheme id (BT-71-1) ⊂ ISO/IEC 6523 ICD
//
// These were the last three no-op stubs in en16931-deferred.ts; converted in
// Story 6.1 Session 5 once the ISO 6523 ICD + VATEX code sets were vendored
// under rules/codelists/. The Invoice model gained `Party.legalRegSchemeId`
// (BT-30-1 / BT-47-1) — populated by parsers/{ubl,cii}.ts — so the BR-CL-11
// predicate can see the scheme id.

import type { Rule } from "./engine.js";
import { isIso6523Icd } from "./codelists/iso6523-icd.js";
import { isVatexCode } from "./codelists/vatex.js";

export const en16931CodelistsExtraRules: readonly Rule[] = [
  {
    id: "BR-CL-11",
    category: "BR-CL",
    severity: "fatal",
    citation: "EN 16931:2017 §6.7 BR-CL-11 (ISO/IEC 6523 ICD subset)",
    summary:
      "The Seller/Buyer legal registration identifier scheme id (BT-30-1 / BT-47-1), when present, shall be from the ISO/IEC 6523 ICD list.",
    run: (inv) => {
      const sellerScheme = inv.seller.legalRegSchemeId;
      if (sellerScheme && !isIso6523Icd(sellerScheme)) {
        return {
          location: { bt: "BT-30-1", bg: "BG-4" },
          message: "BT-30-1 (Schema-Kennung der Verkäufer-Registernummer) ist kein gültiger ISO/IEC-6523-ICD-Code.",
        };
      }
      const buyerScheme = inv.buyer.legalRegSchemeId;
      if (buyerScheme && !isIso6523Icd(buyerScheme)) {
        return {
          location: { bt: "BT-47-1", bg: "BG-7" },
          message: "BT-47-1 (Schema-Kennung der Käufer-Registernummer) ist kein gültiger ISO/IEC-6523-ICD-Code.",
        };
      }
      return null;
    },
  },
  {
    id: "BR-CL-22",
    category: "BR-CL",
    severity: "fatal",
    citation: "EN 16931:2017 §6.7 BR-CL-22 (VATEX subset)",
    summary:
      "Each VAT breakdown VAT exemption reason code (BT-121), when present, shall be from the CEF VATEX code list.",
    run: (inv) => {
      const idx = inv.vatBreakdown.findIndex(
        (v) => v.exemptionReasonCode && !isVatexCode(v.exemptionReasonCode),
      );
      if (idx === -1) return null;
      return {
        location: { bt: "BT-121", bg: "BG-23" },
        message: `BT-121 (Code des USt-Befreiungsgrunds) in Aufschlüsselungseintrag #${idx + 1} ist kein gültiger VATEX-Code.`,
      };
    },
  },
  {
    id: "BR-CL-26",
    category: "BR-CL",
    severity: "fatal",
    citation: "EN 16931:2017 §6.7 BR-CL-26 (ISO/IEC 6523 ICD subset)",
    summary:
      "The Deliver-to location identifier scheme id (BT-71-1), when present, shall be from the ISO/IEC 6523 ICD list.",
    run: (inv) => {
      const scheme = inv.delivery?.locationId?.schemeId;
      if (!scheme || isIso6523Icd(scheme)) return null;
      return {
        location: { bt: "BT-71-1", bg: "BG-13" },
        message: "BT-71-1 (Schema-Kennung der Lieferort-Kennung) ist kein gültiger ISO/IEC-6523-ICD-Code.",
      };
    },
  },
];
