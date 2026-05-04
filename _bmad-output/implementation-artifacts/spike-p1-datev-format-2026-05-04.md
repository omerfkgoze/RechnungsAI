# DATEV EXTF Buchungsstapel v700 — Format Spike

**Date:** 2026-05-04
**For:** Story 5.2 — DATEV Buchungsstapel CSV Generation
**Outcome:** ✅ Feasible. Format is well-documented. No new dependencies required. Architecture decided.

---

## 1. DATEV EXTF Format Overview

DATEV's "Schnittstelle DATEV-Format" for Buchungsstapel (accounting batch) consists of:

| Layer | Content |
|-------|---------|
| Line 1 | Header row (Vorlaufsatz) — 29 semicolon-separated fields |
| Line 2 | Column header row — fixed label strings (no data) |
| Lines 3+ | Data rows (Buchungssätze) — one posting per line |

**Format identifiers:**
```
DATEV-Format-KZ: "EXTF"   (third-party export, not DATEV's own tools)
Versionsnummer: 700
Datenkategorie: 21         (= Buchungsstapel)
Formatversion: 13          (current)
```

---

## 2. Encoding Decision — UTF-8 with BOM (no new dependency)

**Official DATEV spec:** Default encoding is ISO-8859-1/Windows-1252. However, UTF-8 is accepted when a BOM (`﻿`) is prepended.

**Decision: UTF-8 with BOM.**

Rationale:
- `packages/gobd` already uses UTF-8 with BOM for GoBD CSV export — same pattern
- No new dependency (`iconv-lite`) required
- German umlauts (ä, ö, ü, ß) work correctly

```typescript
const BOM = "﻿";
// Prepend BOM to the full file string — identical to gobd/src/csv.ts pattern
```

---

## 3. Header Row — 29 Fields

```
"EXTF";700;21;"Buchungsstapel";13;{erzeugtAm};;"{herkunft}";"RechnungsAI";;{beraterNr};{mandantenNr};{wjBeginn};{sachkontenlaenge};{datumVom};{datumBis};"{bezeichnung}";;1;;0;"EUR";;"";;;"03";;;;"";""
```

| Pos | Field | Value | Source |
|-----|-------|-------|--------|
| 1 | DATEV-Format-KZ | `"EXTF"` | Hardcoded |
| 2 | Versionsnummer | `700` | Hardcoded |
| 3 | Datenkategorie | `21` | Hardcoded (Buchungsstapel) |
| 4 | Formatname | `"Buchungsstapel"` | Hardcoded |
| 5 | Formatversion | `13` | Hardcoded (current) |
| 6 | Erzeugt am | `YYYYMMDDHHmmssmmm` | `new Date()` at export time |
| 7 | Importiert | *(empty)* | Auto-set by DATEV |
| 8 | Herkunft | `"RE"` | Hardcoded — Rechnungseingang |
| 9 | Exportiert von | `"RechnungsAI"` | Hardcoded app name |
| 10 | Importiert von | *(empty)* | Auto-set by DATEV |
| 11 | Berater | `{datev_berater_nr}` | `tenant_settings.datev_berater_nr` |
| 12 | Mandant | `{datev_mandanten_nr}` | `tenant_settings.datev_mandanten_nr` |
| 13 | WJ-Beginn | `YYYYMMDD` | Computed from `fiscal_year_start` + export year |
| 14 | Sachkontenlänge | `{datev_sachkontenlaenge}` | `tenant_settings.datev_sachkontenlaenge` (default 4) |
| 15 | Datum vom | `YYYYMMDD` | First invoice_date in batch |
| 16 | Datum bis | `YYYYMMDD` | Last invoice_date in batch |
| 17 | Bezeichnung | `"RechnungsAI Export"` | Hardcoded or passed as param |
| 18 | Diktatkürzel | *(empty)* | Optional |
| 19 | Buchungstyp | `1` | 1 = Finanzbuchführung |
| 20 | Rechnungslegungszweck | *(empty)* | |
| 21 | Festschreibung | `0` | 0 = not locked |
| 22 | WKZ | `"EUR"` | Hardcoded — EUR only for v1 |
| 23–25 | *(reserved)* | *(empty)* | |
| 26 | SKR | `"03"` or `"04"` | `tenant_settings.skr_plan` → `"03"` or `"04"` |
| 27–29 | *(reserved/info)* | *(empty)* | |

**WJ-Beginn computation:**
```typescript
function fiscalYearStart(startMonth: number, referenceDate: Date): string {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth() + 1;
  // If current month is before fiscal year start, WJ began previous year
  const wjYear = month >= startMonth ? year : year - 1;
  const mm = String(startMonth).padStart(2, "0");
  return `${wjYear}01${mm}`; // YYYYMMDD — NOTE: day is always 01
}
```

Wait — format is `YYYYMMDD` where day=01 and month=fiscal start month. Correct form:
```typescript
const mm = String(startMonth).padStart(2, "0");
return `${wjYear}${mm}01`;  // e.g. 20240101 for January start
```

---

## 4. Data Row — Key Fields for RechnungsAI

125 total fields in DATEV spec; only the first ~14 are required for RechnungsAI v1 export. Fields 15–125 are trailing semicolons.

| Pos | Field | Type | Format | Required | RechnungsAI Source |
|-----|-------|------|--------|----------|-------------------|
| 1 | Umsatz (ohne S/H-Kz) | decimal | German comma, always positive | **Yes** | `invoices.gross_total` |
| 2 | Soll/Haben-Kennzeichen | string 1 | `"S"` or `"H"` | **Yes** | Always `"S"` (Soll = Eingangsrechnung debit) |
| 3 | WKZ Umsatz | string 3 | ISO-4217 | No | `"EUR"` or empty |
| 4 | Kurs | decimal | — | No | Empty (EUR only) |
| 5 | Basisumsatz | decimal | — | No | Empty |
| 6 | WKZ Basisumsatz | string | — | No | Empty |
| 7 | Konto | integer | Padded to Sachkontenlänge | **Yes** | `invoices.skr_code` (e.g. `4940`) |
| 8 | Gegenkonto | integer | Padded to Sachkontenlänge | **Yes** | Kreditorenkonto — see §5 below |
| 9 | BU-Schlüssel | string 4 | Numeric string | No | `invoices.bu_schluessel` → `mapBuSchluessel()` |
| 10 | Belegdatum | date | **`TTMM`** (4 chars, no year) | **Yes** | `invoices.invoice_date` → `DDMM` |
| 11 | Belegfeld 1 | string 36 | `[a-zA-Z0-9$&%*+\-/]*` | No | `invoices.invoice_number` |
| 12 | Belegfeld 2 | string 12 | Same | No | Empty |
| 13 | Skonto | decimal | — | No | Empty |
| 14 | Buchungstext | string 60 | Free text | No | `invoices.supplier` |
| 15–125 | *(all optional)* | — | — | No | Empty |

### Critical: Belegdatum Format

```typescript
// invoice_date is ISO: "2024-02-21"
// DATEV needs: "2102" (day+month, no year, no separator)
function formatBelegdatum(isoDate: string): string {
  const [, mm, dd] = isoDate.split("-");  // "2024", "02", "21"
  return `${dd}${mm}`;  // "2102"
}
```

### Critical: German Number Format

```typescript
// DATEV uses comma decimal, no thousands sep, always positive
function formatAmount(v: number): string {
  return v.toFixed(2).replace(".", ",");  // 1234.56 → "1234,56"
}
```

### Critical: Sachkontenlänge Padding

```typescript
// Account numbers must match exactly the Sachkontenlänge in the header
function padAccount(code: string, length: number): string {
  return code.padStart(length, "0");
}
// "4940" with length=4 → "4940" ✓
// "8400" with length=5 → "08400" ✓
```

---

## 5. Gegenkonto (Offsetting Account) — Kreditorenkonto

DATEV Buchungsstapel for Eingangsrechnungen (AP invoices) books:
- **Konto** (debit) = expense/cost account (SKR code, e.g. `4940`)
- **Gegenkonto** (credit) = Kreditorenkonto (supplier payable account)

**For RechnungsAI v1:** Use a fixed generic Kreditorenkonto (`70000` for SKR03, `10000` for SKR04) or a configurable "Sammelkreditor" account. The correct approach per DATEV spec is a per-supplier vendor account in range 70000–99999 (SKR03) or 10000–69999 (SKR04), but this requires a full Kreditoren master — out of scope for Story 5.2.

**Decision for Story 5.2:** Use a configurable `default_kreditorenkonto` field OR hardcode `70000` (SKR03) / `10000` (SKR04) as a known-limitation note. Story 5.1 can expose this as a single optional settings field.

---

## 6. BU-Schlüssel Mapping

`mapBuSchluessel` is already in `packages/shared/src/constants/skr.ts`:

```typescript
export function mapBuSchluessel(vatRate: number | null): number {
  if (vatRate === null || !Number.isFinite(vatRate) || vatRate < 0) return 0;
  if (Math.abs(vatRate - 0.19) <= 0.005) return 9;
  if (Math.abs(vatRate - 0.07) <= 0.005) return 8;
  return 0;
}
```

**Decision: BU-Schlüssel stays in `packages/shared`.** It is shared between `packages/ai` (categorization) and `packages/datev` (export). `packages/datev` imports from `@rechnungsai/shared`.

In the EXTF row: BU-Schlüssel `0` (Steuerfrei/unknown) should be written as **empty string** `""` (not `"0"`), because DATEV interprets `0` differently from "no BU-Schlüssel."

```typescript
function formatBuSchluessel(code: number): string {
  return code === 0 ? "" : String(code);
}
```

---

## 7. Versioned Architecture — `packages/datev`

```
packages/datev/src/
├── formats/
│   └── extf-v700.ts        ← pure functions for v700 format
├── types.ts                 ← ExtfHeader, ExtfRow, DatevExportInput types
└── index.ts                 ← public exports
```

**Design rule (from Epic 4 retro insight #4):** Format version = separate file. Future DATEV format update → new `extf-v800.ts` or `extf-v700-r2.ts`. Existing code untouched.

### `packages/datev/src/types.ts` sketch

```typescript
export type DatevTenantConfig = {
  beraterNr: string;         // must be non-null at export time
  mandantenNr: string;       // must be non-null at export time
  sachkontenlaenge: number;  // 4–8
  fiscalYearStart: number;   // 1–12
  skrPlan: "SKR03" | "SKR04";
};

export type DatevBookingRow = {
  gross_total: number;
  invoice_date: string;      // ISO: "2024-02-21"
  invoice_number: string | null;
  supplier: string | null;
  skr_code: string | null;
  bu_schluessel: number | null;
};

export type DatevExportResult = {
  csv: string;               // UTF-8 string with BOM
  rowCount: number;
  dateFrom: string;          // YYYYMMDD
  dateTo: string;            // YYYYMMDD
};
```

### `packages/datev/src/formats/extf-v700.ts` sketch

```typescript
const BOM = "﻿";
const SEP = ";";
const EOL = "\r\n";

export function buildExtfV700(
  config: DatevTenantConfig,
  rows: DatevBookingRow[],
  exportedAt: Date = new Date(),
): DatevExportResult {
  const header = buildHeader(config, rows, exportedAt);
  const columnLabels = COLUMN_LABEL_ROW;
  const dataLines = rows.map((r) => buildDataRow(r, config.sachkontenlaenge));
  const csv = BOM + [header, columnLabels, ...dataLines].join(EOL) + EOL;
  return { csv, rowCount: rows.length, dateFrom: ..., dateTo: ... };
}

function buildHeader(config, rows, exportedAt): string { ... }
function buildDataRow(row: DatevBookingRow, sachkontenlaenge: number): string { ... }
```

---

## 8. Watch Points

| Risk | Mitigation |
|------|-----------|
| `beraterNr` or `mandantenNr` null at export | Route Handler (Story 5.3) must guard: return 400 with "DATEV-Konfiguration unvollständig" if null |
| Sachkontenlänge mismatch | Pad all accounts to exact length; validate SKR codes match length in unit tests |
| Invoices with null `invoice_date` | Skip rows with null date OR use batch period end date as fallback — skip preferred |
| Invoices with null `gross_total` | Skip rows — cannot generate valid Buchungssatz without amount |
| Non-EUR amounts | v1: export EUR only; log warning for any row with non-EUR currency (rare in current schema) |
| CSV formula injection | Amount/supplier fields: apply same `escapeField` guard as `packages/gobd/src/csv.ts` |
| Belegfeld 1 character restriction | Strip illegal chars from `invoice_number` before writing to field 11 |

---

## 9. Story 5.2 Task Outline (pre-written for story creation)

1. Add `packages/datev/src/types.ts` — `DatevTenantConfig`, `DatevBookingRow`, `DatevExportResult`
2. Add `packages/datev/src/formats/extf-v700.ts` — `buildExtfV700`, `buildHeader`, `buildDataRow`, helpers
3. Add `packages/datev/src/index.ts` export barrel
4. Add Vitest to `packages/datev` (`package.json` scripts + `vitest.config.ts`) — model on `packages/gobd`
5. Tests: header field positions, Belegdatum `TTMM` format, German amount formatting, Sachkontenlänge padding, BU-Schlüssel `0`→empty, BOM presence, CRLF line endings
6. Smoke tests: export 3 invoices → open in LibreOffice Calc → verify column alignment

---

*Spike completed 2026-05-04. P1 resolved. Stories 5.2 and 5.3 are writable.*
