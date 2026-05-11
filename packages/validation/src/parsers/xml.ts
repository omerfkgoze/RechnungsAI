// fast-xml-parser wrapper. NO business logic here.
//
// Config decisions (AC #3 — load-bearing, do NOT change without re-reading the AC):
//   - `removeNSPrefix: false` — UBL and CII share element names like `<Note>`.
//     The `cbc:` / `cac:` / `rsm:` / `ram:` namespace prefixes are the
//     disambiguation signal.
//   - `parseTagValue: false` — EN 16931 monetary values must stay as text until
//     the rule engine normalizes them. Premature `parseFloat` would mask
//     BR-CO-* arithmetic violations (rounding/precision).
//   - `ignoreAttributes: false` — `currencyID`, `unitCode`, `schemeID`, etc are
//     load-bearing for many rules (e.g. BR-CL-03 currency code on amount).
//   - `preserveOrder: false` — we project to a normalized model anyway; ordering
//     is the XSD's concern, not ours.
//
// Security: fast-xml-parser does NOT resolve external entities by default, so
// XXE / billion-laughs vectors are blocked at the parser layer (P1 §Security).
// The caller (`validateEN16931`) adds the 10 MB size guard (AC #7).

import { XMLParser } from "fast-xml-parser";

import type { RawObj } from "../types.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  preserveOrder: false,
});

export class XmlParseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "XmlParseError";
  }
}

export function parseXml(xml: string): RawObj {
  try {
    const out = parser.parse(xml);
    if (out === null || typeof out !== "object") {
      throw new XmlParseError("Parser returned non-object root");
    }
    return out as RawObj;
  } catch (err) {
    throw new XmlParseError("XML konnte nicht gelesen werden.", err);
  }
}
