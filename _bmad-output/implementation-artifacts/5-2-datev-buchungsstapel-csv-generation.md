# Story 5.2: DATEV Buchungsstapel CSV Generation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want my approved invoices to be converted into a properly formatted DATEV CSV file,
so that my Steuerberater can import it directly into DATEV Unternehmen Online without manual corrections.

## Context: This Story Is Entirely Inside `packages/datev`

**STOP — read this before reading the ACs.**

Story 5.2 is a **pure computation story**. Its entire scope is inside `packages/datev`. No web app pages, no Server Actions, no database migrations. The output is a single exported function `buildExtfV700()` that takes tenant config + invoice rows and returns a UTF-8 CSV string with BOM.

Story 5.3 (not yet written) will wire this function into a Server Action and Route Handler for actual download. **Do NOT implement Story 5.3 here.**

The `packages/datev/src/index.ts` stub currently exists but is empty (`// @rechnungsai/datev - DATEV export functionality`). You are building this package from the stub up. Model everything after `packages/gobd` — same build pattern, same test setup, same BOM/CRLF/escaping conventions.

**Key decision from `spike-p1-datev-format-2026-05-04.md`**: Encoding is **UTF-8 with BOM**, NOT Windows-1252. DATEV accepts UTF-8+BOM and it avoids an `iconv-lite` dependency. The epic says "Windows-1252" but the spike explicitly overrides this — follow the spike.

## Acceptance Criteria

1. **Given** the DATEV package is built **When** `pnpm --filter @rechnungsai/datev build` runs **Then** TypeScript compiles to `dist/` without errors; `package.json` `exports` field points to `dist/index.js`; `main` and `types` point to `dist/index.js` and `dist/index.d.ts` respectively — mirroring the `packages/gobd/package.json` structure exactly.

2. **Given** a Vitest test suite **When** `pnpm --filter @rechnungsai/datev test` runs **Then** all tests in `packages/datev/src/formats/extf-v700.test.ts` pass; `vitest.config.ts` is present at the package root — identical structure to `packages/gobd/vitest.config.ts`.

3. **Given** `packages/datev/src/types.ts` **When** it is created **Then** it exports exactly these three types (no more, no less):
   ```typescript
   export type DatevTenantConfig = {
     beraterNr: string;             // non-null enforced by caller (Story 5.3)
     mandantenNr: string;           // non-null enforced by caller (Story 5.3)
     sachkontenlaenge: number;      // 4–8 from tenants.datev_sachkontenlaenge (default 4)
     fiscalYearStart: number;       // 1–12 from tenants.datev_fiscal_year_start (default 1)
     skrPlan: "SKR03" | "SKR04";   // from tenants.skr_plan
     defaultKreditorenkonto: string | null; // from tenants.datev_default_kreditorenkonto (Story 5.1)
   };
   export type DatevBookingRow = {
     gross_total: number;           // invoices.gross_total — caller MUST filter out null rows before calling
     invoice_date: string;          // ISO "2024-02-21" — caller MUST filter out null rows
     invoice_number: string | null;
     supplier: string | null;
     skr_code: string | null;
     bu_schluessel: number | null;
   };
   export type DatevExportResult = {
     csv: string;                   // UTF-8 string with BOM — ready for download
     rowCount: number;
     skippedCount: number;          // invoices skipped due to missing required fields
     dateFrom: string;              // YYYYMMDD of earliest Belegdatum in batch
     dateTo: string;                // YYYYMMDD of latest Belegdatum in batch
   };
   ```

4. **Given** `packages/datev/src/formats/extf-v700.ts` **When** `buildExtfV700(config, rows, exportedAt?)` is called **Then** the returned `DatevExportResult.csv` string:
   - Starts with UTF-8 BOM (`﻿`, charCode 0xFEFF)
   - Uses `\r\n` (CRLF) as line endings — **never `\n`**
   - Uses `;` (semicolon) as field delimiter
   - Uses `"` (double quote) as text qualifier — fields containing semicolons or double-quotes are RFC 4180 quoted

5. **Given** the EXTF header row (Line 1) **When** `buildExtfV700` runs **Then** the header contains exactly 29 semicolon-separated fields in this order:
   ```
   "EXTF";700;21;"Buchungsstapel";13;{erzeugtAm};;;"RechnungsAI";;{beraterNr};{mandantenNr};{wjBeginn};{sachkontenlaenge};{datumVon};{datumBis};"RechnungsAI Export";;1;;0;"EUR";;"";;"03";;;;"";"";
   ```
   Where:
   - Field 1: `"EXTF"` — hardcoded, quoted
   - Field 2: `700` — version, unquoted integer
   - Field 3: `21` — Datenkategorie (Buchungsstapel), unquoted integer
   - Field 4: `"Buchungsstapel"` — hardcoded, quoted
   - Field 5: `13` — Formatversion, unquoted integer
   - Field 6: `{erzeugtAm}` — `new Date()` in `YYYYMMDDHHmmssmmm` format (17 chars, no separator)
   - Fields 7, 8: empty (auto-set by DATEV)
   - Field 9: `"RechnungsAI"` — hardcoded app name
   - Field 10: empty
   - Field 11: `{beraterNr}` — from `config.beraterNr`
   - Field 12: `{mandantenNr}` — from `config.mandantenNr`
   - Field 13: `{wjBeginn}` — WJ-Beginn in `YYYYMMDD` format (see WJ-Beginn computation below)
   - Field 14: `{sachkontenlaenge}` — from `config.sachkontenlaenge`
   - Field 15: `{datumVon}` — earliest invoice date in batch, `YYYYMMDD`
   - Field 16: `{datumBis}` — latest invoice date in batch, `YYYYMMDD`
   - Field 17: `"RechnungsAI Export"` — hardcoded, quoted
   - Field 18: empty (Diktatkürzel)
   - Field 19: `1` — Buchungstyp (Finanzbuchführung)
   - Field 20: empty
   - Field 21: `0` — Festschreibung (not locked)
   - Field 22: `"EUR"` — hardcoded currency
   - Fields 23–25: empty
   - Field 26: `"03"` or `"04"` from `config.skrPlan` → strip `"SKR"` prefix
   - Fields 27–29: empty

6. **Given** Line 2 (column headers row) **When** `buildExtfV700` runs **Then** the column header row contains the fixed DATEV column labels as a single semicolon-joined line starting with `Umsatz (ohne Soll/Haben-Kz);Soll/Haben-Kennzeichen;WKZ Umsatz;Kurs;Basisumsatz;WKZ Basisumsatz;Konto;Gegenkonto;BU-Schlüssel;Belegdatum;Belegfeld 1;Belegfeld 2;Skonto;Buchungstext;...` — the full 116-column label list is defined as a `const COLUMN_HEADER_ROW` string constant inside `extf-v700.ts` (hardcoded — never computed).

7. **Given** each invoice's data row (Lines 3+) **When** a valid row is generated **Then** the first 14 fields are populated as follows (remaining fields 15–116 are empty semicolons):
   | Pos | Field | Value |
   |-----|-------|-------|
   | 1 | Umsatz | `formatAmount(row.gross_total)` — e.g. `"1234,56"` (comma decimal, always positive, no thousands sep) |
   | 2 | Soll/Haben-Kz | `"S"` — always Soll for Eingangsrechnungen |
   | 3 | WKZ Umsatz | `"EUR"` |
   | 4 | Kurs | empty |
   | 5 | Basisumsatz | empty |
   | 6 | WKZ Basisumsatz | empty |
   | 7 | Konto | `padAccount(row.skr_code, config.sachkontenlaenge)` or empty if null |
   | 8 | Gegenkonto | `gegenKonto(config)` — see Gegenkonto logic below |
   | 9 | BU-Schlüssel | `formatBuSchluessel(row.bu_schluessel)` — `0` or `null` → `""`, else numeric string |
   | 10 | Belegdatum | `formatBelegdatum(row.invoice_date)` — `"DDMM"` 4-char no separator |
   | 11 | Belegfeld 1 | `sanitizeBelegfeld1(row.invoice_number)` — strip illegal chars, max 36 chars |
   | 12 | Belegfeld 2 | empty |
   | 13 | Skonto | empty |
   | 14 | Buchungstext | `truncate(row.supplier, 60)` or empty if null |

8. **Given** rows with invalid or missing required fields **When** `buildExtfV700` processes them **Then** rows where `gross_total` is not a finite positive number OR `invoice_date` is falsy are **skipped** (not included in output); `DatevExportResult.skippedCount` reflects the number of skipped rows; rows with null `skr_code`, `bu_schluessel`, `supplier`, or `invoice_number` are **NOT skipped** — they produce a data row with empty values in those positions.

9. **Given** the generated CSV is opened in LibreOffice Calc (or DATEV Unternehmen Online) **When** the file is opened **Then** the UTF-8 BOM causes auto-detection of encoding — no import wizard needed; CRLF line endings are preserved; no formula injection is possible (apply `escapeField` guard identical to `packages/gobd/src/csv.ts` — prefix with `'` when field starts with `=`, `+`, `-`, `@`, tab, or CR).

10. **Given** `pnpm check-types` and `pnpm lint` **When** run from the repo root **Then** both pass with zero errors including the new datev package files; **And** `pnpm --filter @rechnungsai/datev test` passes with all tests green.

## Tasks / Subtasks

- [x] **Task 1: Update `packages/datev/package.json`** (AC: 1, 2, 10)
  - [x] Add `build` script: `"tsc --build"` (mirror gobd)
  - [x] Add `test` script: `"vitest run"` and `test:watch`: `"vitest"` (mirror gobd)
  - [x] Change `main` from `"./src/index.ts"` to `"./dist/index.js"` (mirror gobd)
  - [x] Change `types` from `"./src/index.ts"` to `"./dist/index.d.ts"` (mirror gobd)
  - [x] Add `exports` field: `{ ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } }` (mirror gobd)
  - [x] Add vitest devDependencies: `vitest`, `@vitest/coverage-v8`, `@types/node` at same versions as gobd (`"vitest": "^4.1.4"`, `"@vitest/coverage-v8": "^4.1.4"`, `"@types/node": "^20.19.39"`)
  - [x] Do NOT add any new runtime dependencies — no `iconv-lite`, no `encoding` packages
- [x] **Task 2: Add `packages/datev/vitest.config.ts`** (AC: 2, 10)
  - [x] Copy `packages/gobd/vitest.config.ts` verbatim — `include: ["src/**/*.test.ts"]`, environment: node
- [x] **Task 3: Add `packages/datev/tsconfig.json` build support** (AC: 1)
  - [x] Read existing `packages/datev/tsconfig.json` — verify it extends `@rechnungsai/typescript-config/base.json` with `outDir: "dist"` and `rootDir: "src"`; if missing `outDir`/`rootDir`, add them (model on `packages/gobd/tsconfig.json`)
- [x] **Task 4: Create `packages/datev/src/types.ts`** (AC: 3)
  - [x] Define `DatevTenantConfig`, `DatevBookingRow`, `DatevExportResult` exactly as in AC #3
  - [x] No imports needed — pure type definitions
- [x] **Task 5: Create `packages/datev/src/formats/extf-v700.ts`** (AC: 4–9)
  - [x] Define constants: `BOM = "﻿"`, `SEP = ";"`, `EOL = "\r\n"`
  - [x] Implement `COLUMN_HEADER_ROW` constant (full 116-label string — see Dev Notes)
  - [x] Implement `escapeField(v: unknown): string` — identical logic to `packages/gobd/src/csv.ts:13-23` (formula injection prefix guard + RFC 4180 quoting)
  - [x] Implement `formatAmount(v: number): string` — `v.toFixed(2).replace(".", ",")`
  - [x] Implement `formatBelegdatum(isoDate: string): string` — split on `-`, return `${dd}${mm}` (4 chars)
  - [x] Implement `padAccount(code: string, length: number): string` — `code.padStart(length, "0")`
  - [x] Implement `formatBuSchluessel(code: number | null): string` — `null` or `0` → `""`, else `String(code)`
  - [x] Implement `sanitizeBelegfeld1(s: string | null): string` — strip chars NOT in `[a-zA-Z0-9$&%*+\-/]`, truncate to 36 chars
  - [x] Implement `truncate(s: string | null, max: number): string` — null → `""`, else `s.slice(0, max)`
  - [x] Implement `gegenKonto(config: DatevTenantConfig): string` — `config.defaultKreditorenkonto ?? (config.skrPlan === "SKR04" ? "10000" : "70000")`
  - [x] Implement `computeWjBeginn(fiscalYearStart: number, referenceDate: Date): string` — see WJ-Beginn computation in Dev Notes
  - [x] Implement `buildHeader(config, rows, exportedAt): string`
  - [x] Implement `buildDataRow(row: DatevBookingRow, sachkontenlaenge: number, gegenKonto: string): string`
  - [x] Implement and export `buildExtfV700(config: DatevTenantConfig, rows: DatevBookingRow[], exportedAt?: Date): DatevExportResult`
  - [x] Import `mapBuSchluessel` from `@rechnungsai/shared` for any dynamic BU-Schlüssel derivation (but `DatevBookingRow.bu_schluessel` already contains the mapped value from DB — the import is available but may not be needed inside this file; do NOT call `mapBuSchluessel` again on data that's already in the row)
- [x] **Task 6: Create `packages/datev/src/formats/extf-v700.test.ts`** (AC: 2, 4–9, 10)
  - [x] Test: BOM present (`csv.charCodeAt(0) === 0xFEFF`)
  - [x] Test: CRLF line endings (`csv.includes("\r\n")`, no bare `\n` outside CRLF)
  - [x] Test: Semicolon delimiter in data rows
  - [x] Test: `formatBelegdatum("2024-02-21")` returns `"2102"` (DDMM, NOT MMDD)
  - [x] Test: `formatAmount(1234.56)` returns `"1234,56"` (comma decimal, no thousands sep)
  - [x] Test: `formatAmount(0.10)` returns `"0,10"` (preserve trailing zero)
  - [x] Test: `padAccount("4940", 4)` returns `"4940"` (no padding needed)
  - [x] Test: `padAccount("8400", 5)` returns `"08400"` (left-pad with zero)
  - [x] Test: `formatBuSchluessel(9)` returns `"9"`
  - [x] Test: `formatBuSchluessel(0)` returns `""` (NOT "0")
  - [x] Test: `formatBuSchluessel(null)` returns `""`
  - [x] Test: `gegenKonto` with null defaultKreditorenkonto + SKR03 → `"70000"`
  - [x] Test: `gegenKonto` with null defaultKreditorenkonto + SKR04 → `"10000"`
  - [x] Test: `gegenKonto` with `"70500"` configured → `"70500"` (user override respected)
  - [x] Test: `sanitizeBelegfeld1("RE-2024/001")` → strips `-` and `/` are allowed, result `"RE-2024/001"`; illegal char `" "` is stripped
  - [x] Test: `sanitizeBelegfeld1` truncates to max 36 chars
  - [x] Test: `buildExtfV700` with 3 valid rows → `rowCount === 3`, `skippedCount === 0`, result has 5 lines (BOM line 1 + column headers + 3 data rows + trailing CRLF)
  - [x] Test: `buildExtfV700` with 1 null `gross_total` row → `skippedCount === 1`, that row NOT in CSV
  - [x] Test: `buildExtfV700` with empty rows array → `rowCount === 0`, CSV still has header + column label rows
  - [x] Test: Header field 11 (beraterNr) appears at correct semicolon position in line 1
  - [x] Test: Formula injection guard — supplier `"=MALICIOUS()"` is escaped with `'` prefix
  - [x] Test: `computeWjBeginn(1, new Date("2024-03-15"))` → `"20240101"` (Jan fiscal start, current year)
  - [x] Test: `computeWjBeginn(7, new Date("2024-03-15"))` → `"20230701"` (July start, March is before July so prev year's fiscal)
  - [x] Test: `computeWjBeginn(7, new Date("2024-08-01"))` → `"20240701"` (August is after July start, current year)
- [x] **Task 7: Update `packages/datev/src/index.ts`** (AC: 1)
  - [x] Export `buildExtfV700` and all types from the barrel:
    ```typescript
    export { buildExtfV700 } from "./formats/extf-v700.js";
    export type { DatevTenantConfig, DatevBookingRow, DatevExportResult } from "./types.js";
    ```
  - [x] Note: `.js` extension in imports (ESM convention — same as gobd/src/index.ts)
- [x] **Task 8: Build and test verification** (AC: 1, 2, 10)
  - [x] `pnpm --filter @rechnungsai/datev build` — zero errors
  - [x] `pnpm --filter @rechnungsai/datev test` — all tests green
  - [x] `pnpm check-types` from repo root — zero errors
  - [x] `pnpm lint` from repo root — zero errors
- [x] **Task 9: Smoke test** (format per `smoke-test-format-guide.md`)
  - [x] Fill in smoke test table in Completion Notes

## Dev Notes

### Existing Code Map (read BEFORE writing any code)

| Concern | File | What's already there |
|---|---|---|
| BOM + CRLF + escapeField pattern | `packages/gobd/src/csv.ts:1-23` | Copy `BOM`, `DELIM`, `EOL` constants and `escapeField` function verbatim — the formula injection guard is identical |
| Package structure to mirror | `packages/gobd/package.json` | `build`, `test`, `test:watch` scripts; `main`, `types`, `exports` to `dist/`; same devDependencies |
| Vitest config to mirror | `packages/gobd/vitest.config.ts` | Copy verbatim — `environment: "node"`, `include: ["src/**/*.test.ts"]` |
| tsconfig to mirror | `packages/gobd/tsconfig.json` | `extends "@rechnungsai/typescript-config/base.json"`, `outDir: "dist"`, `rootDir: "src"` |
| mapBuSchluessel (shared) | `packages/shared/src/constants/skr.ts:54-62` | Already handles `null`, `NaN`, `Infinity`, negative rates. Maps 0.19 → 9, 0.07 → 8, else → 0. DO NOT reimplement. |
| ESM import style | `packages/gobd/src/index.ts` | Uses `.js` extension in all relative imports — required for ESM compatibility in compiled output |
| Test import style | `packages/gobd/src/csv.test.ts:1-2` | `import ... from "./csv.js"` — test files also use `.js` extension (Vitest resolves to `.ts`) |
| DATEV format spec | `_bmad-output/implementation-artifacts/spike-p1-datev-format-2026-05-04.md` | Full 29-field header, data row field spec, BOM/encoding decision, WJ-Beginn formula, Gegenkonto fallback logic |
| Story 5.1 DB additions | `supabase/migrations/20260504000000_datev_default_kreditorenkonto.sql` | `datev_default_kreditorenkonto text null` on tenants — present in `packages/shared/src/types/database.ts` |

### Encoding: UTF-8 with BOM (not Windows-1252)

**The epic says Windows-1252. The spike overrides it.** Follow the spike.

Rationale (from `spike-p1-datev-format-2026-05-04.md§2`):
- `packages/gobd` already uses UTF-8 + BOM for GoBD CSV export — same pattern
- DATEV accepts UTF-8+BOM without requiring a separate encoding step
- Avoids adding `iconv-lite` to the monorepo
- German umlauts (ä, ö, ü, ß) work correctly

BOM character: `"﻿"` (Unicode codepoint U+FEFF, UTF-8 sequence EF BB BF). In JavaScript/Node, just prepend this string — no Buffer manipulation needed.

### WJ-Beginn Computation

```typescript
function computeWjBeginn(fiscalYearStart: number, referenceDate: Date): string {
  const year = referenceDate.getFullYear();
  const currentMonth = referenceDate.getMonth() + 1; // 1-based
  // If current month is before fiscal start, the fiscal year began in the previous calendar year
  const wjYear = currentMonth >= fiscalYearStart ? year : year - 1;
  const mm = String(fiscalYearStart).padStart(2, "0");
  return `${wjYear}${mm}01`; // format: YYYYMMDD — day is always 01
}
// Examples:
// fiscalYearStart=1, date=2024-03-15 → "20240101" (Jan start, march is after Jan → current year)
// fiscalYearStart=7, date=2024-03-15 → "20230701" (Jul start, march is before Jul → prev year)
// fiscalYearStart=7, date=2024-08-01 → "20240701" (Aug is after Jul → current year)
```

### Belegdatum Format: `DDMM` NOT `MMDD`

DATEV calls this "TTMM" in the spec (Tag=Day, Monat=Month). It is a 4-digit string with NO separator and NO year.

```typescript
function formatBelegdatum(isoDate: string): string {
  const parts = isoDate.split("-"); // ["2024", "02", "21"]
  const mm = parts[1]!;             // "02"
  const dd = parts[2]!;             // "21"
  return `${dd}${mm}`;              // "2102" — day FIRST, then month
}
```

Common mistake: returning `"0221"` (MMDD) instead of `"2102"` (DDMM). Tests must verify the correct order.

### Gegenkonto (Field 8) — Kreditorenkonto Logic

Every Buchungsstapel row books:
- **Konto** (debit, field 7) = expense account, e.g. `4940` (from `invoices.skr_code`)
- **Gegenkonto** (credit, field 8) = Kreditorenkonto (supplier payable account)

```typescript
function resolveGegenKonto(config: DatevTenantConfig): string {
  if (config.defaultKreditorenkonto) return config.defaultKreditorenkonto;
  return config.skrPlan === "SKR04" ? "10000" : "70000";
}
```

`70000` = SKR03 Sammel-Kreditorenkonto. `10000` = SKR04 equivalent. This value is the SAME for every row in a batch (it's a tenant-level config, not per-invoice). Compute it once before the `rows.map()` loop.

### BU-Schlüssel: `0` Must Be Empty String

DATEV interprets numeric `0` differently from absence of BU-Schlüssel. When BU-Schlüssel is `0` (Steuerfrei/unknown), write `""` (empty):

```typescript
function formatBuSchluessel(code: number | null): string {
  if (code === null || code === 0) return "";
  return String(code);
}
```

`bu_schluessel` in `invoices` table is already the mapped integer value (stored by Epic 3 categorization flow). Do not call `mapBuSchluessel()` again inside this package — the value is already mapped.

### Amount Format: Always Positive, Comma Decimal

```typescript
function formatAmount(v: number): string {
  return Math.abs(v).toFixed(2).replace(".", ",");
  // Note: Math.abs() because DATEV expects always-positive amounts;
  // the Soll/Haben-Kz field (always "S") determines credit/debit direction
}
```

### COLUMN_HEADER_ROW — Full 116-Label String

The column header row (Line 2) must list all 116 DATEV column names. Define it as a single `const` string at the top of `extf-v700.ts`. The first 14 labels (the ones RechnungsAI populates) are:

```
Umsatz (ohne Soll/Haben-Kz);Soll/Haben-Kennzeichen;WKZ Umsatz;Kurs;Basisumsatz;WKZ Basisumsatz;Konto;Gegenkonto;BU-Schlüssel;Belegdatum;Belegfeld 1;Belegfeld 2;Skonto;Buchungstext
```

Followed by the remaining 102 column names as empty labels (consecutive semicolons). In practice, the header row ends with 102 trailing semicolons after `Buchungstext`. Use the full label list from the DATEV EXTF spec if available; otherwise, the trailing semicolons approach is acceptable for v1 (DATEV UO will import correctly).

**Important:** This is a CONSTANT — never computed, never modified by config.

### Row Skipping Logic

Skip a row (increment `skippedCount`) if either:
1. `row.gross_total` is not a finite number (`!Number.isFinite(row.gross_total)`)
2. `row.gross_total <= 0` (no zero or negative amounts — these would corrupt the batch)
3. `!row.invoice_date` (null, empty, or undefined)

Do NOT skip rows for null `skr_code`, `bu_schluessel`, `supplier`, or `invoice_number` — produce the row with empty fields in those positions.

### dateFrom / dateTo Computation

After filtering valid rows, derive `dateFrom` and `dateTo` from the invoice dates:

```typescript
const validDates = validRows
  .map(r => r.invoice_date.replace(/-/g, ""))  // "2024-02-21" → "20240221"
  .sort();
const dateFrom = validDates[0] ?? exportedAtYYYYMMDD;
const dateTo = validDates[validDates.length - 1] ?? exportedAtYYYYMMDD;
```

These values populate header fields 15 and 16 (Datum vom / Datum bis).

### Package.json Changes Required

Current `packages/datev/package.json` is missing:
1. `build` script
2. `test` and `test:watch` scripts
3. `vitest`, `@vitest/coverage-v8`, `@types/node` in devDependencies
4. `exports` field
5. `main` and `types` point to `./src/index.ts` — must change to `./dist/index.js` / `./dist/index.d.ts`

**After the change, the package MUST be built before any other package can import from it.** If you see TypeScript errors in web app after the change, run `pnpm --filter @rechnungsai/datev build` first.

### Previous Story Intelligence (Story 5.1)

Key learnings from `5-1-datev-settings-configuration.md` that apply here:

- **No emojis in source files** — project lints/forbids them. Use lucide icons in UI (not applicable here, but noted for consistency).
- **Zod v4 in use** — `packages/shared` is on Zod v4. No direct Zod use in this story but be aware if you add any schema validation.
- **`form.watch` vs server props** — not applicable to this pure-computation story.
- **ESM module pattern** — datev package uses `"type": "module"` → all relative imports in source must use `.js` extension (TypeScript resolves to `.ts` at compile time). See `packages/gobd/src/index.ts` for reference.
- **Story 5.1 shipped** `datev_default_kreditorenkonto` on `tenants` table and `tenantSettingsSchema`. The `DatevTenantConfig.defaultKreditorenkonto` field in this story maps directly to that DB column. Callers (Story 5.3) will pass it from the fetched tenant record.
- **Deferred review items from 5.1**: `tenant.ts` has an unconditional `Sentry.captureException` for ALL DB errors including 23514 — pre-existing, do not address here.

### Git Intelligence (last 5 commits relevant to this story)

```
561f006 fix: positionen table edit overflow
e036eb8 fix: onboarding steuerberater null validation
0ab8ad8 create spec UX onboarding and mobile button overflow
f3fc44f done story 5-1
5df5116 story 5-1 in review
```

Patterns:
- Commit style: `<verb>: <description>` or just `<verb> <description>` — no strict Conventional Commits
- Pure package work (like this story) typically lands in 1-2 commits
- Review patches are common ("patches" commit follows "done story X" commit)

### Critical Anti-Patterns to Avoid (LLM Failure Modes)

1. **DO NOT** add `iconv-lite` or any encoding library — UTF-8 with BOM is the decided approach.
2. **DO NOT** call `mapBuSchluessel()` inside this package — `DatevBookingRow.bu_schluessel` already contains the pre-mapped value from the DB.
3. **DO NOT** use `\n` (LF) as line endings — MUST be `\r\n` (CRLF). DATEV is strict about this.
4. **DO NOT** write BU-Schlüssel `0` as the string `"0"` — must be `""` empty string.
5. **DO NOT** forget the `.js` extension in imports inside `src/` — ESM in Node requires it; Vitest resolves to `.ts`.
6. **DO NOT** implement the Route Handler, Server Action, or any web app page — that is Story 5.3.
7. **DO NOT** compute `gegenKonto` per-row — it is the same for all rows in a batch; compute once.
8. **DO NOT** forget to run `pnpm --filter @rechnungsai/datev build` before running `pnpm check-types` from root — the web app (Story 5.3) will fail type-check if dist/ is stale.
9. **DO NOT** mark smoke-test rows `DONE` if you cannot run a real browser — mark `BLOCKED-BY-ENVIRONMENT` and provide manual steps.
10. **DO NOT** use bare `console.log` — use `[datev:buildExtfV700]` prefix if logging is needed (though a pure compute function typically needs no logging).
11. **DO NOT** format the Belegdatum as `MMDD` — it's `DDMM` (Tag first, Monat second). Verify with the test.
12. **DO NOT** use `Number.toLocaleString("de-DE")` for `formatAmount` — it may add thousands separators (`"1.234,56"`) which DATEV does NOT expect. Use `toFixed(2).replace(".", ",")` which produces `"1234,56"` without thousands.

### References

- [Source: `_bmad-output/implementation-artifacts/spike-p1-datev-format-2026-05-04.md`] — Full format spec, encoding decision, field mapping, WJ-Beginn computation, Gegenkonto fallback
- [Source: `_bmad-output/planning-artifacts/epics.md#Story 5.2`] — Original ACs and BDD scenarios (superseded by this story where they conflict)
- [Source: `_bmad-output/implementation-artifacts/5-1-datev-settings-configuration.md#Dev Notes`] — DB column `datev_default_kreditorenkonto`; Story 5.1 file list
- [Source: `packages/gobd/package.json`] — Package structure to mirror
- [Source: `packages/gobd/src/csv.ts:1-23`] — `escapeField`, `BOM`, `DELIM`, `EOL` to copy
- [Source: `packages/gobd/vitest.config.ts`] — Vitest config to mirror
- [Source: `packages/shared/src/constants/skr.ts:54-62`] — `mapBuSchluessel` (import, don't duplicate)
- [Source: `_bmad-output/implementation-artifacts/smoke-test-format-guide.md`] — Tier 1/Tier 2 smoke test format

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

No blockers or debugging needed. Implementation followed gobd patterns exactly.

### Completion Notes List

- Implemented `packages/datev` as a full buildable ESM package mirroring `packages/gobd` structure
- `buildExtfV700()` generates DATEV EXTF Buchungsstapel v700 CSV with UTF-8 BOM, CRLF, and semicolon delimiter
- 29-field EXTF header with correct WJ-Beginn computation (fiscal year aware), erzeugtAm timestamp (YYYYMMDDHHmmssmmm), and SKR plan suffix
- COLUMN_HEADER_ROW: 14 named columns + 102 empty trailing semicolons = 116 total
- Data rows: 14 populated fields + 102 empty trailing = 116 total per row
- Row skipping: gross_total non-finite/zero/negative or falsy invoice_date → skipped; null skr_code/supplier/bu_schluessel/invoice_number → empty field in row
- gegenKonto computed once per batch (not per-row) using defaultKreditorenkonto ?? SKR03→70000/SKR04→10000 fallback
- escapeField applied to all data row fields: formula injection guard + RFC 4180 quoting
- Belegdatum: DDMM order (not MMDD) — verified by test
- formatAmount: Math.abs + toFixed(2).replace(".",",") — no thousands separator
- 32 tests passing (vitest): BOM, CRLF, all helpers, integration tests
- `pnpm check-types` root: 0 errors | `pnpm lint` root: 0 errors (pre-existing web warnings only)

**Smoke Test:**

| # | Action | Expected Output | Pass Criterion | Status |
|---|--------|----------------|----------------|--------|
| (a) | `pnpm --filter @rechnungsai/datev build` | Zero TypeScript errors; `dist/index.js` created | Exit 0 | DONE — confirmed during implementation |
| (b) | `pnpm --filter @rechnungsai/datev test` | 32 tests passing | All green | DONE — 32/32 passed |
| (c) | `pnpm check-types` from root | Zero TS errors across all packages | Exit 0 | DONE — 12/12 tasks successful |
| (d) | `pnpm lint` from root | Zero errors (pre-existing web warnings OK) | 0 errors | DONE — 0 errors, 16 pre-existing warnings |

[Smoke test format: _bmad-output/implementation-artifacts/smoke-test-format-guide.md]

---

### Browser Smoke Test

**Environment:** `pnpm dev` from repo root (not strictly needed for this story — no web UI changes). Tests run via `pnpm --filter @rechnungsai/datev test`.

#### UX Checks

| # | Action | Expected Output | Pass Criterion | Status |
|---|--------|----------------|----------------|--------|
| (a) | From repo root, run `pnpm --filter @rechnungsai/datev build` | Terminal shows TypeScript compilation completing with no errors; `packages/datev/dist/` directory is created with `index.js`, `index.d.ts`, and `formats/extf-v700.js` | Pass if build exits 0 and `dist/index.js` exists | DONE |
| (b) | From repo root, run `pnpm --filter @rechnungsai/datev test` | Terminal shows all test cases passing (green). No test failures. Test count matches the expected number (≥20 tests) | Pass if the test runner exits 0 with all tests green and no skipped tests | DONE — 32 tests passed |
| (c) | From repo root, run `pnpm check-types` | Zero TypeScript errors across all packages including `@rechnungsai/datev` | Pass if exit code is 0 and no error output | DONE |
| (d) | From repo root, run `pnpm lint` | Zero lint errors | Pass if exit code is 0 | DONE |

#### DB Verification

*This story makes no database changes. No DB verification queries required.*

**Manual Steps for GOZE:**
1. `cd /home/omerfkgoze/Documents/GitHub/RechnungsAI`
2. `pnpm --filter @rechnungsai/datev build` — confirm exits 0
3. `pnpm --filter @rechnungsai/datev test` — confirm all tests green
4. `pnpm check-types` — confirm zero errors
5. Mark checks DONE or FAIL

### File List

- `packages/datev/package.json` (updated — build/test scripts, vitest devDeps, exports, main/types to dist/)
- `packages/datev/vitest.config.ts` (new — copy of gobd vitest.config.ts)
- `packages/datev/tsconfig.json` (updated — added `"types": ["node"]`)
- `packages/datev/src/types.ts` (new — DatevTenantConfig, DatevBookingRow, DatevExportResult)
- `packages/datev/src/formats/extf-v700.ts` (new — buildExtfV700 and all helpers)
- `packages/datev/src/formats/extf-v700.test.ts` (new — 32 test cases)
- `packages/datev/src/index.ts` (updated — export barrel from stub to real exports)

### Review Findings

- [x] [Review][Patch] Amount field incorrectly quoted: `escapeField` triggers RFC 4180 quoting on comma (`,`), wrapping `"1190,00"` as `"\"1190,00\""`. DATEV semicolon-delimited format does not need comma quoting — DATEV will reject quoted amounts. Fix: remove `|| s.includes(",")` from quoting condition in `escapeField`. [`packages/datev/src/formats/extf-v700.ts`:`escapeField`] ✓ fixed
- [x] [Review][Patch] BOM defined as literal Unicode character `"﻿"` (U+FEFF embedded in source) instead of `"﻿"` — fragile if any tool strips the BOM character silently. [`packages/datev/src/formats/extf-v700.ts`:3] ✓ fixed
- [x] [Review][Defer] `formatBelegdatum` no ISO validation: non-ISO dates (e.g., `"2024-01-05T12:00:00Z"`) pass `!row.invoice_date` guard and produce garbage Belegdatum via `parts[2]!` non-null assertion. — deferred, caller (Story 5.3) responsible for ISO-format input [`packages/datev/src/formats/extf-v700.ts`:`formatBelegdatum`]
- [x] [Review][Defer] `padAccount` does not truncate `skr_code` longer than `sachkontenlaenge` — `padStart` is no-op when string already exceeds target length, emitting over-length Konto field. — deferred, caller responsibility [`packages/datev/src/formats/extf-v700.ts`:`padAccount`]
- [x] [Review][Defer] `beraterNr`/`mandantenNr` not escaped in `buildHeader` — direct join without `escapeField`; a semicolon in these values would corrupt header field count. — deferred, numerically constrained in DB [`packages/datev/src/formats/extf-v700.ts`:`buildHeader`]
- [x] [Review][Defer] `computeWjBeginn` no range validation for `fiscalYearStart` — out-of-range values (0, 13+) produce invalid DATEV dates. — deferred, DB constrains value [`packages/datev/src/formats/extf-v700.ts`:`computeWjBeginn`]
- [x] [Review][Defer] `formatErzeugtAm` uses local server time, not UTC/German local time — timestamp may be off by 1-2 hours for CET/CEST tenants. — deferred, erzeugtAm is metadata, pre-existing architectural pattern [`packages/datev/src/formats/extf-v700.ts`:`formatErzeugtAm`]

### Change Log

- 2026-05-06: Implemented Story 5.2 — DATEV EXTF Buchungsstapel CSV generation in `packages/datev`. New files: `src/types.ts`, `src/formats/extf-v700.ts`, `src/formats/extf-v700.test.ts`, `vitest.config.ts`. Updated: `package.json`, `tsconfig.json`, `src/index.ts`. Build: zero errors. Tests: 32/32 green. Type check + lint: clean.
