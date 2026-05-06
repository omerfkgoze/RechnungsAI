import type { DatevTenantConfig, DatevBookingRow, DatevExportResult } from "../types.js";

const BOM = "﻿";
const SEP = ";";
const EOL = "\r\n";

// Formula injection guard: prefix with ' when field starts with =, +, -, @, \t, or \r.
const FORMULA_INJECTION_PREFIXES = new Set(["=", "+", "-", "@", "\t", "\r"]);

// Full 116-column DATEV EXTF Buchungsstapel column header row.
// First 14 are the fields RechnungsAI populates; remaining 102 are empty (DATEV reserved).
const COLUMN_HEADER_ROW =
  "Umsatz (ohne Soll/Haben-Kz);Soll/Haben-Kennzeichen;WKZ Umsatz;Kurs;Basisumsatz;WKZ Basisumsatz;Konto;Gegenkonto;BU-Schlüssel;Belegdatum;Belegfeld 1;Belegfeld 2;Skonto;Buchungstext" +
  ";".repeat(102);

export function escapeField(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (FORMULA_INJECTION_PREFIXES.has(s[0] ?? "")) {
    s = `'${s}`;
  }
  if (s.includes(SEP) || s.includes('"') || s.includes("\r") || s.includes("\n") || s.includes(",")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function formatAmount(v: number): string {
  return Math.abs(v).toFixed(2).replace(".", ",");
}

export function formatBelegdatum(isoDate: string): string {
  const parts = isoDate.split("-");
  const mm = parts[1]!;
  const dd = parts[2]!;
  return `${dd}${mm}`;
}

export function padAccount(code: string, length: number): string {
  return code.padStart(length, "0");
}

export function formatBuSchluessel(code: number | null): string {
  if (code === null || code === 0) return "";
  return String(code);
}

export function sanitizeBelegfeld1(s: string | null): string {
  if (s === null) return "";
  return s.replace(/[^a-zA-Z0-9$&%*+\-/]/g, "").slice(0, 36);
}

export function truncate(s: string | null, max: number): string {
  if (s === null) return "";
  return s.slice(0, max);
}

export function gegenKonto(config: DatevTenantConfig): string {
  if (config.defaultKreditorenkonto) return config.defaultKreditorenkonto;
  return config.skrPlan === "SKR04" ? "10000" : "70000";
}

export function computeWjBeginn(fiscalYearStart: number, referenceDate: Date): string {
  const year = referenceDate.getFullYear();
  const currentMonth = referenceDate.getMonth() + 1;
  const wjYear = currentMonth >= fiscalYearStart ? year : year - 1;
  const mm = String(fiscalYearStart).padStart(2, "0");
  return `${wjYear}${mm}01`;
}

function formatErzeugtAm(d: Date): string {
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const HH = String(d.getHours()).padStart(2, "0");
  const MM = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const mmm = String(d.getMilliseconds()).padStart(3, "0");
  return `${yyyy}${mm}${dd}${HH}${MM}${ss}${mmm}`;
}

function formatYYYYMMDD(d: Date): string {
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function buildHeader(
  config: DatevTenantConfig,
  dateFrom: string,
  dateTo: string,
  exportedAt: Date,
): string {
  const erzeugtAm = formatErzeugtAm(exportedAt);
  const wjBeginn = computeWjBeginn(config.fiscalYearStart, exportedAt);
  const skrSuffix = config.skrPlan.replace("SKR", "");

  // 29 fields exactly as per DATEV EXTF Buchungsstapel v700 spec
  const fields = [
    '"EXTF"',
    "700",
    "21",
    '"Buchungsstapel"',
    "13",
    erzeugtAm,
    "",
    "",
    '"RechnungsAI"',
    "",
    config.beraterNr,
    config.mandantenNr,
    wjBeginn,
    String(config.sachkontenlaenge),
    dateFrom,
    dateTo,
    '"RechnungsAI Export"',
    "",
    "1",
    "",
    "0",
    '"EUR"',
    "",
    "",
    "",
    `"${skrSuffix}"`,
    "",
    "",
    "",
  ];

  return fields.join(SEP);
}

function buildDataRow(
  row: DatevBookingRow,
  sachkontenlaenge: number,
  resolvedGegenKonto: string,
): string {
  const fields14 = [
    formatAmount(row.gross_total),
    "S",
    "EUR",
    "",
    "",
    "",
    row.skr_code ? padAccount(row.skr_code, sachkontenlaenge) : "",
    resolvedGegenKonto,
    formatBuSchluessel(row.bu_schluessel),
    formatBelegdatum(row.invoice_date),
    sanitizeBelegfeld1(row.invoice_number),
    "",
    "",
    truncate(row.supplier, 60),
  ];

  return fields14.map(escapeField).join(SEP) + SEP.repeat(102);
}

export function buildExtfV700(
  config: DatevTenantConfig,
  rows: DatevBookingRow[],
  exportedAt: Date = new Date(),
): DatevExportResult {
  let skippedCount = 0;
  const validRows: DatevBookingRow[] = [];

  for (const row of rows) {
    if (!Number.isFinite(row.gross_total) || row.gross_total <= 0 || !row.invoice_date) {
      skippedCount++;
    } else {
      validRows.push(row);
    }
  }

  const exportedAtYYYYMMDD = formatYYYYMMDD(exportedAt);
  const validDates = validRows.map((r) => r.invoice_date.replace(/-/g, "")).sort();
  const dateFrom = validDates[0] ?? exportedAtYYYYMMDD;
  const dateTo = validDates[validDates.length - 1] ?? exportedAtYYYYMMDD;

  const resolvedGegenKonto = gegenKonto(config);

  const headerLine = BOM + buildHeader(config, dateFrom, dateTo, exportedAt);
  const dataLines = validRows.map((row) =>
    buildDataRow(row, config.sachkontenlaenge, resolvedGegenKonto),
  );

  const csv = [headerLine, COLUMN_HEADER_ROW, ...dataLines].join(EOL) + EOL;

  return {
    csv,
    rowCount: validRows.length,
    skippedCount,
    dateFrom,
    dateTo,
  };
}
