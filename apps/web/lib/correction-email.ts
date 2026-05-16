// Builds the `mailto:` URL for the supplier-correction request (Story 6.2).
// Mirrors `buildSteuerberaterMailto` in `./datev-export.ts` (precedent for
// React 19 mailto-as-link pattern). Body uses German formal "Sie".
//
// Truncates violation lists to the top 15 entries sorted by severity then
// ruleId so the encoded body stays under the practical RFC 6068 ~2000-char
// budget (P3 spike §"Known Limitations Accepted").

export type CorrectionViolation = {
  ruleId: string;
  severity: string;
  message: string;
};

const MAX_VIOLATIONS = 15;

const SEVERITY_RANK: Record<string, number> = {
  fatal: 0,
  error: 1,
  warning: 2,
};

// Lenient supplier-email shape check. Mirrors the regex posture on
// tenants.steuerberater_email at the migration layer. Rejected addresses
// fall back to a no-recipient mailto so the user can paste the address
// in their mail client.
const EMAIL_SHAPE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function isValidYmd(y: number, m: number, d: number): boolean {
  return y >= 1900 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

// Returns a German `TT.MM.JJJJ` date or `null` when the input cannot be
// parsed. The detail page passes `invoice_data.invoice_date.value` raw (no
// Zod parse on the read path — see page.tsx), so the value may be a bare ISO
// date, a full ISO datetime (`2026-05-16T00:00:00Z`), an already-German
// `TT.MM.JJJJ` string, or AI garbage. Never reformat unparseable input into a
// plausible-looking date that gets emailed to the supplier.
function isoToGermanDay(iso: string): string | null {
  const trimmed = iso.trim();
  const de = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed);
  if (de) {
    const d = de[1]!;
    const m = de[2]!;
    const y = de[3]!;
    return isValidYmd(+y, +m, +d) ? `${d}.${m}.${y}` : null;
  }
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)/.exec(trimmed);
  if (isoMatch) {
    const y = isoMatch[1]!;
    const m = isoMatch[2]!;
    const d = isoMatch[3]!;
    return isValidYmd(+y, +m, +d) ? `${d}.${m}.${y}` : null;
  }
  return null;
}

function sanitizeRecipient(email: string | null): string {
  if (!email) return "";
  return EMAIL_SHAPE.test(email) ? email : "";
}

function sortViolations(
  violations: ReadonlyArray<CorrectionViolation>,
): CorrectionViolation[] {
  return [...violations].sort((a, b) => {
    const rankA = SEVERITY_RANK[a.severity] ?? 99;
    const rankB = SEVERITY_RANK[b.severity] ?? 99;
    if (rankA !== rankB) return rankA - rankB;
    return a.ruleId.localeCompare(b.ruleId);
  });
}

export function buildCorrectionMailto(args: {
  supplierEmail: string | null;
  invoiceNumber: string | null;
  invoiceDateIso: string | null;
  supplierName: string | null;
  violations: ReadonlyArray<CorrectionViolation>;
  tenantCompanyName: string;
}): string {
  const {
    supplierEmail,
    invoiceNumber,
    invoiceDateIso,
    violations,
    tenantCompanyName,
  } = args;

  const invoiceNumberLabel = invoiceNumber ?? "[Rechnungsnummer unbekannt]";
  const formattedDate = invoiceDateIso ? isoToGermanDay(invoiceDateIso) : null;
  const invoiceDateLabel = formattedDate ?? "[Datum unbekannt]";

  const subjectSegments = ["Korrekturanfrage Rechnung"];
  if (invoiceNumber) subjectSegments.push(invoiceNumber);
  if (formattedDate) subjectSegments.push(`vom ${formattedDate}`);
  const subject = subjectSegments.join(" ");

  const sorted = sortViolations(violations);
  const truncated = sorted.length > MAX_VIOLATIONS;
  const shown = truncated ? sorted.slice(0, MAX_VIOLATIONS) : sorted;

  const violationLines = shown.length === 0
    ? ["- Die Rechnung erfüllt nicht das EN 16931-Format."]
    : shown.map((v) => `- ${v.message} (${v.ruleId})`);
  if (truncated) {
    violationLines.push(
      `- … sowie ${sorted.length - MAX_VIOLATIONS} weitere Punkte (vollständige Liste in der App).`,
    );
  }

  const signature = tenantCompanyName.trim().length > 0
    ? tenantCompanyName
    : "[Firmenname]";

  const body =
    `Sehr geehrte Damen und Herren,\n\n` +
    `bei der Prüfung Ihrer Rechnung ${invoiceNumberLabel} vom ${invoiceDateLabel} sind folgende Abweichungen gegenüber der EN 16931 (E-Rechnung) festgestellt worden:\n\n` +
    `${violationLines.join("\n")}\n\n` +
    `Bitte senden Sie uns eine korrigierte Rechnung im konformen XRechnung- oder ZUGFeRD-Format zu.\n\n` +
    `Mit freundlichen Grüßen,\n` +
    `${signature}`;

  const recipient = sanitizeRecipient(supplierEmail);
  return `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
