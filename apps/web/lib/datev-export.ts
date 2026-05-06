// Helpers for the DATEV export dialog.
// `formatDateRangeGerman` renders an inclusive ISO range as `"01.05.2026 – 06.05.2026"`.
// `buildSteuerberaterMailto` produces a `mailto:` URL with German subject/body for the
// Steuerberater handoff. The user attaches the just-downloaded CSV manually since
// `mailto:` cannot carry attachments per RFC 6068.

const MONTHS_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

function isoToGermanDay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function formatDateRangeGerman(dateFromIso: string, dateToIso: string): string {
  return `${isoToGermanDay(dateFromIso)} – ${isoToGermanDay(dateToIso)}`;
}

export function buildSteuerberaterMailto(args: {
  dateFromIso: string;
  dateToIso: string;
  tenantCompanyName: string;
}): string {
  const { dateFromIso, dateToIso, tenantCompanyName } = args;

  // Use the midpoint of the date range to label the export's dominant month.
  const fromMs = Date.parse(`${dateFromIso}T00:00:00Z`);
  const toMs = Date.parse(`${dateToIso}T00:00:00Z`);
  const midDate = new Date(Math.floor((fromMs + toMs) / 2));
  const monthLabel = `${MONTHS_DE[midDate.getUTCMonth()]} ${midDate.getUTCFullYear()}`;

  const subject = `DATEV Export ${monthLabel} ${tenantCompanyName}`;
  const body =
    `Hallo,\n\n` +
    `anbei der DATEV-Buchungsstapel-Export für den Zeitraum ${formatDateRangeGerman(dateFromIso, dateToIso)}.\n\n` +
    `Viele Grüße`;

  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
