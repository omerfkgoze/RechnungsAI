import type { Invoice } from "@rechnungsai/shared";

export function safeCurrency(code: string | undefined | null): string {
  return /^[A-Z]{3}$/.test(code ?? "") ? (code as string) : "EUR";
}

export function parseGermanDecimal(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  let normalized: string;
  if (trimmed.includes(",")) {
    // German locale: dots are thousands separators, comma is decimal
    normalized = trimmed.replace(/\./g, "").replace(",", ".");
  } else {
    // Machine format: decimal point, no thousands separator
    normalized = trimmed;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function formatValue(
  key: keyof Invoice,
  value: unknown,
  currency?: string,
): string {
  if (value === null || value === undefined) return "—";
  if (key === "net_total" || key === "vat_total" || key === "gross_total") {
    return formatEur(typeof value === "number" ? value : Number(value), currency);
  }
  if (key === "invoice_date" && typeof value === "string") {
    return formatDateDe(value);
  }
  return String(value);
}

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

// Parses a German-format date string (TT.MM.JJJJ — also accepts `-` or `/` as
// separators) and returns the ISO 8601 representation (YYYY-MM-DD) used for
// storage and AI exchange. Returns null for unparseable input. Validates that
// the date round-trips (rejects 31.02.2026 etc).
export function parseGermanDate(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  // Already ISO — accept and validate.
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return validateAndFormat(Number(y), Number(m), Number(d));
  }
  const deMatch = trimmed.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (!deMatch) return null;
  const [, d, m, y] = deMatch;
  return validateAndFormat(Number(y), Number(m), Number(d));
}

function validateAndFormat(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2999) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  // Round-trip via Date to reject impossible dates (e.g. 31.02).
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

// Active input mask for German date entry. Compares the next input against the
// previous value to detect adding-vs-deleting: when the user finishes a digit
// group (DD, MM) the trailing `.` is injected immediately so the cursor lands
// on the next group without typing the separator. On backspace the just-deleted
// `.` is NOT re-injected — otherwise the user could never erase the boundary.
export function applyGermanDateMask(next: string, prev: string = ""): string {
  const nextDigits = next.replace(/\D/g, "").slice(0, 8);
  const prevDigits = prev.replace(/\D/g, "");
  const isAdding = nextDigits.length > prevDigits.length;
  const len = nextDigits.length;
  if (len === 0) return "";
  if (len < 2) return nextDigits;
  if (len === 2) return isAdding ? `${nextDigits}.` : nextDigits;
  if (len < 4) return `${nextDigits.slice(0, 2)}.${nextDigits.slice(2)}`;
  if (len === 4) {
    const base = `${nextDigits.slice(0, 2)}.${nextDigits.slice(2, 4)}`;
    return isAdding ? `${base}.` : base;
  }
  return `${nextDigits.slice(0, 2)}.${nextDigits.slice(2, 4)}.${nextDigits.slice(4)}`;
}

// Converts an ISO YYYY-MM-DD string to the German-format string (TT.MM.JJJJ)
// used in input fields. Returns empty string for null/invalid so it can be
// bound directly to a text <input value>.
export function isoToGermanDateInput(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}.${m[2]}.${m[1]}`;
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
