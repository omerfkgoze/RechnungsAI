// Profile detection: UBL vs CII vs unknown.
// Cheap regex pre-check — avoids paying the full fxp parse cost when the input
// is plainly not an e-invoice (e.g. random XML or HTML mis-typed as XML).

const UBL_ROOT_RE = /<\s*(?:[A-Za-z_][\w.-]*:)?(?:Invoice|CreditNote)\b/;
const CII_ROOT_RE = /<\s*(?:[A-Za-z_][\w.-]*:)?CrossIndustryInvoice\b/;
const UBL_NS_RE =
  /xmlns(?::[A-Za-z_][\w.-]*)?\s*=\s*["']urn:oasis:names:specification:ubl:schema:xsd:(?:Invoice|CreditNote)-2/;
const CII_NS_RE =
  /xmlns(?::[A-Za-z_][\w.-]*)?\s*=\s*["']urn:un:unece:uncefact:data:standard:CrossIndustryInvoice/;

export function detectProfile(xml: string): "ubl" | "cii" | "unknown" {
  // Scan only the first 4 KB — root element + namespace declarations live there.
  const head = xml.length > 4096 ? xml.slice(0, 4096) : xml;
  if (CII_ROOT_RE.test(head) && CII_NS_RE.test(head)) return "cii";
  if (UBL_ROOT_RE.test(head) && UBL_NS_RE.test(head)) return "ubl";
  // Fallback: root match without strict NS check (some senders omit the
  // namespace on subtype documents). Better to attempt projection than to
  // hard-reject; projection will emit STRUCT-* on real shape failures.
  if (CII_ROOT_RE.test(head)) return "cii";
  if (UBL_ROOT_RE.test(head)) return "ubl";
  return "unknown";
}
