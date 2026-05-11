# Story 6.1: EN 16931 Invoice Validation Engine

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want incoming e-invoices to be automatically validated against the official European standard,
so that I know immediately if a supplier's invoice is compliant before I process it.

## Context: Wire-Up Story — Two New Packages + One Integration

**STOP — read this before reading the ACs.**

Story 6.1 is the **wire-up story for two new packages plus an integration into the existing extraction flow**. The package internals are scoped by P1+P2 spikes (already done); the choreography is scoped by P4 (also done). This story does NOT ship the 6.2 UI (results display + correction email — that is Story 6.2) and does NOT ship real email infrastructure (A5 resolution: mailto shim in 6.2; Epic 8.3 owns real send).

### Wire-up Surfaces (six — matches the P4 spike threshold for "dedicated wire-up spike required")

1. **`packages/validation`** — new pure-compute TS package: `validateEN16931(xml, opts) → ValidationReport`, `detectProfile(xml)`, `projectToInvoiceData(report) → InvoiceData`. UBL 2.1 + CII D16B parsers + shared rule engine. Stub package already scaffolded (`packages/validation/package.json` exists; `src/` is empty per check on 2026-05-11).
2. **`packages/pdf`** — new pure-compute TS package: `extractZugferdXml(bytes) → ZugferdExtractionResult`, `isLikelyEInvoicePdf(bytes) → boolean`, `extractAttachments(bytes)`. Stub package already scaffolded (`packages/pdf/package.json` exists; `src/` is empty).
3. **DB migration** — 4 new columns on `invoices` (`validation_status`, `validation_errors`, `validation_rule_set_version`, `validated_at`) + audit allow-list extension folding the previously-tracked Epic 6 P5 task (`validation_passed`, `validation_failed`, `revalidation_completed`).
4. **`extractInvoice` Server Action** — modified at `apps/web/app/actions/invoices/upload.ts:202` to (a) detect ZUGFeRD PDFs before AI extraction, (b) validate XML inline, (c) short-circuit AI when ZUGFeRD validates clean, (d) merge validation fields into the existing final UPDATE, (e) emit a second audit event.
5. **`revalidateInvoice` Server Action** — new function in `apps/web/app/actions/invoices/review.ts` for explicit user re-trigger (banner on detail page when rule-set bumps; click → revalidate).
6. **No UI rendering of `validation_errors`** — Story 6.2 owns that. This story only writes the data so 6.2 can read it.

### Scope reduction (read carefully)

- **No 6.2 UI** — no `<ValidationResults>` component, no detail-page row rendering of `validation_errors`, no "Korrektur anfordern" button. 6.2 builds the read side.
- **No real email** — A5 already decided mailto-shim for 6.2; this story does not touch `packages/email` or `tenants.steuerberater_email` (P3.1 already landed that column).
- **No `original_xml` column** — D3: Storage is the SSOT for XML; both `extractInvoice` (initial) and `revalidateInvoice` (re-trigger) re-download from `file_path` on demand. No duplicate persistence.
- **No `validation_runs` history table** — out of scope per spike §7. Audit trail carries per-run history; `invoices.validation_*` carries current state.
- **No RPC wrapper** — D7: `validation_status` is internal UX, not a GoBD legal record like `commit_datev_export`. Single UPDATE per invoice is sufficient. Audit is best-effort (D9: log to Sentry, do not fail the user op).
- **No KoSIT-style versioned rule modules** — single in-place rule set baked as `kosit-2.5.0`; bump = update string + content. Time-travel re-validation is deferred.
- **No background queue / Edge Function** — D1: sync inline inside `extractInvoice` on Node runtime. p95 < 500 ms for 200-line invoice (P1 estimate). Async is a known-deferred optimization, not v1.

### What is in scope

1. **Build `packages/validation` per the file layout in P1 research §"Recommended File Layout"** — `parsers/{xml,detect,ubl,cii}`, `rules/{engine,en16931-core,en16931-calculations,en16931-codelists,en16931-vat,xrechnung-de,codelists/}`, public API `validateEN16931` + `detectProfile` + `projectToInvoiceData` + types. Dep: `fast-xml-parser@^5` (MIT, ~120 kB).
2. **Build `packages/pdf` per the file layout in P2 spike §4.1** — `extract-attachments.ts`, `extract-zugferd-xml.ts`, `detect-einvoice.ts`, `types.ts`, `index.ts`. Dep: `pdf-lib@^1.17.1` (MIT, ~300 kB).
3. **Single Supabase migration** `20260511000000_invoice_validation.sql` adds 4 columns + check constraint + folded audit allow-list extension + index. Forward-only. After migration, regenerate `packages/shared/src/types/database.ts`.
4. **Modify `extractInvoice`** in `apps/web/app/actions/invoices/upload.ts:202` to wire validation into the existing flow per the choreography in spike P4 §3.1.
5. **Add `revalidateInvoice`** in `apps/web/app/actions/invoices/review.ts` (file already exists at `apps/web/app/actions/invoices/review.ts:1`).
6. **Tests** for each new package, the extended `extractInvoice`, and the new `revalidateInvoice` — 4-tier pyramid per P1 research §"Four-tier test pyramid": unit-per-rule, integration-against-KoSIT-corpus, rules-coverage assertion, caller wire-up. PDF extraction has 3 fixture PDFs (P2 §8).

### What is NOT in scope

- 6.2 UI work (`<ValidationResults>` + `<CorrectionEmailDialog>` + detail-page rendering of `validation_errors`).
- Real email send (Epic 8.3) — `mailto:` shim lives in 6.2.
- `original_xml` column / in-app XML preview (D3 / spike §7).
- `validation_runs` history table.
- Auto-recompute when rule set bumps (D11 — manual via banner only; banner itself is 6.2 UI).
- New "validation pending" status badges in `<InvoiceListCard>` — `validation_status` is rendered later in 6.2.

## Acceptance Criteria

### Package: `packages/validation`

1. **Given** the package `packages/validation` is currently a stub (`src/` empty as of 2026-05-11) **When** the story is implemented **Then** `packages/validation/src/index.ts` exports three named functions and the relevant types verbatim per spike P1 §"Package Public API":

    ```ts
    export function validateEN16931(
      xml: string,
      opts?: { profile?: 'auto' | 'ubl' | 'cii'; ruleSet?: 'core' | 'xrechnung' }
    ): ValidationReport;
    export function detectProfile(xml: string): 'ubl' | 'cii' | 'unknown';
    export function projectToInvoiceData(report: ValidationReport): InvoiceData;
    export type {
      ValidationReport, ValidationViolation, ValidationStatus,
      ViolationCategory, Severity, Invoice
    };
    ```

    `ValidationReport.status` is one of `'valid' | 'invalid' | 'warning'` (P1 contract — note: the broader 6-value enum `pending|valid|warning|invalid|unsupported|skipped` is the DB column shape per D13, not the package shape; the package never emits `pending|unsupported|skipped` — those are caller-level states. The caller's mapping is documented in AC #15). `validateEN16931` is **sync** (CPU-only — not `Promise`). Pure compute. No imports from `@supabase/*`, `next/*`, `react/*`, `apps/web/*`. Only one runtime dep: `fast-xml-parser` (add to `dependencies`, NOT `peerDependencies`).

2. **Given** the file layout in P1 research §"Recommended File Layout" **When** the package is built **Then** the following files exist verbatim (do NOT create `xrechnung.ts` / `zugferd.ts` at top level — P1 explicitly revises the original epic-line decomposition because ZUGFeRD is a transport, not a syntax):

    ```
    packages/validation/src/
    ├── index.ts                                 (public exports + barrel)
    ├── types.ts                                 (ValidationReport, ValidationViolation, Invoice, Party, …)
    ├── parsers/
    │   ├── xml.ts                               (parseXml(xml) → RawObj; fxp wrapper, no logic)
    │   ├── detect.ts                            (detectProfile(xml))
    │   ├── ubl.ts                               (projectFromUbl(RawObj) → Invoice)
    │   └── cii.ts                               (projectFromCii(RawObj) → Invoice)
    ├── rules/
    │   ├── engine.ts                            (runRules(invoice, ruleSet) → Violation[])
    │   ├── en16931-core.ts                      (BR-01..BR-65 + structural)
    │   ├── en16931-calculations.ts              (BR-CO-* totals/rounding/VAT cross-checks)
    │   ├── en16931-codelists.ts                 (BR-CL-* currency/country/VAT cat/units)
    │   ├── en16931-vat.ts                       (BR-S/Z/E/AE/G/IC/IG/IP/O-* per-category)
    │   ├── xrechnung-de.ts                      (de-BR-*)
    │   └── codelists/
    │       ├── iso4217-currency.ts              (export const SET = new Set([...]))
    │       ├── iso3166-country.ts
    │       ├── unece-rec20-units.ts
    │       └── vat-categories.ts
    ├── project-to-invoice-data.ts               (P4 spike §5.3 — projection helper for caller)
    └── __tests__/
        ├── parse.ubl.test.ts
        ├── parse.cii.test.ts
        ├── rules.coverage.test.ts               (asserts every KoSIT 2.5.0 ID is implemented)
        ├── rules.engine.test.ts
        ├── rules.en16931-core.test.ts
        ├── rules.en16931-calculations.test.ts
        ├── rules.en16931-codelists.test.ts
        ├── rules.xrechnung-de.test.ts
        ├── integration.kosit-corpus.test.ts     (KoSIT XRechnung-testsuite corpus)
        ├── project-to-invoice-data.test.ts
        └── fixtures/
            ├── kosit-corpus/                    (vendored from itplr-kosit/xrechnung-testsuite)
            ├── synthetic-ubl/
            └── synthetic-cii/
    ```

3. **Given** `fast-xml-parser` is added as a dep **When** parsing **Then** `parsers/xml.ts` wraps `XMLParser` with the EXACT config from spike P2 §5: `{ ignoreAttributes: false, removeNSPrefix: false, parseTagValue: false, preserveOrder: false }`. **Do NOT enable** `removeNSPrefix` — UBL and CII share element names like `<Note>` and namespace prefixes (`cbc:`, `cac:`, `rsm:`, `ram:`, `udt:`, `qdt:`) are the disambiguation signal. **Do NOT enable** `parseTagValue` — EN 16931 monetary values must remain textual until the rule engine normalizes them (one rounding bug from premature `parseFloat` here would mask BR-CO-* arithmetic violations).

4. **Given** the rule encoding strategy chosen in P1 research §"Rule File Shape (P1 Goal 4)" **When** rules are written **Then** each rule is a TS object literal with shape `{ id, category, severity, citation, summary, run }`; `run: (invoice: Invoice) => null | { location?, message, messageParams? }`. `message` is **German, end-user-facing**; `summary` is **English, developer-facing**. NEVER write end-user strings in English (P1 §"Why this shape" — no i18n abstraction for v1). `run` is pure and side-effect-free. Rule arrays are exported as `readonly Rule[]`.

5. **Given** the rules coverage assertion is the linchpin (P1) **When** `rules.coverage.test.ts` runs **Then** it loads a `fixtures/kosit-corpus/manifest.json` (committed alongside the fixtures — derive it from `itplr-kosit/xrechnung-testsuite` `rules.xml` once at vendoring time; do NOT generate it dynamically in CI) listing every KoSIT 2.5.0 rule ID and asserts that every ID is present in the union of `en16931CoreRules ∪ en16931CalculationsRules ∪ en16931CodelistsRules ∪ en16931VatRules ∪ xrechnungDeRules`. New rule sets land = manifest bump + new rule entries; test catches drift before merge.

6. **Given** `projectToInvoiceData(report) → InvoiceData` (in `packages/validation/src/project-to-invoice-data.ts`) **When** invoked **Then** it maps `report.invoice` (the normalized internal model) to the `InvoiceData` shape from `@rechnungsai/shared` (the AI-extraction confidence-wrapped shape used by `invoices.invoice_data`). Each field is wrapped as `{ value: <string>, confidence: 1.0 }` because structured XML data is by construction high-confidence (P4 spike §8 open question 4: validated XML invoices land in `ready`, NEVER `review` — skipping human review for valid e-invoices is the whole point of EN 16931). Tradeoff documented; acceptable for v1. The function returns `null` if `report.status === 'invalid'` and the AI fallback path will run instead (D5).

    NOTE: This requires the package to internally expose `report.invoice` (the projected `Invoice` model). Update `ValidationReport` to include `invoice: Invoice | null` (null only when XML parsing fails before projection — `STRUCT-XML-MALFORMED`). This is an additive change to the contract in spike P1 §"Package Public API" — explicitly approved by P4 spike §5.3.

7. **Given** XXE / billion-laughs attack vectors (P1 §"Security Considerations") **When** parsing **Then** `fast-xml-parser` is non-resolving by default — no extra config needed for XXE. Add an input-size guard in `validateEN16931`: if `xml.length > 10 * 1024 * 1024` (10 MB) return one synthetic violation `STRUCT-XML-TOO-LARGE` (severity `fatal`, category `STRUCT`, German message `"XML-Datei zu groß (max. 10 MB)."`) and short-circuit parsing. Reason: existing `apps/web` upload path already caps invoice uploads at 25 MB so 10 MB is a defense-in-depth margin for the embedded-XML inside a PDF case (extracted bytes can be smaller than the PDF).

8. **Given** violation messages may leak PII (P1 §"Security Considerations") **When** rules emit messages **Then** messages reference BT/BG IDs only — NEVER echo raw field content. E.g.: `"Pflichtfeld BT-44 (Käufername) fehlt."` ✓ — NOT `"Käufername 'Max Müller' ungültig"` ✗. This protects audit logs from leaking supplier/buyer data and matches the rule-set-versioning approach (audit `metadata.violations` carries rule IDs + counts, not full message strings — see AC #21).

### Package: `packages/pdf`

9. **Given** the package `packages/pdf` is currently a stub **When** the story is implemented **Then** `packages/pdf/src/index.ts` exports:

    ```ts
    export { extractAttachments } from './extract-attachments';
    export { extractZugferdXml } from './extract-zugferd-xml';
    export { isLikelyEInvoicePdf } from './detect-einvoice';
    export type {
      ExtractedAttachment, ZugferdExtractionResult, ZugferdProfile,
    } from './types';
    ```

    The exact type shapes are dictated by P2 spike §4.2 verbatim (`ZugferdExtractionResult` is a tagged union with `kind: 'found' | 'not-zugferd' | 'error'` — caller pattern-matches on `kind`; **no exceptions cross the package boundary**). Dep: `pdf-lib@^1.17.1` (MIT). Do NOT add `pdfjs-dist` — it is the **reserved fallback** documented in P2 §3.2, not a current dep.

10. **Given** the extraction sketch in P2 spike §4.3 **When** `extractZugferdXml(bytes)` is called **Then** it walks the PDF/A-3 `/EmbeddedFiles` name tree (Kids-array recursion path required per P2 §4.3) and returns the first attachment whose filename (case-insensitively) is in `{ 'factur-x.xml', 'zugferd-invoice.xml', 'xrechnung.xml' }`, OR — if no filename match — the first attachment whose `/Subtype` is `application/xml`/`text/xml` AND `/AFRelationship` is `/Source` or `/Alternative`. **Do NOT** grab arbitrary XML attachments; suppliers sometimes attach delivery notes alongside the invoice (P2 §7 watch point). `profile: null` on return — profile detection lives in `packages/validation` (P2 §4.3 last paragraph), not here.

11. **Given** `isLikelyEInvoicePdf(bytes)` is a cheap pre-check (P2 §4.4) **When** called **Then** it loads the PDF with `pdf-lib.PDFDocument.load(bytes, { throwOnInvalidObject: false })`, inspects `catalog.lookup(PDFName.of('AF'), PDFArray)`, and returns `true` iff that array exists and has size > 0. Returns `false` on any thrown error (encrypted PDFs, corrupted bytes — P2 §7). This is the routing signal in `extractInvoice`'s PDF branch — it must be fast (single catalog parse, no full document parse).

12. **Given** the 3 test fixtures listed in P2 spike §8 **When** tests run **Then** `packages/pdf/test/fixtures/` contains three real PDFs vendored from public ZUGFeRD test corpora: `factur-x-basic.pdf` (factur-x.xml, BASIC), `zugferd-2-en16931.pdf` (factur-x.xml, EN16931), `zugferd-1-legacy.pdf` (zugferd-invoice.xml, BASIC — for filename-fallback coverage). **Source attribution**: each fixture's source URL goes in a `README.md` in that folder. If no public-domain corpus is found in 30 minutes of search, MARK THIS AC AS **BLOCKED-BY-ENVIRONMENT** in your completion notes and ship synthetic fixtures by hand-assembling a minimal PDF/A-3 with `pdf-lib`'s own embed API in a test setup file — document the choice explicitly. Do NOT skip the test — synthetic fixtures still exercise the extraction code paths.

13. **Given** `pdf-lib` is added **When** the package is built **Then** `packages/pdf/package.json` declares `"pdf-lib": "^1.17.1"` in `dependencies` and NOTHING else as a runtime dep (no `pdfjs-dist`, no `pdf-parse`, no `@stackforge-eu/factur-x` — see P2 §3.1 EUPL-1.2 rejection rationale). The license policy memorialized in P2 §10 holds: **all runtime deps in RechnungsAI must be MIT / Apache-2.0 / BSD / ISC**. Verify the resolved version in `pnpm-lock.yaml` after install — `pdf-lib@^1.17.1` should resolve to a 1.17.x or 1.18.x release.

### Migration: `20260511000000_invoice_validation.sql`

14. **Given** the migration date is today (`2026-05-11`) **When** the migration runs **Then** `supabase/migrations/20260511000000_invoice_validation.sql` adds 4 columns to `public.invoices` per the SQL sketch in spike P4 §4 verbatim (with `check (jsonb_typeof(validation_errors) = 'array')` belt-and-braces constraint):

    ```sql
    alter table public.invoices
      add column validation_status text not null default 'pending'
        check (validation_status in ('pending','valid','warning','invalid','unsupported','skipped')),
      add column validation_errors jsonb not null default '[]'::jsonb
        check (jsonb_typeof(validation_errors) = 'array'),
      add column validation_rule_set_version text null,
      add column validated_at timestamptz null;
    ```

    Verify against `packages/shared/src/types/database.ts` BEFORE writing the migration that no `validation_*` column already exists on `invoices` (checked 2026-05-11 — none does). If any near-name collision appears (e.g. a stale `is_valid bool`), STOP and ask before proceeding. **No `original_xml` column** — D3.

15. **Given** the value space `'pending'|'valid'|'warning'|'invalid'|'unsupported'|'skipped'` (D13) **When** the caller writes a value **Then** the mapping is:

    | DB value | When caller writes it |
    |---|---|
    | `pending` | Never written by the caller; only the column default for rows created before the migration backfill (existing rows get `pending` via the default; backfilled to `skipped` if `file_type` indicates non-e-invoice — see AC #18) |
    | `valid` | Package returned `ValidationReport.status = 'valid'` |
    | `warning` | Package returned `ValidationReport.status = 'warning'` (any violations have `severity: 'warning'` but none have `severity: 'fatal' | 'error'`) |
    | `invalid` | Package returned `ValidationReport.status = 'invalid'` |
    | `unsupported` | Caller saw an XML profile we don't recognize (`detectProfile` returned `'unknown'` OR the customizationId is not in our known set). Package was NOT called for this row, OR it was called and returned `STRUCT-PROFILE-UNKNOWN` as the only violation. |
    | `skipped` | File type is not an e-invoice format (image, photo-only PDF) — caller short-circuits without calling the package |

    The package itself NEVER emits `pending|unsupported|skipped` — those are caller-level states (mapped in `upload.ts` and `review.ts`).

16. **Given** the index intent in P4 §4 **When** the migration runs **Then** it creates a partial index for "what needs re-validation when rule set bumps":

    ```sql
    create index if not exists invoices_validation_rule_set_idx
      on public.invoices (tenant_id, validation_rule_set_version)
      where validation_status in ('valid','warning','invalid');
    ```

    Partial because `pending|unsupported|skipped` rows are not candidates for re-validation; excluding them keeps the index small.

17. **Given** the audit allow-list extension folds the previously-tracked Epic 6 P5 task (D14 — single migration, single rollback unit) **When** the migration runs **Then** it drops and re-creates `audit_logs_event_type_chk` to add three new values. **Mirror the EXACT `do $$ ... exception when duplicate_object then null; end $$` pattern from `supabase/migrations/20260501000000_archive_search_and_export.sql:20-31`** — that is the established idempotency wrapper for this constraint in this codebase. The new constraint list is the existing values plus `'validation_passed', 'validation_failed', 'revalidation_completed'`:

    ```sql
    do $$
    begin
      alter table public.audit_logs drop constraint if exists audit_logs_event_type_chk;
      alter table public.audit_logs add constraint audit_logs_event_type_chk check (
        event_type in (
          'upload', 'field_edit', 'categorize', 'approve', 'flag',
          'undo_approve', 'undo_flag', 'export_datev', 'export_audit', 'hash_verify_mismatch',
          'validation_passed', 'validation_failed', 'revalidation_completed'
        )
      );
    exception
      when duplicate_object then null;
    end $$;
    ```

    Re-read `20260501000000_archive_search_and_export.sql:25-26` before writing this — if any new event type has been added between Epic 4 and Epic 6 that is not in the list above, **include it in the new constraint** (the migration would fail otherwise on existing rows). As of 2026-05-11 the verified set is `'upload','field_edit','categorize','approve','flag','undo_approve','undo_flag','export_datev','export_audit','hash_verify_mismatch'` — confirm by grepping the latest migration that touched this constraint before writing.

18. **Given** the migration runs against a DB with existing invoice rows **When** the default `'pending'` kicks in **Then** all pre-existing rows get `validation_status = 'pending'`. This is acceptable as a transitional state — the column will be set authoritatively the next time each invoice is touched by `extractInvoice` or `revalidateInvoice`. **Do NOT** add a one-shot backfill UPDATE in the migration to re-run validation across existing rows — that would block the migration on potentially-expensive parsing for thousands of rows. The banner in 6.2 (D11) handles the "rule-set version is stale" UX for these rows via user-clicked `revalidateInvoice`.

19. **Given** column grants follow the Story 5.1 / Story 4.x pattern **When** the migration runs **Then** verify whether the existing pattern uses fine-grained `grant update (col1, col2, ...) on public.invoices to authenticated` (as suggested in P4 spike §4) OR a coarse `grant update on public.invoices to authenticated`. Read `supabase/migrations/20260427000000_invoice_approval_columns.sql` and `supabase/migrations/20260504000000_datev_default_kreditorenkonto.sql` to determine the established pattern for this table. **Whichever pattern is established, extend it to include the four new columns** — do NOT introduce a new grant style. If the established pattern is coarse, no grant statement is needed (the new columns inherit). If the established pattern is fine-grained, add a single `grant update (validation_status, validation_errors, validation_rule_set_version, validated_at) on public.invoices to authenticated` matching the existing block. (P4 spike §4 suggested fine-grained; verify against current state.)

20. **Given** the migration is forward-only (codebase convention) **When** committed **Then** no down migration; type regeneration must follow per the Story 5.1 precedent. After `supabase db reset` (local) succeeds, regenerate `packages/shared/src/types/database.ts` using whatever script Story 4.1 / 5.1 established (search for `gen types` or `supabase gen` in `package.json` / Turbo task config — Epic 3 prep P1 `prep-p1-supabase-gen-types` codified this). The four new columns must appear in the regenerated types; verify with `grep -n validation_status packages/shared/src/types/database.ts` post-regen.

### Server Action: modified `extractInvoice` in `apps/web/app/actions/invoices/upload.ts`

21. **Given** the existing `extractInvoice` signature **When** modified **Then** the **external signature is unchanged** (return type stays `Promise<ActionResult<{ status: 'ready' | 'review'; overall: number }>>`). The wire-up is internal: the new branches read XML/PDF bytes, call validation, and merge fields into the existing final UPDATE per the choreography in P4 spike §3.1. The `extracted_at` / `extraction_error: null` / `invoice_data` / `status` writes that already exist at `upload.ts:382-389` REMAIN — the validation fields are ADDED to the same UPDATE payload (D6 — one row, one UPDATE per invoice, no RPC, D7).

22. **Given** the new XML branch (file_type `application/xml`) **When** entered **Then** before the existing AI extraction call site (around `upload.ts:356` `aiExtractInvoice(...)`):

    a. Download bytes via `await supabase.storage.from('invoices').download(row.file_path)`. On error → existing rollback path (`status='captured'`, `extraction_error="Datei konnte momentan nicht geladen werden — bitte erneut versuchen."`); set `flippedToProcessing=false`; return — F8 in spike §6.
    b. Decode with `new TextDecoder('utf-8', { fatal: false }).decode(bytes)` — UTF-8 BOM is consumed transparently (P2 §7).
    c. Detect: `const profile = detectProfile(xml)` (from `@rechnungsai/validation`).
       - If `profile === 'unknown'`: set `validationStatus='unsupported'`, `validationErrors=[{ ruleId: 'STRUCT-PROFILE-UNKNOWN', category: 'STRUCT', severity: 'fatal', message: 'E-Rechnungsformat erkannt, aber nicht unterstützt.', citation: '' }]`, `validationRuleSetVersion='kosit-2.5.0'`, `validatedAt=now()`. Set `extraction_error = "E-Rechnungsformat erkannt, aber nicht unterstützt: <customizationId>. Validierung übersprungen."` (the `<customizationId>` is left as a literal placeholder string if not derivable cheaply — Story 6.2 wording is owned by 6.2 spike §11). Do NOT call AI (D10 — pure XML uploads skip AI). Status goes to `review` (existing `statusFromOverallConfidence` is bypassed because there is no `result.data` — see (e) below for what `invoice_data` becomes). Proceed to single UPDATE.
       - Else (`'ubl'` or `'cii'`): `const report = validateEN16931(xml, { ruleSet: 'xrechnung' })`.
    d. Compute `validationFields = { validation_status: report.status, validation_errors: report.violations, validation_rule_set_version: report.ruleSetVersion, validated_at: new Date().toISOString() }`.
    e. Project: `const invoiceData = projectToInvoiceData(report)`. If non-null (`report.status` is `'valid'` or `'warning'`): use as the `invoice_data` payload; set `status = 'ready'` regardless of any AI-style confidence routing (per AC #6 tradeoff — valid e-invoices skip the review queue). If null (`report.status === 'invalid'` OR `report.invoice` is null due to parse failure): we still have an XML row but no usable data → set `extraction_error = "XML konnte nicht gelesen werden — bitte Lieferant kontaktieren."`, `status = 'captured'` (the existing failure-rollback shape — F1 in spike §6), `invoice_data` unchanged (NULL). Do NOT call AI on pure XML uploads even on `invalid` (D10).
    f. Single UPDATE merges existing fields (`invoice_data` / `status` / `extracted_at` / `extraction_error`) with `validationFields`. Single statement → atomic.
    g. After UPDATE succeeds, emit a SECOND audit event via `logAuditEvent(supabase, { tenantId, invoiceId, actorUserId: user.id, eventType: report.status === 'valid' ? 'validation_passed' : 'validation_failed', metadata: { profile: report.profile, customizationId: report.customizationId, violationCount: report.violations.length, ruleSetVersion: report.ruleSetVersion, durationMs: report.durationMs } })`. **The existing extract-event emission stays unchanged** (do NOT consolidate to one event — extract and validate are two distinct GoBD-adjacent operations). Audit emission is best-effort (D9): on failure → `console.error` + `Sentry.captureException`, do NOT fail the user-visible operation (F5 in spike §6). Use tag `module: 'invoices'`, `action: 'validate'` for Sentry.

23. **Given** the new PDF branch (file_type `application/pdf`) **When** entered **Then** the existing `aiExtractInvoice` call at `upload.ts:356` becomes conditional. Insert this logic BEFORE that call:

    a. Download bytes (same as XML branch). On error → existing rollback path; F8.
    b. `const isEInvoice = await isLikelyEInvoicePdf(bytes)`. If `false`: do not branch — fall through to the existing AI extraction path unchanged; before the final UPDATE, set `validationStatus='skipped'`, `validationErrors=[]`, `validationRuleSetVersion=null`, `validatedAt=null` (F12 — non-e-invoice PDF, validation not applicable, no error).
    c. If `true`: `const result = await extractZugferdXml(bytes)`.
       - `result.kind === 'error'`: treat as plain PDF — fall through to AI extraction (F2). Set `validationStatus='skipped'`, `validationErrors=[]`. Log `console.warn('[invoices:validate] zugferd-extract-error', result.reason, result.detail)` + Sentry breadcrumb but DO NOT fail.
       - `result.kind === 'not-zugferd'`: same as above — `'skipped'`. No warn (this is expected for plain PDFs that happened to have `/AF` markers but no XML).
       - `result.kind === 'found'`: `const report = validateEN16931(result.xml, { ruleSet: 'xrechnung' })`. Compute `validationFields` per AC #22 (d). Branch on `report.status`:
         - `'valid'` or `'warning'`: project to `invoice_data` via `projectToInvoiceData(report)`; status = `'ready'`; **skip AI** (D5 — saves tokens + time; trust structured data over AI). Set `extracted_at = now()`, `extraction_error = null`.
         - `'invalid'`: **AI fallback** (D5) — fall through to existing AI extraction path; AI's `invoice_data` is used; `validationFields` reflect the invalid report so 6.2 still surfaces them. (F11 in spike §6 — record `usedSource: 'ai'` in audit metadata for traceability.)
    d. Single UPDATE merges fields (same shape as AC #22 (f)).
    e. Audit emission same as AC #22 (g). When AI fallback ran on `invalid`, the audit metadata gains `usedSource: 'ai'`; when XML projection was used, `usedSource: 'xml'` (F11).

24. **Given** the existing image branch (`image/jpeg`, `image/png`) **When** entered **Then** validation is not applicable — set `validationStatus='skipped'`, `validationErrors=[]`, `validationRuleSetVersion=null`, `validatedAt=null` in the final UPDATE. NO call to `packages/validation` for images. NO audit `validation_*` event (only `'extract'`-side audit, unchanged).

25. **Given** `extractInvoice` already exceeds ~250 lines (P4 spike §12 risk #2) **When** the new logic is added **Then** extract two pure helpers in the same file (`apps/web/app/actions/invoices/upload.ts`) to keep cyclomatic complexity bounded:

    ```ts
    // Both helpers are sync where possible; only download+parse paths are async.
    async function runStructuredExtraction(
      bytes: Uint8Array,
      fileType: string,
    ): Promise<{ validationFields: ValidationDbFields; invoiceData: InvoiceData | null; usedSource: 'xml' | 'ai' | 'none' }>;
    function composeUpdatePayload(
      base: { status: string; invoice_data: unknown; extracted_at: string; extraction_error: string | null },
      v: ValidationDbFields,
    ): Record<string, unknown>;
    ```

    Helper names match P4 spike §12 risk mitigation verbatim. Both stay in `upload.ts`; no new file. Add unit tests for `composeUpdatePayload` (3 cases: skipped, valid, invalid). `runStructuredExtraction` is harder to unit-test (depends on Supabase storage); cover it via the action-level tests (AC #28).

26. **Given** the existing rollback paths in `extractInvoice` (currently at `upload.ts:322, 346, 363, 392, 429`) **When** a new failure mode triggers **Then** the rollback shape is unchanged: set `status='captured'`, set German `extraction_error`, set `flippedToProcessing=false`, return `{ success: false, error: msg }`. Add NO new rollback paths for validation failures — `validation_status='invalid'` is a SUCCESS path for `extractInvoice` (the row reaches `review` or `ready` with errors stored on it; the user sees them in 6.2). The ONLY new rollback path is F1 (XML projection returned null — `extraction_error = "XML konnte nicht gelesen werden — bitte Lieferant kontaktieren."`, status back to `captured`).

### Server Action: new `revalidateInvoice` in `apps/web/app/actions/invoices/review.ts`

27. **Given** the file `apps/web/app/actions/invoices/review.ts` already exists (`apps/web/app/actions/invoices/review.ts:1` is `"use server"`, currently exports `correctInvoiceField`, `signInvoiceUrl`, `categorizeInvoice`, `updateSkrCode`) **When** the story is implemented **Then** the file gains a new exported function `revalidateInvoice` per P4 spike §5.2 verbatim:

    ```ts
    export async function revalidateInvoice(
      invoiceId: string,
    ): Promise<ActionResult<{ status: ValidationStatus; violationCount: number }>>;
    ```

    Shape:

    a. `invoiceIdSchema.safeParse(invoiceId)` (helper from `./shared`).
    b. Auth + tenant resolution — MIRROR `correctInvoiceField` at `review.ts:25-58` verbatim (it does `getUser` → `users.select('tenant_id').eq('id', user.id).single()` → redirect on failure).
    c. Row select with **tenant guard** (Epic 4 retro P2 pattern — `.eq('tenant_id', tenantId)`):

       ```ts
       await supabase
         .from('invoices')
         .select('id, tenant_id, status, file_path, file_type, validation_rule_set_version')
         .eq('id', invoiceId)
         .eq('tenant_id', tenantId)
         .single();
       ```

    d. If `row.status === 'processing'` → `{ success: false, error: 'Extraktion läuft. Bitte einen Moment warten.' }`. Allow ALL OTHER statuses (P4 spike §8 open question 3 — re-validation is a read-side compute, doesn't affect approval state).
    e. If `row.file_type` is not in `{ 'application/xml', 'application/pdf' }` → `{ success: true, data: { status: 'skipped', violationCount: 0 } }` AND set `validation_status='skipped'` if not already (idempotent). No audit event.
    f. Re-run the SAME XML / PDF branch logic from AC #22 / AC #23 — BUT extract the shared logic into a helper rather than copy-pasting. Helper goes in `apps/web/app/actions/invoices/shared.ts` (or — if it imports server-only deps — keep it in `upload.ts` and `import { runStructuredExtraction } from './upload'`; verify no `"use server"` cross-file leakage by checking that `runStructuredExtraction` is not in a `'use server'` export — Next.js 16 requires `'use server'` files to export ONLY server actions per `apps/web/AGENTS.md` "This is NOT the Next.js you know"). The shared helper is the SAME `runStructuredExtraction` from AC #25.
    g. Single UPDATE on `invoices` setting `validation_status`, `validation_errors`, `validation_rule_set_version`, `validated_at`. Tenant guard: `.eq('id', invoiceId).eq('tenant_id', tenantId)`.
    h. Audit: `logAuditEvent(supabase, { tenantId, invoiceId, actorUserId: user.id, eventType: 'revalidation_completed', metadata: { profile, customizationId, violationCount, ruleSetVersionBefore: row.validation_rule_set_version, ruleSetVersionAfter: report.ruleSetVersion, durationMs: report.durationMs } })`. Best-effort per D9 — Sentry on failure, do NOT fail user op.
    i. `revalidatePath(\`/rechnungen/${invoiceId}\`)`.
    j. Catch block: mirror the `NEXT_REDIRECT` digest-detect pattern from `correctInvoiceField` (`review.ts:117-126` if present, else the canonical pattern at `apps/web/app/actions/invoices/approval.ts:129-143`). Tag: `module: 'invoices'`, `action: 'revalidate'`.

28. **Given** F6 (double-click race) **When** the user clicks "Erneut validieren" twice in quick succession (Story 6.2 banner will render this; for now, the action must be safe) **Then** `revalidateInvoice` is idempotent: the second call performs the same parse+validate work and writes the same result. NO server-side debounce / cached-result short-circuit (would add complexity for no real benefit since the work is cheap). Client-side `useTransition` (which 6.2 will add) prevents the double-submit at the UI layer; this AC is just defending the server side from accidental duplicate calls.

### Test Coverage

29. **Given** the test pyramid from P1 research §"Four-tier test pyramid" **When** the story ships **Then** `packages/validation/__tests__/` contains the file set listed in AC #2 (the test file names are the contract). Coverage targets:

    | Tier | File(s) | Cases |
    |---|---|---|
    | Unit — parsing | `parse.ubl.test.ts`, `parse.cii.test.ts` | 3 happy + 2 malformed per syntax (6 + 6) |
    | Unit — rules | `rules.{en16931-core,en16931-calculations,en16931-codelists,xrechnung-de}.test.ts` | 1 PASS + 1 FAIL per rule (covers each `Rule.run` branch); ~150 rules → ~300 cases total |
    | Unit — engine | `rules.engine.test.ts` | rule-set switching ('core' vs 'xrechnung'), violation ordering, empty-rule-set guard |
    | Coverage | `rules.coverage.test.ts` | one assertion per KoSIT 2.5.0 ID in the manifest |
    | Integration | `integration.kosit-corpus.test.ts` | Iterate vendored KoSIT corpus subfolders; assert `valid` for `/standard/*`, expect violations for `/technical-cases/*` per the corpus's own `expected.json` if present (fallback: assert non-empty violations array) |
    | Projection | `project-to-invoice-data.test.ts` | 3 cases — minimal invoice, full invoice, invoice with line items; assert each field is `{ value: <string>, confidence: 1.0 }`; assert null return on invalid report |

    **Realism check**: ~300 individual rule cases is a lot. If you can't write all of them in this story (sprint budget), the MINIMUM scope is: every `Rule.run` has at least the PASS path covered by `integration.kosit-corpus.test.ts` (so the function is exercised). The per-rule unit FAIL case is the part that gates merge. Mark any uncovered rule explicitly in completion notes; do NOT silently skip.

30. **Given** the 3 PDF fixtures from AC #12 **When** `packages/pdf/__tests__/` runs **Then** the test cases from P2 spike §8 verbatim: detector (AF present vs absent), extractor (each fixture → expected filename + non-empty UTF-8 string starting with `<?xml`), negative non-ZUGFeRD PDF, negative non-XML attachment, negative corrupted bytes, name-tree edge case (paginated tree → Kids recursion). Pattern: model on `packages/datev/__tests__/` and `packages/gobd/__tests__/` for test file layout (`vitest.config.ts` shape — mirror those packages line-by-line).

31. **Given** the modified `extractInvoice` **When** tests run **Then** `apps/web/app/actions/invoices/upload.test.ts` (existing file — EXTEND it, do NOT create a new file) gains new cases using the EXACT mock-chain pattern from the existing file (re-read `upload.test.ts:1-80` before writing — Supabase mock chains break in subtle ways; Epic 3 lesson):
    - (a) XML branch — happy `valid`: pure XML upload, `validateEN16931` mocked to return valid report, `invoice_data` is populated via `projectToInvoiceData`, single UPDATE has `validation_status='valid'`, audit emits `validation_passed`, no AI call.
    - (b) XML branch — `invalid`: rollback path, status → `'captured'`, `extraction_error` is the German message from AC #22.e, no audit event.
    - (c) XML branch — `unsupported`: status='review', `extraction_error` is the German placeholder message, `validation_status='unsupported'`, no AI call.
    - (d) PDF branch — not-e-invoice: `isLikelyEInvoicePdf` returns false → existing AI path runs unchanged, `validation_status='skipped'` in final UPDATE, `validation_errors=[]`.
    - (e) PDF branch — valid ZUGFeRD: `extractZugferdXml.kind='found'`, validation passes, AI is NOT called (assert mock not invoked), XML projection writes `invoice_data`, audit emits `validation_passed` with `usedSource: 'xml'` metadata.
    - (f) PDF branch — invalid ZUGFeRD: AI fallback runs (assert mock IS invoked), validation fields reflect the invalid report, audit has `usedSource: 'ai'`.
    - (g) PDF branch — extract-error: warn + Sentry breadcrumb, AI fallback runs, status='skipped'.
    - (h) Image branch — `validation_status='skipped'`, `validation_errors=[]`, no `packages/validation` call.
    - (i) Audit failure swallowed: `logAuditEvent` throws, action still returns success, Sentry captures (use `vi.mocked(captureException).mockClear()` + assert called).

    Mock the packages: `vi.mock('@rechnungsai/validation', () => ({ validateEN16931: vi.fn(), detectProfile: vi.fn(), projectToInvoiceData: vi.fn() }))` and `vi.mock('@rechnungsai/pdf', () => ({ isLikelyEInvoicePdf: vi.fn(), extractZugferdXml: vi.fn() }))`. DO NOT instantiate the real packages in this test file — that's `integration.kosit-corpus.test.ts`'s job.

32. **Given** the new `revalidateInvoice` **When** tests run **Then** a new file `apps/web/app/actions/invoices/review.test.ts` covers: (a) happy XRechnung re-validate → success, single UPDATE issued, audit emits `revalidation_completed`; (b) tenant-isolation guard — invoice belongs to different tenant → `{ success: false, error: ... }`, no UPDATE issued; (c) file_type='image/jpeg' → `{ success: true, data: { status: 'skipped', violationCount: 0 } }`, no `packages/validation` call; (d) `status='processing'` → blocked error; (e) auth failure → `redirect(...)` thrown; (f) audit failure swallowed; (g) PDF non-zugferd → skipped. Reuse the same `vi.mock` pattern as AC #31.

    NOTE: The existing `review.ts` already exports `correctInvoiceField` + `categorizeInvoice` + `updateSkrCode`. If `review.test.ts` already exists (verify with `ls apps/web/app/actions/invoices/`), EXTEND it instead of creating a new file. As of 2026-05-11, the file does not exist.

### Smoke Test Format

33. **Given** Epic 3 A1 / Epic 5 retro A3 enforcement **When** the smoke test section is written **Then** it follows `_bmad-output/implementation-artifacts/smoke-test-format-guide.md` verbatim — UX Checks table with columns (#, Action, Expected Output, Pass Criterion, Status) + DB Verification table with columns (#, Query, Expected Return, What It Validates, Status). ALL UX-tier rows MUST be marked `BLOCKED-BY-ENVIRONMENT` (dev agent has no real browser) with manual steps for GOZE below the table. DB Verification rows are `BLOCKED-BY-ENVIRONMENT` only if GOZE doesn't have local Postgres access — assume they do, so DB rows can be `DONE` once verified locally by the dev agent against `supabase db reset`-applied schema.

## Tasks / Subtasks

- [ ] **Task 1 — Vendor KoSIT corpus + manifest** (AC: #5, #29)
  - [ ] Clone or download `itplr-kosit/xrechnung-testsuite` (Apache-2.0); copy `src/test/business-cases/{standard,extension}/*.xml` + `src/test/technical-cases/*.xml` to `packages/validation/__tests__/fixtures/kosit-corpus/`
  - [ ] Generate `manifest.json` listing every rule ID from `rules.xml` (one-shot script in `__tests__/fixtures/_tools/build-manifest.ts`, run once, commit the JSON; do NOT make CI regenerate it)
  - [ ] Add `NOTICE.md` to fixtures folder citing KoSIT corpus source + Apache-2.0 license

- [ ] **Task 2 — Build `packages/validation`** (AC: #1, #2, #3, #4, #6, #7, #8)
  - [ ] Add `fast-xml-parser@^5` to `packages/validation/package.json` dependencies
  - [ ] Author `types.ts` (ValidationReport, ValidationViolation, Invoice, Party, BG/BT shapes per P1 §"Invoice (normalized model)")
  - [ ] Author `parsers/xml.ts` (fxp wrapper with the exact config from AC #3)
  - [ ] Author `parsers/detect.ts` (`detectProfile(xml)` — UBL vs CII vs unknown per P1 §"Profile Detection & Routing")
  - [ ] Author `parsers/ubl.ts` + `parsers/cii.ts` (projection from raw fxp output → Invoice; emit `STRUCT-*` violations on missing required structural fields)
  - [ ] Author `rules/engine.ts` (Rule type + `runRules` per P1 §"Rule File Shape")
  - [ ] Author `rules/codelists/{iso4217-currency,iso3166-country,unece-rec20-units,vat-categories}.ts` (static Sets)
  - [ ] Author `rules/en16931-core.ts` (BR-01..BR-65 — mandatory field + structural rules)
  - [ ] Author `rules/en16931-calculations.ts` (BR-CO-* — totals, rounding, VAT-amount cross-checks)
  - [ ] Author `rules/en16931-codelists.ts` (BR-CL-* — codelist membership)
  - [ ] Author `rules/en16931-vat.ts` (BR-S/Z/E/AE/G/IC/IG/IP/O-*)
  - [ ] Author `rules/xrechnung-de.ts` (de-BR-* — German CIUS extension; gated by `ruleSet === 'xrechnung'`)
  - [ ] Author `project-to-invoice-data.ts` (AC #6 — Report → InvoiceData mapping with confidence: 1.0)
  - [ ] Author `index.ts` barrel
  - [ ] Vitest config — mirror `packages/datev/vitest.config.ts` + `packages/datev/package.json` test script

- [ ] **Task 3 — Build `packages/pdf`** (AC: #9, #10, #11, #13)
  - [ ] Add `pdf-lib@^1.17.1` to `packages/pdf/package.json` dependencies
  - [ ] Author `types.ts` (per P2 §4.2)
  - [ ] Author `extract-attachments.ts` (per P2 §4.3 — name-tree walker)
  - [ ] Author `extract-zugferd-xml.ts` (per P2 §4.3 — filename + AFRelationship filter)
  - [ ] Author `detect-einvoice.ts` (per P2 §4.4)
  - [ ] Author `index.ts` barrel
  - [ ] Vitest config — same pattern as `packages/validation`

- [ ] **Task 4 — Fixture PDFs** (AC: #12)
  - [ ] Try to source the 3 PDFs from public ZUGFeRD test corpora (FNFE-MPE, Konsens, ZUGFeRD-Community); commit to `packages/pdf/__tests__/fixtures/` with a `README.md` citing sources
  - [ ] If no public-domain corpus found in 30 minutes: hand-assemble synthetic ZUGFeRD PDFs with `pdf-lib`'s embed API in a `__tests__/setup.ts` (programmatically create a PDF/A-3 with each filename variant + valid CII bytes for one minimal invoice)
  - [ ] Mark this task's smoke-test row `BLOCKED-BY-ENVIRONMENT` only if synthetic path is taken

- [ ] **Task 5 — Migration `20260511000000_invoice_validation.sql`** (AC: #14, #16, #17, #18, #19)
  - [ ] Verify no existing `validation_*` columns on `invoices` (`grep -n validation packages/shared/src/types/database.ts`)
  - [ ] Verify the current event-type allow-list (re-read latest migration touching `audit_logs_event_type_chk` — `supabase/migrations/20260501000000_archive_search_and_export.sql:25-26` as of 2026-05-11)
  - [ ] Verify the established grants pattern on `invoices` (re-read `20260427000000_invoice_approval_columns.sql` + `20260504000000_datev_default_kreditorenkonto.sql`)
  - [ ] Author migration combining: ADD COLUMN (×4), ADD CHECK constraints, ADD INDEX, DROP+ADD `audit_logs_event_type_chk` with the new event types, GRANT extension (only if fine-grained pattern is established)
  - [ ] Header comment block at top following `20260504000000_datev_default_kreditorenkonto.sql` style — positive insert query, RLS rejection query, check-constraint rejection query

- [ ] **Task 6 — Regenerate types** (AC: #20)
  - [ ] Run `supabase db reset` locally to apply the migration
  - [ ] Run the established `gen-types` script (find in `package.json` / Turbo task config — Epic 3 prep P1 codified)
  - [ ] Verify `packages/shared/src/types/database.ts` now has `validation_status`, `validation_errors`, `validation_rule_set_version`, `validated_at` on `invoices`
  - [ ] Verify `audit_logs.event_type` literal-union (if it appears as such in the generated types) includes the three new values

- [ ] **Task 7 — Modify `extractInvoice` in `apps/web/app/actions/invoices/upload.ts`** (AC: #21, #22, #23, #24, #25, #26)
  - [ ] Add imports for `validateEN16931`, `detectProfile`, `projectToInvoiceData` from `@rechnungsai/validation` and `isLikelyEInvoicePdf`, `extractZugferdXml` from `@rechnungsai/pdf`
  - [ ] Author `runStructuredExtraction` helper at the top of the file (sync where possible, async for the download+parse path)
  - [ ] Author `composeUpdatePayload` helper (sync; pure)
  - [ ] Refactor the existing branch logic at `upload.ts:320-400` to insert the XML / PDF / image branches per AC #22 / #23 / #24
  - [ ] Merge `validationFields` into the existing final UPDATE at `upload.ts:382-389`
  - [ ] Add the second `logAuditEvent` call for validation event (best-effort, after the existing extract-side event)

- [ ] **Task 8 — Add `revalidateInvoice` in `apps/web/app/actions/invoices/review.ts`** (AC: #27, #28)
  - [ ] Import `runStructuredExtraction` (verify export shape works across files; if `"use server"` cross-file constraints block this, inline the relevant branches in `review.ts` instead — but DO NOT copy 200 lines; the shared logic must live in one place)
  - [ ] Author `revalidateInvoice` per the shape in AC #27
  - [ ] Wire `revalidatePath`

- [ ] **Task 9 — Tests** (AC: #29, #30, #31, #32)
  - [ ] `packages/validation/__tests__/*` per the file list in AC #2
  - [ ] `packages/pdf/__tests__/*` per AC #30
  - [ ] Extend `apps/web/app/actions/invoices/upload.test.ts` per AC #31
  - [ ] Create `apps/web/app/actions/invoices/review.test.ts` per AC #32

- [ ] **Task 10 — Smoke test section + completion notes** (AC: #33)
  - [ ] Author "Browser Smoke Test" section under Dev Agent Record → Completion Notes using the format guide template verbatim
  - [ ] All UX rows BLOCKED-BY-ENVIRONMENT with manual steps
  - [ ] DB Verification rows can be DONE if dev verified locally
  - [ ] Add `[Smoke test format: _bmad-output/implementation-artifacts/smoke-test-format-guide.md]` in Dev Notes per the format checklist

## Dev Notes

### Pattern Citations (Epic 5 retro A2 — "Pattern first")

Cite these reference impls in your implementation; the patterns are load-bearing:

- **Server Action shape** — `apps/web/app/actions/invoices/upload.ts:202-460` (`extractInvoice`) is the file you're modifying. Re-read it in full before touching it.
- **Server Action auth+tenant pattern** — `apps/web/app/actions/invoices/approval.ts:39-58` (used by 5.3 verbatim; mirror in `revalidateInvoice`).
- **Tenant-isolation `.eq('tenant_id', tenantId)` guard** — Epic 4 prep-p2 pattern; see `apps/web/app/actions/invoices/review.ts:25-92` for `correctInvoiceField`.
- **Versioned package layout** — `packages/datev/src/formats/extf-v700.ts` is the precedent (one file per format, additive on new). `packages/validation/parsers/{ubl,cii}.ts` follows the same axis.
- **Pure-compute package boundary** — `packages/datev` + `packages/gobd`: no `@supabase/*`, no `next/*`, no `react/*` imports; verified by ESLint config inheritance. `packages/validation` + `packages/pdf` inherit the same boundary.
- **Audit allow-list extension** — `supabase/migrations/20260501000000_archive_search_and_export.sql:20-31` is the established `do $$ ... exception when duplicate_object` wrapper for `audit_logs_event_type_chk`. Mirror byte-by-byte (AC #17).
- **Audit emission helper** — `logAuditEvent` in `apps/web/app/actions/invoices/shared.ts:19-53`. DO NOT modify the helper; just call it twice (extract event + validation event).
- **`commit_datev_export` RPC** — explicit ANTI-pattern reference per D7. We do NOT wrap validation in an RPC because `validation_status` is internal UX, not a GoBD legal record. Citing the contrast so future readers understand the choice.

### Anti-Patterns to Avoid

- ❌ **Wrap validation in an RPC** — D7. Single UPDATE is sufficient.
- ❌ **Add `original_xml` column** — D3. Storage is SSOT.
- ❌ **Auto-recompute when rule set bumps** — D11. Manual via banner only (banner is 6.2).
- ❌ **Render `validation_errors` in any UI** — Story 6.2 owns this. This story only writes the data.
- ❌ **`removeNSPrefix: true` in fxp config** — AC #3. Strips disambiguation between UBL and CII.
- ❌ **`parseTagValue: true` in fxp config** — AC #3. Premature `parseFloat` masks BR-CO-* arithmetic violations.
- ❌ **Echo raw field content into violation messages** — AC #8. Reference BT/BG IDs only.
- ❌ **Add `pdfjs-dist` / `pdf-parse` / `@stackforge-eu/factur-x`** — P2 §3.1 / §3.2 / §10. `pdf-lib` only.
- ❌ **Skip the rules-coverage assertion** — AC #5. It's the linchpin.
- ❌ **Backfill validation across existing rows in the migration** — AC #18. Lazy backfill on next touch is the chosen posture.
- ❌ **Self-certify smoke test rows as DONE without a browser** — Epic 5 retro A3, AC #33. BLOCKED-BY-ENVIRONMENT is the only honest label for UX-tier checks the dev agent runs.

### Likely Failure Modes (Epic 5 retro A2 — new required section)

Copied from P4 spike §6 (F1–F12) verbatim. Each is a "who fails" scenario the story handles by design:

| # | Failure mode | Story 6.1 response |
|---|---|---|
| F1 | XRechnung XML truncated mid-tag | `parseXml` fails → `STRUCT-XML-MALFORMED`, `validation_status='invalid'`, AI does NOT run, row → `captured` with German error `"XML konnte nicht gelesen werden — bitte Lieferant kontaktieren."` |
| F2 | ZUGFeRD PDF with broken `/EmbeddedFiles` name tree | `extractZugferdXml` returns `{ kind: 'error' }` → treat as plain PDF, fall through to AI, `validation_status='skipped'` (we couldn't validate, but AI extracted) |
| F3 | Pure XML with unrecognized CustomizationID | `validation_status='unsupported'`, `STRUCT-PROFILE-UNKNOWN` violation, AI does NOT run, 6.2 will show "Format wird nicht unterstützt" with mailto-supplier shim |
| F4 | Validation succeeds but DB UPDATE fails (RLS, constraint) | Existing rollback path extends: status → `captured`, German `extraction_error`, single user-facing error, re-upload |
| F5 | Audit emit fails after UPDATE succeeds | D9 — Sentry log only, user op succeeds; gap recoverable from `invoices.validation_*` columns |
| F6 | User clicks "Erneut validieren" twice in quick succession | Server-side idempotent UPDATE writes the same result; client uses `useTransition` (6.2's responsibility) |
| F7 | Two tabs view same invoice; one revalidates, second sees stale | `revalidatePath` fires; second tab's RSC refetch picks up the new state on next nav (acceptable — same posture as Story 3.x) |
| F8 | Storage download fails during initial extract | Same rollback path: status → `captured`, `extraction_error = "Datei konnte momentan nicht geladen werden — bitte erneut versuchen."` |
| F9 | Rule set bumps from 2.5.0 → 2.6.0; existing invoices show stale results | D11 — banner on detail page when `validation_rule_set_version < CURRENT`; user-clicked `revalidateInvoice` recomputes; never auto-recompute |
| F10 | Invoice has 200+ violations; URL-encoded mailto body exceeds browser limit | Story 6.2 concern; audit metadata carries `violationCount`; full list stays in `invoices.validation_errors` for in-app rendering |
| F11 | AI extraction yields `gross_total=100`; XML projection yields `99.99` | D5 — trust XML on `valid|warning`; on `invalid`, AI fallback. Audit `metadata.usedSource` records which path won. |
| F12 | User uploads PDF that is an invoice *photo* (no embedded XML) | `validation_status='skipped'`, `validation_errors=[]`, 6.2 will show "Validation nicht anwendbar (Foto-Beleg)" informationally |

### Performance Budget (P1 §"Performance & Scalability Notes", P4 §D15)

- p95 < 500 ms for a 200-line invoice (parse + project + ~150 rules) on Vercel Node runtime.
- Parsing dominates 90%+ of the budget; rule evaluation is cheap.
- 10,000-line worst case estimated < 500 ms (linear scale). Will be measured during implementation against the KoSIT corpus.
- If observed p95 exceeds 500 ms in real traffic → revisit Option B (background Edge Function / job queue per P1 §"Where Validation Runs"). NOT v1 scope.
- Add a soft warning: `if (durationMs > 500) console.warn('[invoices:validate] slow', { invoiceId, durationMs })`. Pre-NFR drift signal.

### Security Posture

- **XXE / billion-laughs** — fast-xml-parser does not resolve external entities by default (P1 §"Security Considerations"). 10 MB input guard added (AC #7).
- **PII in messages** — BT/BG IDs only, no raw field content (AC #8).
- **Audit log size** — `metadata.violations` carries rule IDs + counts, never full message strings.
- **RLS** — `revalidateInvoice` uses tenant-guarded select (AC #27.c). `extractInvoice` already has the pattern.
- **Encrypted PDFs** — P2 §7 watch point. `extractZugferdXml` returns `{ kind: 'error', reason: 'pdf-parse-failed' }`; AI fallback runs; user sees a UI hint at validation time (6.2). No special handling in this story.

### Project Structure Notes

- All new code lives in two new packages (`packages/validation/src/`, `packages/pdf/src/`) + one modified file + one new function in an existing file. NO touches to `apps/web/components/*` (no UI). NO touches to `apps/web/app/(app)/*` (no page changes).
- After implementation `pnpm --filter @rechnungsai/validation build` and `pnpm --filter @rechnungsai/pdf build` must succeed (if the workspace requires a build step — both stub `package.json` files currently have `main: "./src/index.ts"` with no build script, mirroring `packages/datev`; if `packages/datev` builds to `dist/`, do the same for these two).
- Migration is forward-only per codebase convention; no down migration written.
- Type regeneration is mandatory post-migration; the workflow is established in Epic 3 prep P1.

### References

- [P1 architecture research: `_bmad-output/planning-artifacts/research/technical-en-16931-e-invoice-validation-architecture-research-2026-05-10.md`] (file layout §"Recommended File Layout", rule shape §"Rule File Shape (P1 Goal 4)", public API §"Package Public API", test strategy §"Four-tier test pyramid", security §"Security Considerations", performance §"Performance & Scalability Notes")
- [P2 ZUGFeRD spike: `_bmad-output/implementation-artifacts/spike-p2-zugferd-pdf-extraction-2026-05-10.md`] (extraction sketch §4.3, types §4.2, license rejection §3.1, watch points §7, fixture list §8, license posture §10)
- [P4 wire-up spike: `_bmad-output/implementation-artifacts/spike-p4-validation-wire-up-2026-05-10.md`] (decision matrix §2, choreography §3.1/§3.2, migration sketch §4, server-action signatures §5, failure modes §6, open questions §8, risk register §12)
- [P3 + P3.1 email decision: `_bmad-output/implementation-artifacts/prep-p3-email-decision-2026-05-10.md`] (mailto-shim for 6.2 — informative, not implemented in this story)
- [Epic 5 retro: `_bmad-output/implementation-artifacts/epic-5-retro-2026-05-10.md`] (A1 wire-up spike rule, A2 likely-failure-modes section, A3 smoke-test status enforcement — all applied above)
- [Smoke test format guide: `_bmad-output/implementation-artifacts/smoke-test-format-guide.md`]
- [Architecture: `_bmad-output/planning-artifacts/architecture.md`] (Implementation Patterns §"Naming Patterns", §"Format Patterns", §"Process Patterns")
- [Epics: `_bmad-output/planning-artifacts/epics.md:932-960`] (Story 6.1 epic-line acceptance criteria — informative; this story's ACs override per the spike resolutions)
- [Project AGENTS guide: `apps/web/AGENTS.md`] (Next.js 16 conventions; "This is NOT the Next.js you know"; date-input convention not relevant here since this story has no UI)
- [KoSIT XRechnung test suite: `https://github.com/itplr-kosit/xrechnung-testsuite`] (vendored corpus source — Apache-2.0)
- [Existing extractInvoice: `apps/web/app/actions/invoices/upload.ts:202`] (the function to modify)
- [Existing review.ts: `apps/web/app/actions/invoices/review.ts:1`] (the file to add `revalidateInvoice` to)
- [Existing audit_logs_event_type_chk: `supabase/migrations/20260501000000_archive_search_and_export.sql:20-31`] (pattern for AC #17)
- [Existing audit emission helper: `apps/web/app/actions/invoices/shared.ts:19-53`] (`logAuditEvent`)

### Latest Tech Information (2026-05-11)

- **`fast-xml-parser`** v5.x (active as of 2026-05) — MIT, ~120 kB unpacked. Non-resolving by default (XXE-safe). Used in production by `node-zugferd` (small market signal). API: `new XMLParser(opts).parse(xml)`.
- **`pdf-lib`** v1.17.x (stable since 1.10) — MIT, ~300 kB. Pure JS, no native bindings, works on Vercel serverless + edge runtimes. Low-level objects accessible (`PDFDocument.catalog.lookup(PDFName.of(...))`). Confirmed not deprecated as of 2026-05.
- **Next.js 16** — App Router; Server Actions on Node.js runtime (NOT Edge — P1 §"Where Validation Runs"). Existing extractInvoice already on Node runtime. `"use server"` files must export ONLY async server actions (see `apps/web/AGENTS.md`).
- **Vercel direction** — "Not investing further in Edge runtime" (linked in P1 research). Sync Node runtime is the correct choice for CPU-bound validation work; no reason to plan around Edge.

## Dev Agent Record

### Agent Model Used

_To be filled by the dev agent (claude-opus-4-7 or equivalent at implementation time)_

### Debug Log References

### Completion Notes List

_To be filled during implementation. Include the smoke test section per AC #33._

### File List

_To be filled during implementation. Expected additions:_

- `packages/validation/src/index.ts` (NEW)
- `packages/validation/src/types.ts` (NEW)
- `packages/validation/src/parsers/{xml,detect,ubl,cii}.ts` (NEW ×4)
- `packages/validation/src/rules/{engine,en16931-core,en16931-calculations,en16931-codelists,en16931-vat,xrechnung-de}.ts` (NEW ×6)
- `packages/validation/src/rules/codelists/{iso4217-currency,iso3166-country,unece-rec20-units,vat-categories}.ts` (NEW ×4)
- `packages/validation/src/project-to-invoice-data.ts` (NEW)
- `packages/validation/__tests__/*.ts` (NEW ×11 + fixtures)
- `packages/validation/package.json` (MODIFIED — add `fast-xml-parser`)
- `packages/validation/vitest.config.ts` (NEW)
- `packages/pdf/src/{index,types,extract-attachments,extract-zugferd-xml,detect-einvoice}.ts` (NEW ×5)
- `packages/pdf/__tests__/*.ts` + fixtures (NEW)
- `packages/pdf/package.json` (MODIFIED — add `pdf-lib`)
- `packages/pdf/vitest.config.ts` (NEW)
- `supabase/migrations/20260511000000_invoice_validation.sql` (NEW)
- `packages/shared/src/types/database.ts` (REGENERATED post-migration)
- `apps/web/app/actions/invoices/upload.ts` (MODIFIED — `extractInvoice` + 2 helpers)
- `apps/web/app/actions/invoices/review.ts` (MODIFIED — `+ revalidateInvoice`)
- `apps/web/app/actions/invoices/upload.test.ts` (MODIFIED — extend with validation cases)
- `apps/web/app/actions/invoices/review.test.ts` (NEW)
