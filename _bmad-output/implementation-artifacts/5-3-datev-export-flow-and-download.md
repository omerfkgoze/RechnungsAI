# Story 5.3: DATEV Export Flow and Download

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to pick a date range from the dashboard, see export progress, and download a DATEV CSV of my approved invoices,
so that I can hand my monthly bookkeeping over to my Steuerberater in under a minute.

## Context: Wire-Up Story — No New Computation

**STOP — read this before reading the ACs.**

Story 5.3 is a **wire-up story**. Everything that *generates* the DATEV CSV already exists:

- `buildExtfV700(config, rows, exportedAt?)` — Story 5.2, in `@rechnungsai/datev`. Returns `{ csv, rowCount, skippedCount, dateFrom, dateTo }`.
- `tenants.datev_*` columns + readiness indicator — Story 5.1.
- `audit_logs.event_type = 'export_datev'` — already permitted by the constraint (`supabase/migrations/20260501000000_archive_search_and_export.sql:26`); the migration comment explicitly says `Story 5.x wires the callsite.`
- `invoices.status = 'exported'` — already in the enum (`supabase/migrations/20260417100000_invoices_table.sql:26`).
- `<ExportAction>` CTA — Story 3.5, currently has a no-op `onExport` prop (`apps/web/components/dashboard/export-action.tsx:13,47`).
- Active-mask German date inputs — `lib/format.ts` + `components/archive/archive-search-filters.tsx` (reference impl).

You are wiring these together: a dialog on the dashboard, a Server Action that builds + writes, a Route Handler that downloads.

### Scope reduction (read carefully)

The epic line for 5.3 mentions **emailing the CSV to the Steuerberater**. **Email is OUT OF SCOPE for this story** for two concrete reasons:

1. `@rechnungsai/email` is an empty stub (`packages/email/src/index.ts` is one comment line — no Resend/SES/nodemailer integration, no env vars, no templates).
2. `tenants` has no `steuerberater_email` column (`packages/shared/src/types/database.ts:286-300` — only `steuerberater_name`). Adding one + a validator + UI + email infra is its own story.

Epic 8 (`### Story 8.3: Weekly Value Recap Email and Notification Preferences`) is where transactional email infrastructure lands. **Add the email handoff as a deferred-work entry in this story's Review Findings** (see Task 9). Do NOT ship a half-working email button.

In place of email, the post-export success state offers **download** and an **inert `mailto:` helper** (opens the user's mail client with a pre-filled German subject/body — no attachment, since browsers can't attach files via `mailto:`; the user drags the just-downloaded file in themselves). This is a one-line `<a href={mailto:…}>` — no email infra needed.

### What is in scope

1. New Server Action `prepareDatevExport(input)` in `apps/web/app/actions/datev.ts` — validates settings, fetches eligible rows, builds CSV via `buildExtfV700`, persists `csv` bytes in a short-lived row, transitions `status` from `ready` → `exported` for the included invoices, writes one `export_datev` audit row.
2. New Route Handler `apps/web/app/api/export/datev/[exportId]/route.ts` — GETs the prepared CSV and streams it as `text/csv` with `Content-Disposition: attachment` + Windows-1252-safe filename. The two-step (prepare → fetch) pattern mirrors how the archive ZIP export was done in 4.3 except that 4.3 did the work in-route; here we split because the dialog needs the result counts (`rowCount`, `skippedCount`) BEFORE the user clicks "Herunterladen".
3. New table `datev_exports` (single migration) — stores the prepared CSV with a 1-hour TTL, scoped by `tenant_id`. RLS limits read to the owning tenant. The Route Handler verifies tenant + freshness, returns 410 on expired.
4. New client component `<DatevExportDialog>` — opens from the existing `<ExportAction>` CTA, runs the 3-step German progress UI (Validating / Formatting / Packaging), shows partial-success summary, offers download + `mailto:` helper.
5. Wire `<ExportAction onExport>` to open the dialog.
6. Tests: schema, action, route handler, dialog — patterns identical to existing files.

### What is NOT in scope

- Email send (no infra; defer to Epic 8).
- New "exported" badge styles — `invoice-list-card.tsx:40` already has `exported: "outline"`.
- "Last export date" filter logic on the date-range picker (defaults to "first day of current calendar month → today" — simpler and sufficient for v1; the epic says "based on last export date" but per `prep-p2-datev-settings-scope-2026-05-04.md` we already pruned epic 5 scope, and querying last-export adds RPC overhead for marginal value in the first iteration).
- DATEV format changes — locked to v700 from Story 5.2.

## Acceptance Criteria

### Server Action: `prepareDatevExport`

1. **Given** the file `apps/web/app/actions/datev.ts` does not yet exist **When** the story is implemented **Then** it exists with `"use server"` directive at line 1, exports a single named function `prepareDatevExport`, follows the auth/tenant resolution pattern of `apps/web/app/actions/invoices/approval.ts:39-58` verbatim (call `supabase.auth.getUser()` first, then `users.select("tenant_id").eq("id", user.id).single()`, redirect to `/login?returnTo=/dashboard` on either failure), and returns `Promise<ActionResult<{ exportId: string; rowCount: number; skippedCount: number; dateFrom: string; dateTo: string; missingSettings: false } | { missingSettings: true; missingFields: string[] }>>`.

2. **Given** the action's input **When** it is called **Then** the input shape is `{ dateFrom: string; dateTo: string }` (both `YYYY-MM-DD` ISO strings), validated by a Zod schema `prepareDatevExportSchema` declared at the top of `datev.ts` using `z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, { message: "Datum muss im Format JJJJ-MM-TT vorliegen." })`; cross-field check `dateFrom <= dateTo` returns the German error `"Startdatum darf nicht nach dem Enddatum liegen."`; both bounds are inclusive in the SQL `gte`/`lte` filters.

3. **Given** the user's tenant has missing required DATEV settings (any of `datev_berater_nr`, `datev_mandanten_nr` is null) **When** `prepareDatevExport` checks the tenant row **Then** the action returns `{ success: true, data: { missingSettings: true, missingFields: ["datev_berater_nr", ...] } }` (NOT `{ success: false }` — missing settings is an expected branch the dialog handles inline, not a hard error); the dialog (AC #11) then shows the German prompt `"Für den DATEV-Export werden noch deine Berater- und Mandantennummer benötigt."` with a deep link to `/einstellungen#datev` (UX-DR14 — never navigate away from the export context).

4. **Given** valid settings AND a valid date range **When** the action queries invoices **Then** it selects FROM `invoices` WHERE `tenant_id = <currentTenant> AND status = 'ready' AND invoice_date_value >= dateFrom AND invoice_date_value <= dateTo`, ordered by `invoice_date_value ASC, id ASC` (deterministic batch ordering — mirrors `apps/web/app/api/archive/export/route.ts:126-127`), columns `id, gross_total_value, invoice_date_value, invoice_number_value, supplier_name_value, skr_code, bu_schluessel`. `LIMIT 500` (NFR4 — partial-export cap; if more than 500 are eligible the dialog instructs the user to narrow the range — see AC #12). `invoice_date_value` is the existing generated column (`supabase/migrations/20260501000001_fix_invoice_date_generated_column.sql`). DO NOT use `invoice_data->>'invoice_date'` — the safe-cast generated column is the canonical sort field.

5. **Given** the SQL returned 0 rows **When** the action evaluates **Then** it returns `{ success: false, error: "Im gewählten Zeitraum gibt es keine freigegebenen Rechnungen für den Export." }`; no audit row is written; no `datev_exports` row is created.

6. **Given** the SQL returned 1+ rows **When** the action calls `buildExtfV700` **Then** it imports `buildExtfV700` and the three types from `@rechnungsai/datev` (the package builds to `dist/` per Story 5.2 — make sure `pnpm --filter @rechnungsai/datev build` has been run if you see TS resolution errors); maps each DB row to `DatevBookingRow` via `{ gross_total: r.gross_total_value!, invoice_date: r.invoice_date_value!, invoice_number: r.invoice_number_value, supplier: r.supplier_name_value, skr_code: r.skr_code, bu_schluessel: r.bu_schluessel }` (the `!` non-null assertions are safe BECAUSE the SQL filtered `status = 'ready'` and the DB-level NOT NULL constraints + generated columns guarantee non-null on `gross_total_value` / `invoice_date_value` for ready rows — but defend anyway: filter rows where either is null in JS before the map, and add the count to `skippedCount`); maps the tenant row to `DatevTenantConfig` with `skrPlan: tenant.skr_plan === "SKR04" ? "SKR04" : "SKR03"` (defensive default to SKR03 if value is unexpectedly missing — same coercion pattern as `apps/web/app/(app)/rechnungen/[id]/page.tsx:117`). DO NOT recompute `bu_schluessel` here — the column already holds the mapped integer (Story 5.2 anti-pattern #2 carries forward).

7. **Given** `buildExtfV700` returned `{ csv, rowCount, skippedCount, dateFrom, dateTo }` **When** persistence runs **Then** the action inserts ONE row into `datev_exports` with columns `tenant_id, created_by, csv, row_count, skipped_count, date_from, date_to, expires_at` where `expires_at = now() + interval '1 hour'`; the insert returns the new row's `id` (uuid) which becomes the response's `exportId`. RLS protects reads — see AC #15.

8. **Given** the new export row was successfully inserted **When** invoice status transitions run **Then** the action issues ONE `update` against `invoices` setting `status = 'exported'` filtered by `tenant_id = currentTenant AND id IN (<includedIds>) AND status = 'ready'` (the `status = 'ready'` predicate is the concurrency guard — same pattern as `approval.ts:94`); rows that have changed status concurrently are silently skipped (this is correct — they no longer belong in the batch). Capture the actually-updated count via `.select("id")` and compare to `rowCount` — if they diverge, log via `console.warn("[datev:export] concurrent-skip", ...)` and adjust the response's `rowCount` to the actual count (do not error out — partial commits are fine and aligned with the partial-export AC).

9. **Given** the status update succeeded **When** audit logging runs **Then** the action calls `logAuditEvent(supabase, { tenantId, invoiceId: null, actorUserId: user.id, eventType: "export_datev", metadata: { export_id, row_count, skipped_count, date_from, date_to, format: "extf-v700", invoice_ids } })` ONCE, where `invoice_ids` is the array of UUIDs that actually transitioned (NOT the originally-fetched ids — drift is possible per AC #8). The single `eventType: "export_datev"` matches the constraint allow-list (`supabase/migrations/20260501000000_archive_search_and_export.sql:26`). Pre-existing helper signature in `apps/web/app/actions/invoices/shared.ts:19-53` — DO NOT modify the helper.

10. **Given** any thrown error inside the action **When** the catch block runs **Then** the catch follows the existing canonical pattern from `approval.ts:129-143`: detect `NEXT_REDIRECT` digest and rethrow; otherwise `console.error("[datev:export]", err)`, `Sentry.captureException(err, { tags: { module: "datev", action: "prepare_export" }, extra: { dateFrom, dateTo } })`, return `{ success: false, error: "Unerwarteter Fehler. Bitte erneut versuchen." }`. Use the tag `module: "datev"` consistently across all calls in this story (the existing `module: "gobd"` tag belongs to GoBD code; do NOT borrow it).

### Migration: `datev_exports`

11. **Given** the new migration `supabase/migrations/20260506000000_datev_exports.sql` (today's date, `2026-05-06` per project state) **When** `supabase db reset` runs **Then** the migration creates `public.datev_exports` with columns `id uuid primary key default gen_random_uuid()`, `tenant_id uuid not null references public.tenants(id) on delete cascade`, `created_by uuid not null references auth.users(id)`, `csv text not null` (UTF-8 string with BOM — Postgres `text` is fine, the BOM is just three bytes), `row_count integer not null check (row_count > 0)`, `skipped_count integer not null default 0 check (skipped_count >= 0)`, `date_from text not null` (`YYYYMMDD`, plain text — matches the format `buildExtfV700` returns), `date_to text not null`, `created_at timestamptz not null default now()`, `expires_at timestamptz not null`. Add an index `create index datev_exports_tenant_created_at_idx on public.datev_exports (tenant_id, created_at desc);` for any future "last export date" queries. Enable RLS: `alter table public.datev_exports enable row level security;`. Add policy `datev_exports_tenant_select`: `for select to authenticated using (tenant_id = (select tenant_id from public.users where id = auth.uid()))` — the same `(select … from users where id = auth.uid())` shape as `20260415100000_tenant_settings.sql` policies. NO insert/update/delete policies — only Server Actions running as service-role-or-authenticated-with-RLS-bypass write here (the action uses the request-scoped client, so we DO need an INSERT policy: add `datev_exports_tenant_insert` `for insert to authenticated with check (tenant_id = (select tenant_id from public.users where id = auth.uid()) AND created_by = auth.uid())`). Add a smoke header comment block at the top following `20260504000000_datev_default_kreditorenkonto.sql` style (positive insert query, RLS rejection query, expiry sanity query). Forward-only — do not write a `down` migration. After `supabase db reset`, regenerate types via the same script Story 5.1 used so `packages/shared/src/types/database.ts` includes the new table. **DO NOT** touch `audit_logs` or `invoices` schemas — both already support what this story needs.

### Route Handler: `/api/export/datev/[exportId]`

12. **Given** the file `apps/web/app/api/export/datev/[exportId]/route.ts` does not yet exist **When** the story is implemented **Then** it exists, exports `async function GET(request, ctx)` (Next.js 16 App Router signature — `ctx: { params: Promise<{ exportId: string }> }`, `await ctx.params` to read), and follows the auth+tenant resolution from `apps/web/app/api/archive/export/route.ts:74-98` (returning `Response.json({ error: "Nicht authentifiziert." }, { status: 401 })` on auth failure — NOT redirect; route handlers do not throw redirects the way actions do). Validate `exportId` with `z.string().uuid({ message: "Ungültige Export-ID." })`; on parse failure return `Response.json({ error: "Ungültige Export-ID." }, { status: 400 })`.

13. **Given** the export row is fetched **When** the row is found, owned by the requesting tenant, and not expired **Then** the handler builds a filename via `datev-export-${tenantSlug}-${dateFrom}-${dateTo}.csv` where `tenantSlug` uses the same `toTenantSlug` helper that lives in `apps/web/app/api/archive/export/route.ts:38-44` (extract it into `apps/web/app/api/_helpers/filename.ts` AS PART of this story so both routes share it — keep the implementation byte-identical to avoid breaking the existing audit-export filename); `dateFrom`/`dateTo` are already `YYYYMMDD` per AC #11; the handler responds `200` with `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="<filename>"; filename*=UTF-8''<urlEncodedFilename>` (the `filename*` parameter is RFC 5987 — required when the filename contains non-ASCII; copy the exact pattern from `route.ts:303-307` adapted for csv — the existing audit route does NOT use `filename*` because it only emits ASCII-only slugs, but our DATEV filename uses the same slug, so plain `filename=` is sufficient — keep it simple, ASCII-only header). Body is `row.csv` encoded as `Uint8Array` via `new TextEncoder().encode(row.csv)`. `Content-Length` = `bytes.byteLength`.

14. **Given** the export row is missing or owned by a different tenant **When** the handler queries **Then** return `Response.json({ error: "Export nicht gefunden." }, { status: 404 })` (do not differentiate "doesn't exist" vs "wrong tenant" — same response prevents tenant-existence probing).

15. **Given** `row.expires_at < now()` **When** the handler checks **Then** return `Response.json({ error: "Dieser Export-Link ist abgelaufen. Bitte starte den Export erneut." }, { status: 410 })`. The dialog (AC #18) treats 410 by re-running `prepareDatevExport`.

16. **Given** the download succeeded **When** the handler completes **Then** the route DOES NOT mutate state (no `delete` of the row, no audit row) — the audit row was written by `prepareDatevExport` at the moment of preparation, which is when the actual booking transition occurred. The CSV download is just retrieval; re-downloading the same CSV within the 1-hour window must work (browsers retry; users tap "Herunterladen" twice). Repeat downloads do NOT generate new audit rows.

### UI: `<DatevExportDialog>` and `<ExportAction>` wiring

17. **Given** `apps/web/components/dashboard/export-action.tsx:13` already declares `onExport?: () => void` and the dashboard currently passes nothing (`apps/web/app/(app)/dashboard/page.tsx:299-302`) **When** the wiring is complete **Then** a new client component `apps/web/components/export/datev-export-dialog.tsx` is added; the dashboard page (still a Server Component) is refactored MINIMALLY: extract the `<ExportAction>` block plus the new `<DatevExportDialog>` into a small new client wrapper `apps/web/components/dashboard/export-action-with-dialog.tsx` that owns the `open` state — `dashboard/page.tsx` imports the wrapper and passes `readyCount`/`exportedThisMonthCount` props through unchanged (Server Component → Client wrapper boundary stays clean; do NOT make `dashboard/page.tsx` a client component). The wrapper's `useState` open flag is the only client state; clicking "DATEV Export" sets `open=true` (replacing the no-op `onExport`); the dialog is `<Dialog>` from `components/ui/dialog.tsx` (shadcn pattern; check if the project already has it — `grep -rn "from \"@/components/ui/dialog\"" apps/web/components/` will show usage; otherwise the existing `<Dialog>` from `archive/audit-export-confirm-dialog.tsx` shows the canonical pattern in this codebase).

18. **Given** the dialog is opened **When** the initial state renders **Then** the dialog shows: a heading `"DATEV-Export"`, a sub-line `"{readyCount} Rechnung{en} bereit für den Export"`, a German date-range picker with two `<Input>` fields labelled `"Von"` and `"Bis"` using the active-mask pattern from `apps/web/components/archive/archive-search-filters.tsx:170` (`inputMode="numeric"`, `placeholder="TT.MM.JJJJ"`, `maxLength={10}`, `applyGermanDateMask` on change, `parseGermanDate` to convert to ISO before calling the action — REQUIRED per `apps/web/AGENTS.md` "Date Input Convention"); default `dateFrom` is the first day of the current calendar month (`new Date(today.getFullYear(), today.getMonth(), 1)`), default `dateTo` is today; format defaults to `"DATEV EXTF"` (display-only, no select for v1); Berater-Nr / Mandanten-Nr are display-only readonly text (not editable from the dialog — the user goes to settings to change). Below the inputs: primary button `"Export erstellen"`, secondary button `"Abbrechen"`. NO toasts, NO modals nested inside (UX-DR12).

19. **Given** the user clicks `"Export erstellen"` **When** the action is invoked **Then** the dialog enters a 3-step German progress UI matching UX-DR14 verbatim: `"Wird validiert..."` → `"Wird formatiert..."` → `"Wird zusammengestellt..."`. Implement as a single `<div role="status" aria-live="polite">` whose text cycles via three sequential 200ms timeouts that resolve to the action's promise (the action is the actual work — the timeouts are purely UX scaffolding so the user sees progress on a fast machine; on a slow query they finish in real-time). Implement with `useTransition` so the form is disabled during pending. NFR4: the action must complete within 10s for up to 500 rows — log a `console.warn("[datev:export] slow", { ms })` if elapsed > 8s to flag pre-NFR drift. Concurrency safeguard: the primary button is `disabled` while pending — multiple clicks cannot submit twice.

20. **Given** the action returned `{ success: true, data: { missingSettings: true, missingFields } }` **When** the dialog renders **Then** the progress UI is replaced with the German prompt `"Für den DATEV-Export werden noch deine Berater- und Mandantennummer benötigt."` plus a `<Link>` to `/einstellungen` (use Next.js `<Link>`; the deep link `/einstellungen#datev` is best-effort — the settings page does not currently have an `id="datev"` anchor; add one in this story alongside the wiring) and a primary button `"Zu den Einstellungen"`. NO error styling — this is a happy-path branch.

21. **Given** the action returned `{ success: true, data: { exportId, rowCount, skippedCount, dateFrom, dateTo, missingSettings: false } }` AND `rowCount === 0` cannot happen here (the action returns `success:false` for that case per AC #5) **When** the dialog renders the success state **Then** it shows: a green check-circle (`lucide-react CheckCircle2`, `text-success`), a heading `"Export bereit"`, a summary line `"{rowCount} von {rowCount + skippedCount} Rechnung(en) exportiert"` (when `skippedCount > 0` add `"— {skippedCount} übersprungen"` — explanation: extract method validation could not parse the row); a primary button `"Herunterladen"` whose `onClick` triggers a hidden `<a href={\`/api/export/datev/${exportId}\`} download={`datev-export-${dateFrom}-${dateTo}.csv`} ref={anchorRef}>`'s `.click()` — this is the standard download trigger pattern in the codebase (no `window.location.assign` — that would lose the `download` attribute hint); a secondary button labelled `"Per E-Mail an Steuerberater senden"` that opens a `mailto:` URL: `` mailto:?subject=DATEV%20Export%20{Month%20Year}%20{tenantCompanyName}&body={germanIntroBody} `` — `Month Year` is the German month name from the dateFrom/dateTo midpoint, `germanIntroBody` is `Hallo,%0A%0Aanbei der DATEV-Buchungsstapel-Export für den Zeitraum {dateFromGerman} bis {dateToGerman}.%0A%0AViele Grüße` (URL-encoded). Note: `mailto:` cannot attach the file — the user attaches the just-downloaded file manually. A small `<p class="text-caption text-muted-foreground">` reads `"Hänge die heruntergeladene Datei in deinem E-Mail-Programm an."` to set the expectation.

22. **Given** the action returned `{ success: false, error }` **When** the dialog renders **Then** the progress UI is replaced with `<p class="text-destructive text-body-sm" role="alert">{error}</p>` and the primary button reverts to `"Export erstellen"` so the user can retry; no toast, no modal. The error string comes from the action verbatim — it is already in German and user-facing.

23. **Given** the user closes the dialog after a successful export **When** the dialog unmounts **Then** the dashboard re-renders with updated counts — call `router.refresh()` from the wrapper's `onOpenChange` close handler IFF a successful export occurred during the dialog's lifetime; this re-fetches the RSC server data so `<ExportAction>` shows the new `readyCount` (now 0 if all were exported) and `exportedThisMonthCount` (incremented). Without `router.refresh()` the count stays stale until the user navigates.

24. **Given** the dialog has a `mailto:` button **When** it is rendered **Then** the `mailto:` href is computed once per success state via a memoized helper (no inline IIFE in JSX); the helper lives in `apps/web/lib/datev-export.ts` (NEW file — also the natural home for a small `formatDateRangeGerman(dateFromIso, dateToIso): string` helper that renders `"01.05.2026 – 06.05.2026"` for the body) and has its own unit tests (4 cases: month-only range, cross-month range, full-year range, and proper URL-encoding of an umlaut tenant name like `"Müller GmbH"`).

### Tests

25. **Given** the action `prepareDatevExport` **When** tests run **Then** a new file `apps/web/app/actions/datev.test.ts` covers, using the EXACT mock chain pattern from `apps/web/app/actions/invoices.test.ts:1-95` (re-read it before writing — Supabase mock chains break in subtle ways): **(a)** happy path with 3 valid rows → success, `rowCount: 3`, `skippedCount: 0`, status update issued, `logAuditEvent` called once with `eventType: "export_datev"` and the exact `metadata` shape from AC #9, **(b)** missing settings (`datev_berater_nr` is null) → `{ success: true, data: { missingSettings: true, missingFields: ["datev_berater_nr"] } }`, NO invoice query, NO audit row, **(c)** zero ready invoices in range → `{ success: false, error: "Im gewählten Zeitraum gibt es keine freigegebenen Rechnungen für den Export." }`, NO datev_exports insert, NO audit row, **(d)** date range with `dateFrom > dateTo` → Zod failure with the German cross-field error, **(e)** auth failure → `redirect(...)` thrown (assert `await expect(...).rejects.toThrow(/NEXT_REDIRECT/)`), **(f)** concurrent skip — SQL select returns 5 rows, status update returns only 3 (two flipped to `exported` concurrently) → `rowCount: 3` in response, `console.warn` invoked, audit row contains the 3 actually-transitioned ids, **(g)** unknown DB error during `datev_exports` insert → action returns generic German error, `Sentry.captureException` called with `tags: { module: "datev", action: "prepare_export" }`, **(h)** `buildExtfV700` is invoked with `DatevTenantConfig.skrPlan = "SKR04"` when tenant has `skr_plan: "SKR04"` — verifies the SKR coercion. DO NOT boot `@rechnungsai/datev` for real in tests — `vi.mock("@rechnungsai/datev", () => ({ buildExtfV700: vi.fn(() => ({ csv: "BOM;...", rowCount: 3, skippedCount: 0, dateFrom: "20260501", dateTo: "20260506" })) }))`.

26. **Given** the route handler at `/api/export/datev/[exportId]` **When** tests run **Then** a new file `apps/web/app/api/export/datev/[exportId]/route.test.ts` covers, using the SAME mock pattern as `apps/web/app/api/archive/export/route.test.ts:1-95`: **(a)** valid request, fresh export → 200, `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="datev-export-..."`, body matches the stored `csv`, **(b)** invalid uuid → 400, **(c)** auth failure → 401, **(d)** export belongs to a different tenant → 404, **(e)** `expires_at < now()` → 410 with the German message, **(f)** Supabase error during select → 500 with `Sentry.captureException` invoked. ASSERT no `audit_logs` insert occurs in any case (the route MUST NOT log — that's the action's job per AC #16).

27. **Given** the dialog component **When** tests run **Then** `apps/web/components/export/datev-export-dialog.test.tsx` covers: **(a)** opens on `open={true}`, shows readyCount-aware sub-line, **(b)** date masking — typing `"01052026"` in the "Von" field renders `"01.05.2026"` (active-mask integration test — same pattern as `apps/web/components/archive/archive-search-filters.test.tsx`), **(c)** primary button disabled when either date is incomplete (`parseGermanDate` returns null), **(d)** missing-settings branch renders the German prompt and the link to `/einstellungen`, **(e)** success branch renders the download anchor with the correct `href` and `download` attribute, **(f)** error branch renders the destructive paragraph with `role="alert"`, **(g)** mailto button href is encoded correctly for a tenant whose name contains an umlaut. Use `@testing-library/react` + `vi.mock` for the action — match the existing `dashboard-keyboard-shortcuts.test.tsx` pattern for client-component tests.

28. **Given** the helper `formatDateRangeGerman` and the mailto-builder in `lib/datev-export.ts` **When** tests run **Then** `apps/web/lib/datev-export.test.ts` exists with the 4 cases from AC #24 — pure unit tests, no React.

29. **Given** the migration **When** `supabase db reset` runs **Then** the new `datev_exports` table appears (`\d public.datev_exports` lists all columns), the RLS policies are present (`select * from pg_policies where tablename = 'datev_exports'` returns the two policies), an authenticated user with tenant A cannot select tenant B's rows (manual psql verification — paste output in Completion Notes following Story 5.1 format), `pnpm --filter @rechnungsai/shared types:generate` (or whatever the actual script is — check `packages/shared/package.json`) regenerates `database.ts` with the new table.

### Verification

30. **Given** the full story is complete **When** verification runs **Then** `pnpm check-types` from repo root → 0 errors; `pnpm lint` from repo root → 0 errors (pre-existing warnings OK — see Story 5.2 baseline of 16 warnings); `pnpm --filter @rechnungsai/datev build` succeeds (it is a peer dep of `apps/web`); `pnpm --filter web test` passes including new tests; `pnpm --filter @rechnungsai/shared test` passes (no changes there but check); a manual end-to-end smoke confirms: open dashboard → click "DATEV Export" → set date range → click "Export erstellen" → download the file → open it in a text editor and confirm BOM (`hexdump -C file.csv | head -1` shows `ef bb bf`) + CRLF line endings + the previously-`ready` invoices now show as `exported` in the dashboard. Smoke test format per `_bmad-output/implementation-artifacts/smoke-test-format-guide.md` — Tier 1 UX + Tier 2 DB + filesystem (a new tier — describe inline). Mark `BLOCKED-BY-ENVIRONMENT` for any row the dev agent cannot run (real browser flows).

## Tasks / Subtasks

- [ ] **Task 1: Migration + types** (AC: 11, 29)
  - [ ] Create `supabase/migrations/20260506000000_datev_exports.sql` mirroring the structure of `20260504000000_datev_default_kreditorenkonto.sql` (smoke header comment block, `create table`, `create index`, `enable rls`, two policies)
  - [ ] Run `supabase db reset` locally — confirm migration applies cleanly
  - [ ] Regenerate `packages/shared/src/types/database.ts` (same script Story 5.1 used)
  - [ ] Manual psql verification of the three smoke queries (positive insert, RLS rejection, expiry sanity) — paste results into Completion Notes
- [ ] **Task 2: Server Action** (AC: 1–10, 25)
  - [ ] Create `apps/web/app/actions/datev.ts` with `prepareDatevExport` and the Zod input schema
  - [ ] Mirror auth/tenant resolution from `approval.ts:39-58` verbatim
  - [ ] Tenant settings check → `missingSettings` branch
  - [ ] Invoice fetch with `LIMIT 500`, ordered by `invoice_date_value, id`
  - [ ] Map to `DatevTenantConfig` / `DatevBookingRow[]`, call `buildExtfV700`
  - [ ] Insert `datev_exports` row with 1-hour TTL
  - [ ] Atomic status transition `ready → exported` with `.eq("status","ready")` guard, capture actually-updated ids
  - [ ] Single `logAuditEvent` call with `event_type: "export_datev"` and the metadata from AC #9
  - [ ] Catch block matching `approval.ts:129-143` pattern
  - [ ] Create `apps/web/app/actions/datev.test.ts` with 8 cases from AC #25
- [ ] **Task 3: Route Handler** (AC: 12–16, 26)
  - [ ] Create `apps/web/app/api/_helpers/filename.ts` extracting `toTenantSlug` from the existing audit route (UPDATE `apps/web/app/api/archive/export/route.ts` to import from the shared helper — single-line diff)
  - [ ] Create `apps/web/app/api/export/datev/[exportId]/route.ts` with `GET`
  - [ ] Auth + tenant resolution (route-handler style: 401 not redirect)
  - [ ] Zod-validate `exportId` UUID
  - [ ] Fetch `datev_exports` row with tenant scoping (RLS + explicit `.eq("tenant_id", tenantId)` defense-in-depth)
  - [ ] Expiry check → 410
  - [ ] Build `Content-Disposition` filename from tenantSlug + dateFrom/dateTo
  - [ ] Return `text/csv` body
  - [ ] Create `apps/web/app/api/export/datev/[exportId]/route.test.ts` with 6 cases from AC #26
- [ ] **Task 4: Helpers + lib** (AC: 24, 28)
  - [ ] Create `apps/web/lib/datev-export.ts` with `formatDateRangeGerman` and `buildSteuerberaterMailto`
  - [ ] Create `apps/web/lib/datev-export.test.ts` with 4 cases from AC #24
- [ ] **Task 5: Dialog component** (AC: 17–22, 27)
  - [ ] Create `apps/web/components/export/datev-export-dialog.tsx` (client component)
  - [ ] German date-range picker using `applyGermanDateMask` / `parseGermanDate` / `isoToGermanDateInput` (per `apps/web/AGENTS.md`)
  - [ ] 3-step progress UI with `useTransition`
  - [ ] Missing-settings, success, and error branches with the exact German strings from ACs #20–#22
  - [ ] `mailto:` helper button using `lib/datev-export.ts`
  - [ ] Hidden anchor for download trigger
  - [ ] Add `id="datev"` anchor target on the settings page (`apps/web/app/(app)/einstellungen/page.tsx`) — single-line addition for the deep link from the missing-settings branch
  - [ ] Create `apps/web/components/export/datev-export-dialog.test.tsx` with 7 cases from AC #27
- [ ] **Task 6: Dashboard wiring** (AC: 17, 23)
  - [ ] Create `apps/web/components/dashboard/export-action-with-dialog.tsx` (client wrapper) — owns `open` state, calls `router.refresh()` on close-after-success
  - [ ] Update `apps/web/app/(app)/dashboard/page.tsx` to import the wrapper and replace the bare `<ExportAction>` (single block change, lines ~299-302)
  - [ ] Verify `apps/web/app/(app)/dashboard/page.test.tsx` (mocks `<ExportAction>` to null) still passes — extend the mock if the wrapper is now the imported symbol
- [ ] **Task 7: Build + lint + type-check** (AC: 30)
  - [ ] `pnpm --filter @rechnungsai/datev build` → 0 errors (required before web app picks up the type changes)
  - [ ] `pnpm check-types` from repo root → 0 errors
  - [ ] `pnpm lint` from repo root → 0 errors (Story 5.2 baseline of 16 pre-existing warnings remains acceptable)
  - [ ] `pnpm --filter web test` → all green
- [ ] **Task 8: Smoke test** (AC: 30; format per `smoke-test-format-guide.md`)
  - [ ] Fill in smoke test table in Completion Notes — Tier 1 UX (dialog flow), Tier 2 DB (datev_exports row, invoice status flips, audit row), Filesystem tier (BOM + CRLF byte-level check)
  - [ ] Mark rows `BLOCKED-BY-ENVIRONMENT` if the dev agent cannot run a real browser; provide manual steps for GOZE following Story 5.1's pattern
- [ ] **Task 9: Defer email handoff** (Scope reduction note)
  - [ ] Append a deferred-work entry to `_bmad-output/implementation-artifacts/deferred-work.md` under a new `## Deferred from: Story 5.3 (2026-05-06)` heading, briefly describing the scope reduction (no `@rechnungsai/email` infra, no `tenants.steuerberater_email` column) and pointing forward to Epic 8 / Story 8.3 as the home for proper email send

## Dev Notes

### Existing Code Map (read these BEFORE writing any code)

| Concern | File | What's already there |
|---|---|---|
| Server Action auth+tenant pattern | `apps/web/app/actions/invoices/approval.ts:39-58` | The canonical 18-line auth+user-row+tenantId block. Copy verbatim into `datev.ts`. |
| Server Action catch pattern | `apps/web/app/actions/invoices/approval.ts:129-143` | NEXT_REDIRECT detection + Sentry + generic German error. Copy verbatim. |
| Atomic status transition | `apps/web/app/actions/invoices/approval.ts:85-112` | `.update({...}).eq("status", "ready").select("id, status").maybeSingle()` — concurrency guard via the `.eq("status", ...)` predicate. |
| Audit log helper | `apps/web/app/actions/invoices/shared.ts:19-53` | `logAuditEvent(supabase, params)`. Already supports `eventType: "export_datev"`. Do NOT modify the helper. |
| Action test mock chain | `apps/web/app/actions/invoices.test.ts:1-95` | Re-read before writing `datev.test.ts`. The chained `.from(...).update(...).eq(...).select(...).maybeSingle()` pattern needs `vi.fn()` returning `this` (or the chain object) from each step. |
| Route handler auth pattern | `apps/web/app/api/archive/export/route.ts:74-98` | Auth + tenant resolution returning JSON 401 (not redirect). Copy. |
| Route handler test pattern | `apps/web/app/api/archive/export/route.test.ts:1-95` | Mock chain for route handlers — different shape from action tests. Copy. |
| `toTenantSlug` helper | `apps/web/app/api/archive/export/route.ts:38-44` | Extract to `apps/web/app/api/_helpers/filename.ts` and re-import from both routes. Byte-identical implementation. |
| German date input convention | `apps/web/components/archive/archive-search-filters.tsx:170` + `apps/web/lib/format.ts:64,102,121` | Active-mask pattern using `applyGermanDateMask`/`parseGermanDate`/`isoToGermanDateInput`. **Required by `apps/web/AGENTS.md` — native `<input type="date">` is forbidden.** |
| Dialog component pattern | `apps/web/components/archive/audit-export-confirm-dialog.tsx` (if it exists; otherwise grep `from "@/components/ui/dialog"` for a real example) | shadcn `<Dialog>` open/close + close-on-overlay-click + accessible labels. |
| ExportAction CTA | `apps/web/components/dashboard/export-action.tsx:13,47` | `onExport?: () => void` prop is currently no-op — wire the new dialog to it via the wrapper. |
| Dashboard page integration point | `apps/web/app/(app)/dashboard/page.tsx:299-302` | The single `<ExportAction>` JSX block to replace. |
| `buildExtfV700` (Story 5.2 output) | `packages/datev/src/formats/extf-v700.ts` (built to `dist/`) | Pure function; takes `DatevTenantConfig` + `DatevBookingRow[]`. Imports from `@rechnungsai/datev`. |
| DB types — datev_* columns | `packages/shared/src/types/database.ts:286-330` | All 4 tenant DATEV columns + `datev_default_kreditorenkonto` from Story 5.1. |
| Status enum | `supabase/migrations/20260417100000_invoices_table.sql:21-26` + `packages/shared/src/types/database.ts:424` | `'exported'` is already in the enum. No new enum value needed. |
| Audit event type allow-list | `supabase/migrations/20260501000000_archive_search_and_export.sql:26` | `'export_datev'` is already permitted. The migration comment says "Story 5.x wires the callsite." — this is the callsite. |
| Generated `invoice_date_value` column | `supabase/migrations/20260501000001_fix_invoice_date_generated_column.sql` | Safe-cast from `invoice_data->>'invoice_date'`. Use this column for `gte`/`lte`, NOT the JSONB path. |
| Generated `gross_total_value` column | `supabase/migrations/20260423000000_invoice_sort_columns.sql` (or the safer 20260424100000 version) | Numeric-cast from JSONB. Use this column. |

### Why a Two-Step Prepare → Download Flow

The audit ZIP export (Story 4.3) does it all in one route — POST a body, get back the ZIP. We split here for two UX reasons:

1. The dialog needs to display `rowCount` and `skippedCount` BEFORE the user commits to a download, so they can decide whether to broaden the date range or fix skipped invoices first. A single-step download would surface those counts only AFTER a commit.
2. Status transitions (`ready → exported`) must happen at the moment of preparation (so concurrent reviews see the new state), not at download time. The user might never click Download, but the audit row already records the export. This matches DATEV-domain expectation that "export was generated and committed" is the audited event, not "file was retrieved by user."

The 1-hour TTL on `datev_exports` rows balances "user can re-download for a while" with "stale data does not pile up." A daily cron to delete expired rows is NOT in this story — accumulation in 1 hour windows for a single tenant is bounded by the rate at which a human can run exports (~1/min worst case → 60 rows/hour/tenant; storage cost is negligible). Add a cleanup cron in Epic 8 if needed.

### Why `text` Not `bytea` for the CSV Column

`buildExtfV700` returns a UTF-8 string with BOM — already a string, not a byte buffer. Storing as `text` keeps the round-trip simple (`row.csv` is a string in the route handler, encode once with `TextEncoder` for the response body). `bytea` would force base64 round-tripping on every read with no functional benefit; the BOM byte sequence (`EF BB BF`) is preserved as-is in `text` because Postgres treats text as opaque bytes for non-ASCII content (UTF-8 storage). Verified: `packages/gobd` GoBD audit ZIP also keeps the assembled string in memory rather than persisting it — different lifetime model (GoBD ZIP is one-shot in-route; we persist for the prepare/download split).

### Why a New Table Instead of a Storage Bucket

The audit ZIP route streams bytes from `supabase.storage.from("invoices")` only because the source bytes already live in storage. A DATEV CSV is generated at export time — there is nothing to stream from. Putting it in storage would mean uploading a generated string to a bucket and then immediately downloading it once. A short-lived row in Postgres with RLS gives us the same security properties with one fewer round-trip and no orphan-cleanup machinery (just `expires_at` filter on read).

### `mailto:` Handoff — Why It Is OK to Ship As-Is

The epic line "Or they can email the CSV to their Steuerberater" reads as "send via app." We are explicitly punting that to Epic 8. The `mailto:` link is a thin shim:

- It is not a fake button — clicking it really does open the user's mail client with subject + body pre-filled.
- It cannot attach files (`mailto:` per RFC 6068 has no attachment parameter that any major mail client honours), so the helper text under the button explicitly tells the user to attach the just-downloaded file. This is honest UX, not a polished feature.
- When Epic 8 ships proper email send, the dialog adds a third button ("Direkt senden") next to it; the `mailto:` shim either stays (as a "use my own client" alternative) or is removed.

### `<DatevExportDialog>` State Machine

```
idle ─[click "Export erstellen"]→ pending
pending ─[action returns missingSettings]→ missing-settings
pending ─[action returns success+rowCount>0]→ success
pending ─[action returns success:false]→ error
error ─[click "Export erstellen"]→ pending
missing-settings is terminal (user navigates away to /einstellungen)
success ─[click "Herunterladen"]→ success (re-downloadable until TTL expires; no state change)
success ─[dialog closed]→ unmounts, parent calls router.refresh()
```

Implementation: a single `useReducer` keyed on a discriminated union (`{type:"idle"} | {type:"pending"} | {type:"missing-settings", missingFields} | {type:"success", payload} | {type:"error", message}`) is cleaner than four `useState` flags. Total state size is small enough that `useState<DialogState>(initialState)` with manual setState calls is also acceptable — pick whichever you (the dev agent) find easier to test; do NOT over-engineer.

### Critical Anti-Patterns to Avoid (LLM Failure Modes)

1. **DO NOT** add an email send. No Resend dep, no SES, no nodemailer. The `mailto:` shim is the entire user-facing email surface in this story. Epic 8 owns real email.
2. **DO NOT** add a `steuerberater_email` column to `tenants`. That column belongs to the email story.
3. **DO NOT** convert `dashboard/page.tsx` to a client component. The wrapper component (`export-action-with-dialog.tsx`) is the client boundary. Page stays RSC.
4. **DO NOT** use `<input type="date">` anywhere. `apps/web/AGENTS.md` is explicit. Use the active-mask pattern.
5. **DO NOT** call `router.refresh()` on every dialog close — only on close-after-successful-export. Refreshing on cancel/error wastes a server roundtrip and may overwrite optimistic counts.
6. **DO NOT** write the audit row from the route handler. The action wrote it at preparation time. Repeat downloads = no new audit rows (AC #16).
7. **DO NOT** use `eventType` strings other than `"export_datev"` in the audit insert. The constraint allow-list will reject anything else with code `23514`. Don't borrow `"export_audit"` from the GoBD route — that has a different domain meaning.
8. **DO NOT** use `module: "gobd"` in Sentry tags for DATEV code. Use `module: "datev"`. Different domain, different on-call query.
9. **DO NOT** persist the CSV in `supabase.storage`. Use the `datev_exports` Postgres row.
10. **DO NOT** delete the `datev_exports` row in the route handler after download. Cleanup is a future concern; deletion would break re-download (browser retries, double-clicks).
11. **DO NOT** add `bu_schluessel` mapping logic in the action — the column already holds the mapped value (Story 5.2 anti-pattern carries forward).
12. **DO NOT** drop the `LIMIT 500` cap. NFR4 says the export must complete within 10s for up to 500 rows. Above that, the dialog should instruct the user to narrow the range — explicit limit + UX is better than slow-and-silent.
13. **DO NOT** silently skip rows with null `gross_total_value` or `invoice_date_value` — increment `skippedCount` AND surface the count to the user in the success state. The user might want to fix those rows and re-export.
14. **DO NOT** put the action's CSV-building logic in the route handler. The route is a thin retrieval layer. Mixing them defeats the prepare/download split.
15. **DO NOT** mark smoke-test rows `DONE` if you cannot actually run a real browser. `BLOCKED-BY-ENVIRONMENT` + manual steps for GOZE — same as Story 5.1.
16. **DO NOT** forget to extend `apps/web/app/(app)/dashboard/page.test.tsx`'s `<ExportAction>` mock when the dashboard imports the wrapper instead. The test currently mocks `ExportAction` to `null`; the new symbol is `ExportActionWithDialog` (or whatever you name it) — keep them aligned or the test breaks unrelatedly.
17. **DO NOT** introduce a generated server timestamp (e.g. `formatErzeugtAm`) that diverges from CET — the spike note about UTC drift (`5-2-...md` review defer) carries forward; current behaviour uses local server time and that is acceptable for v1. Do not "fix" it here; the deferred item is logged.

### Previous Story Intelligence

Carrying forward from `5-2-datev-buchungsstapel-csv-generation.md`:

- **`@rechnungsai/datev` is now a buildable ESM package.** Run `pnpm --filter @rechnungsai/datev build` if you see `Cannot find module '@rechnungsai/datev'` in TS or in tests — `dist/` may be stale.
- **`escapeField` got patched mid-review** to NOT quote on commas (DATEV semicolon-delimited format rejects quoted decimal numbers). This is fixed in 5.2; just be aware that the CSV bytes the action persists already account for this.
- **`formatBelegdatum` is `DDMM`, not `MMDD`.** If you find yourself debugging a "wrong date in DATEV" issue while building tests, double-check this — don't try to "fix" it.
- **No new runtime dependencies.** Stay within the existing dep graph: `@rechnungsai/shared`, `@rechnungsai/datev`, `@sentry/nextjs`, `lucide-react`, Supabase client, Next.js. No `nodemailer`, no `iconv-lite`, no `date-fns` (the project uses native `Intl.DateTimeFormat` and the `format.ts` helpers).

Carrying forward from `5-1-datev-settings-configuration.md`:

- **Settings page deep link target.** The link from the missing-settings dialog branch goes to `/einstellungen`. Add `id="datev"` to the "DATEV-Konfiguration" heading inside `tenant-settings-form.tsx` so `/einstellungen#datev` scrolls there. Single-line change.
- **Sentry tag convention.** `tags: { module: "datev", action: "prepare_export" }` for the action; `tags: { module: "datev", action: "download_export" }` for the route handler.
- **No emojis in JSX.** Use `lucide-react` icons. `CheckCircle2`, `AlertTriangle`, `Download` are the three needed for this story.
- **Form `reset` after save discipline** — irrelevant here (no React Hook Form `form.reset` outside of the existing settings form), but the underlying lesson "every state branch must be explicitly handled" applies to the dialog's state machine.

### Git Intelligence (last 5 commits — patterns to match)

```
af2fac9 done story 5-2
45ded29 story 5-2 in review
57274f1 story 5-2 ready-for-dev
561f006 fix: positionen table edit overflow
e036eb8 fix: onboarding steuerberater null validation
```

Patterns:
- Commit cadence: `ready-for-dev` → `in review` → `done` (three commits per story is normal; review patches absorbed in the `in review` commit).
- Concise lowercase descriptions, no Conventional Commit prefixes except for `fix:` / `refactor:`.
- The two `fix:` commits before story 5-2 are unrelated UX fixes; not relevant to this story's implementation but useful as a reminder that pre-existing bugs (e.g. positionen overflow) live in their own commits, not in story scope.

### Latest Tech Information

- **Next.js 16 App Router** — `apps/web/AGENTS.md` says "This is NOT the Next.js you know" and warns about reading `node_modules/next/dist/docs/` before writing. For route handlers in 16: `params` is async (`ctx.params: Promise<{ exportId: string }>`); `await ctx.params` to read. Do NOT use the Next.js 14 sync params signature.
- **shadcn `<Dialog>`** — uses Radix UI under the hood. The accessible label pattern is `<DialogTitle>` + `<DialogDescription>`; do not omit either.
- **Zod v4** — `prep-td1-zod-v4-repo-wide-upgrade.md` was completed in Epic 4 prep. Use Zod v4 idioms in the new schema (e.g. `z.string().regex(..., { message: "..." })`, `z.string().uuid({ message: "..." })`). Match the style in `packages/shared/src/schemas/tenant-settings.ts`.
- **Supabase client** — `createServerClient` is the request-scoped client (`apps/web/lib/supabase/server.ts`). All RLS policies apply automatically. The action and route handler use this client; we do NOT need a service-role client.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 5.3`] — Original ACs and BDD scenarios (the email-send line is descoped per this story's rationale block)
- [Source: `_bmad-output/implementation-artifacts/spike-p1-datev-format-2026-05-04.md`] — DATEV format spec; relevant here only for the WJ-Beginn / Belegdatum review (already implemented in 5.2)
- [Source: `_bmad-output/implementation-artifacts/5-2-datev-buchungsstapel-csv-generation.md`] — `buildExtfV700` API surface, `DatevTenantConfig` / `DatevBookingRow` shapes, anti-patterns
- [Source: `_bmad-output/implementation-artifacts/5-1-datev-settings-configuration.md`] — Settings UI integration, lucide icons, design tokens, Sentry tags
- [Source: `_bmad-output/implementation-artifacts/4-3-archive-search-and-audit-export.md`] — Server-Component / Client-Component split rationale, archive route handler patterns
- [Source: `_bmad-output/implementation-artifacts/smoke-test-format-guide.md`] — Tier 1/Tier 2 smoke test format (extend with a Filesystem tier for the BOM check)
- [Source: `apps/web/AGENTS.md`] — German date input convention; native date inputs forbidden
- [Source: `apps/web/app/api/archive/export/route.ts`] — Route handler structure, `toTenantSlug`, auth/tenant resolution
- [Source: `apps/web/app/api/archive/export/route.test.ts`] — Route handler test mock chain
- [Source: `apps/web/app/actions/invoices/approval.ts`] — Server Action structure, atomic status update
- [Source: `apps/web/app/actions/invoices.test.ts`] — Server Action test mock chain
- [Source: `apps/web/app/actions/invoices/shared.ts`] — `logAuditEvent`, `AuditEventType`, `InvoiceStatus`
- [Source: `apps/web/components/archive/archive-search-filters.tsx`] — Active-mask date input reference
- [Source: `apps/web/lib/format.ts`] — `applyGermanDateMask`, `parseGermanDate`, `isoToGermanDateInput`
- [Source: `apps/web/components/dashboard/export-action.tsx`] — `<ExportAction>` and its `onExport` prop
- [Source: `supabase/migrations/20260417100000_invoices_table.sql`] — Invoice status enum (`'exported'` already present)
- [Source: `supabase/migrations/20260430000000_audit_logs.sql`] — Audit log table + initial event constraint
- [Source: `supabase/migrations/20260501000000_archive_search_and_export.sql`] — Extended audit constraint (`'export_datev'` permitted)
- [Source: `supabase/migrations/20260504000000_datev_default_kreditorenkonto.sql`] — Migration template to mirror (smoke header comment block, RLS pattern)
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md`] — Append the email-handoff deferral here under a new heading

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

### Review Findings

### Change Log
