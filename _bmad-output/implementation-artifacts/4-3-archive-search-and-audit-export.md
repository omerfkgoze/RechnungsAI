# Story 4.3: Archive Search and Audit Export

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to search my archived invoices and export them for tax audits,
So that I can quickly find any document and provide complete records to the Finanzamt when requested.

---

## Technical Concerns (≤3, per Epic 1 retro Action #2)

1. **Archive search route + paginated Server Action against `invoices` (FR24, NFR5, NFR26)** — A NEW route group lands at `apps/web/app/(app)/archiv/page.tsx` (Server Component) + `apps/web/app/(app)/archiv/loading.tsx` (skeleton). The existing nav (`apps/web/components/layout/mobile-nav.tsx:10` and `sidebar-nav.tsx:19`) already points at `/archiv` — Story 4.3 fills the route. The page reads filters from `searchParams` via a NEW `parseArchiveQuery` helper in `apps/web/lib/archive-query.ts` (mirrors `apps/web/lib/dashboard-query.ts` Zod-permissive parser; per-field `safeParse`, drop invalid). Filters: `dateFrom`/`dateTo` (ISO `YYYY-MM-DD`, applied to `invoice_date_value` — see Concern #3), `supplier` (≤100 chars, escaped LIKE), `minAmount`/`maxAmount` (`gross_total_value` from existing migration `20260423000000`), `invoiceNumber` (≤100 chars, escaped LIKE on NEW `invoice_number_value`), `fiscalYear` (4-digit year, derived from `tenant_settings.fiscal_year_start_month`), `page` (1-indexed, default 1), `pageSize` (fixed 50; `LIST_LIMIT` constant — NFR5 <1s budget). The page calls a NEW Server Action `searchArchivedInvoices(input): Promise<ActionResult<{ rows, total, page, pageSize }>>` placed in `apps/web/app/actions/invoices.ts` immediately after `verifyInvoiceArchive`. Auth pattern mirrors `getInvoiceSignedUrl` (auth → tenant lookup → redirect on missing user; `.eq("tenant_id", tenantId)` defense-in-depth on the row SELECT per Epic 3 retro A1). Query: `.from("invoices").select("id, status, file_type, original_filename, sha256, invoice_data, gross_total_value, supplier_name_value, invoice_number_value, invoice_date_value, created_at, updated_at, approved_at, skr_code", { count: "exact" })` with `.eq("tenant_id", tenantId)`, applied filters, `.order("invoice_date_value", { ascending: false, nullsFirst: false })` then `.order("created_at", { ascending: false })` (chronological with stable tie-break), `.range((page-1)*pageSize, page*pageSize - 1)`. The action returns `{ rows, total: count ?? 0, page, pageSize }`; the page renders a NEW client component `<ArchiveSearchFilters />` (`apps/web/components/archive/archive-search-filters.tsx` — mirror `invoice-list-filters.tsx` debounced URL writer pattern; native `<input type="date">` on mobile, shadcn `<Input>` desktop), a NEW server-rendered `<ArchiveResultList rows={rows} />` (`apps/web/components/archive/archive-result-list.tsx`), pagination controls (NEW `<ArchivePagination total page pageSize />`), and the empty state via existing `<EmptyState>` (`apps/web/components/layout/empty-state.tsx`) with verbatim German per UX-DR19: title `"Keine Rechnungen gefunden"`, description `"Versuche einen anderen Suchbegriff oder Zeitraum."`. NFR5 budget: existing indexes from `20260423000000` cover supplier+amount; Concern #3 adds the missing indexes for date range and invoice_number. Tenant filtering: explicit `.eq("tenant_id", tenantId)` AND `.gte/.lte` on filter values (RLS already enforces; explicit filter is defense-in-depth + lets the query planner pick the tenant-prefixed composite index). The dashboard's 100-invoice cap (`LIST_LIMIT = 100` at `dashboard/page.tsx:35`) does NOT apply here — this story uses its own paginated 50-per-page strategy; **do not import `LIST_LIMIT` from the dashboard module** (per `prep-p5-deferred-work-triage-2026-04-28.md§4`).

2. **Audit export ZIP via Route Handler — store-only ZIP writer in `packages/gobd` (FR25, GoBD §147 AO Z2/Z3, NFR20)** — A NEW Route Handler at `apps/web/app/api/archive/export/route.ts` (POST) handles audit export — Server Actions cannot stream binary downloads with `Content-Disposition`, so a Route Handler is the correct primitive (per `apps/web/AGENTS.md` — read `node_modules/next/dist/docs/` for Route Handler conventions before coding). Request body: `{ invoiceIds: string[] }` (Zod-validated: `z.array(z.guid()).min(1).max(500)` — 500 is the per-export cap; larger exports require multiple ZIPs and that scope is deferred). Auth: `createServerClient()` → `auth.getUser()` → `users.tenant_id` lookup → 401 JSON on missing user. The handler then runs server-side: (a) `SELECT id, file_path, sha256, original_filename, file_type, supplier_name_value, gross_total_value, invoice_number_value, invoice_date_value, status, skr_code, bu_schluessel, approved_at, approved_by, created_at FROM invoices WHERE tenant_id = $1 AND id = ANY($2)` — defense-in-depth `.eq("tenant_id", tenantId)` AND `.in("id", invoiceIds)` (RLS still applies; missing IDs are silently filtered, the response surfaces `requested_count` vs `included_count` for transparency); (b) for each invoice, `supabase.storage.from("invoices").download(file_path)` and call `verifyBuffer(bytes, sha256)` from `@rechnungsai/gobd` to compute a per-row verification status (`"verified" | "mismatch" | "legacy"` — `legacy` when `sha256 IS NULL`); (c) build the ZIP archive in-memory via a NEW helper `buildAuditExportZip(entries): Promise<Uint8Array>` in `packages/gobd/src/zip.ts` (NEW file). The ZIP is **store-only (compression method 0x0000 — no DEFLATE)** so the writer stays ~120 lines of TypeScript with **no new top-level dependency** (consistent with Epic 3 + Story 4.1/4.2 discipline; Steuerberater tooling reads store-only ZIPs identically to compressed ones, and original files are already compressed — JPEG/PDF — so re-compressing yields ~0% savings). The writer uses Node 22's `zlib.crc32(buffer)` for the per-entry CRC32 (Node ≥18.20 / ≥20.10 ships `zlib.crc32`; the project's `pnpm-workspace.yaml` already pins Node ≥20). Per ZIP entry: a Local File Header + compressed-stored bytes + Central Directory File Header + EOCD record at the end. The ZIP layout: `audit-export-<tenantSlug>-<YYYYMMDD>.zip` containing `documents/<invoiceId>.<ext>` (one file per invoice, original bytes), `summary.csv` (NEW helper `buildSummaryCsv(rows): string` in `packages/gobd/src/csv.ts` — RFC 4180 escaped, German headers: `Rechnungs-ID;Lieferant;Rechnungsnummer;Belegdatum;Bruttobetrag;SKR-Konto;BU-Schlüssel;Status;Genehmigt am;SHA-256;Verifikationsstatus`; UTF-8 with BOM `EF BB BF` for Excel German-locale compatibility; semicolon delimiter — German Excel default), `audit-trail.csv` (`SELECT id, invoice_id, actor_user_id, event_type, field_name, old_value, new_value, metadata, created_at FROM audit_logs WHERE tenant_id = $1 AND invoice_id = ANY($2) ORDER BY invoice_id, created_at` — same German header treatment, `metadata` rendered as `JSON.stringify`), and `README.txt` (verbatim German describing the export contents and GoBD legal basis: `§§238–241 HGB`, `GoBD Tz. 100–107`, retention period). Response: `new Response(zipBytes, { status: 200, headers: { "Content-Type": "application/zip", "Content-Disposition": \`attachment; filename="${filename}"\`, "Content-Length": String(zipBytes.byteLength) } })`. Crucially the handler also calls `logAuditEvent(supabase, { eventType: "export_audit", … })` AFTER the ZIP is fully assembled but BEFORE the response is returned (so the audit row is durable even if the client never receives the bytes — per Story 4.2 `logAuditEvent` discipline: non-fatal, Sentry-fallback on failure). Metadata payload: `{ invoice_count: includedCount, requested_count: requestedCount, missing_count, mismatch_count, format: "zip", ranges: { dateFrom, dateTo, fiscalYear } }`. Error handling: any per-invoice download/hash failure logs to Sentry with `tags: { module: "gobd", action: "export_audit" }` and produces a row in the manifest with `verification_status = "error"` — the export NEVER aborts because one file failed (the user gets every recoverable invoice; the manifest documents what was lost). Memory budget: 500 invoices × ~500KB avg ≈ 250MB peak — acceptable on the server tier; if a future story raises the cap above 500, switch to streaming ZIP via `Readable.from`. **`event_type = "export_audit"` is a NEW event type** — Concern #3 ships the migration that extends the `audit_logs_event_type_chk` CHECK constraint.

3. **NEW migration: `audit_logs_event_type_chk` extension + `invoice_number_value`/`invoice_date_value` generated columns + supporting indexes (FR24, FR25, NFR5)** — A NEW migration `supabase/migrations/20260501000000_archive_search_and_export.sql` does three things in one transaction. (i) **Extend the audit event taxonomy:** `alter table public.audit_logs drop constraint if exists audit_logs_event_type_chk` then re-add with the new value: `add constraint audit_logs_event_type_chk check (event_type in ('upload','field_edit','categorize','approve','flag','undo_approve','undo_flag','export_datev','export_audit','hash_verify_mismatch'))`. Wrap in `do $$ … exception when duplicate_object then null; end $$` for idempotency (Story 4.1 review patch lesson). The header comment cites `prep-p4-gobd-audit-scope-research-2026-04-28.md§3` and notes that Story 5 (DATEV export) will use `export_datev`; Story 4.3 ships `export_audit`. (ii) **Add two generated columns on `invoices` to support archive search:** `alter table public.invoices add column if not exists invoice_number_value text generated always as (invoice_data -> 'invoice_number' ->> 'value') stored, add column if not exists invoice_date_value date generated always as (case when invoice_data -> 'invoice_date' ->> 'value' ~ '^\d{4}-\d{2}-\d{2}$' then (invoice_data -> 'invoice_date' ->> 'value')::date else null end) stored;` — the `case when` regex guard mirrors the `gross_total_value` safe-cast pattern from migration `20260424100000` (NULL on malformed input rather than migration error; AI extractor occasionally emits non-ISO dates and we don't want one bad row to break the column). Generated columns are STORED (not VIRTUAL — PostgREST `.eq()` / `.gte()` / `.order()` only accepts plain column names per the existing migration 20260423000000 comment). (iii) **Add three composite indexes covering the four archive-search query shapes:** `create index if not exists invoices_tenant_invoice_date_idx on public.invoices (tenant_id, invoice_date_value desc nulls last)` (covers date range + fiscal year filter + default chronological sort); `create index if not exists invoices_tenant_invoice_number_idx on public.invoices (tenant_id, invoice_number_value)` (covers exact / prefix invoice_number search; ILIKE on a leading wildcard cannot use a btree but exact match + 1-char-prefix can); `create index if not exists invoices_tenant_sha256_idx on public.invoices (tenant_id, sha256) where sha256 is not null` (partial index — covers Story 4.1 deferred item "no index on sha256" for the export-time batch verification path; `where sha256 is not null` keeps the index small since legacy rows are skipped by the verifier anyway). No new column GRANTs needed: `authenticated` already lacks `update` on `invoice_data`, and these are generated columns (Postgres rejects direct UPDATE on generated columns by definition). After migration, run `pnpm supabase gen types` and commit the regenerated `packages/shared/src/types/database.ts` with `invoice_number_value: string | null` and `invoice_date_value: string | null` (Postgres `date` → JS `string` in supabase-js) added to the `invoices` Row. Update `packages/shared/src/types/database.ts` to include `"export_audit"` in the `audit_logs.Insert.event_type` union. Header comment documents §238 HGB (machine-readable record) and the retention rationale: even with the new generated columns, no DELETE path is added to the migration — retention by absence of mutation policy, mirroring Story 4.1.

**Deferred to Story 5.x (DATEV export):** `event_type = "export_datev"` is permitted by the new CHECK constraint after this story, but the actual `logAuditEvent` callsite for DATEV export is wired by Story 5.2/5.3 (not this story).
**Deferred to Epic 7 (Verfahrensdokumentation):** Linking the audit export ZIP into the auto-generated Verfahrensdokumentation as proof artifact. Story 4.3 produces the export; Epic 7 references it.
**Deferred (out of scope, infrastructure):** Storage-layer 10-year retention enforcement (FR23). Same posture as Story 4.1: no DELETE policy on `invoices` or `storage.objects` for `authenticated` → tenant cannot delete → retention by absence. Document in migration header.
**Deferred (export size > 500 invoices):** Streaming ZIP via Node `Readable.from` and per-file Storage stream (vs. the in-memory build used here). Memory profile of 500-invoice export ≈ 250MB is acceptable on current Hetzner tier; raise this cap only when GOZE has a real Steuerberater request that needs more in one ZIP.
**Deferred (compression):** DEFLATE-compressed ZIP. Originals are already compressed (JPEG/PDF) — store-only adds <1% size and saves ~120 LOC of CRC32+DEFLATE plumbing. Switch only if a Steuerberater tool rejects store-only ZIPs (none known to do so — store-only is method 0x0000, the universal fallback).
**Deferred (XLSX export):** Some Steuerberater prefer XLSX over CSV. CSV with semicolon + UTF-8 BOM is the German Excel default and opens cleanly. Add XLSX (via `exceljs` or hand-rolled OOXML) only if Steuerberater feedback warrants — would introduce a top-level dep, so the bar is real user demand.
**Deferred (full-text search across `invoice_data`):** GIN index on `invoice_data` JSONB for free-text. Out of scope per epics.md AC #1: the four named filter dimensions (date, supplier, amount, invoice_number) cover the FR24 requirement.
**Deferred (FR23 deletion-during-retention banner):** Showing a "documents cannot be manually deleted within retention period" banner inside the archive UI is satisfied by epics.md AC #4. The current implementation surfaces no delete UI in the archive at all — there is nothing to suppress; the retention guarantee is structural (no DELETE grant). A subtle one-line affordance in the archive header (`<RetentionNotice />` — verbatim German `"Dokumente werden 10 Jahre aufbewahrt (GoBD §147 AO)."`) is in scope and lives in Task 5; richer educational UI is deferred.

---

## Acceptance Criteria

1. **Given** the migration `20260501000000_archive_search_and_export.sql` is applied
   **When** `\d public.invoices` and `\d public.audit_logs` are inspected
   **Then** `invoices.invoice_number_value text` and `invoices.invoice_date_value date` exist as `GENERATED ALWAYS AS (… ) STORED` columns with the documented expressions
   **And** the CHECK constraint `audit_logs_event_type_chk` permits `'export_audit'` in addition to the prior nine values (verified by `select pg_get_constraintdef(oid) from pg_constraint where conname = 'audit_logs_event_type_chk'`)
   **And** indexes `invoices_tenant_invoice_date_idx`, `invoices_tenant_invoice_number_idx`, and `invoices_tenant_sha256_idx` exist (the last is a partial index `where sha256 is not null`)
   **And** `pnpm supabase gen types` regenerates `packages/shared/src/types/database.ts` to include `invoice_number_value: string | null` and `invoice_date_value: string | null` on the `invoices` Row, and `"export_audit"` in the `audit_logs` `Insert.event_type` union

2. **Given** an authenticated user navigates to `/archiv`
   **When** the page loads with no filters set
   **Then** the existing nav (`/archiv` link in `mobile-nav.tsx` and `sidebar-nav.tsx`) routes to the new page (no nav change required)
   **And** all archived invoices for the user's tenant are listed, sorted by `invoice_date_value desc nulls last` then `created_at desc`, paginated 50 per page
   **And** each row shows: supplier name (`supplier_name_value` or `"Unbekannter Lieferant"` fallback), invoice date (German format `DD.MM.YYYY` via existing `formatGermanDate` utility — or upload date `created_at` if `invoice_date_value` is null with a `(Hochgeladen)` muted suffix), gross amount (German locale `EUR 1.234,56`), status badge, upload date in muted text, and a SHA-256 short-form `…<lastEight>` chip when `sha256` is non-null
   **And** the page is reachable in ≤3 clicks from `/dashboard` (NFR26 — the bottom-nav `Archiv` link is one click; this AC is satisfied by the existing nav)
   **And** server-render time for a tenant with 200 archived invoices is ≤1s on the local dev DB (NFR5 — verified by `console.time` in dev OR by the smoke test `psql` `EXPLAIN ANALYZE` on the underlying query)

3. **Given** the user enters search filters at `/archiv`
   **When** any filter changes
   **Then** the URL is updated with the active filter params (text inputs — supplier, invoiceNumber, minAmount, maxAmount — debounced 300ms mirroring `invoice-list-filters.tsx`; `type="date"` and `<select>` inputs write immediately since each interaction is a single discrete value), and the page server-renders the filtered list with `total` count from the `count: "exact"` query
   **And** date-range filter applies to `invoice_date_value` (NOT `created_at`) — both bounds inclusive (`gte` + `lte` with the upper bound translated to next-day at UTC midnight only when the user supplied a `to`)
   **And** supplier filter is `ilike` on `supplier_name_value` with `%` and `_` escaped (mirror `dashboard/page.tsx:107` escape function)
   **And** amount filter applies to `gross_total_value` with `gte`/`lte`
   **And** invoice_number filter is `ilike` on `invoice_number_value` with the same escape treatment
   **And** fiscal_year filter (when present) computes `[fiscalYearStart, fiscalYearEnd]` from `tenants.fiscal_year_start_month` (default month = 1 if column missing or null — DATEV settings are not yet shipped) and applies to `invoice_date_value`
   **And** invalid filter values are silently dropped per-field (mirror `parseDashboardQuery` per-field `safeParse`)

4. **Given** the user's filter combination matches no rows
   **When** the page server-renders
   **Then** the result list is replaced by `<EmptyState>` with title `"Keine Rechnungen gefunden"` (h2 per UX-DR19) and description `"Versuche einen anderen Suchbegriff oder Zeitraum."` (body-sm per UX-DR19), centered, no sad faces, no illustration
   **And** the filter bar remains visible and interactive (the user can adjust filters without reloading)
   **And** pagination controls are NOT rendered when `total === 0`

5. **Given** the user has search results visible at `/archiv`
   **When** they click a per-row checkbox to select 1–500 invoices and tap a NEW `<AuditExportButton>` (`apps/web/components/archive/audit-export-button.tsx`)
   **Then** the button POSTs `{ invoiceIds }` to `/api/archive/export`
   **And** the Route Handler validates auth, validates `z.array(z.guid()).min(1).max(500)`, fetches invoice rows scoped by `tenant_id = my_tenant_id()` AND `id = ANY(invoiceIds)`, downloads each file from Storage, computes a per-row `verification_status` via `verifyBuffer` (`verified` / `mismatch` / `legacy` / `error`), assembles the ZIP via `buildAuditExportZip` from `packages/gobd/src/zip.ts`, and responds with `Content-Type: application/zip` + `Content-Disposition: attachment; filename="audit-export-<tenantSlug>-<YYYYMMDD>.zip"`
   **And** the ZIP contains exactly: one file under `documents/<invoiceId>.<ext>` per included invoice (`<ext>` mapped from `file_type` via existing `extFromMime` logic in `actions/invoices.ts:88`), `summary.csv`, `audit-trail.csv`, and `README.txt`
   **And** `summary.csv` is UTF-8 with BOM (`EF BB BF`), semicolon-delimited, RFC 4180 quote-escaped, with the verbatim German headers from Concern #2; rows preserve the order of `invoiceIds` in the request
   **And** `audit-trail.csv` rows are sorted `(invoice_id, created_at asc)` and include every `audit_logs` row whose `tenant_id` and `invoice_id` match the request
   **And** `README.txt` cites §§238–241 HGB and GoBD Tz. 100–107 verbatim

6. **Given** the export request includes invoice IDs that do not belong to the caller's tenant OR do not exist
   **When** the Route Handler runs
   **Then** those IDs are silently filtered out by RLS + the explicit `.eq("tenant_id", tenantId)` (defense-in-depth per Epic 3 retro A1) — no error is returned to the caller
   **And** the response body is still a valid ZIP for the IDs that DID resolve
   **And** the audit log entry's metadata records `requested_count` and `included_count` — the diff documents the filter-out
   **And** if the included count is zero the handler returns `400` JSON `{ error: "Keine Rechnungen für den Audit-Export gefunden." }` (no empty ZIP — that is a user error, not a partial success)

7. **Given** at least one selected invoice's stored file no longer matches its `sha256` (mismatch)
   **When** the export is built
   **Then** the file is INCLUDED in the ZIP regardless (the auditor still gets the bytes)
   **And** the row in `summary.csv` carries `verification_status = "mismatch"` and the `audit-trail.csv` already contains the `hash_verify_mismatch` row Story 4.2 inserts
   **And** `Sentry.captureException(new Error("[gobd:export] hash mismatch"), { tags: { module: "gobd", action: "export_audit" }, extra: { invoiceId, storedHash: row.sha256 } })` fires once per mismatched invoice
   **And** the export does NOT abort — the user receives all files

8. **Given** the export completes (whether or not mismatches occurred)
   **When** the response is sent
   **Then** exactly ONE `audit_logs` row is inserted with `event_type = "export_audit"`, `actor_user_id = user.id`, `tenant_id` resolved at handler entry, `invoice_id = null` (tenant-level event — the `audit_logs.invoice_id` column is nullable per Story 4.2 migration)
   **And** `metadata` contains `{ invoice_count, requested_count, missing_count, mismatch_count, format: "zip", filters: { dateFrom, dateTo, fiscalYear } }` (filter values are echoed verbatim from the request body if present, else `null`)
   **And** if the `audit_logs` insert fails the response still completes successfully (per Story 4.2 `logAuditEvent` non-fatal contract — Sentry surfaces the audit miss)

9. **Given** archive contains documents spanning multiple fiscal years
   **When** the user sets the `fiscalYear` filter (e.g. `2025`)
   **Then** the page resolves `tenants.fiscal_year_start_month` (default 1 if NULL or column missing) and computes `[fiscalYearStart, fiscalYearEnd]` correctly: e.g. for start month = 1 → `2025-01-01..2025-12-31`; for start month = 7 → `2024-07-01..2025-06-30` (the "fiscal year ending in 2025")
   **And** the filter applies on `invoice_date_value` (not `created_at`)
   **And** the URL retains `fiscalYear=2025` as a single param (no separate `dateFrom`/`dateTo` to keep shareable URLs short); when the user manually sets `dateFrom`/`dateTo` those override the fiscal_year computation (last-write-wins from the URL → page render)
   **And** a one-line muted retention notice renders above the results: `"Dokumente werden 10 Jahre aufbewahrt (GoBD §147 AO)."`

10. **Given** the Vitest test suite runs (`pnpm test` from repo root)
    **When** all tests complete
    **Then** the following NEW or UPDATED test cases pass:
    - `apps/web/lib/archive-query.test.ts` (NEW) — 6 cases covering per-field `safeParse` (bad date dropped, bad amount dropped, bad page coerced to 1, supplier max-length, fiscalYear 4-digit guard, defaults applied)
    - `apps/web/app/actions/invoices.test.ts` — 4 NEW cases for `searchArchivedInvoices`: (a) tenant filter + filter combos build the correct query chain (mock spy on `.eq`/`.ilike`/`.gte`/`.lte`/`.range`); (b) cross-tenant invoiceIds are silently filtered (no error); (c) NFR5 `count: "exact"` returns the total separate from `data`; (d) sort order is `invoice_date_value desc nulls last, created_at desc`
    - `apps/web/app/api/archive/export/route.test.ts` (NEW) — 6 cases: happy-path 3-invoice ZIP shape (assert ZIP local-file-header signature `0x04034b50` and EOCD `0x06054b50`); auth → 401; cross-tenant ID filtering; mismatch path emits Sentry once + still ships ZIP; included_count = 0 → 400; `audit_logs` insert called with `event_type = "export_audit"` and the documented metadata shape (mock `auditInsertMock` per Story 4.2 pattern)
    - `packages/gobd/src/zip.test.ts` (NEW) — 5 cases: empty input throws; single-entry ZIP round-trips through `unzipper` OR a trivial in-test parser (no new dep — verify by parsing the headers manually); CRC32 matches `zlib.crc32`; UTF-8 filenames preserve diacritics (`Lieferant_ä.txt`); EOCD points to the correct central-directory offset
    - `packages/gobd/src/csv.test.ts` (NEW) — 4 cases: BOM prefix `EF BB BF`; semicolon delimiter; quote-escaping (`a;b → "a;b"`, `a"b → "a""b"`); German locale numbers (`1234.56 → "1.234,56"` via existing shared currency formatter)
    - `apps/web/components/archive/archive-search-filters.test.tsx` (NEW) — 3 cases: filter changes write to URL after 300ms debounce; fiscalYear param overrides dateFrom/dateTo only when both are absent; reset button clears all params
    - `apps/web/components/archive/audit-export-button.test.tsx` (NEW) — 3 cases: button disabled at 0 selected and >500 selected; click triggers POST with the selected IDs; download trigger uses `URL.createObjectURL(blob)` + temporary `<a>` click pattern (no new dep)
    - `apps/web/app/(app)/archiv/page.test.tsx` (NEW) — 2 cases: empty results render `<EmptyState>` with the verbatim German strings; non-empty results render the row count + pagination
    **And** test count baseline: 340 (post-4.2). New target: ≥360 (delta +20 minimum)

11. **Given** the smoke test is executed by GOZE per `smoke-test-format-guide.md`
    **When** all UX Checks and DB Verification queries are run
    **Then** the search → results → select → export → ZIP-on-disk flow produces a valid ZIP that opens in `unzip -l` showing the documented file layout
    **And** every UX row dev agent cannot run is marked `BLOCKED-BY-ENVIRONMENT` with explicit manual steps for GOZE (per Epic 2 retro A1 — no self-certification)

---

## Tasks / Subtasks

- [x] **Task 1 — Migration: extend audit constraint + invoices generated columns + indexes (AC: 1)**
  - [x] Create `supabase/migrations/20260501000000_archive_search_and_export.sql`
  - [x] Header comment cites §§238–241 HGB, GoBD Tz. 100–107, NFR5 (<1s), and the no-DELETE retention posture (mirrors Story 4.1/4.2 migration discipline)
  - [x] `do $$ begin alter table public.audit_logs drop constraint if exists audit_logs_event_type_chk; alter table public.audit_logs add constraint audit_logs_event_type_chk check (event_type in ('upload','field_edit','categorize','approve','flag','undo_approve','undo_flag','export_datev','export_audit','hash_verify_mismatch')); exception when duplicate_object then null; end $$;`
  - [x] `alter table public.invoices add column if not exists invoice_number_value text generated always as (invoice_data -> 'invoice_number' ->> 'value') stored;`
  - [x] `alter table public.invoices add column if not exists invoice_date_value date generated always as (case when invoice_data -> 'invoice_date' ->> 'value' ~ '^\d{4}-\d{2}-\d{2}$' then (invoice_data -> 'invoice_date' ->> 'value')::date else null end) stored;`
  - [x] Create three indexes: `invoices_tenant_invoice_date_idx`, `invoices_tenant_invoice_number_idx`, partial `invoices_tenant_sha256_idx where sha256 is not null`
  - [x] Run `pnpm supabase gen types` (or BLOCKED-BY-ENVIRONMENT — manually add `invoice_number_value: string | null`, `invoice_date_value: string | null` to `invoices` Row in `database.ts`; add `"export_audit"` to `audit_logs.Insert.event_type` union)
  - [x] `pnpm --filter @rechnungsai/shared build`

- [x] **Task 2 — Archive query parser + Server Action (AC: 2, 3, 9)**
  - [x] NEW `apps/web/lib/archive-query.ts` mirroring `dashboard-query.ts` (Zod schema + per-field `safeParse` parser; fields: `dateFrom`, `dateTo`, `supplier`, `minAmount`, `maxAmount`, `invoiceNumber`, `fiscalYear` (4-digit), `page` (1-indexed default 1), `pageSize` (default 50, max 50))
  - [x] NEW unit test `apps/web/lib/archive-query.test.ts` (6 cases per AC #10)
  - [x] In `apps/web/app/actions/invoices.ts` (just after `verifyInvoiceArchive`), add NEW `searchArchivedInvoices(input): Promise<ActionResult<{ rows, total, page, pageSize }>>`
  - [x] Auth pattern: `createServerClient()` → `auth.getUser()` → redirect-on-missing → `users.tenant_id` lookup → `tenantId`
  - [x] Build query with `.eq("tenant_id", tenantId)` defense-in-depth, all filter applications, `.order("invoice_date_value", desc, nullsFirst:false)` → `.order("created_at", desc)`, `.range(offset, offset+pageSize-1)`, `count: "exact"`
  - [x] Fiscal year resolution: SELECT `tenants.fiscal_year_start_month` (default 1 if NULL/missing); compute `[fyStart, fyEnd]` and apply to `invoice_date_value`; explicit `dateFrom`/`dateTo` override fiscalYear
  - [x] Sentry capture on query error with `tags: { module: "gobd", action: "archive_search" }`
  - [x] `NEXT_REDIRECT` digest re-throw in catch (mirror `verifyInvoiceArchive`)

- [x] **Task 3 — `packages/gobd/src/zip.ts` store-only ZIP writer (AC: 5, 7)**
  - [x] NEW file. Export `buildAuditExportZip(entries: Array<{ path: string; bytes: Uint8Array }>): Promise<Uint8Array>`
  - [x] Implement Local File Header (signature `0x04034b50`, version 20, no encryption flag, method 0 = store, dos time/date, CRC32 via `node:zlib` `crc32`, sizes, name length, name UTF-8 with bit 11 of general-purpose flag set)
  - [x] Per-entry: emit LFH then bytes; store offsets for the central directory pass
  - [x] Central Directory File Header (signature `0x02014b50`) per entry; finally EOCD (signature `0x06054b50`) referencing total entries + central dir size + offset
  - [x] Empty input → throw `Error("buildAuditExportZip: at least one entry required")`
  - [x] NEW `packages/gobd/src/zip.test.ts` (5 cases per AC #10)
  - [x] Export from `packages/gobd/src/index.ts`

- [x] **Task 4 — `packages/gobd/src/csv.ts` summary + audit CSV builders (AC: 5)**
  - [x] NEW file. Export `buildSummaryCsv(rows): string` and `buildAuditTrailCsv(rows): string`
  - [x] UTF-8 BOM (`﻿` prepended), `;` delimiter, `\r\n` line terminator (RFC 4180 + Windows-friendly), quote-wrap any field containing `;`/`"`/`\r`/`\n`, escape `"` as `""`
  - [x] German locale number formatting via existing `formatCurrency` from `@rechnungsai/shared` if available; otherwise inline German formatter
  - [x] German headers per Concern #2; row order matches request order (summary) / `(invoice_id, created_at asc)` (audit-trail)
  - [x] NEW `packages/gobd/src/csv.test.ts` (4 cases per AC #10)
  - [x] Export from `packages/gobd/src/index.ts`

- [x] **Task 5 — Archive page + components (AC: 2, 3, 4, 9)**
  - [x] NEW route `apps/web/app/(app)/archiv/page.tsx` (Server Component) + `apps/web/app/(app)/archiv/loading.tsx` (skeleton mirroring `dashboard/loading.tsx`)
  - [x] NEW `apps/web/components/archive/archive-search-filters.tsx` (`"use client"`) — debounced URL writer; native `<input type="date">` for date inputs (mobile keyboard compliance — UX requirement); shadcn `<Input>` for amount + supplier + invoiceNumber; reset button clears all params
  - [x] NEW `apps/web/components/archive/archive-result-list.tsx` (server component) — renders rows; uses existing `<EmptyState>` from `apps/web/components/layout/empty-state.tsx` for zero-results
  - [x] NEW `apps/web/components/archive/archive-pagination.tsx` (`"use client"`) — total/page/pageSize → prev/next links via `router.replace` preserving other params
  - [x] NEW `apps/web/components/archive/retention-notice.tsx` — verbatim `"Dokumente werden 10 Jahre aufbewahrt (GoBD §147 AO)."`, muted text, single line above results
  - [x] All German strings verbatim per epics.md Story 4.3 ACs and UX-DR19
  - [x] NEW `apps/web/app/(app)/archiv/page.test.tsx` (2 cases per AC #10)
  - [x] NEW `apps/web/components/archive/archive-search-filters.test.tsx` (3 cases per AC #10)

- [x] **Task 6 — Audit export Route Handler + button (AC: 5, 6, 7, 8)**
  - [x] NEW `apps/web/app/api/archive/export/route.ts` (POST handler — read `node_modules/next/dist/docs/` Route Handler section before coding per `apps/web/AGENTS.md`)
  - [x] Body schema: `z.object({ invoiceIds: z.array(z.guid()).min(1).max(500) })`
  - [x] Auth: 401 JSON `{ error: "Nicht authentifiziert." }` on missing user
  - [x] Resolve `tenantId` from `users.tenant_id` (same pattern as Server Actions)
  - [x] SELECT invoices with `.eq("tenant_id", tenantId)` AND `.in("id", invoiceIds)` — defense-in-depth
  - [x] If included count = 0 → `400 { error: "Keine Rechnungen für den Audit-Export gefunden." }`
  - [x] For each invoice: `supabase.storage.from("invoices").download(file_path)`; `verifyBuffer` → `verification_status`; on Storage error → mark row as `verification_status = "error"` and continue
  - [x] SELECT `audit_logs` rows for the same invoice_ids (tenant-scoped)
  - [x] Build entries: `documents/<id>.<ext>`, `summary.csv`, `audit-trail.csv`, `README.txt` (verbatim German GoBD legal-basis paragraph; cite §§238–241 HGB + Tz. 100–107)
  - [x] Call `buildAuditExportZip(entries)` → `Uint8Array`
  - [x] Call `logAuditEvent(supabase, { eventType: "export_audit", invoiceId: null, metadata: { invoice_count, requested_count, missing_count, mismatch_count, format: "zip", filters } })` BEFORE returning the response
  - [x] Response: `new Response(zipBytes, { status: 200, headers: { "Content-Type": "application/zip", "Content-Disposition": \`attachment; filename="${filename}"\`, "Content-Length": ... } })`
  - [x] On unexpected error → 500 JSON + Sentry capture with `tags: { module: "gobd", action: "export_audit" }`
  - [x] NEW `apps/web/app/api/archive/export/route.test.ts` (6 cases per AC #10)
  - [x] NEW `apps/web/components/archive/audit-export-button.tsx` (`"use client"`) — selection-aware button; on click `fetch("/api/archive/export", { method: "POST", body: JSON.stringify({ invoiceIds }), headers: { "Content-Type": "application/json" } })`; convert response to Blob; trigger download via `URL.createObjectURL` + temp `<a>`; revoke URL on cleanup; `useTransition` for pending UI
  - [x] Add a per-row checkbox + "select all on this page" pattern to `archive-result-list.tsx` (controlled by URL state OR a small Zustand store local to the page; URL state is simpler — reuse existing `ui-store` only if needed)
  - [x] NEW `apps/web/components/archive/audit-export-button.test.tsx` (3 cases per AC #10)

- [x] **Task 7 — Tests (AC: 10)**
  - [x] All NEW test files listed in AC #10 land in their documented locations
  - [x] `apps/web/app/actions/invoices.test.ts` — extend fake supabase client to handle the new `.range`, `.in("id", …)`, `count: "exact"` chains
  - [x] Verify total count: 340 baseline → ≥360 target (delta ≥20) — **Actual: 376 tests (web: 285, gobd: 21, shared: 59, ai: 11)**
  - [x] `pnpm test` from repo root passes; `pnpm check-types` clean

- [x] **Task 8 — Smoke test (AC: 11)**
  - [x] Browser Smoke Test section added to Completion Notes
  - [x] UX Checks cover: navigate to `/archiv`, apply filters, empty state, select+export, downloaded ZIP opens in `unzip -l`, contains `summary.csv` + `audit-trail.csv` + `documents/` + `README.txt`
  - [x] DB Verification: query `audit_logs WHERE event_type = 'export_audit'` returns the new row with documented metadata; `EXPLAIN ANALYZE` shows the new indexes are used (one-shot diagnostic)
  - [x] All UX rows marked `BLOCKED-BY-ENVIRONMENT` with manual steps for GOZE

- [x] **Task 9 — Tenant isolation checklist (Epic 3 retro A1)**
  - [x] Server Action row SELECTs in `searchArchivedInvoices` use `.eq("tenant_id", tenantId)` defense-in-depth ✓
  - [x] Route Handler `apps/web/app/api/archive/export/route.ts` uses `.eq("tenant_id", tenantId)` AND `.in("id", invoiceIds)` ✓
  - [x] `audit_logs` SELECT for the export trail uses `.eq("tenant_id", tenantId)` ✓
  - [x] No raw SQL: every read goes through supabase-js so RLS is the second wall

### Review Findings

_Generated by `/bmad-code-review` on 2026-05-02 (Blind Hunter + Edge Case Hunter + Acceptance Auditor against diff `477f1e7..HEAD`)_

#### Decision Needed (5)

- [x] [Review][Decision→Patch] **audit-trail.csv scope vs README claim** — Resolved 2026-05-02: keep query scope as-is (per-invoice events only); update README.txt wording to `"Änderungsprotokoll der ausgewählten Belege"` to match. Folded into Patch #9 (README Umlaute rewrite). Rationale: GoBD Vollständigkeit (söz=kod uyumu), DSGVO data minimization, scope clarity for Steuerberater.
- [x] [Review][Decision→Patch] **`audit_logs.metadata` PII passthrough** — Resolved 2026-05-02: whitelist approach. Added as new Patch #19 below. Audit Story 4.2 callsites for actual metadata payload, define audit-relevant whitelist (e.g., `confidence_score`, `ai_model`, `extraction_attempt`, `batch_id`), drop everything else from CSV. Rationale: DSGVO data minimization + safer-by-default for external auditor.
- [x] [Review][Decision→Patch] **Filter contradiction silent drop** — Resolved 2026-05-02: hard validation. Added as new Patch #20. Mark conflicting fields with `aria-invalid` + inline German message (`"Bis-Datum muss nach Von-Datum liegen"`, `"Maximalbetrag muss größer als Minimalbetrag sein"`); do NOT execute the search until valid. Rationale: professional financial-software UX standard — never let user act on data they think is filtered when it isn't.
- [x] [Review][Decision→AC update] **Date / fiscalYear debounce vs AC #3** — Resolved 2026-05-02: AC #3 updated to specify "text inputs debounced 300ms; date/select inputs write immediately". Code unchanged. Rationale: discrete-value inputs don't need debounce; deferring date picker writes adds UI lag without benefit.
- [x] [Review][Decision→Patch] **`ArchiveResultList` client/server split** — Resolved 2026-05-02: refactor to spec shape. Added as new Patch #21. Split `<ArchiveResultList>` into server component (renders rows + SHA-256 chip + dates) + `<ArchiveSelectionLayer>` client wrapper holding `Set<string>` selection state and `<AuditExportButton>`. Rationale: Next.js App Router server-first discipline; prevents future feature bloat from being trapped in a client island.

#### Patch (18)

- [x] [Review][Patch] **CSV formula injection — `escapeField` does not guard `=`/`+`/`-`/`@`/`\t`/`\r` prefixes** [`packages/gobd/src/csv.ts:137`] — supplier name like `=cmd|'/c calc'!A1` executes when Steuerberater opens summary.csv in Excel. Prefix with `'` or quote when value starts with these chars.
- [x] [Review][Patch] **ZIP writer silently truncates >4 GiB / >65 535 entries** [`packages/gobd/src/zip.ts:2438-2484`] — `centralSize`/`localOffset`/entry-count fields are uint16/uint32, no guard. Add explicit `if (totalSize > 0xFFFFFFFF || entries.length > 0xFFFE) throw new Error(...)` before writing EOCD.
- [x] [Review][Patch] **Failed Storage download writes 0-byte file into ZIP** [`route.ts:1157,1202`] — auditor sees corrupt PDF, indistinguishable from real document. Replace with `documents/<id>.MISSING.txt` containing the failure reason; mark `verification_status = "error"` in summary.csv.
- [x] [Review][Patch] **Migration regex accepts logically-invalid dates → `make_date()` raises on INSERT** [`supabase/migrations/20260501000000_archive_search_and_export.sql:2570-2582`] — regex `^\d{4}-\d{2}-\d{2}$` accepts `2026-13-45`; `make_date(2026,13,45)` raises `date_out_of_range` aborting the INSERT. Tighten regex to validate month 01-12 + day 01-31, OR wrap in PL/pgSQL `IMMUTABLE` function with `EXCEPTION WHEN datetime_field_overflow THEN NULL`.
- [x] [Review][Patch] **`searchArchivedInvoices` Server Action accepts unvalidated `page` / `pageSize`** [`apps/web/app/actions/invoices.ts:666-734`] — exported action callable from any client, can pass `pageSize=999999` or `page=-1` (negative offset). Add Zod input validation enforcing `page >= 1` and `pageSize === PAGE_SIZE`.
- [x] [Review][Patch] **`logAuditEvent` not wrapped in try/catch despite "non-fatal on failure" comment** [`route.ts:1251-1268`] — if audit insert throws, the user receives 500 and never gets the assembled ZIP; conversely a swallowed error means export happens with no audit row. Wrap explicitly with `try { await logAuditEvent(...) } catch (e) { Sentry.captureException(e, ...) }` and decide policy (recommend fail-closed: refuse to ship the ZIP if audit write fails — GoBD).
- [x] [Review][Patch] **`URL.revokeObjectURL` called synchronously after `a.click()`** [`apps/web/components/archive/audit-export-button.tsx:1864`] — Safari and some Chromium variants abort the download. Defer revoke via `setTimeout(() => URL.revokeObjectURL(url), 0)` or `requestIdleCallback`.
- [x] [Review][Patch] **`packages/shared/src/types/database.ts` does NOT add `"export_audit"` to `audit_logs.Insert.event_type`** [`packages/shared/src/types/database.ts`] — AC #1 last clause + Completion Notes claim this was done; diff shows no such change. Run `pnpm supabase gen types` and commit, or hand-add the literal union member.
- [x] [Review][Patch] **README.txt uses ASCII transliteration (`gemaess`, `Aenderungsprotokoll`, `Aufbewahrungsfrist`)** [`route.ts:1044-1062`] — verbatim German policy + AC #5 require proper Umlaute. Replace with `gemäß`, `Änderungsprotokoll`, `Unveränderbarkeit` etc.
- [x] [Review][Patch] **AC #2 row missing separate "upload date in muted text"** [`archive-result-list.tsx:1442-1494`] — `created_at` shown only as fallback when `invoice_date_value` is null. AC #2 requires both dates: invoice date AND upload date as separate muted-text element on every row.
- [x] [Review][Patch] **Missing test: "fiscalYear param overrides dateFrom/dateTo only when both are absent"** [`apps/web/components/archive/archive-search-filters.test.tsx`] — required by AC #10. Add a third assertion verifying the override-only-when-absent semantics.
- [x] [Review][Patch] **ZIP DOS time uses local timezone** [`packages/gobd/src/zip.ts:2395-2405`] — non-deterministic across server timezones. Switch to `getUTCHours()`, `getUTCMinutes()`, etc.
- [x] [Review][Patch] **`dateFrom`/`dateTo` validated only by regex, not real-date check** [`archive-query.ts:1963`] — `2026-13-45` passes regex, then PostgREST `gte` errors with "Archiv kann momentan nicht geladen werden". Use `z.string().date()` (Zod ≥3.22) or chain with a `Date.parse` + `getMonth()/getDate()` round-trip check.
- [x] [Review][Patch] **`searchArchivedInvoices` returns empty rows + count when `page > totalPages` (user stranded on phantom page)** [`invoices.ts:728-734`, `archive-pagination.tsx:1303`] — `page=10, total=5` shows empty-state but `total=5`. Clamp `page = min(page, max(1, totalPages))` after the count is known and re-execute, or redirect to last valid page.
- [x] [Review][Patch] **`AuditExportButton` no UI feedback on failure** [`audit-export-button.tsx:1846-1850`] — only `console.error`; user sees button re-enable with no indication. Add inline error message (German) or shadcn toast; capture to Sentry.
- [x] [Review][Patch] **Route handler `bodySchema.filters.dateFrom/dateTo` accept arbitrary string → audit log poisoning** [`route.ts:1014-1016`] — attacker can send `dateFrom: "<script>"` or 10 KB of garbage; verbatim recorded in `audit_logs.metadata` (immutable). Validate with `z.string().regex(...).optional()` or stricter date format.
- [x] [Review][Patch] **Route handler invoice fetch has no `.order()` → non-deterministic ZIP byte sequence** [`route.ts:1108-1114`] — repeated exports of same IDs produce different ZIP layouts. Add `.order("invoice_date_value", { ascending: true, nullsFirst: false }).order("id")` for stable ordering.
- [x] [Review][Patch] **Route handler SELECT omits `approved_by`, `created_at`** [`route.ts:1110-1112`] — Concern #2 documents these in the SELECT list. Add for completeness even if not currently in summary.csv.
- [x] [Review][Patch] **Mobile bottom-nav not visible on `/archiv` until scroll-to-bottom + horizontal overflow** [`apps/web/app/(app)/archiv/page.tsx`, `apps/web/components/archive/archive-search-filters.tsx`, `apps/web/components/archive/archive-result-list.tsx`] — From GOZE smoke test (UX issue #1): bottom-nav (`mobile-nav.tsx` is `fixed bottom-0 z-40`) does not render at viewport bottom on `/archiv` mobile, only after scrolling to page bottom; page also overflows horizontally. Likely cause: a child of `<main>` exceeds `100vw` (filter bar grid, result-list table, or pagination buttons) which breaks `position: fixed` containment on iOS Safari. Audit each archive component for missing `min-w-0` / `overflow-x-hidden` / `flex-wrap`; constrain filter bar to single-column stack on mobile (mirror dashboard layout); ensure `<main>` parent has `pb-16` (or equivalent) so content does not hide behind the fixed nav. Verify with `pnpm dev` + Chrome devtools mobile emulation (iPhone SE 375px). Reproduces from smoke test (a)–(j) on a real device.
- [x] [Review][Patch] **Replace `<input type="date">` in archive filters with the Story 3-5 active-mask pattern** [`apps/web/components/archive/archive-search-filters.tsx:1660,1671`] — GOZE smoke test (UX issue #2): native `type="date"` lacks active masking; German users expect to type `31.12.2025` with auto-inserted dots. Story 3-5 already shipped the working masked date input via helpers in `apps/web/lib/format.ts` (`applyGermanDateMask`, `isoToGermanDateInput`, `parseGermanDate`) — reference implementation: `apps/web/components/invoice/editable-field.tsx:236-248`. Reuse that pattern: (a) change inputs from `type="date"` to plain text with `inputMode="numeric"`, `placeholder="TT.MM.JJJJ"`, `maxLength={10}`; (b) initialize draft via `isoToGermanDateInput` from URL ISO values; (c) `onChange` runs `applyGermanDateMask(next, prev)`; (d) before `writeParams`, convert via `parseGermanDate` to ISO — only write when valid OR when empty; (e) on invalid input show inline `<FormMessage>` with `"Ungültiges Datum — bitte TT.MM.JJJJ."`. Do NOT introduce a new shared component yet — the helpers are already shared via `lib/format.ts`; component-level abstraction can come when a third callsite appears. Add tests covering paste of `31.12.2025`, partial `15.03`, invalid `99.99.9999`.
- [x] [Review][Patch] **Remove all unmasked `<input type="date">` from app code + add convention rule** [`apps/web/AGENTS.md`, repo-wide grep] — Prevent future stories from reintroducing the same UX mismatch. Steps: (1) `rg "type=\"date\"" apps/web/` and convert any remaining native date inputs to the masked pattern OR document them as intentional exceptions with rationale (e.g., admin-only debug screens); (2) append a short rule to `apps/web/AGENTS.md` (or NEW `apps/web/docs/conventions.md`): *"Date inputs MUST use the German active-mask pattern. Reference: `editable-field.tsx:236-248` + helpers in `lib/format.ts` (`applyGermanDateMask`, `isoToGermanDateInput`, `parseGermanDate`). Native `<input type="date">` is forbidden because German users expect `DD.MM.YYYY` typing not the OS picker, and the masked pattern is already battle-tested via Story 3-5."*
- [x] [Review][Patch] **Refactor `<ArchiveResultList>` to server component + client selection layer** [`apps/web/components/archive/archive-result-list.tsx`] — Remove `"use client"` from `<ArchiveResultList>`; render rows, dates, status badge, SHA-256 chip server-side. Extract selection state + `<AuditExportButton>` into a NEW `<ArchiveSelectionLayer>` (`apps/web/components/archive/archive-selection-layer.tsx`, `"use client"`) that wraps the server-rendered list and owns `Set<string>` of selected IDs + per-row checkbox bridges via the `id` of each row. Update `apps/web/app/(app)/archiv/page.tsx` to wrap `<ArchiveResultList>` inside `<ArchiveSelectionLayer>`. (Resolves Decision #5.)
- [x] [Review][Patch] **Filter contradiction hard-validation in `<ArchiveSearchFilters>`** [`apps/web/components/archive/archive-search-filters.tsx`, `apps/web/lib/archive-query.ts:2024-2033`] — Add client-side cross-field check: when `dateFrom > dateTo` or `minAmount > maxAmount`, block the URL write, set `aria-invalid="true"` + inline `<FormMessage>` German error (`"Bis-Datum muss nach Von-Datum liegen"`, `"Maximalbetrag muss größer als Minimalbetrag sein"`). Server parser keeps current silent-drop as defense-in-depth (URL hand-edit fallback). Add 2 tests covering both contradictions. (Resolves Decision #3.)
- [x] [Review][Patch] **`audit_logs.metadata` whitelist for CSV export** [`packages/gobd/src/csv.ts` + `apps/web/app/api/archive/export/route.ts:1233`] — Audit Story 4.2 `logAuditEvent` callsites to enumerate keys actually written into `metadata`. Define audit-relevant whitelist (proposed: `confidence_score`, `ai_model`, `extraction_attempt`, `batch_id`, `previous_status`, `flag_reason`); strip all other keys before passing to `buildAuditTrailCsv`. Document the whitelist in README.txt so the auditor knows scope. (Resolves Decision #2.)

#### Defer (5)

- [x] [Review][Defer] **Streaming ZIP / memory pressure at 500 invoices** [`route.ts:1147-1244`] — deferred, pre-existing per spec ("Deferred (export size > 500 invoices)"; 250MB peak acceptable on Hetzner tier).
- [x] [Review][Defer] **`.in("id", invoiceIds)` URL length at 500 UUIDs (~18.5 KB)** [`route.ts:1114`] — deferred; needs real Supabase integration test. Mitigation if hit: switch to chunked fetches.
- [x] [Review][Defer] **`selectedIds` state persists across page navigation** [`archive-result-list.tsx`] — deferred; UX polish, not in spec scope. User can export rows from previous pages — not a security bug (server-side tenant check).
- [x] [Review][Defer] **`invoice_number_value` btree max-key size (~2700 bytes)** [migration] — deferred; rare malicious AI extraction edge case. Add length cap when observed.
- [x] [Review][Defer] **Per-tenant rate limit on `/api/archive/export`** — deferred; no story owns rate-limiting infrastructure. Authenticated user can repeatedly trigger 500-invoice exports.



### Scope Fences (from epics + prep-p5 + Story 4.1/4.2 deferred items)

- **DATEV export wiring (`event_type: "export_datev"`)** → Story 5.x. The CHECK constraint extension in this story permits the value, but no callsite is wired here.
- **XLSX audit export** → deferred (CSV with semicolon + UTF-8 BOM is the German Excel default; XLSX requires a top-level dep).
- **Streaming ZIP for >500 invoices** → deferred (in-memory build is sufficient at current scale; switch when GOZE has a real Steuerberater request that needs more).
- **Verfahrensdokumentation linkage** → Epic 7. Story 4.3 produces the export; Epic 7 references it.
- **Storage-layer 10-year retention enforcement** → infra-only; current retention guarantee is structural (no DELETE policy).
- **No new top-level dependencies** — same discipline as Stories 4.1/4.2. Hand-rolled store-only ZIP + hand-rolled CSV avoid `fflate`, `jszip`, `exceljs`, `papaparse`. Node ≥20.10 ships `zlib.crc32` — verify `process.versions.node` if uncertain at build time.

### Existing files to read BEFORE coding

Per Story 3.x / 4.1 / 4.2 review discipline (read every UPDATE file completely):

- `apps/web/AGENTS.md` — "This is NOT the Next.js you know." Read `node_modules/next/dist/docs/` for Route Handler conventions before writing `apps/web/app/api/archive/export/route.ts`.
- `apps/web/app/(app)/dashboard/page.tsx` — full file. The archive page mirrors its overall shell + filter pattern. Note the `parseDashboardQuery` per-field `safeParse` and the LIKE escape at line 107.
- `apps/web/components/dashboard/invoice-list-filters.tsx` — full file. The 300ms debounced URL writer + `lastWrittenRef` mid-type clobber fix is the template for `<ArchiveSearchFilters />`. Do NOT introduce a new pattern.
- `apps/web/lib/dashboard-query.ts` — full file. Mirror its Zod-permissive schema, per-field parse, cross-field sanity (e.g. `from > to`).
- `apps/web/app/actions/invoices.ts` — full file. Understand: `getInvoiceSignedUrl` (lines 698-775) and `verifyInvoiceArchive` (lines 782-875) auth/tenant pattern, `logAuditEvent` (lines 40-74), `LOG_PREFIX`/`AUDIT_LOG` discipline, `NEXT_REDIRECT` digest re-throw. `searchArchivedInvoices` lands immediately after `verifyInvoiceArchive`.
- `apps/web/app/actions/invoices.test.ts` — fake supabase client structure, `auditInsertMock` from Story 4.2 is reused for `event_type: "export_audit"` assertions.
- `apps/web/components/layout/empty-state.tsx` — already implements UX-DR19 layout. Reuse — do not create a new one.
- `apps/web/components/layout/mobile-nav.tsx` (line 10) and `sidebar-nav.tsx` (line 19) — `/archiv` href already wired. Story 4.3 simply fills the route; no nav change.
- `supabase/migrations/20260423000000_invoice_sort_columns.sql` and `20260424100000_invoice_sort_columns_safe_cast.sql` — generated-column safe-cast pattern + index discipline. The new `invoice_date_value` column reuses the same regex-guarded cast.
- `supabase/migrations/20260430000000_audit_logs.sql` — the CHECK constraint to be extended; the immutability posture comment to mirror.
- `supabase/migrations/20260417000000_storage_invoices_bucket.sql` — confirms write-once Storage policies (Story 4.3 only READS from Storage; no migration changes here).
- `_bmad-output/implementation-artifacts/4-1-immutable-document-storage-and-sha-256-hashing.md` — `verifyInvoiceArchive` Server Action contract; this story uses the same `verifyBuffer` from `@rechnungsai/gobd` for the export-time batch verification.
- `_bmad-output/implementation-artifacts/4-2-audit-trail-and-action-logging.md` — `logAuditEvent` discipline (sequential + Sentry fallback, non-fatal); audit insert payload shape; AuditEventType union.
- `_bmad-output/implementation-artifacts/prep-p4-gobd-audit-scope-research-2026-04-28.md` — §3 event taxonomy (Story 4.3 adds `export_audit` to satisfy §147 AO Z2/Z3); §7 Story 4.3 scope description.
- `_bmad-output/implementation-artifacts/prep-p5-deferred-work-triage-2026-04-28.md` — §4: archive search uses a dedicated query path, NOT the dashboard's 100-row cap. Do NOT import `LIST_LIMIT`.
- `_bmad-output/implementation-artifacts/smoke-test-format-guide.md` — verbatim format for the Browser Smoke Test section. Do not deviate.
- `packages/gobd/src/hash.ts` — `verifyBuffer` is the per-row verifier. Already shipped, already tested.
- `packages/gobd/src/index.ts` — barrel export. Add `buildAuditExportZip` and the CSV builders.
- `packages/shared/src/types/database.ts` — Row/Insert/Update shapes for `invoices` and `audit_logs`. After migration, add the two new generated-column fields and `"export_audit"` to the event_type union.
- `apps/web/app/actions/invoices.ts:88` — `extFromMime` for the ZIP filename extension; export it (currently file-local) OR redeclare in the Route Handler.

### Search Server Action Implementation Sketch

```ts
const ARCHIVE_SEARCH_LOG = "[invoices:archive-search]";

export async function searchArchivedInvoices(
  input: ArchiveQuery,
): Promise<ActionResult<{ rows: ArchiveRow[]; total: number; page: number; pageSize: number }>> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login?returnTo=/archiv");
    const { data: userRow } = await supabase
      .from("users").select("tenant_id").eq("id", user.id).single();
    if (!userRow) redirect("/login?returnTo=/archiv");
    const tenantId = userRow.tenant_id;

    // Resolve fiscal year if requested and no explicit date range
    let dateFrom = input.dateFrom ?? null;
    let dateTo = input.dateTo ?? null;
    if (input.fiscalYear && !dateFrom && !dateTo) {
      const { data: t } = await supabase
        .from("tenants").select("fiscal_year_start_month")
        .eq("id", tenantId).single();
      const startMonth = t?.fiscal_year_start_month ?? 1;
      const fy = input.fiscalYear;
      // start month = 1 → [fy-01-01, fy-12-31]; start month = 7 → [(fy-1)-07-01, fy-06-30]
      const fyStartYear = startMonth === 1 ? fy : fy - 1;
      dateFrom = `${fyStartYear}-${String(startMonth).padStart(2, "0")}-01`;
      // last day of (startMonth - 1) of `fy`
      const endMonth = startMonth === 1 ? 12 : startMonth - 1;
      const endYear = startMonth === 1 ? fy : fy;
      const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
      dateTo = `${endYear}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    }

    let q = supabase.from("invoices").select(
      "id, status, file_type, original_filename, sha256, invoice_data, gross_total_value, supplier_name_value, invoice_number_value, invoice_date_value, created_at, updated_at, approved_at, skr_code",
      { count: "exact" },
    ).eq("tenant_id", tenantId);

    if (dateFrom) q = q.gte("invoice_date_value", dateFrom);
    if (dateTo)   q = q.lte("invoice_date_value", dateTo);
    if (input.supplier) {
      const escaped = input.supplier.replace(/[\\%_]/g, (c) => `\\${c}`);
      q = q.ilike("supplier_name_value", `%${escaped}%`);
    }
    if (input.invoiceNumber) {
      const escaped = input.invoiceNumber.replace(/[\\%_]/g, (c) => `\\${c}`);
      q = q.ilike("invoice_number_value", `%${escaped}%`);
    }
    if (input.minAmount !== undefined) q = q.gte("gross_total_value", input.minAmount);
    if (input.maxAmount !== undefined) q = q.lte("gross_total_value", input.maxAmount);

    const offset = (input.page - 1) * input.pageSize;
    q = q.order("invoice_date_value", { ascending: false, nullsFirst: false })
         .order("created_at", { ascending: false })
         .range(offset, offset + input.pageSize - 1);

    const { data, count, error } = await q;
    if (error) {
      console.error(ARCHIVE_SEARCH_LOG, "query-failed", error);
      Sentry.captureException(error, { tags: { module: "gobd", action: "archive_search" } });
      return { success: false, error: "Archiv kann momentan nicht geladen werden." };
    }
    return { success: true, data: { rows: (data ?? []) as ArchiveRow[], total: count ?? 0, page: input.page, pageSize: input.pageSize } };
  } catch (err) {
    const digest = (err as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw err;
    console.error(ARCHIVE_SEARCH_LOG, err);
    Sentry.captureException(err, { tags: { module: "gobd", action: "archive_search" } });
    return { success: false, error: "Unerwarteter Fehler. Bitte erneut versuchen." };
  }
}
```

### ZIP Writer Implementation Sketch (`packages/gobd/src/zip.ts`)

```ts
import { crc32 } from "node:zlib";

type ZipEntry = { path: string; bytes: Uint8Array };

function dosTime(d = new Date()): { time: number; date: number } {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((Math.floor(d.getSeconds() / 2)) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

export async function buildAuditExportZip(entries: ZipEntry[]): Promise<Uint8Array> {
  if (entries.length === 0) throw new Error("buildAuditExportZip: at least one entry required");
  const enc = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;
  const { time, date } = dosTime();

  for (const e of entries) {
    const nameBytes = enc.encode(e.path);
    const crc = crc32(e.bytes); // Node ≥20.10 ships zlib.crc32
    const size = e.bytes.byteLength;

    // Local File Header (signature 0x04034b50, version 20, flag bit 11 = UTF-8 names)
    const lfh = new Uint8Array(30 + nameBytes.length);
    const lfhView = new DataView(lfh.buffer);
    lfhView.setUint32(0, 0x04034b50, true);
    lfhView.setUint16(4, 20, true);
    lfhView.setUint16(6, 0x0800, true); // UTF-8 name flag
    lfhView.setUint16(8, 0, true);  // method 0 = store
    lfhView.setUint16(10, time, true);
    lfhView.setUint16(12, date, true);
    lfhView.setUint32(14, crc, true);
    lfhView.setUint32(18, size, true);
    lfhView.setUint32(22, size, true);
    lfhView.setUint16(26, nameBytes.length, true);
    lfhView.setUint16(28, 0, true);
    lfh.set(nameBytes, 30);

    localChunks.push(lfh, e.bytes);

    // Central Directory File Header (signature 0x02014b50)
    const cdfh = new Uint8Array(46 + nameBytes.length);
    const cdfhView = new DataView(cdfh.buffer);
    cdfhView.setUint32(0, 0x02014b50, true);
    cdfhView.setUint16(4, 20, true);  // version made by
    cdfhView.setUint16(6, 20, true);  // version needed
    cdfhView.setUint16(8, 0x0800, true);
    cdfhView.setUint16(10, 0, true);
    cdfhView.setUint16(12, time, true);
    cdfhView.setUint16(14, date, true);
    cdfhView.setUint32(16, crc, true);
    cdfhView.setUint32(20, size, true);
    cdfhView.setUint32(24, size, true);
    cdfhView.setUint16(28, nameBytes.length, true);
    cdfhView.setUint16(30, 0, true);
    cdfhView.setUint16(32, 0, true);
    cdfhView.setUint16(34, 0, true);
    cdfhView.setUint16(36, 0, true);
    cdfhView.setUint32(38, 0, true);  // external file attributes
    cdfhView.setUint32(42, offset, true);
    cdfh.set(nameBytes, 46);
    centralChunks.push(cdfh);

    offset += lfh.byteLength + size;
  }

  const centralStart = offset;
  const centralSize = centralChunks.reduce((s, c) => s + c.byteLength, 0);

  // EOCD (signature 0x06054b50)
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, centralStart, true);
  eocdView.setUint16(20, 0, true);

  // Concat all chunks
  const total = offset + centralSize + eocd.byteLength;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of localChunks)   { out.set(c, p); p += c.byteLength; }
  for (const c of centralChunks) { out.set(c, p); p += c.byteLength; }
  out.set(eocd, p);
  return out;
}
```

### CSV Builder Implementation Sketch (`packages/gobd/src/csv.ts`)

```ts
const BOM = "﻿";
const DELIM = ";";
const EOL = "\r\n";

function escapeField(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(DELIM) || s.includes('"') || s.includes("\r") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildSummaryCsv(rows: SummaryRow[]): string {
  const headers = [
    "Rechnungs-ID","Lieferant","Rechnungsnummer","Belegdatum","Bruttobetrag",
    "SKR-Konto","BU-Schlüssel","Status","Genehmigt am","SHA-256","Verifikationsstatus",
  ];
  const out = [BOM + headers.join(DELIM)];
  for (const r of rows) {
    out.push([
      r.id, r.supplier ?? "", r.invoice_number ?? "",
      r.invoice_date ?? "", formatGermanCurrency(r.gross_total),
      r.skr_code ?? "", r.bu_schluessel ?? "",
      r.status, r.approved_at ?? "", r.sha256 ?? "", r.verification_status,
    ].map(escapeField).join(DELIM));
  }
  return out.join(EOL) + EOL;
}
```

### Why Hand-Rolled ZIP/CSV (not `fflate`/`jszip`/`papaparse`)

- **No new top-level dependency** — same discipline as Epic 3 + Stories 4.1/4.2 (no `framer-motion`, no `sonner`).
- **GoBD-evidentiary correctness** — store-only ZIP is the universally accepted method 0x0000; Steuerberater tooling reads it identically to compressed ZIPs. The originals are JPEG/PDF/XML — already compressed; DEFLATE would save <1%.
- **Audit transparency** — a 200-line writer is easier to review for a tax audit than a 30KB minified library.
- **Future swap is cheap** — if a future story needs DEFLATE or XLSX, swap the helper module; the Route Handler never sees the implementation.

### Audit Insert Discipline (export_audit)

```ts
// Inside the Route Handler, AFTER zipBytes is built, BEFORE returning the response:
await logAuditEvent(supabase, {
  tenantId,
  invoiceId: null, // tenant-level event
  actorUserId: user.id,
  eventType: "export_audit",
  metadata: {
    invoice_count: includedCount,
    requested_count: requestedCount,
    missing_count: requestedCount - includedCount,
    mismatch_count: rows.filter(r => r.verification_status === "mismatch").length,
    format: "zip",
    filters: { dateFrom: body.filters?.dateFrom ?? null, dateTo: body.filters?.dateTo ?? null, fiscalYear: body.filters?.fiscalYear ?? null },
  },
});
```

`logAuditEvent` is non-fatal (per Story 4.2): if the insert fails, Sentry captures the error and the export response still succeeds. The auditor still gets the ZIP; the audit miss is observable.

### Tenant Isolation Checklist (Epic 3 retro A1)

- `searchArchivedInvoices` row SELECT: `.eq("tenant_id", tenantId)` ✓
- Tenant fiscal_year SELECT: `.eq("id", tenantId)` ✓
- Route Handler invoices SELECT: `.eq("tenant_id", tenantId).in("id", invoiceIds)` ✓
- Route Handler audit_logs SELECT: `.eq("tenant_id", tenantId).in("invoice_id", invoiceIds)` ✓
- Storage download: scoped by `file_path` from rows already filtered by tenant ✓ (Storage RLS is the second wall)
- `logAuditEvent` insert: passes resolved `tenantId` ✓

### Error Path Audit (Epic 2 retro A2 — carried forward)

For every new code path:
- `searchArchivedInvoices` query error → Sentry + user-facing German error → graceful failure (page shows the error empty state).
- Route Handler auth fail → `401 { error: "Nicht authentifiziert." }` — never silently 200.
- Route Handler body validation fail → `400 { error: "<first zod issue>" }`.
- Route Handler per-invoice download fail → row marked `verification_status = "error"`, Sentry capture, export continues.
- Route Handler `logAuditEvent` fail → non-fatal (Story 4.2 contract); response still completes.
- Route Handler unexpected error → 500 + Sentry + generic German error message.
- Cross-tenant invoice IDs → silently filtered (no information leak about what other tenants have).

### Source Tree Touch Points

**NEW:**
- `supabase/migrations/20260501000000_archive_search_and_export.sql`
- `apps/web/app/(app)/archiv/page.tsx`
- `apps/web/app/(app)/archiv/loading.tsx`
- `apps/web/app/(app)/archiv/page.test.tsx`
- `apps/web/app/api/archive/export/route.ts`
- `apps/web/app/api/archive/export/route.test.ts`
- `apps/web/lib/archive-query.ts`
- `apps/web/lib/archive-query.test.ts`
- `apps/web/components/archive/archive-search-filters.tsx`
- `apps/web/components/archive/archive-search-filters.test.tsx`
- `apps/web/components/archive/archive-result-list.tsx`
- `apps/web/components/archive/archive-pagination.tsx`
- `apps/web/components/archive/audit-export-button.tsx`
- `apps/web/components/archive/audit-export-button.test.tsx`
- `apps/web/components/archive/retention-notice.tsx`
- `packages/gobd/src/zip.ts`
- `packages/gobd/src/zip.test.ts`
- `packages/gobd/src/csv.ts`
- `packages/gobd/src/csv.test.ts`

**MODIFIED:**
- `packages/shared/src/types/database.ts` (regenerated by `pnpm supabase gen types`; if BLOCKED-BY-ENVIRONMENT, manually add `invoice_number_value`, `invoice_date_value`, and `"export_audit"` per AC #1)
- `apps/web/app/actions/invoices.ts` (add `searchArchivedInvoices` after `verifyInvoiceArchive`)
- `apps/web/app/actions/invoices.test.ts` (4 NEW cases for `searchArchivedInvoices`)
- `packages/gobd/src/index.ts` (export `buildAuditExportZip`, `buildSummaryCsv`, `buildAuditTrailCsv`)

**FORBIDDEN:**
- New top-level dependencies (`fflate`, `jszip`, `exceljs`, `papaparse`, `archiver`). Hand-rolled is the standard.
- Importing `LIST_LIMIT` from `apps/web/app/(app)/dashboard/page.tsx` — archive uses its own pagination strategy (per `prep-p5-deferred-work-triage-2026-04-28.md§4`).
- Modifying `<SourceDocumentViewer>` or `<ArchiveIntegrityBadge>` — archive search reuses both unchanged.
- Modifying `audit_logs` columns or RLS policies — only the CHECK constraint is extended.
- Adding any UPDATE or DELETE policy on `audit_logs` or `invoices` — same retention posture as Story 4.2.
- Wiring `event_type = "export_datev"` — Story 5.x territory; the CHECK constraint already permits the value but no callsite is added here.
- Streaming response (chunked) for the ZIP — in-memory build is sufficient at the 500-invoice cap; if scale forces a switch, do it in a follow-up story.
- Dashboard `/dashboard` page changes — archive is a separate route with its own filter and query strategy.
- Modifying `Storage.objects` policies — the bucket is already write-once from Epic 2.
- Backfilling `invoice_date_value` for legacy rows — generated columns auto-populate on INSERT/UPDATE; no manual backfill needed.

### Testing Standards

- Vitest + jsdom (already wired). Mock `@/lib/supabase/server` per the Story 3.x / 4.2 fake-client pattern; reuse `auditInsertMock` for `event_type: "export_audit"` assertions.
- Route Handler tests: build a `Request` via `new Request("https://x/api/archive/export", { method: "POST", body: JSON.stringify({ invoiceIds }), headers: { "content-type": "application/json" } })`; call `POST(request)`; inspect `response.status`, `response.headers.get("content-type")`, and `await response.arrayBuffer()`.
- ZIP tests: parse the local file header signature `0x04034b50`, central directory signature `0x02014b50`, and EOCD signature `0x06054b50` directly from the bytes. No external unzipper dependency. CRC32 is asserted against `node:zlib` `crc32` of the same input.
- CSV tests: assert BOM bytes (`out.charCodeAt(0) === 0xFEFF`); assert delimiter; assert quote-escaping by feeding `;`, `"`, `\n` payloads.
- Browser smoke test: standard local Supabase: `psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres'`. Format per `smoke-test-format-guide.md`.

### Project Structure Notes

- `/archiv` route group lands inside the existing `(app)/` segment so the app shell (mobile-nav, sidebar-nav, trust-badge-bar) wraps it automatically.
- `apps/web/components/archive/` is a NEW component folder — first archive-specific UI domain. Mirror the `dashboard/`, `invoice/`, `capture/` folder discipline.
- Per architecture.md line 532, `archive/page.tsx` is reserved for `FR24-FR25`. Story 4.3 implements both.
- Per architecture.md line 703, `packages/gobd/src/audit-log.ts` is reserved — this story does NOT introduce it (consistent with Story 4.2 deferring the same package module). The `logAuditEvent` helper in `apps/web/app/actions/invoices.ts` remains the single insert path.
- Per architecture.md line 784, `app/archive/` was the original path; the implemented German `/archiv` is the user-facing route. Both architecture.md and the nav components are aligned on `/archiv` after this story (architecture.md will be updated by the doc agent during Epic 4 retrospective).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 4 / Story 4.3] — Story statement + ACs (lines 790-820)
- [Source: _bmad-output/planning-artifacts/prd.md#FR24,FR25,NFR5,NFR15,NFR16,NFR26] — search filter dimensions, <1s response, 5M-row scale, 50GB archive, 3-click rule
- [Source: _bmad-output/implementation-artifacts/prep-p4-gobd-audit-scope-research-2026-04-28.md§7] — GoBD §147 AO Z2/Z3 audit export scope
- [Source: _bmad-output/implementation-artifacts/prep-p5-deferred-work-triage-2026-04-28.md§4] — archive search uses dedicated query path, NOT dashboard cap
- [Source: _bmad-output/implementation-artifacts/4-1-immutable-document-storage-and-sha-256-hashing.md] — `verifyInvoiceArchive` + `verifyBuffer` are reused for export-time batch verification
- [Source: _bmad-output/implementation-artifacts/4-2-audit-trail-and-action-logging.md] — `logAuditEvent` discipline; `AuditEventType` union; `audit_logs_event_type_chk` CHECK constraint to extend
- [Source: _bmad-output/implementation-artifacts/epic-3-retro-2026-04-28.md§Action Items] — A1 tenant-isolation checklist (defense-in-depth `.eq("tenant_id", tenantId)`)
- [Source: _bmad-output/implementation-artifacts/smoke-test-format-guide.md] — Smoke test format (mandatory)
- [Source: _bmad-output/planning-artifacts/architecture.md#packages/gobd] — Package layout (lines 696-705); `audit-log.ts` mentioned but intentionally deferred (Story 4.2/4.3 keep concerns in the Server Action / Route Handler)
- [Source: _bmad-output/planning-artifacts/architecture.md#Database conventions] — `snake_case` plural table names (line 294); Supabase Storage RLS pattern (line 208)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Empty States] — UX-DR19 verbatim German empty-state copy + layout (line 1924)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Navigation] — `Archiv` bottom-nav item (line 1890); 3-click NFR26
- [Source: supabase/migrations/20260423000000_invoice_sort_columns.sql + 20260424100000_invoice_sort_columns_safe_cast.sql] — Generated-column safe-cast pattern; STORED requirement for PostgREST
- [Source: supabase/migrations/20260430000000_audit_logs.sql] — CHECK constraint to extend; idempotent migration pattern
- [Source: supabase/migrations/20260417000000_storage_invoices_bucket.sql] — write-once Storage policies (read-only consumption in this story)
- [Source: supabase/migrations/20260415000000_fix_rls_recursion.sql] — `public.my_tenant_id()` SECURITY DEFINER helper (reuse — do not redefine)
- [Source: apps/web/app/actions/invoices.ts] — `getInvoiceSignedUrl` (698), `verifyInvoiceArchive` (782), `logAuditEvent` (40-74), `extFromMime` (88), `LOG_PREFIX` discipline
- [Source: apps/web/app/(app)/dashboard/page.tsx] — server-component query pattern, LIKE escape (107), `Promise.all` parallel fetches, `parseDashboardQuery` usage
- [Source: apps/web/components/dashboard/invoice-list-filters.tsx] — debounced URL writer pattern (300ms + lastWrittenRef)
- [Source: apps/web/lib/dashboard-query.ts] — Zod-permissive per-field `safeParse` parser
- [Source: apps/web/components/layout/empty-state.tsx] — UX-DR19 layout (reuse)
- [Source: apps/web/components/layout/mobile-nav.tsx:10 + sidebar-nav.tsx:19] — `/archiv` href already wired
- [Source: apps/web/AGENTS.md] — "This is NOT the Next.js you know." Read `node_modules/next/dist/docs/` first
- [Source: packages/gobd/src/hash.ts] — `verifyBuffer` (already shipped + tested in Story 4.1)
- [Source: Node.js docs §zlib.crc32] — Node ≥20.10 ships `zlib.crc32(buffer)` for the per-entry ZIP CRC

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- **CSV test RFC 4180 escaping:** Test expected raw `{"source":"manual"}` in CSV output; RFC 4180 doubles inner quotes so actual output is `"{""source"":""manual""}"`. Fixed test assertion.
- **gobd package `.js` extension requirement:** Node16 moduleResolution requires explicit `.js` extensions in ESM imports. Fixed `zip.test.ts` and `csv.test.ts` to import `"./zip.js"` and `"./csv.js"`.
- **`buildSummaryCsv is not a function` in route tests:** `dist/` was stale after adding new source files. Fixed by running `pnpm --filter @rechnungsai/gobd build`.
- **`@testing-library/user-event` not installed:** Rewrote filter and export button tests using `fireEvent` from `@testing-library/react` and `vi.useFakeTimers()`, matching existing `invoice-list-filters.test.tsx` pattern.
- **TypeScript `Object is possibly 'undefined'`:** Array index accesses `bytes[i]` in route test ZIP signature parsing added `?? 0` defaults for strict mode.
- **`Uint8Array<ArrayBufferLike>` not assignable to `BodyInit`:** Changed `new Response(zipBytes, ...)` to `new Response(zipBytes.buffer as ArrayBuffer, ...)` in route handler.
- **Page test `ArchivePagination` string not found:** Mock function name not serialized in React element JSON. Changed assertion to `toContain('"pageSize":50')`.
- **Review patch: CSV whitelist strips `{ source: "manual" }` from test:** `filterAuditMetadata` only allows whitelisted keys; updated csv.test.ts to use `{ confidence_score: 0.95, source: "manual" }` and assert whitelisted key present + PII key absent.
- **Review patch: ArchiveSelectionLayer needs "Hochgeladen" header addition:** Adding upload date as its own column required a new `<th>` header — verified row count matches header count.

### Completion Notes List

All 9 tasks completed. Implementation summary:

**Task 1 — Migration:** `supabase/migrations/20260501000000_archive_search_and_export.sql` extends `audit_logs_event_type_chk` CHECK constraint to include `'export_audit'`, adds `invoice_number_value` and `invoice_date_value` GENERATED ALWAYS AS STORED columns with regex-guarded date cast (NULL-safe), and creates 3 composite indexes. Types manually added to `packages/shared/src/types/database.ts` (BLOCKED-BY-ENVIRONMENT: local Supabase not running).

**Task 2 — Archive query parser + Server Action:** `apps/web/lib/archive-query.ts` implements Zod per-field `safeParse` with cross-field sanity. `searchArchivedInvoices` in `apps/web/app/actions/invoices.ts` implements full auth→tenant→fiscal-year-resolution→filter-chain→pagination with `count: "exact"` and Sentry fallback.

**Task 3 — ZIP writer:** `packages/gobd/src/zip.ts` implements store-only ZIP (method 0x0000) using `node:zlib` `crc32`. LFH + CDFH + EOCD layout, UTF-8 flag (bit 11), ~130 LOC, zero new dependencies.

**Task 4 — CSV builders:** `packages/gobd/src/csv.ts` implements RFC 4180 with UTF-8 BOM (EF BB BF), semicolon delimiter, German locale number formatting via inline `Intl.NumberFormat("de-DE")`, and proper quote-escaping.

**Task 5 — Archive page + components:** Server Component page at `/archiv`, debounced filter component (300ms + `lastWrittenRef`), result list with `EmptyState`, pagination, `RetentionNotice`, and loading skeleton.

**Task 6 — Route Handler + button:** POST `/api/archive/export` with full GoBD-compliant ZIP export: auth, tenant isolation, per-invoice `verifyBuffer`, hash-mismatch Sentry, `logAuditEvent` before response. `AuditExportButton` uses `useTransition` + `URL.createObjectURL`.

**Task 7 — Tests:** 376 total (285 web, 21 gobd, 59 shared, 11 ai). +36 from 340 baseline, exceeds ≥360 target.

**Task 8 — Smoke test:** See Browser Smoke Test section below.

**Task 9 — Tenant isolation:** All query paths verified: `searchArchivedInvoices` `.eq("tenant_id")`, Route Handler `.eq("tenant_id").in("id", invoiceIds)`, `audit_logs` SELECT `.eq("tenant_id")`, `logAuditEvent` insert with resolved `tenantId`. No raw SQL. RLS is the second wall.

**Review patches applied (2026-05-02):** All 24 review findings addressed. Summary:
- Patch 1: `escapeField` in csv.ts guards `=`, `+`, `-`, `@`, `\t`, `\r` prefix chars (formula injection).
- Patch 2: ZIP writer throws on >65534 entries or >4 GiB total payload.
- Patch 3: Failed Storage downloads → `documents/<id>.MISSING.txt` with reason (not silent 0-byte).
- Patch 4: NEW migration `20260501000001_fix_invoice_date_generated_column.sql` — `public.parse_iso_date_safe()` IMMUTABLE function wraps `make_date` with exception handler; drops + recreates `invoice_date_value` column.
- Patch 5: `searchArchivedInvoices` clamps `page >= 1` and pins `pageSize = PAGE_SIZE` at action entry.
- Patch 6: `logAuditEvent` in route handler wrapped in explicit try/catch with Sentry fallback.
- Patch 7: `URL.revokeObjectURL` deferred via `setTimeout(..., 0)` for Safari/Chromium download safety.
- Patch 8: `database.ts` event_type is `string` (supabase-gen-types does not generate check-constraint unions); `AuditEventType` in `invoices.ts` already includes `"export_audit"` — no change needed.
- Patch 9: README.txt rewritten with proper Umlaute (gemäß, Unveränderbarkeit, Änderungsprotokoll) + scope note.
- Patch 10: `ArchiveSelectionLayer` renders upload date in a dedicated "Hochgeladen" column on every row.
- Patch 11: Added test — fiscalYear and dateFrom coexist in URL (override-only-when-absent semantics).
- Patch 12: `dosTime()` in zip.ts uses `getUTC*` methods for timezone-deterministic output.
- Patch 13: `isoDate` in archive-query.ts uses `.refine()` real-calendar-date round-trip check.
- Patch 14: `archiv/page.tsx` redirects to page 1 when `rows.length === 0 && total > 0 && page > 1`.
- Patch 15: `AuditExportButton` shows German inline error message (`role="alert"`) + Sentry capture on failure.
- Patch 16: `bodySchema` in route.ts uses tighter regex for `dateFrom`/`dateTo` (month 01-12, day 01-31).
- Patch 17: Invoice fetch in route handler adds `.order("invoice_date_value", asc).order("id", asc)` for deterministic ZIP order.
- Patch 18: Invoice SELECT in route handler adds `approved_by, created_at` per Concern #2.
- Patch 19: `archiv/page.tsx` outer div uses `min-w-0 flex flex-col gap-4`; `ArchiveSelectionLayer` outer div uses `min-w-0 flex flex-col gap-3` to prevent horizontal overflow breaking fixed nav.
- Patch 20: Archive search filters use German active-mask date inputs (`applyGermanDateMask` / `isoToGermanDateInput` / `parseGermanDate`). Dashboard filters updated identically.
- Patch 21: `apps/web/AGENTS.md` convention rule added; `invoice-list-filters.tsx` date inputs converted to active-mask; test updated to use German format.
- Patch 22: `ArchiveResultList` refactored to server component (renders EmptyState or `<ArchiveSelectionLayer>`); NEW `ArchiveSelectionLayer` client component owns selection state + renders table.
- Patch 23: Cross-field date contradiction (`dateFrom > dateTo`) and amount contradiction (`min > max`) show `aria-invalid` + German `role="alert"` error and block URL write; 2 new tests added.
- Patch 24: `filterAuditMetadata` in csv.ts whitelists audit-relevant metadata keys; applied in route.ts before building audit-trail.csv; README.txt documents whitelisted keys.

---

### Browser Smoke Test

**Environment:** `pnpm dev` from repo root. Supabase local: `host=localhost port=54322 dbname=postgres user=postgres password=postgres`.

#### UX Checks

| # | Action | Expected Output | Pass Criterion | Status |
|---|--------|----------------|----------------|--------|
| (a) | Sign in → tap **Archiv** in the bottom nav or sidebar | `/archiv` loads. Page title `"Archiv"` visible. Muted text `"Dokumente werden 10 Jahre aufbewahrt (GoBD §147 AO)."` appears above results. Filter bar (Lieferant, Rechnungsnummer, Von, Bis, Geschäftsjahr, Betrag) visible. | Pass if the page loads at `/archiv`, the title `"Archiv"` is visible, the retention notice renders verbatim, and the filter bar is visible. | DONE |
| (b) | On `/archiv` with invoices loaded, type `"Muster"` into the **Lieferant** field | URL does NOT update immediately. After 300ms, URL updates to include `supplier=Muster` and results re-render filtered. | Pass if the URL does NOT update before 300ms debounce AND after debounce the URL contains `supplier=Muster` and only matching rows appear. | DONE |
| (c) | On `/archiv`, set **Geschäftsjahr** to `2025` | URL immediately updates to include `fiscalYear=2025`. Results re-render showing only invoices with `invoice_date_value` in the fiscal year range. | Pass if URL updates without 300ms delay AND contains `fiscalYear=2025` AND results change. | DONE |
| (d) | On `/archiv`, click **Filter zurücksetzen** after setting any filters | URL navigates to plain `/archiv` (no query params). All filter inputs clear. All invoices re-appear. | Pass if URL is exactly `/archiv` (no `?` params) after clicking reset AND all filter inputs are empty. | DONE |
| (e) | On `/archiv` with a filter that matches no invoices (e.g. **Lieferant** = `"XYZNONEXISTENT"`) | Results area shows `"Keine Rechnungen gefunden"` (h2) and `"Versuche einen anderen Suchbegriff oder Zeitraum."` (body-sm). No pagination controls. Filter bar remains visible. | Pass if both verbatim German strings appear AND no pagination buttons are rendered. | DONE |
| (f) | On `/archiv` with ≥1 invoice visible, check the checkbox next to one invoice row | Checkbox becomes checked. The **GoBD-Audit-Export** button (or similar German label) becomes enabled. | Pass if the export button changes from disabled to enabled after selecting exactly one invoice. | DONE |
| (g) | With 1–3 invoices selected, click the export button | Browser triggers a download. Downloaded file has a name matching `audit-export-<slug>-<YYYYMMDD>.zip`. | Pass if the browser download dialog appears (or file lands in Downloads) with a `.zip` filename containing `audit-export`. | DONE |
| (h) | Open the downloaded ZIP: `unzip -l <downloaded-file>.zip` in a terminal | Output lists: `documents/<uuid>.pdf` (or `.jpg`/`.xml`) for each selected invoice, `summary.csv`, `audit-trail.csv`, `README.txt`. No other unexpected files. | Pass if `unzip -l` output contains all four expected path categories and the total file count equals `N documents + 3` (where N is selected invoice count). | DONE |
| (i) | Open `summary.csv` from the ZIP in Excel (German locale) or a text editor | CSV opens with German headers (`Rechnungs-ID;Lieferant;Rechnungsnummer;…`), semicolon delimiter, German amount format (`1.234,56`), and one row per selected invoice. | Pass if headers are in German AND amounts use comma decimal separator AND each selected invoice appears as one row. | DONE |
| (j) | Read `README.txt` from the ZIP | Contains verbatim text citing `§§ 238-241 HGB` and `GoBD Tz. 100-107` and `§ 147 AO`. | Pass if the three legal references appear verbatim in the file. | DONE |

UX issues:
1. Archiv bolumunune gecis yapinca mobil uyumluluk berbat.
   - ekranin en altinda sabit olmasi gereken navigation butonlari gorunmuyor ve sayfanin en altina scroll edince gorunuyor.
   - Archiv sayfasi mobil icin yanlardan ve boylamasina mobil icin uyumlu degil tasiyor
2. filtrelerde kullanilan tarih inputlari "Ubersicht" sayfasindaki tarih filtrelerinin kullandigi gibi "active mask" yapmali ve alman kullanicinin UX'ine gore user "DD-MM-YYYY" formatinda input girmeyi bekliyor. (story 3-5)

**Manual Steps for GOZE:**
1. `pnpm dev` from repo root
2. Sign in at `/login` with a test account that has at least 3 invoices in the archive
3. Run UX checks (a)–(j) in order
4. For check (h): run `unzip -l <filename>.zip` in a terminal on the downloaded file
5. Mark each check `DONE` or `FAIL` — if FAIL, note what you actually saw vs. the expected output

#### DB Verification

| # | Query | Expected Return | What It Validates | Status |
|---|-------|----------------|-------------------|--------|
| (d1) | `psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres' -c "SELECT event_type, invoice_id, metadata->>'invoice_count' AS invoice_count, metadata->>'format' AS format FROM audit_logs WHERE event_type = 'export_audit' ORDER BY created_at DESC LIMIT 1;"` | `event_type \| invoice_id \| invoice_count \| format` / `---------------+------------+--------------+--------` / `export_audit \| [null] \| [N] \| zip` / `(1 row)` | Confirms AC #8: one `export_audit` row inserted with `invoice_id = null` (tenant-level event) and `format = "zip"`. | DONE |
| (d2) | `psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres' -c "SELECT metadata->>'requested_count' AS requested, metadata->>'invoice_count' AS included, metadata->>'missing_count' AS missing, metadata->>'mismatch_count' AS mismatches FROM audit_logs WHERE event_type = 'export_audit' ORDER BY created_at DESC LIMIT 1;"` | Four integer-valued columns matching the export just run. `requested` = number of IDs sent. `included` ≤ `requested`. `missing` = `requested - included`. `mismatches` = 0 for normal invoices. | Confirms AC #8: metadata shape is complete with all four count fields. | DONE |
| (d3) | `psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres' -c "EXPLAIN (ANALYZE, FORMAT TEXT) SELECT id FROM invoices WHERE tenant_id = (SELECT tenant_id FROM users LIMIT 1) AND invoice_date_value BETWEEN '2025-01-01' AND '2025-12-31' ORDER BY invoice_date_value DESC NULLS LAST LIMIT 50;"` | Query plan includes `Index Scan using invoices_tenant_invoice_date_idx`. Execution time < 100ms on local empty DB. | Confirms AC #1 + NFR5: new composite index `invoices_tenant_invoice_date_idx` is selected by the planner for date-range + tenant filter. | DONE |

---

### File List

**NEW files:**
- `supabase/migrations/20260501000000_archive_search_and_export.sql`
- `supabase/migrations/20260501000001_fix_invoice_date_generated_column.sql`
- `apps/web/components/archive/archive-selection-layer.tsx`
- `apps/web/app/(app)/archiv/page.tsx`
- `apps/web/app/(app)/archiv/loading.tsx`
- `apps/web/app/(app)/archiv/page.test.tsx`
- `apps/web/app/api/archive/export/route.ts`
- `apps/web/app/api/archive/export/route.test.ts`
- `apps/web/lib/archive-query.ts`
- `apps/web/lib/archive-query.test.ts`
- `apps/web/components/archive/archive-search-filters.tsx`
- `apps/web/components/archive/archive-search-filters.test.tsx`
- `apps/web/components/archive/archive-result-list.tsx`
- `apps/web/components/archive/archive-pagination.tsx`
- `apps/web/components/archive/audit-export-button.tsx`
- `apps/web/components/archive/audit-export-button.test.tsx`
- `apps/web/components/archive/retention-notice.tsx`
- `packages/gobd/src/zip.ts`
- `packages/gobd/src/zip.test.ts`
- `packages/gobd/src/csv.ts`
- `packages/gobd/src/csv.test.ts`

**MODIFIED files:**
- `packages/shared/src/types/database.ts` (added `invoice_number_value`, `invoice_date_value` to `invoices.Row`; `event_type: string` — union not generated by supabase-js for CHECK constraints)
- `apps/web/app/actions/invoices.ts` (added `searchArchivedInvoices` + page/pageSize validation; `AuditEventType` includes `"export_audit"`)
- `apps/web/app/actions/invoices.test.ts` (4 new cases for `searchArchivedInvoices`)
- `packages/gobd/src/index.ts` (exported `buildAuditExportZip`, `ZipEntry`, `buildSummaryCsv`, `buildAuditTrailCsv`, `filterAuditMetadata`, `SummaryRow`, `AuditTrailRow`)
- `packages/gobd/src/zip.ts` (UTC DOS time; 4 GiB + entry count guards)
- `packages/gobd/src/csv.ts` (formula injection guard; `filterAuditMetadata` whitelist helper; audit trail uses whitelist)
- `packages/gobd/src/csv.test.ts` (updated metadata test to use whitelisted keys)
- `apps/web/app/api/archive/export/route.ts` (tighter body schema; README Umlaute; MISSING.txt for failed downloads; .order() on invoice fetch; approved_by+created_at in SELECT; logAuditEvent try/catch; metadata whitelist)
- `apps/web/lib/archive-query.ts` (real-date round-trip refine on isoDate)
- `apps/web/app/(app)/archiv/page.tsx` (min-w-0 on outer div; redirect import; phantom-page redirect)
- `apps/web/components/archive/archive-result-list.tsx` (server component; delegates to ArchiveSelectionLayer)
- `apps/web/components/archive/archive-search-filters.tsx` (active-mask date inputs; cross-field contradiction validation with aria-invalid + error messages)
- `apps/web/components/archive/archive-search-filters.test.tsx` (7 → 11 tests: fiscalYear coexistence, active-mask date tests, contradiction validation tests)
- `apps/web/components/archive/audit-export-button.tsx` (defer URL.revokeObjectURL; inline error message + Sentry)
- `apps/web/components/dashboard/invoice-list-filters.tsx` (date inputs converted to active-mask pattern)
- `apps/web/components/dashboard/invoice-list-filters.test.tsx` (date test updated to German format)
- `apps/web/AGENTS.md` (date input convention rule added)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-05-02 | Implemented Story 4.3: migration, archive-query parser, searchArchivedInvoices Server Action, store-only ZIP writer, CSV builders, archive page + components, audit export Route Handler, AuditExportButton. 376 tests passing (285 web, 21 gobd, 59 shared, 11 ai). pnpm check-types clean. | claude-sonnet-4-6 |
| 2026-05-02 | Applied all 24 code-review patches: CSV formula injection guard, ZIP guards, MISSING.txt for failed downloads, new migration fix for date column, Server Action input validation, logAuditEvent try/catch, URL.revokeObjectURL defer, README Umlaute, upload date column, filter contradiction validation, active-mask date inputs (archiv + dashboard), ArchiveResultList refactor to server component + ArchiveSelectionLayer, metadata DSGVO whitelist, phantom-page redirect, mobile overflow fix, AGENTS.md convention rule. 382 tests passing (291 web, 21 gobd, 59 shared, 11 ai). pnpm check-types clean. | claude-sonnet-4-6 |
| 2026-05-02 | Post-review mobile fix: (1) `overflow-x-clip` on AppShell root div prevents document expanding beyond viewport → fixes `position: fixed` bottom nav on iOS Safari; (2) archive table hides Hochgeladen+Status on mobile (<640px) and SHA-256 on <768px via `hidden sm:table-cell`/`hidden md:table-cell` — 4 columns on mobile fits 375px; (3) Lieferant cell gets `max-w-[8rem] sm:max-w-none truncate`. 291 web tests passing. pnpm check-types clean. | claude-sonnet-4-6 |
| 2026-05-02 | Fix summary.csv column-shift in LibreOffice: `escapeField` now also quotes fields containing comma, so German decimal amounts like "222,51" are rendered as `"222,51"` and not split when LibreOffice auto-detects comma as delimiter. New test verifies gross_total field is quoted. 22 gobd + 291 web tests passing. | claude-sonnet-4-6 |
