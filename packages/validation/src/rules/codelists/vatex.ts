// CEF VATEX — VAT exemption reason code list.
//
// Used by BR-CL-22: when a VAT breakdown line carries a VAT exemption reason
// code (BT-121), that code shall be from the VATEX code list maintained by the
// EU eInvoicing project (subset of the EN/TS 16931 code lists).
//
// Practical set covering the EU-level VATEX-EU-* codes (Directive 2006/112/EC
// article references) plus the well-known national codes. Widen on demand if a
// real invoice carries a newly published VATEX code that is missing here.

export const VATEX_CODES: ReadonlySet<string> = new Set([
  "VATEX-EU-79-C",
  "VATEX-EU-132",
  "VATEX-EU-132-1A",
  "VATEX-EU-132-1B",
  "VATEX-EU-132-1C",
  "VATEX-EU-132-1D",
  "VATEX-EU-132-1E",
  "VATEX-EU-132-1F",
  "VATEX-EU-132-1G",
  "VATEX-EU-132-1H",
  "VATEX-EU-132-1I",
  "VATEX-EU-132-1J",
  "VATEX-EU-132-1K",
  "VATEX-EU-132-1L",
  "VATEX-EU-143",
  "VATEX-EU-143-1A",
  "VATEX-EU-143-1B",
  "VATEX-EU-143-1C",
  "VATEX-EU-143-1D",
  "VATEX-EU-143-1E",
  "VATEX-EU-143-1F",
  "VATEX-EU-143-1FA",
  "VATEX-EU-143-1G",
  "VATEX-EU-143-1H",
  "VATEX-EU-143-1I",
  "VATEX-EU-143-1J",
  "VATEX-EU-143-1K",
  "VATEX-EU-143-1L",
  "VATEX-EU-144",
  "VATEX-EU-146-1E",
  "VATEX-EU-148",
  "VATEX-EU-148-A",
  "VATEX-EU-148-B",
  "VATEX-EU-148-C",
  "VATEX-EU-148-D",
  "VATEX-EU-148-E",
  "VATEX-EU-148-F",
  "VATEX-EU-148-G",
  "VATEX-EU-151",
  "VATEX-EU-151-1A",
  "VATEX-EU-151-1AA",
  "VATEX-EU-151-1B",
  "VATEX-EU-151-1C",
  "VATEX-EU-151-1D",
  "VATEX-EU-151-1E",
  "VATEX-EU-159",
  "VATEX-EU-309",
  "VATEX-EU-AE",
  "VATEX-EU-D",
  "VATEX-EU-F",
  "VATEX-EU-G",
  "VATEX-EU-I",
  "VATEX-EU-IC",
  "VATEX-EU-O",
  "VATEX-EU-J",
  "VATEX-FR-FRANCHISE",
  "VATEX-FR-CNWVAT",
]);

export function isVatexCode(code: string | undefined): boolean {
  if (!code) return false;
  return VATEX_CODES.has(code.trim());
}
