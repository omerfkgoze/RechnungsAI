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

// P19 — when the date range spans more than one calendar month, the subject
// reflects both ends ("April–Mai 2026"). When it spans more than one year, we
// fall back to fully-qualified labels on each side ("Dezember 2026–Januar 2027").
function monthLabelForRange(dateFromIso: string, dateToIso: string): string {
  const [fromYearStr, fromMonthStr] = dateFromIso.split("-");
  const [toYearStr, toMonthStr] = dateToIso.split("-");
  const fromYear = Number(fromYearStr);
  const toYear = Number(toYearStr);
  const fromMonth = Number(fromMonthStr) - 1;
  const toMonth = Number(toMonthStr) - 1;
  const fromName = MONTHS_DE[fromMonth];
  const toName = MONTHS_DE[toMonth];

  if (fromYear === toYear && fromMonth === toMonth) {
    return `${fromName} ${fromYear}`;
  }
  if (fromYear === toYear) {
    return `${fromName}–${toName} ${fromYear}`;
  }
  return `${fromName} ${fromYear}–${toName} ${toYear}`;
}

export function buildSteuerberaterMailto(args: {
  dateFromIso: string;
  dateToIso: string;
  tenantCompanyName: string;
}): string {
  const { dateFromIso, dateToIso, tenantCompanyName } = args;

  const monthLabel = monthLabelForRange(dateFromIso, dateToIso);

  const subject = `DATEV Export ${monthLabel} ${tenantCompanyName}`;
  const body =
    `Hallo,\n\n` +
    `anbei der DATEV-Buchungsstapel-Export für den Zeitraum ${formatDateRangeGerman(dateFromIso, dateToIso)}.\n\n` +
    `Viele Grüße`;

  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
