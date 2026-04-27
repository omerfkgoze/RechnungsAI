# Story 3.5: Compliance Warnings and Weekly Value Summary

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to be warned about invoices with missing or invalid data and see how much time and money I am saving,
So that I can fix compliance issues before export and feel confident about the value the system provides.

---

## Technical Concerns (≤3, per Epic 1 retro Action #2)

1. **Compliance check engine + per-invoice warning surface (FR46, UX-DR17 amber pattern)** — A NEW pure helper `runComplianceChecks(invoice: Invoice): ComplianceWarning[]` lives at `packages/shared/src/compliance/invoice-compliance.ts` (new sub-folder; export through `packages/shared/src/index.ts`). Each check is a small named function returning `null` or `{ id, severity: 'amber' | 'red', field: string, code: ComplianceCode, message: string }`. Codes: `missing_ust_id`, `invalid_invoice_date`, `missing_invoice_number`, `missing_supplier_name`, `missing_gross_total`, `vat_total_mismatch` (|net + vat − gross| > 0.02 EUR tolerance, only when all three present and currency is EUR). Messages are conversational German (specific + actionable per UX-DR17 — see "Compliance Messages" in Dev Notes for the verbatim strings). The helper is **synchronous, deterministic, and side-effect-free** so it can run on the server in `<InvoiceDetailPane />` (RSC) and in the dashboard list aggregation without any DB query. A NEW client component `<ComplianceWarningsBanner warnings={...} />` at `apps/web/components/invoice/compliance-warnings-banner.tsx` renders an amber inline banner (NOT a toast, NOT a modal — UX-DR12, UX-DR17 "Preventive warning") at the top of the detail pane scroll area when `warnings.length > 0`. The banner is **persistent until resolved** — no dismiss button, recomputes on every render. Each warning row has the message and a tertiary button `Zum Feld springen` that focuses the corresponding `<EditableField />` via the existing `id={\`field-${path}\`}` anchor (Story 3.2 pattern). Warnings never block other actions: `[Freigeben]`/`[Flaggen]`/swipe still work and the banner does NOT prevent approval per the AC ("warnings never block the entire workflow").

2. **Weekly Value Summary card replacing the dashboard placeholder (FR33, UX-DR19)** — A NEW Server Component `<WeeklyValueSummary />` at `apps/web/components/dashboard/weekly-value-summary.tsx` replaces the placeholder `"Deine Woche auf einen Blick"` Card currently rendered in `apps/web/app/(app)/dashboard/page.tsx:347–356` (right rail when no invoice selected). It accepts `{ tenantId }` and runs **one** Postgres RPC `tenant_weekly_value_summary()` (NEW SECURITY DEFINER function, `security definer`, `set search_path = public, pg_temp`, `my_tenant_id()` guard — same pattern as `invoice_processing_stats` in `20260423100000_dashboard_aggregations_hardening.sql`). Returns `{ week_invoices bigint, week_time_saved_minutes integer, week_vat_total numeric, month_exported_count bigint, month_vat_total numeric }`. Week boundary = Monday 00:00 UTC → next Monday 00:00 UTC (ISO weeks; `date_trunc('week', now())` because Postgres treats Monday as the first day). Month boundary = `date_trunc('month', now())`. `week_invoices` counts rows where `created_at` falls in the current week AND `status` ∈ `('ready','review','exported')` (i.e., reached extraction; `captured`/`processing` excluded so the card never shows still-being-processed counts). `week_time_saved_minutes = week_invoices * 12` (per UX-DR5 reference + Story 3.4 SessionSummary calibration). `week_vat_total` = `SUM((invoice_data->'vat_total'->>'value')::numeric)` over the same week, regex-guarded `'^[0-9]+(\.[0-9]+)?$'` like the safe-cast migration (`20260424100000`); only `ready`/`exported` rows (approved-or-final). `month_vat_total` = same but month-scoped + `status='exported'`. Numbers render with **tabular-nums** and German locale: `new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })` → "EUR 1.234,56". Time saved renders as `"~2h 30min"` when ≥60 min, `"~25 min"` otherwise. Empty/zero state: when `week_invoices === 0`, fall back to the existing placeholder message — the card still renders but says `"Diese Woche noch keine Rechnungen erfasst."`. Render position: same slot as the current placeholder Card (`apps/web/app/(app)/dashboard/page.tsx:347–356`); replaces it 1:1.

3. **Keyboard shortcuts: arrow nav + A/E + ? (UX-DR20, FR33 close)** — A NEW client component `<DashboardKeyboardShortcuts />` at `apps/web/components/dashboard/dashboard-keyboard-shortcuts.tsx` mounted as a sibling of `<DashboardRealtimeRefresher />` in `apps/web/app/(app)/dashboard/page.tsx`. Behavior: **desktop only** (`window.matchMedia("(min-width: 1024px)").matches` — same gate as `KeyboardShortcutsHelp`); ignores when focus is on `<input>`, `<textarea>`, `<select>`, or `[contenteditable=true]` (mirror `keyboard-shortcuts-help.tsx`); ignores `e.isComposing || e.keyCode === 229`; ignores when modifier keys (Ctrl/Cmd/Alt) held. Bindings: **ArrowDown** moves the dashboard "selected" cursor forward through the visible list (the `data-invoice-id` attribute on each `<InvoiceListCardLink>` — adds the attribute now); **ArrowUp** moves backward; **Enter** opens the currently-cursor-selected invoice via `router.push(\`?selected=${id}\`, { scroll: false })` (existing split-view pattern from 3-1); **A** approves the currently-selected detail-pane invoice via `approveInvoice` (re-uses `<InvoiceActionsHeader>`'s flow but at dashboard scope — see "Why a separate hook" in Dev Notes); **E** scrolls to / focuses `<ExportAction />` and clicks it if `readyCount >= 1` (`document.querySelector('[data-export-cta]')?.click()`); **?** is already bound by `<KeyboardShortcutsHelp>` (Story 1.5) — this story EXTENDS the help table content there: add 5 NEW rows (`↑/↓ Liste navigieren`, `Enter Detail öffnen`, `A Freigeben`, `E DATEV-Export`, all marked `bound: true`). The cursor state lives in component state (no URL persistence — purely visual focus ring `ring-2 ring-primary` toggled via `data-keyboard-selected`); first ArrowDown after mount selects the first row. `prefers-reduced-motion: reduce` does not affect keyboard nav — only animations are gated. Visual focus indicator: 2px solid `var(--primary)` + 2px offset on the active row (matches AC verbiage and existing `focus-visible:ring-2 focus-visible:ring-ring` Tailwind utility — apply via `ring-2 ring-offset-2 ring-primary` on `data-keyboard-selected` rows).

**Deferred to Story 4.2:** Audit log entry per warning resolution (today the warning auto-clears when the underlying field changes — no event log).
**Deferred to Story 6.1:** EN 16931 validation engine; this story's compliance checks are the lightweight subset (UST-ID, date, gross/VAT consistency) — full EN 16931 BR-* rules are Epic 6.
**Deferred to Story 8.3:** Persistent multi-week streak counter on the weekly summary; this story shows current week only.
**Deferred to Story 8.3 / FR45:** Email weekly recap (cron job at `app/api/cron/weekly-recap/route.ts`); this story is the in-app card only.
**Deferred (out of scope):** Dashboard list-row arrow navigation persisting across `router.refresh()` — keyboard cursor resets after a realtime refresh; revisit if QA reports.

---

## Acceptance Criteria

1. **Given** the user opens an invoice detail pane (split-view on dashboard or `/rechnungen/[id]`) for a `ready` or `review` invoice with missing or invalid required data
   **When** the pane renders
   **Then** the NEW `<ComplianceWarningsBanner>` appears as the first scroll-area child below the header — amber background (`bg-warning/10`), 1px amber border (`border-warning/40`), `role="status"`, `aria-live="polite"`, ⚠ icon (`<AlertTriangle>` from lucide-react if already a dep, else inline SVG)
   **And** the banner lists one row per detected warning with verbatim German message text matching the "Compliance Messages" table in Dev Notes (e.g., `"Die USt-IdNr fehlt auf dieser Rechnung. Bitte ergänzen oder den Lieferanten kontaktieren."`)
   **And** the banner is persistent: no dismiss button, no auto-hide; recomputes from `runComplianceChecks(invoice)` on every render of the pane

2. **Given** an invoice with no compliance issues
   **When** the detail pane renders
   **Then** `runComplianceChecks(invoice)` returns `[]`
   **And** the banner does NOT render (no empty amber chrome, no whitespace)

3. **Given** the compliance check runs against `invoice_data` JSON
   **When** these fields are evaluated
   **Then** the following warning codes fire, exactly once each, with the listed precondition (FR46):
   - `missing_ust_id` — `supplier_tax_id.value` is null OR empty string OR fails the regex `^DE\d{9}$` (German USt-IdNr format only — non-DE suppliers do not produce this warning; null country defaults to DE-strict because all current users are German entities)
   - `invalid_invoice_date` — `invoice_date.value` is null (the schema's `isoDateField` already nulls non-ISO strings) OR is more than 18 months old OR is in the future (>1 day past today UTC)
   - `missing_invoice_number` — `invoice_number.value` is null or empty string
   - `missing_supplier_name` — `supplier_name.value` is null or empty string
   - `missing_gross_total` — `gross_total.value` is null
   - `vat_total_mismatch` — all three of `net_total.value`, `vat_total.value`, `gross_total.value` are non-null AND `currency.value` is null/`'EUR'` AND `Math.abs(net + vat - gross) > 0.02` (2 cent tolerance for AI rounding)
   **And** unit tests in `packages/shared/src/compliance/invoice-compliance.test.ts` cover one positive and one negative case per code (≥12 cases)

4. **Given** the compliance banner is visible
   **When** the user clicks `Zum Feld springen` on a warning row
   **Then** the page scrolls to and focuses the matching `<EditableField>` via `document.getElementById(\`field-${path}\`)?.scrollIntoView({ block: 'center' })` followed by `.focus({ preventScroll: true })` on the field's primary input
   **And** if the warning's `field` does not map to a visible `<EditableField>` (e.g., compound `vat_total_mismatch` warning maps to `gross_total`), the closest editable field is focused

5. **Given** an invoice has compliance warnings
   **When** the user attempts to approve via swipe-right OR `[Freigeben]` button OR keyboard `A`
   **Then** the action proceeds normally — `approveInvoice` is called, status flips `review → ready`, the green toast `"Rechnung freigegeben."` appears
   **And** the warning banner remains visible after the approve (still amber, still listing the same warnings) — warnings never block approval, they live alongside it
   **And** corresponding test in `apps/web/components/invoice/invoice-detail-pane.test.tsx` (MODIFY) confirms approve still works on a warning-laden invoice

6. **Given** the user is on the desktop dashboard (lg+) at `/dashboard` with `selected` query unset
   **When** the right column renders
   **Then** the existing placeholder card `"Deine Woche auf einen Blick"` is REPLACED by the NEW `<WeeklyValueSummary tenantId={tenantId} />` Server Component
   **And** the card shows three lines for the current week (Monday 00:00 UTC → next Monday): `Rechnungen diese Woche: <N>`, `Geschätzte Zeitersparnis: ~<X>h <Y>min` (or `~<N> min` for <60), `MwSt.-Vorsteuer diese Woche: EUR 1.234,56`
   **And** all numbers use `tabular-nums` Tailwind utility (`font-variant-numeric: tabular-nums`) and the EUR amount uses `Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })`
   **And** the card also shows ONE summary line for the current month: `Exportiert (April): <N> Rechnungen, EUR <X>` — `month_exported_count` and `month_vat_total` from the same RPC

7. **Given** the user has zero invoices for the current week
   **When** `<WeeklyValueSummary>` renders
   **Then** the card still appears but shows `"Diese Woche noch keine Rechnungen erfasst."` followed by encouraging text `"Lade deine erste Rechnung der Woche hoch und sieh deine Zeitersparnis."` (UX-DR19 empty-state — no sad faces, conversational German)
   **And** the month summary line still renders below if `month_exported_count > 0`, otherwise it is hidden (no zero-only chrome)

8. **Given** the dashboard SQL migration is applied
   **When** the new RPC is called
   **Then** `public.tenant_weekly_value_summary()` returns exactly one row matching the type signature in Technical Concerns #2
   **And** the function follows the same hardening pattern as `invoice_processing_stats` in `20260423100000_dashboard_aggregations_hardening.sql`: `security definer`, `stable`, `set search_path = public, pg_temp`, raises `'tenant_weekly_value_summary: tenant context missing'` when `my_tenant_id() IS NULL`, `coalesce`-guards every nullable read, `revoke all from public` + `grant execute to authenticated`
   **And** the migration file is `supabase/migrations/20260428000000_weekly_value_summary.sql` (NEW)

9. **Given** the user is on `/dashboard` on a desktop browser (lg+) with no input/textarea focused
   **When** they press `ArrowDown`
   **Then** a focus ring (2px solid `var(--primary)`, 2px offset) appears on the FIRST visible invoice list row
   **And** subsequent `ArrowDown` moves the ring to the next row in DOM order; `ArrowUp` moves backward; the ring wraps from last → first / first → last on overflow
   **And** when no row is currently selected, the first `ArrowDown` selects the first row and the first `ArrowUp` selects the last row

10. **Given** the keyboard cursor is on a list row
    **When** the user presses `Enter`
    **Then** the dashboard navigates via `router.push` to `/dashboard?selected=<id>` (split-view opens; the existing pattern from Story 3-1 / 3-2)
    **And** the page does NOT reload; only the selected param changes

11. **Given** the dashboard split-view is open with an invoice selected (any approvable status)
    **When** the user presses `A` (no input focused)
    **Then** the invoice is approved via the same `approveInvoice` Server Action used by `<InvoiceActionsHeader>`, with `method: 'keyboard'`
    **And** the green toast `"Rechnung freigegeben."` appears (re-using the existing `<ActionToastProvider>` from Story 3-4)
    **And** if the invoice is already `ready`, the action is idempotent (re-stamp); if `exported`/`captured`/`processing`, the German error toast appears (re-uses existing rejection paths from Story 3-4 ACs)
    **And** the dashboard-level `A` shortcut and the detail-pane-level `A` shortcut do NOT both fire (the dashboard listener early-returns when a detail pane is mounted — gated by checking for `data-invoice-actions-header` presence in the DOM; the existing detail-pane shortcut wins)

12. **Given** the user is on `/dashboard` with `readyCount >= 1`
    **When** they press `E` (no input focused)
    **Then** the page invokes `<ExportAction>`'s click via `document.querySelector('[data-export-cta]')?.click()` — `<ExportAction>` MODIFIED to add `data-export-cta="true"` on its outer button/card (Story 3-4 left a clickable `onExport` callback that currently logs `[export:cta] click`; this story does NOT change Epic 5's deferred export flow — it just provides the keyboard entry point)
    **And** when `readyCount === 0`, pressing `E` does nothing (no console error, no toast)

13. **Given** the help overlay (`?` key on lg+) opens
    **When** it renders
    **Then** the table at `apps/web/components/layout/keyboard-shortcuts-help.tsx` (MODIFY) lists the 5 new bindings as `bound: true` (no `(bald verfügbar)` muted suffix) in this order: `↑ ↓ Liste navigieren`, `Enter Detail öffnen`, `A Freigeben`, `E DATEV-Export`, plus the existing `?` row
    **And** the existing `g d`, `g e`, `/` rows REMAIN with `bound: false` (still placeholder text — those are still Epic 3+ binding territory and are unchanged)

14. **Given** unit tests exercise the new surface
    **When** `pnpm test` runs
    **Then** the suite gains:
    - `packages/shared/src/compliance/invoice-compliance.test.ts` — NEW. ≥12 cases (one positive + one negative per code: missing_ust_id, invalid_invoice_date past+future, missing_invoice_number, missing_supplier_name, missing_gross_total, vat_total_mismatch within tolerance vs. outside).
    - `apps/web/components/invoice/compliance-warnings-banner.test.tsx` — NEW. ≥4 cases: (a) renders with warnings; (b) returns null with empty warnings; (c) `Zum Feld springen` calls `scrollIntoView` + `focus` on the right element id; (d) banner stays visible after a re-render (persistent semantics).
    - `apps/web/components/dashboard/weekly-value-summary.test.tsx` — NEW. ≥4 cases: (a) renders zero-state when `week_invoices=0`; (b) renders all 3 lines + month line for non-zero; (c) tabular-nums class applied; (d) hides month line when `month_exported_count=0`.
    - `apps/web/components/dashboard/dashboard-keyboard-shortcuts.test.tsx` — NEW. ≥6 cases: ArrowDown selects first row; ArrowUp from start wraps to last; Enter calls `router.push` with `?selected=`; `A` calls approveInvoice when detail visible; `E` clicks the `[data-export-cta]` element when present; ignores when input focused.
    - `apps/web/components/invoice/invoice-detail-pane.test.tsx` — MODIFY. Add 1 case: warnings banner present when invoice has missing USt-IdNr, approve still works.
    - `apps/web/components/layout/keyboard-shortcuts-help.test.tsx` — MODIFY (or NEW if absent). Add 1 case: 5 new shortcut rows render as bound.
    - **Target:** +4 new test files, +≥27 new cases. Total test count: 247 → **≥274**.

15. **Given** CI-equivalent commands run from the repo root
    **When** they execute
    **Then** `pnpm lint`, `pnpm check-types`, `pnpm build`, `pnpm test` all pass with zero new errors. `npx -y supabase db reset --no-seed` applies all migrations cleanly including `20260428000000_weekly_value_summary.sql`.

16. **Given** the smoke-test format (per `_bmad-output/implementation-artifacts/smoke-test-format-guide.md`) is mandatory
    **When** the story completes
    **Then** Completion Notes include a `### Browser Smoke Test` section covering at minimum:
    - **UX (a)** Open `/rechnungen/[id]` for an invoice missing USt-IdNr → amber banner with the exact German message at the top of the pane.
    - **UX (b)** Click `Zum Feld springen` on the USt-IdNr warning → page scrolls to and focuses the `supplier_tax_id` field.
    - **UX (c)** Approve a warning-laden invoice → green toast appears, banner remains visible.
    - **UX (d)** Open `/dashboard` (no `?selected`) on lg+ → right column shows the new Weekly Value Summary card with three lines + month line.
    - **UX (e)** With zero invoices this week → the card shows the empty-state message.
    - **UX (f)** On lg+ desktop, press `ArrowDown` → focus ring on first list row; press again → second row; `Enter` → split-view opens.
    - **UX (g)** With split-view open, press `A` → invoice approved, green toast.
    - **UX (h)** With ≥1 ready invoice, press `E` → ExportAction click handler fires (`console.info('[export:cta] click', ...)`).
    - **UX (i)** Press `?` → help overlay shows the 5 new shortcuts as bound; existing `g d`/`g e`/`/` still muted.
    - **UX (j)** Regression: swipe-to-approve, EditableField, SKR select, source viewer dot, SessionSummary, ExportAction variants all still work.
    - **DB (d1)** `SELECT * FROM tenant_weekly_value_summary();` on a tenant with 3 ready invoices this week → returns one row with `week_invoices=3`, non-null `week_time_saved_minutes=36`, plausible `week_vat_total`.
    - **DB (d2)** Same RPC on an empty-week tenant → returns `week_invoices=0`, `week_time_saved_minutes=0`, `week_vat_total=0`.
    - Mark `BLOCKED-BY-ENVIRONMENT` per smoke-test guide.

---

## Tasks / Subtasks

- [ ] **Task 1: Compliance check engine in shared (AC: #2, #3, #4)**
  - [ ] 1.1 `packages/shared/src/compliance/invoice-compliance.ts` NEW — exports `runComplianceChecks(invoice: Invoice): ComplianceWarning[]`, `ComplianceWarning` type, `ComplianceCode` enum-equivalent. Pure functions per check (one each: `checkUstId`, `checkInvoiceDate`, `checkInvoiceNumber`, `checkSupplierName`, `checkGrossTotal`, `checkVatMismatch`). 2-cent tolerance constant `VAT_MISMATCH_TOLERANCE_EUR = 0.02`.
  - [ ] 1.2 `packages/shared/src/index.ts` — MODIFY: re-export `runComplianceChecks`, `ComplianceWarning`, `ComplianceCode`.
  - [ ] 1.3 `packages/shared/src/compliance/invoice-compliance.test.ts` NEW — ≥12 cases.

- [ ] **Task 2: Compliance warnings banner UI (AC: #1, #4, #5)**
  - [ ] 2.1 `apps/web/components/invoice/compliance-warnings-banner.tsx` NEW — `"use client"`. Props `{ warnings: ComplianceWarning[] }`. Returns `null` when empty. Amber styling per Dev Notes. `Zum Feld springen` button calls `document.getElementById(\`field-${path}\`)?.scrollIntoView` + focus.
  - [ ] 2.2 `apps/web/components/invoice/invoice-detail-pane.tsx` — MODIFY: import `runComplianceChecks` and `<ComplianceWarningsBanner>`; render banner immediately below the header section (above the field grid).
  - [ ] 2.3 `apps/web/components/invoice/editable-field.tsx` — VERIFY (read-only check): the existing wrapper element already has an `id={\`field-${path}\`}` anchor or equivalent — if absent, ADD `id` prop on the outermost wrapper without changing visual styling.
  - [ ] 2.4 `apps/web/components/invoice/compliance-warnings-banner.test.tsx` NEW — 4 cases.
  - [ ] 2.5 `apps/web/components/invoice/invoice-detail-pane.test.tsx` — MODIFY: 1 new case (warning + approve coexistence).

- [ ] **Task 3: Weekly value summary RPC + card (AC: #6, #7, #8)**
  - [ ] 3.1 `supabase/migrations/20260428000000_weekly_value_summary.sql` NEW — adds `tenant_weekly_value_summary()` SECURITY DEFINER function. `revoke all from public; grant execute to authenticated;`. Uses `date_trunc('week', now())` for week boundary, `date_trunc('month', now())` for month. Regex-guarded numeric casts on `invoice_data->'vat_total'->>'value'` (mirror `20260424100000` pattern). `coalesce` everything; raise on NULL `my_tenant_id()`.
  - [ ] 3.2 `apps/web/components/dashboard/weekly-value-summary.tsx` NEW — Server Component (`async function`, no `"use client"`). Calls `supabase.rpc("tenant_weekly_value_summary")`. Formats with `Intl.NumberFormat('de-DE',...)` + `tabular-nums`. Empty/zero state per AC #7.
  - [ ] 3.3 `apps/web/app/(app)/dashboard/page.tsx` — MODIFY: replace the placeholder Card at lines ~347–356 with `<WeeklyValueSummary tenantId={tenantId} />`. The `<ProcessingStatsRow>` section below it is unchanged.
  - [ ] 3.4 `apps/web/components/dashboard/weekly-value-summary.test.tsx` NEW — 4 cases (mock RPC results).
  - [ ] 3.5 `npx -y supabase db reset --no-seed` to verify migration applies cleanly.

- [ ] **Task 4: Dashboard keyboard shortcuts (AC: #9, #10, #11, #12, #13)**
  - [ ] 4.1 `apps/web/components/dashboard/dashboard-keyboard-shortcuts.tsx` NEW — `"use client"`. Listens on `window`, gated by `matchMedia("(min-width: 1024px)")`, input/textarea/select/contentEditable focus-guard, modifier-key guard, IME guard. Cursor state in `useState<string | null>`; visual focus via `data-keyboard-selected="true"` attribute on the matched `<a data-invoice-id="...">` element + Tailwind `[data-keyboard-selected=true]:ring-2` (or imperatively toggle a class — CSS attribute selector is cleaner). Wraps cursor on overflow.
  - [ ] 4.2 `apps/web/components/dashboard/invoice-list-card-link.tsx` — MODIFY: add `data-invoice-id={id}` on the `<a>` element so the keyboard hook can enumerate rows.
  - [ ] 4.3 `apps/web/components/dashboard/export-action.tsx` — MODIFY: add `data-export-cta="true"` on the outer clickable element (button or card-as-button) so `E` key can find it.
  - [ ] 4.4 `apps/web/app/(app)/dashboard/page.tsx` — MODIFY: render `<DashboardKeyboardShortcuts />` as a sibling of `<DashboardRealtimeRefresher />`.
  - [ ] 4.5 `apps/web/components/layout/keyboard-shortcuts-help.tsx` — MODIFY: add 5 NEW rows to `SHORTCUTS` array (`↑ ↓ Liste navigieren`, `Enter Detail öffnen`, `A Freigeben`, `E DATEV-Export`, all `bound: true`); keep the existing `?`, `g d`, `g e`, `/` rows unchanged.
  - [ ] 4.6 `apps/web/components/dashboard/dashboard-keyboard-shortcuts.test.tsx` NEW — 6 cases.
  - [ ] 4.7 `apps/web/components/layout/keyboard-shortcuts-help.test.tsx` — MODIFY (or NEW): 1 case asserting the 5 new bound rows render.

- [ ] **Task 5: Validate + Smoke Test (AC: #15, #16)**
  - [ ] 5.1 `pnpm check-types`, `pnpm lint`, `pnpm build`, `pnpm test` (≥274 cases) — all clean.
  - [ ] 5.2 `npx -y supabase db reset --no-seed` cleanly applies the new migration.
  - [ ] 5.3 Smoke test section authored in Completion Notes per the canonical format (`smoke-test-format-guide.md`).

---

## Dev Notes

### Scope Fences (from epics + Story 3.4 deferred list)

- **Email weekly recap (FR45 cron job)** → Story 8.3. This story is in-app card only.
- **Persistent multi-week streak counter on the weekly summary** → Story 8.3.
- **Audit log entry per warning resolution** → Story 4.2 (durable audit table).
- **Full EN 16931 BR-* validation** → Epic 6.
- **DATEV CSV generation triggered by `E`** → Epic 5 (this story only wires the keyboard entry point; the actual flow is still Epic 5).
- **Custom dropdown a11y, sonner, Framer Motion** → still NOT introduced. Same discipline as 3-3 / 3-4.
- **Cursor persistence across `router.refresh()`** → out of scope (acceptable per realtime cadence).

### Compliance Messages (verbatim German — UX-DR17)

| Code                     | Field path          | Severity | Message (verbatim)                                                                                          |
|--------------------------|---------------------|----------|-------------------------------------------------------------------------------------------------------------|
| `missing_ust_id`         | `supplier_tax_id`   | amber    | `Die USt-IdNr fehlt auf dieser Rechnung. Bitte ergänzen oder den Lieferanten kontaktieren.`                |
| `invalid_invoice_date`   | `invoice_date`      | amber    | `Das Rechnungsdatum fehlt oder ist ungültig. Bitte trage das korrekte Datum ein.`                           |
| `missing_invoice_number` | `invoice_number`    | amber    | `Die Rechnungsnummer fehlt. Bitte ergänze sie aus dem Originalbeleg.`                                       |
| `missing_supplier_name`  | `supplier_name`     | amber    | `Der Lieferantenname fehlt. Ohne Lieferant kann die Rechnung nicht exportiert werden.`                       |
| `missing_gross_total`    | `gross_total`       | amber    | `Der Bruttobetrag fehlt. Bitte trage den Gesamtbetrag der Rechnung ein.`                                    |
| `vat_total_mismatch`     | `gross_total`       | amber    | `Netto + MwSt. ergeben nicht den Bruttobetrag. Bitte überprüfe die Beträge.`                                 |

Use `ä`/`ü`/`ö`/`ß` directly (UTF-8 source files). NO ASCII transliteration in user-facing strings.

### Compliance Banner Visual Spec

```
┌──────────────────────────────────────────────────────────────┐
│  ⚠  Diese Rechnung benötigt deine Aufmerksamkeit.            │
│                                                              │
│  • Die USt-IdNr fehlt auf dieser Rechnung. ...               │
│    [Zum Feld springen →]                                     │
│  • Das Rechnungsdatum fehlt oder ist ungültig. ...           │
│    [Zum Feld springen →]                                     │
└──────────────────────────────────────────────────────────────┘
```

- Container: `rounded-lg border border-warning/40 bg-warning/10 p-4`, `role="status"`, `aria-live="polite"` (changes are read but non-interrupting)
- Heading: `text-body font-semibold text-foreground` — `"Diese Rechnung benötigt deine Aufmerksamkeit."` (only when `warnings.length >= 1`)
- Each row: flex-col gap-1; message in `text-body-sm text-foreground`; jump button is tertiary (`text-body-sm text-muted-foreground hover:text-foreground underline`). NOT a Primary button — UX-DR17 amber pattern + button hierarchy (one Primary per screen, owned by `[Freigeben]`).

### Why a separate dashboard `A` shortcut from the detail-pane `A` shortcut

`<InvoiceActionsHeader>` already binds `A` when a detail pane is mounted (Story 3.4 AC #7). On the desktop dashboard split-view, BOTH the dashboard list AND the detail pane are visible — but the user's intent on `A` is "approve the selected invoice" regardless of which is "focused". Solution: the dashboard listener checks for the presence of `[data-invoice-actions-header]` in the DOM at keypress time; if present, the dashboard hook early-returns and lets the detail pane's listener fire (the detail pane already knows the invoice id from props). When NO detail pane is mounted (dashboard list only, no `?selected=`), `A` does nothing on the dashboard — that matches the AC since "selected detail pane" is a precondition.

### RPC Implementation Sketch

```sql
create or replace function public.tenant_weekly_value_summary()
returns table(
  week_invoices bigint,
  week_time_saved_minutes integer,
  week_vat_total numeric,
  month_exported_count bigint,
  month_vat_total numeric
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  week_start timestamptz := date_trunc('week', now());
  week_end timestamptz := week_start + interval '7 days';
  month_start timestamptz := date_trunc('month', now());
  month_end timestamptz := month_start + interval '1 month';
  v_week_count bigint;
  v_week_vat numeric;
  v_month_count bigint;
  v_month_vat numeric;
begin
  if public.my_tenant_id() is null then
    raise exception 'tenant_weekly_value_summary: tenant context missing';
  end if;

  select
    count(*) filter (where status in ('ready','review','exported')),
    coalesce(sum(
      case
        when invoice_data->'vat_total'->>'value' ~ '^[0-9]+(\.[0-9]+)?$'
          and status in ('ready','exported')
          then (invoice_data->'vat_total'->>'value')::numeric
        else 0
      end
    ), 0)
  into v_week_count, v_week_vat
  from public.invoices
  where tenant_id = public.my_tenant_id()
    and created_at >= week_start
    and created_at < week_end;

  select
    count(*) filter (where status = 'exported'),
    coalesce(sum(
      case
        when invoice_data->'vat_total'->>'value' ~ '^[0-9]+(\.[0-9]+)?$'
          and status = 'exported'
          then (invoice_data->'vat_total'->>'value')::numeric
        else 0
      end
    ), 0)
  into v_month_count, v_month_vat
  from public.invoices
  where tenant_id = public.my_tenant_id()
    and created_at >= month_start
    and created_at < month_end;

  return query select
    coalesce(v_week_count, 0)::bigint,
    (coalesce(v_week_count, 0) * 12)::integer,
    coalesce(v_week_vat, 0)::numeric,
    coalesce(v_month_count, 0)::bigint,
    coalesce(v_month_vat, 0)::numeric;
end;
$$;

revoke all on function public.tenant_weekly_value_summary() from public;
grant execute on function public.tenant_weekly_value_summary() to authenticated;
```

`date_trunc('week', now())` on Postgres returns Monday 00:00 (ISO 8601). The function runs in UTC; week boundary is technically Monday 00:00 UTC, which is acceptable for MVP (German timezone offset shifts boundary by 1–2h — a known cosmetic edge case, not a correctness bug). Document this in the migration comment.

### Existing files to read BEFORE coding

Per Story 3.3 / 3.4 review discipline (read every UPDATE file completely):

- `apps/web/components/invoice/invoice-detail-pane.tsx` — banner mount target + understand the existing flex layout.
- `apps/web/components/invoice/editable-field.tsx` — verify or add the `id={\`field-${path}\`}` anchor used by `Zum Feld springen`.
- `apps/web/components/dashboard/invoice-list-card-link.tsx` — add `data-invoice-id`, coexist with the swipe wrapper's pointerdown.
- `apps/web/components/dashboard/export-action.tsx` — add `data-export-cta` to the outer clickable; do NOT touch the variant logic (Story 3-4 territory).
- `apps/web/components/layout/keyboard-shortcuts-help.tsx` — extend the `SHORTCUTS` array; preserve the `bound: false` rows verbatim.
- `apps/web/app/(app)/dashboard/page.tsx` — replace the placeholder Card (lines ~347–356); mount `<DashboardKeyboardShortcuts />`.
- `apps/web/components/invoice/invoice-actions-header.tsx` — note the existing `A` binding precedence (detail pane wins).
- `apps/web/components/dashboard/dashboard-esc-handler.tsx` — same input/textarea focus-guard pattern to mirror in the new keyboard hook.
- `supabase/migrations/20260423100000_dashboard_aggregations_hardening.sql` — reference template for the new RPC.
- `supabase/migrations/20260424100000_invoice_sort_columns_safe_cast.sql` — regex-guarded numeric cast pattern to reuse in the RPC.
- `packages/shared/src/schemas/invoice.ts` — `Invoice` type, `isoDateField` already nulls non-ISO strings (so `invalid_invoice_date` only fires on `null`).
- `apps/web/AGENTS.md` — "This is NOT the Next.js you know." Read `node_modules/next/dist/docs/` before writing client components / Server Actions / route handlers.

### Previous Story Intelligence (3.4 review patches that affect 3.5)

- **Tenant filter on invoice fetch** is mandatory in dashboard + detail-page SELECTs. The new RPC inherits this via `my_tenant_id()`; do not bypass.
- **Toast system** — re-use `<ActionToastProvider>` from 3.4. Don't introduce a second toast surface for `A`/`E` keyboard actions; the existing approve flow already toasts.
- **SessionStorage / sessionStorage** — used by `<SessionSummary>` (3.4); the new keyboard cursor is in-memory only (does NOT persist).
- **Test count baseline:** 247 (post-3.4). New target: ≥274 (delta +27).
- **Smoke test format** — mandatory; follow `smoke-test-format-guide.md` exactly.
- **3.4 review found:** `bottom-16 lg:bottom-0` correction on toast for mobile nav clearance — keep that pattern intact (don't regress when touching `app/(app)/layout.tsx`).
- **3.4 review found:** unmount cleanup on toast `setTimeout` — when adding `setTimeout`/`addEventListener` in the new keyboard hook, MUST clean up on unmount.
- **3.4 review found:** `transitionend` event bubbles — when wiring any new event listener that depends on event-target equality, filter `event.target === ref.current` AND/OR `event.propertyName === 'transform'`.

### Schema Already Applied vs. New

- New: `20260428000000_weekly_value_summary.sql` adds `tenant_weekly_value_summary()` RPC. No new columns, no new tables.
- Existing `invoices` columns are sufficient (`status`, `created_at`, `invoice_data` JSON for VAT extraction).

### Error Path Audit (Epic 2 retro A2 — carried forward)

For the new RPC + helper:
- `runComplianceChecks` is pure; no error paths. Always returns an array (possibly empty).
- RPC `tenant_weekly_value_summary` raises on missing tenant (defense-in-depth); coalesces every nullable read; regex-guards numeric casts.
- `<WeeklyValueSummary>` Server Component: if `supabase.rpc` returns an error, fall back to the empty-state card with `console.warn('[dashboard:weekly] rpc error', error)` and Sentry capture (`Sentry.captureException(error, { tags: { module: 'dashboard', source: 'weekly_value_summary' } })`). Don't blow up the dashboard render.
- Keyboard hook: `try/catch` around `router.push` and the `[data-export-cta]?.click()` (defensive — `click()` on a disabled element is a no-op; on a missing element we early-return).

### Source Tree Touch Points

**NEW:**
- `supabase/migrations/20260428000000_weekly_value_summary.sql`
- `packages/shared/src/compliance/invoice-compliance.ts` + `.test.ts`
- `apps/web/components/invoice/compliance-warnings-banner.tsx` + `.test.tsx`
- `apps/web/components/dashboard/weekly-value-summary.tsx` + `.test.tsx`
- `apps/web/components/dashboard/dashboard-keyboard-shortcuts.tsx` + `.test.tsx`

**MODIFIED:**
- `packages/shared/src/index.ts` (re-export new compliance API)
- `apps/web/components/invoice/invoice-detail-pane.tsx` (mount banner)
- `apps/web/components/invoice/invoice-detail-pane.test.tsx` (1 case)
- `apps/web/components/invoice/editable-field.tsx` (verify/add `id` anchor)
- `apps/web/components/dashboard/invoice-list-card-link.tsx` (add `data-invoice-id`)
- `apps/web/components/dashboard/export-action.tsx` (add `data-export-cta`)
- `apps/web/app/(app)/dashboard/page.tsx` (replace placeholder + mount keyboard hook)
- `apps/web/components/layout/keyboard-shortcuts-help.tsx` (5 new rows)
- `apps/web/components/layout/keyboard-shortcuts-help.test.tsx` (1 case — create file if absent)

**FORBIDDEN:**
- New top-level dependencies (no `framer-motion`, no `sonner`, no `react-spring`, no `react-hotkeys-hook`).
- Touching the `invoice_status` enum (Story 4.2 territory).
- Modifying `<InvoiceActionsHeader>`'s existing `A` binding logic (precedence handled at the dashboard listener side).
- Modifying `<ExportAction>`'s variant logic (3.4 territory) — only add the `data-export-cta` data attribute.
- Adding a second toast root or replacing the 3.4 `<ActionToastProvider>`.

### Testing Standards

- Vitest + jsdom (already wired).
- Mock `next/navigation` (`useRouter().push`).
- Mock `window.matchMedia` for the lg+ desktop gate AND `prefers-reduced-motion`.
- Mock `@/lib/supabase/server` for the Server Component test using the same fake client pattern as `dashboard/page` indirect tests (or test the component with a stubbed RPC return value passed in via a thin wrapper).
- Use `vi.fn()` for `scrollIntoView` and `focus` (jsdom does not implement `scrollIntoView` natively).
- For the keyboard hook: synthesize `KeyboardEvent` via `new KeyboardEvent('keydown', { key: 'ArrowDown' })`; ensure `e.isComposing` and `e.keyCode` defaults are sane.
- For the RPC, no direct unit test — covered indirectly by the smoke test DB query and the component test (which mocks the RPC return).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-3.5] — AC source (lines 694–719)
- [Source: _bmad-output/planning-artifacts/prd.md] — FR33 (line 566), FR46 (line 588), UX-DR17 (loading/feedback patterns), UX-DR20 (desktop keyboard shortcuts)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md] — WeeklyRecapCard spec (line 1687, 1754), Warning Feedback patterns (lines 1801–1808), Validation Warning rules (line 1175), Preventive warning pattern (line 1807, "USt-IdNr. fehlt — Vorsteuerabzug gefährdet"), Empty-state pattern (UX-DR19)
- [Source: _bmad-output/planning-artifacts/architecture.md] — `apps/web/components/dashboard/weekly-recap-card.tsx` placement (line 598), `app/api/cron/weekly-recap/route.ts` (line 743 — Story 8.3 territory, NOT this story), `runComplianceChecks` package boundary fits `packages/shared`
- [Source: _bmad-output/implementation-artifacts/3-4-swipe-to-approve-and-confidence-based-review-queue.md] — toast provider, `[Freigeben]` keyboard `A` precedence, deferred-to-3.5 list (lines 23, 202)
- [Source: _bmad-output/implementation-artifacts/1-5-tenant-settings-and-dashboard-shell.md] — UX-DR20 keyboard help overlay foundation (line 31)
- [Source: _bmad-output/implementation-artifacts/smoke-test-format-guide.md] — mandatory format
- [Source: apps/web/components/invoice/invoice-detail-pane.tsx] — banner mount target
- [Source: apps/web/components/dashboard/dashboard-esc-handler.tsx] — focus-guard + window listener pattern to mirror
- [Source: apps/web/components/layout/keyboard-shortcuts-help.tsx] — `SHORTCUTS` array to extend; lg+ + focus-guard reference
- [Source: supabase/migrations/20260423100000_dashboard_aggregations_hardening.sql] — RPC hardening template
- [Source: supabase/migrations/20260424100000_invoice_sort_columns_safe_cast.sql] — regex-guarded numeric cast pattern
- [Source: packages/shared/src/schemas/invoice.ts] — `Invoice` type + `isoDateField`

[Smoke test format: _bmad-output/implementation-artifacts/smoke-test-format-guide.md]

---

## Dev Agent Record

### Agent Model Used

_(filled by dev agent)_

### Debug Log References

_(filled by dev agent)_

### Completion Notes List

_(filled by dev agent — must include `### Browser Smoke Test` section per the canonical format)_

### File List

_(filled by dev agent)_

### Review Findings

_(filled by reviewer agent)_

## Change Log

| Date       | Change                                                                                              | Author          |
|------------|-----------------------------------------------------------------------------------------------------|-----------------|
| 2026-04-27 | Story file created — comprehensive context engine output (Compliance + Weekly Summary + Keyboard)   | claude-opus-4-7 |
