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
