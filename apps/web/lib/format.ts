// German-locale formatters shared across dashboard components.
// Extracted for Story 3.1 — do NOT duplicate into individual components.

export function formatEur(
  value: number | null | undefined,
  currency: string | null | undefined = "EUR",
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const code = currency && currency.length > 0 ? currency : "EUR";
  try {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
}

export function formatDateDe(input: string | Date | null | undefined): string {
  if (input === null || input === undefined) return "—";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}
