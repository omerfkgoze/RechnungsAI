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

function isoToGermanDay(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  return `${d}.${m}.${y}`;
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
  const invoiceDateLabel = invoiceDateIso
    ? isoToGermanDay(invoiceDateIso)
    : "[Datum unbekannt]";

  const subjectSegments = ["Korrekturanfrage Rechnung"];
  if (invoiceNumber) subjectSegments.push(invoiceNumber);
  if (invoiceDateIso) subjectSegments.push(`vom ${isoToGermanDay(invoiceDateIso)}`);
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
