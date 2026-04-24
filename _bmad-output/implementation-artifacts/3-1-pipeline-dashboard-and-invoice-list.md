# Story 3.1: Pipeline Dashboard and Invoice List

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to see all my invoices organized by processing status with real-time counts, filter/sort/search over the list, and at-a-glance processing statistics,
so that I always know what needs my attention and can manage my invoice workflow from a single screen.

---

## Technical Concerns (≤3, per Epic 1 retro Action #2)

1. **PipelineHeader component** — new dashboard component with 4 lifecycle stages, real-time counts, accessibility, responsive behaviour (UX-DR1).
2. **Invoice list (RSC) + filters/sort** — tenant-scoped server-fetched list rendered as cards, client-side filter/sort/search controls (FR30, FR31, NFR3, NFR5).
3. **Processing statistics row + AC #TD4 (`extraction_attempts` upper bound)** — the statistics section (FR34) plus the Epic 2 retro TD4 guardrail to cap server-side retry counts on stuck `captured` rows.

Split-view layout (UX-DR10 desktop 380px list + detail pane) and deep filter wiring to Story 3.2's detail pane are **out of scope** — Story 3.2 owns the detail pane; Story 3.1 renders the list only and links each card to `/rechnungen/[id]`.

Swipe-to-approve, SKR categorization, compliance warnings, weekly value summary are **out of scope** — owned by Stories 3.3–3.5.

---

## Acceptance Criteria

1. **Given** the user is authenticated and has invoices in various stages **When** they navigate to `/dashboard` **Then** a new `<PipelineHeader />` server component (`apps/web/components/dashboard/pipeline-header.tsx`) renders the four lifecycle stages in enum order (`captured` → `processing` → `ready` → `exported`) as horizontal buttons with real-time per-stage counts and WhatsApp-style indicators: circle `○` (Erfasst), half-circle `◐` (Verarbeitung), filled-circle `●` (Bereit), checkmark `✓` (Exportiert). Labels in German: "Erfasst", "Verarbeitung", "Bereit", "Exportiert". Counts come from a single aggregate SQL query (AC #11a). The `review` status is folded into "Bereit" for the count (both "Bereit" and "zur Prüfung" need user attention — a single actionable bucket matches the UX wireframe at ux-design-specification.md:1356–1360). Document this folding in Dev Notes under "Status → Stage Mapping". Stage ordering is load-bearing per `20260417100000_invoices_table.sql` comment — **do NOT** reorder.

2. **Given** the PipelineHeader renders **When** a stage has `count > 0` **Then** per UX-DR1 states: (a) **Default** — no emphasis; (b) **Attention** — the "Bereit" stage only: count rendered `font-bold`, with a `subtle-pulse` CSS animation on the count span (define `@keyframes subtle-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.6 } }` in `apps/web/app/globals.css` with `animation: subtle-pulse 2s ease-in-out infinite`, wrap in `@media (prefers-reduced-motion: no-preference)`); (c) **Processing** — "Verarbeitung" stage count gets a `shimmer` class (reuse `animate-pulse` from Tailwind/shadcn, `motion-reduce:animate-none`); (d) **Empty** — all 4 counts = 0 → count spans use `text-muted-foreground`; (e) **Tapped** — `active:scale-[1.05] transition-transform` via Tailwind (no Framer Motion — retro discipline). Haptic feedback: wrap each stage button's `onClick` in a client component that calls `navigator.vibrate?.(10)` inside a `typeof navigator !== 'undefined'` guard. **No** new dependency. See AC #3 for click behaviour.

3. **Given** the PipelineHeader is rendered **When** the user clicks a stage button **Then** the client wrapper (`pipeline-header-stages.tsx`) invokes an `onStageClick(stageId)` callback that scrolls the page to the corresponding invoice list section via `document.getElementById(`stage-${stageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })` AND updates the URL query param `?stage={stageId}` via `router.replace()` from `next/navigation` (shallow — does NOT refetch server data). This forms the bridge to AC #6 filtering. Keyboard: each stage is a `<button type="button">` inside the `<nav role="navigation" aria-label="Rechnungs-Pipeline">`; `aria-label="{LabelDe}: {count} Rechnungen"`, `aria-current="true"` if query param matches. Escape key clears the stage filter (Escape listener on the dashboard client wrapper — guarded for input-focus per 2.3 post-review fix LOW #7). **Toggle behaviour (post-review D3):** re-clicking the currently active stage clears the `?stage` param — matches WhatsApp/iOS tab-toggle UX conventions; originally omitted from the spec.

4. **Given** the viewport is mobile (`<sm`, `<640px`) **When** the PipelineHeader renders **Then** stage labels use abbreviations: `"Erfasst"` → `"Erf."`, `"Verarbeitung"` → `"Verarb."`, `"Bereit"` → `"Bereit"` (unchanged), `"Exportiert"` → `"Export."`. Implement via two spans: `<span className="sm:hidden">{short}</span><span className="hidden sm:inline">{full}</span>`. Icons always visible. Counts always visible. On desktop (`lg+`, `≥1024px`), full labels with increased spacing.

5. **Given** the dashboard loads **When** the page is rendered **Then** `/dashboard/page.tsx` is a **React Server Component** that fetches its data via `createServerClient()` (from `@/lib/supabase/server`) — **NOT** a Route Handler, **NOT** a Server Action (those are for mutations, per `apps/web/AGENTS.md` Next.js 16 discipline). Query shape:
   ```ts
   const { data: invoices } = await supabase
     .from("invoices")
     .select("id, status, file_path, file_type, original_filename, invoice_data, extraction_error, extracted_at, created_at, updated_at")
     .order("created_at", { ascending: false })
     .limit(100);
   const { data: stageCounts } = await supabase
     .rpc("invoice_stage_counts"); // see AC #11a — new SQL function
   const { data: stats } = await supabase
     .rpc("invoice_processing_stats"); // see AC #11b — new SQL function
   ```
   RLS enforces tenant scoping (Story 2.1 `invoices_select_own` policy). Page must complete render within 2 seconds on broadband (NFR3) — verified via `pnpm build` Next.js route output and smoke AC #12(e). **Limit of 100** covers the MVP dashboard scope (Epic 3 does not ship pagination — deferred to Epic 4). Document the limit + "Epic 4 will add pagination" reference in Dev Notes. If a tenant has ≥100 invoices, render an inline amber banner: `"Es werden die neuesten 100 Rechnungen angezeigt. Die vollständige Ansicht kommt mit dem Archiv."` **Do NOT** paginate client-side — the banner is the honest contract.

6. **Given** the invoice list renders **When** a row displays **Then** each invoice is rendered via a **new** component `<InvoiceListCard />` at `apps/web/components/dashboard/invoice-list-card.tsx` — a **collapsed-only** card (the full `AccordionInvoiceCard` expand-pane is Story 3.2's scope). Card anatomy exactly:
   - **4px left border** colored by `overallConfidence(invoice.invoice_data)` if `invoice_data !== null`: `border-l-confidence-high | border-l-confidence-medium | border-l-confidence-low` (use the shared `confidenceLevel()` helper from `@rechnungsai/shared`). If `invoice_data IS NULL` (status `captured` or `processing`), border color is `border-l-muted`. If status is `captured` AND `extraction_error IS NOT NULL`, border is `border-l-destructive`.
   - **Row 1:** `<p className="font-medium text-body">{supplier_name ?? "Unbekannter Lieferant"}</p>` on the left, `<p className="text-body tabular-nums">{formatEur(gross_total, currency)}</p>` on the right (use `Intl.NumberFormat("de-DE", { style: "currency", currency: currency ?? "EUR", minimumFractionDigits: 2 })` — format: `1.234,56 €`). Null gross → `"—"`. Extract `formatEur` and `formatDateDe` into a NEW module `apps/web/lib/format.ts` (do **not** duplicate `formatCurrency` from `extraction-results-client.tsx:61`; migrate that usage in a follow-up if trivial — otherwise leave the client component file alone to avoid scope creep).
   - **Row 2:** status pill on the left (`<Badge />` from `@/components/ui/badge`; German label per status map in AC #10); date on the right using `Intl.DateTimeFormat("de-DE").format(new Date(created_at))` → `dd.MM.yyyy`.
   - **Role:** the whole card is `<Link href={`/rechnungen/${id}`} className="block ...">` — one tap/click → detail route (Story 2.2 scaffold). No swipe, no expand, no action buttons — Story 3.2 and 3.4 own those.
   - **Processing shimmer:** if status ∈ `{captured, processing}`, the supplier+gross spans use `animate-pulse motion-reduce:animate-none` and render `"Wird verarbeitet…"` instead of `"Unbekannter Lieferant"` when `invoice_data IS NULL`.
   - **Error state:** if status=`captured` AND `extraction_error IS NOT NULL`, show a small inline `text-caption text-destructive` line beneath Row 2 with `"KI-Extraktion fehlgeschlagen: {extraction_error}"` — no retry button in 3.1 (Epic 3 Story 3.2 handles manual re-extraction UX).
   - **Accessibility:** card has `aria-label="{supplier_name ?? 'Unbekannter Lieferant'}, {formatEur}, {statusLabel}, {dateDe}"` — screen reader reads the essentials as one utterance.

7. **Given** the user wants to find/narrow invoices **When** the filter bar renders above the list **Then** a **client component** `<InvoiceListFilters />` at `apps/web/components/dashboard/invoice-list-filters.tsx` provides:
   - **Status select** (shadcn not included in current repo — use a native `<select>` with shadcn-style `<Label>` above. Options: "Alle", "Erfasst", "Verarbeitung", "Bereit", "Zur Prüfung", "Exportiert").
   - **Supplier text search** (`<Input placeholder="Lieferant suchen…">`, debounced 300ms).
   - **Amount range** — two `<Input type="number" step="0.01">` side-by-side with a separator, labelled "Betrag von / bis (EUR)".
   - **Date range** — two `<Input type="date">` labelled "Von / Bis" — native date picker per UX-DR18.
   - **Sort by** select — options: "Datum (neueste)" (default), "Datum (älteste)", "Betrag (höchste)", "Betrag (niedrigste)", "Lieferant (A–Z)", "Status".
   - **SKR category filter** — explicitly **deferred to Story 3.3** (that story introduces the category column). In 3.1, render the filter control as **disabled** with tooltip `"Verfügbar nach Story 3.3"` — or omit entirely. Dev choice: **omit** in 3.1 and revisit after 3.3 ships (simpler, no misleading affordance). Document decision in Dev Notes.
   - **All filters are URL-query-param-driven** (`supplier`, `minAmount`, `maxAmount`, `from`, `to`, `status`, `sort`) using `next/navigation` `useSearchParams` + `router.replace()`. The RSC page reads the same params from `searchParams` and applies them server-side to the Supabase query — **single source of truth, no client-side filtering**. This satisfies NFR5 (<1 s) because Postgres serves filtered results via the `(tenant_id, created_at desc)` composite index and RLS (+ the new in-memory filter only for supplier substring on server). Deep-linking + browser-back work naturally.
   - Below the filter controls, a `<button type="button">Filter zurücksetzen</button>` that `router.replace("/dashboard")` clears all params.

8. **Given** the server applies filters to the query **When** the RSC page re-renders with `searchParams` **Then** the Supabase query is built conditionally:
   ```ts
   // pseudocode inside page.tsx
   let q = supabase.from("invoices").select("...").limit(100);
   if (params.status && params.status !== "all") q = q.eq("status", params.status);
   if (params.from) q = q.gte("created_at", params.from);
   if (params.to)   q = q.lte("created_at", `${params.to}T23:59:59`);
   if (params.supplier) q = q.ilike("invoice_data->supplier_name->>value", `%${params.supplier}%`);
   // Amount filters use jsonb path — note: `gross_total->value` is numeric, use ->> and cast:
   if (params.minAmount) q = q.gte("(invoice_data->'gross_total'->>'value')::numeric", Number(params.minAmount));
   if (params.maxAmount) q = q.lte("(invoice_data->'gross_total'->>'value')::numeric", Number(params.maxAmount));
   // Sort — default created_at desc
   switch (params.sort) {
     case "date_asc":     q = q.order("created_at", { ascending: true }); break;
     case "amount_desc":  q = q.order("(invoice_data->'gross_total'->>'value')::numeric", { ascending: false, nullsFirst: false }); break;
     case "amount_asc":   q = q.order("(invoice_data->'gross_total'->>'value')::numeric", { ascending: true, nullsFirst: false }); break;
     case "supplier_asc": q = q.order("invoice_data->'supplier_name'->>'value'", { ascending: true, nullsFirst: false }); break;
     case "status":       q = q.order("status", { ascending: true }); break;
     default:             q = q.order("created_at", { ascending: false });
   }
   ```
   **Parse + validate** `searchParams` with a dedicated zod schema `dashboardQuerySchema` at `apps/web/lib/dashboard-query.ts` (NEW), mirrored from Story 2.1's `invoiceUploadInputSchema` discipline. Unknown / malformed params are **silently dropped** (not rejected — graceful degradation per NFR21). Boundaries: amount ≥ 0, amount ≤ 1_000_000, date strings match `/^\d{4}-\d{2}-\d{2}$/`, supplier ≤ 100 chars (after trim). Test the schema (AC #11).

9. **Given** the filter changes **When** the user types in supplier or adjusts a date **Then** the client component debounces URL updates for text inputs only (300ms via a single `useEffect` + `setTimeout`, no `lodash.debounce` dependency). Selects and date pickers commit on change. Every `router.replace()` uses the `{ scroll: false }` option so the viewport does not jump during interaction. `next/navigation`'s `useRouter` + `useSearchParams` are SSR-safe; use `"use client"` at the top of the filters component only — keep the dashboard page itself a Server Component.

10. **Given** the Status Badge renders on the invoice card **When** the backing status is known **Then** the German label map (exported from `apps/web/lib/status-labels.ts` NEW — single source of truth, consumed by PipelineHeader, InvoiceListCard, filter select):
    ```ts
    export const INVOICE_STATUS_LABEL_DE: Record<Invoice["status"], string> = {
      captured:   "Erfasst",
      processing: "Verarbeitung",
      ready:      "Bereit",
      review:     "Zur Prüfung",
      exported:   "Exportiert",
    };
    ```
    Badge variants: map `captured`→`secondary`, `processing`→`secondary` (`animate-pulse`), `ready`→`default` (primary), `review`→`destructive`, `exported`→`outline`. Extend `<Badge />` if needed — DO NOT add a new UI package.

11. **Given** aggregation queries are needed for pipeline counts + statistics (FR34) **When** the RSC fetches data **Then** **two new Postgres SECURITY DEFINER functions** are added via migration `supabase/migrations/20260422000000_dashboard_aggregations.sql`:
    - **(a)** `public.invoice_stage_counts()` → `returns table(status public.invoice_status, count bigint)` — filters by `tenant_id = public.my_tenant_id()` (reuse Story 1.5 helper). Returns one row per enum value, with `0` where no invoices exist (use `generate_series` or CROSS JOIN against `unnest(enum_range(null::public.invoice_status))` to guarantee all 5 stages are returned, even stages with zero invoices). `grant execute on function public.invoice_stage_counts() to authenticated`.
    - **(b)** `public.invoice_processing_stats()` → `returns table(total_invoices bigint, avg_accuracy numeric, export_history_count bigint)` — tenant-scoped. `total_invoices` = COUNT(*). `avg_accuracy` = AVG of `overallConfidence` (re-implemented server-side because the JS helper is unavailable): use the 7 `OVERALL_KEYS` from `packages/shared/src/schemas/invoice.ts` directly — `avg((invoice_data->'invoice_number'->>'confidence')::numeric + (invoice_data->'invoice_date'->>'confidence')::numeric + (invoice_data->'supplier_name'->>'confidence')::numeric + (invoice_data->'gross_total'->>'confidence')::numeric + (invoice_data->'vat_total'->>'confidence')::numeric + (invoice_data->'net_total'->>'confidence')::numeric + (invoice_data->'currency'->>'confidence')::numeric) / 7.0` WHERE `invoice_data IS NOT NULL`. Cast `numeric(4,3)` for readable output. `export_history_count` = COUNT(*) WHERE `status='exported'`. `grant execute on function public.invoice_processing_stats() to authenticated`.
    - **CRITICAL:** Both functions MUST have `SECURITY DEFINER` **AND** `SET search_path = public, pg_temp` to prevent search_path hijacking (Supabase RLS hardening lint rule). Follow the pattern from `20260415000000_fix_rls_recursion.sql` for `my_tenant_id()`. Also add an explicit `REVOKE ALL ON FUNCTION ... FROM PUBLIC` before the grant.
    - **TD4 (Epic 2 retro tech debt)** — add a **third migration statement** in the same file that caps `extraction_attempts` at 5: `ALTER TABLE public.invoices ADD CONSTRAINT invoices_extraction_attempts_upper_bound CHECK (extraction_attempts <= 5);`. The `extractInvoice` Server Action currently increments without bound (`apps/web/app/actions/invoices.ts:253`). Add a defensive early-return in `extractInvoice` before the attempts++ UPDATE: if `row.extraction_attempts >= 5`, return `{ success: false, error: "Maximale Anzahl der Versuche erreicht. Bitte überprüfe das Dokument manuell." }`. Document in Dev Notes under "TD4 Resolution".

12. **Given** the Processing Statistics section (FR34) **When** the RSC renders **Then** a new component `<ProcessingStatsRow />` at `apps/web/components/dashboard/processing-stats-row.tsx` (server component — no `"use client"`) renders three stat cards using the existing `<Card>/<CardContent>` pattern from the current dashboard placeholder:
    - **"Rechnungen gesamt"** → `{total_invoices}` (e.g. `"42"`)
    - **"KI-Genauigkeit"** → `{Math.round(avg_accuracy * 100)}%` with inline `<ConfidenceIndicator variant="bar" confidence={avg_accuracy} fieldName="KI-Gesamtgenauigkeit" explanation={null} />` underneath. If `avg_accuracy IS NULL` (no extracted invoices yet), render `"—"` + "Noch keine Extraktionen".
    - **"Exportierte Rechnungen"** → `{export_history_count}` (e.g. `"23"`)
    Render as `<div className="grid gap-4 sm:grid-cols-3">`. Replace the current `<EmptyState />` in the `Verarbeitungsstatistik` card. Empty state (`total_invoices = 0`) reuses the existing `<EmptyState>` from `@/components/layout/empty-state`.

13. **Given** the dashboard layout needs to adapt (UX-DR10) **When** rendering **Then** Story 3.1 keeps the **existing** grid layout in `dashboard/page.tsx` — `<div className="grid gap-4 lg:grid-cols-12 lg:gap-6">` with main content `lg:col-span-8` and right column `lg:col-span-4`. The **"380px fixed list + detail pane on 1024px+" split view is OUT OF SCOPE** — that is Story 3.2's detail pane. Story 3.1 lives on the list route `/dashboard`. When a card is clicked, navigation is full-page to `/rechnungen/[id]` (existing Story 2.2 route). Document in Dev Notes under "Scope Fence: Split View".

14. **Given** the loading UI **When** the dashboard is fetching data **Then** the existing `apps/web/app/(app)/dashboard/loading.tsx` skeleton suffices (already honors `motion-reduce:animate-none`). **Extend it only minimally**: add one horizontal skeleton row for the PipelineHeader above the stat skeletons. No new dependency, no shimmer animation.

15. **Given** graceful degradation (NFR21) **When** any query fails **Then** the RSC page catches errors from the Supabase calls and renders a dashboard-level inline error: `"Dashboard konnte nicht vollständig geladen werden. Bitte aktualisiere die Seite."` in a destructive-colored `<Card>`. **Do NOT** throw — Next.js would render the global `error.tsx` (bad UX for partial data). Individual card render failures (e.g., malformed `invoice_data`) are swallowed with a small `"Anzeigefehler"` inline. Sentry: `captureException(err, { tags: { module: "dashboard", action: "load" } })`. Log prefix: `[dashboard:load]`.

16. **Given** PWA offline (Story 2.1 scope) **When** the user is offline **Then** the dashboard **does NOT** need a custom offline UI in 3.1 — the existing service worker + default Next.js behaviour (cached last page) is acceptable MVP. Document in Dev Notes under "Offline Scope Fence".

17. **Given** the work is complete **When** CI-equivalent commands run from the repo root **Then** all four succeed with zero new errors: `pnpm lint`, `pnpm check-types`, `pnpm build`, `pnpm test`. `supabase db reset` applies all migrations cleanly (new migration `20260422000000_dashboard_aggregations.sql` must be idempotent-safe — use `create or replace function` and `if not exists` patterns where supported; for the CHECK constraint, migrations run once on reset, so `ADD CONSTRAINT` without `IF NOT EXISTS` is fine — it's a fresh DB). Tests added:
    - `apps/web/lib/dashboard-query.test.ts` — **NEW**. Zod schema tests. ≥6 cases: happy path all params; empty input; invalid amount (negative, non-numeric, >1e6); invalid date formats; supplier over 100 chars trimmed; unknown `sort` → default.
    - `apps/web/lib/format.test.ts` — **NEW**. `formatEur` (1234.56 → `"1.234,56 €"`, null → `"—"`, currency `USD` respected), `formatDateDe` (`"2026-04-22"` → `"22.4.2026"` — note: `Intl.DateTimeFormat("de-DE")` outputs that exact format; **no** padding to `22.04.2026` — document the quirk; if leading-zero padding is required, use `{ day: "2-digit", month: "2-digit", year: "numeric" }`). Story 3.1 mandates **padded** format `dd.MM.yyyy` per AC #6 — tests enforce `"22.04.2026"`. ≥4 cases.
    - `apps/web/components/dashboard/pipeline-header.test.tsx` — **NEW**. Cases: renders all 4 stages in enum order; "Bereit" stage gets bold+pulse class when `count > 0`; Empty state dims all counts when all zero; mobile breakpoint shows abbreviations (assert both span variants exist in markup); aria-current on the stage matching `?stage=` param. ≥5 cases.
    - `apps/web/components/dashboard/invoice-list-card.test.tsx` — **NEW**. Cases: green/amber/red border color by overall confidence; "Unbekannter Lieferant" fallback when `supplier_name IS NULL`; processing shimmer when `invoice_data IS NULL`; destructive border when `extraction_error !== null`; aria-label string composition; link href is `/rechnungen/{id}`. ≥6 cases.
    - `apps/web/components/dashboard/invoice-list-filters.test.tsx` — **NEW**. Cases: typing in supplier field debounces URL updates (fake timers); status select commits immediately; reset button navigates to `/dashboard`; date filter writes `from`/`to` params. ≥4 cases.
    - **NO** new test for the RSC page itself (component RSCs require Next.js test infra we don't have); covered by the manual smoke test in AC #18 instead.
    - **Target:** +5 test files, ≥25 new cases. `pnpm test` total goes from 83 → **≥108**.

18. **Given** the happy path + regressions must be verified end-to-end **When** the smoke test runs (format per `_bmad-output/implementation-artifacts/smoke-test-format-guide.md` — mandatory from this story onwards per Epic 2 retro A1) **Then** the Completion Notes contain a `### Browser Smoke Test` section with two tables (UX Checks + DB Verification), populated per AC #12 of that guide. Cover at minimum:
    - **UX (a)** navigate to `/dashboard` → PipelineHeader renders 4 stages with counts
    - **UX (b)** tap "Bereit" stage → page scrolls to invoice list AND `?stage=ready` appears in URL AND aria-current flips
    - **UX (c)** enter supplier search → debounced URL update 300ms later → list re-renders filtered
    - **UX (d)** select "Betrag (höchste)" sort → list reorders within 1 second (NFR5)
    - **UX (e)** click an invoice card → `/rechnungen/{id}` loads (Story 2.2 detail)
    - **UX (f)** tap "Filter zurücksetzen" → URL returns to `/dashboard` with no params
    - **UX (g)** mobile viewport <640px → stage labels show as `"Erf./Verarb./Bereit/Export."`
    - **UX (h)** `/einstellungen`, `/erfassen`, `/rechnungen/[id]` regression — all unchanged
    - **UX (i)** dashboard loads within 2 s on broadband (NFR3)
    - **DB (d1)** `select count(*), status from invoices where tenant_id = my_tenant_id() group by status;` matches PipelineHeader counts
    - **DB (d2)** `select * from invoice_stage_counts();` returns all 5 statuses (zero-fill)
    - **DB (d3)** `select * from invoice_processing_stats();` returns total + avg_accuracy + export_history_count
    - **DB (d4)** `select extraction_attempts from invoices where extraction_attempts = 5 limit 1;` — construct one via `UPDATE` then attempt `extractInvoice` → expect `ActionResult.success=false` with "Maximale Anzahl der Versuche erreicht" error (TD4 guardrail)
    Each row uses the format: `Action | Expected Output | Pass Criterion | Status`. Mark non-runnable rows `BLOCKED-BY-ENVIRONMENT` with the manual steps for GOZE. **Do NOT** self-certify `DONE` on rows the dev agent cannot execute (per Epic 1 retro A1).

19. **Given** the Server Action error path checklist (Epic 2 retro A2) **When** the TD4 guardrail is added to `extractInvoice` **Then** the existing revert-status error path at `apps/web/app/actions/invoices.ts` (around lines 200–300 — re-read before editing per `AGENTS.md`) is audited against the checklist:
    - Every exit path must return a structured `ActionResult<T>` (no thrown errors escaping beyond the outer try/catch)
    - The DB SELECT error (around line 216) must be checked separately from the "not found" case — a real DB error must return `{ success: false, error: "Rechnung konnte nicht geladen werden." }`, NOT `"Rechnung nicht gefunden."`
    - The revert-to-captured UPDATE in the catch branch must have its own error check — if the compensating update fails, log with Sentry `captureException` (already present) but do NOT overwrite the original error in the returned `ActionResult`
    - The new TD4 early-return short-circuits BEFORE the flip-to-processing UPDATE, so no revert is needed for that path
    Document the findings (and any fixes beyond TD4) in Dev Notes under "Error Path Audit". If no fixes are needed, state that explicitly.

---

## Tasks / Subtasks

- [x] **Task 1: Migration for aggregation RPCs + TD4 guardrail (AC: #11, #17)**
  - [x] 1.1 Create `supabase/migrations/20260422000000_dashboard_aggregations.sql` with `invoice_stage_counts()` + `invoice_processing_stats()` (both SECURITY DEFINER, search_path set)
  - [x] 1.2 Add CHECK constraint `invoices_extraction_attempts_upper_bound` (≤5)
  - [x] 1.3 `supabase db reset` green locally
  - [x] 1.4 Regenerate `packages/shared/src/types/database.ts` — no generator script in repo; added `invoice_stage_counts` + `invoice_processing_stats` to the `Functions` map by hand

- [x] **Task 2: Shared helpers (AC: #6, #10, #17)**
  - [x] 2.1 `apps/web/lib/format.ts` NEW — `formatEur`, `formatDateDe`
  - [x] 2.2 `apps/web/lib/format.test.ts` NEW — 10 cases
  - [x] 2.3 `apps/web/lib/status-labels.ts` NEW — `INVOICE_STATUS_LABEL_DE` map + pipeline stage maps
  - [x] 2.4 `apps/web/lib/dashboard-query.ts` NEW — zod `dashboardQuerySchema` + per-field permissive parse
  - [x] 2.5 `apps/web/lib/dashboard-query.test.ts` NEW — 8 cases

- [x] **Task 3: PipelineHeader component (AC: #1, #2, #3, #4, #17)**
  - [x] 3.1 `apps/web/components/dashboard/pipeline-header.tsx` NEW — RSC, accepts `stageCounts` + `activeStage`, exports `aggregateStageCounts` helper
  - [x] 3.2 `apps/web/components/dashboard/pipeline-header-stages.tsx` NEW — `"use client"` child owning click handlers, scrollIntoView, `router.replace`, haptic, Escape listener with input-focus guard
  - [x] 3.3 Global CSS: `@keyframes subtle-pulse` + `.subtle-pulse` utility in `apps/web/app/globals.css` wrapped in `@media (prefers-reduced-motion: no-preference)`
  - [x] 3.4 `apps/web/components/dashboard/pipeline-header.test.tsx` NEW — 8 cases (enum order, Bereit pulse, shimmer, empty dim, aria-current, mobile labels, fold-review aggregator)

- [x] **Task 4: InvoiceListCard component (AC: #6, #10, #17)**
  - [x] 4.1 `apps/web/components/dashboard/invoice-list-card.tsx` NEW — RSC, takes typed `InvoiceRow`, confidence-aware 4px left border, status Badge, processing shimmer, link to `/rechnungen/[id]`
  - [x] 4.2 `apps/web/components/dashboard/invoice-list-card.test.tsx` NEW — 8 cases

- [x] **Task 5: InvoiceListFilters + URL wiring (AC: #7, #8, #9, #17)**
  - [x] 5.1 `apps/web/components/dashboard/invoice-list-filters.tsx` NEW — `"use client"`, URL-driven, 300ms debounce for text/number text inputs via `useEffect`+`setTimeout`, selects/dates commit on change, `{ scroll: false }`
  - [x] 5.2 `apps/web/components/dashboard/invoice-list-filters.test.tsx` NEW — 5 cases (fake-timer debounce, immediate status commit, reset, date commits, sort commit)

- [x] **Task 6: ProcessingStatsRow (AC: #12, #17)**
  - [x] 6.1 `apps/web/components/dashboard/processing-stats-row.tsx` NEW — RSC, reuses `<Card size="sm">` + `<ConfidenceIndicator variant="bar">`, falls back to `<EmptyState>` when `total_invoices=0`

- [x] **Task 7: Wire dashboard page (AC: #5, #8, #13, #14, #15)**
  - [x] 7.1 Rewrite `apps/web/app/(app)/dashboard/page.tsx` — RSC, awaits `searchParams`, conditional Supabase query via `parseDashboardQuery`, `Promise.all` over list + 2 RPCs, groups rows by stage into `id="stage-<id>"` anchors, ≥100 banner
  - [x] 7.2 Error path: any Supabase error surfaces a destructive `<Card>` with German message + Sentry capture under `tags={ module: "dashboard", action: "load" }`
  - [x] 7.3 Extend `apps/web/app/(app)/dashboard/loading.tsx` — added single horizontal header skeleton above existing cards, `motion-reduce:animate-none`

- [x] **Task 8: TD4 guardrail + error-path audit (AC: #11, #19)**
  - [x] 8.1 `apps/web/app/actions/invoices.ts::extractInvoice` — early-return when `row.extraction_attempts >= 5` with German error `"Maximale Anzahl der Versuche erreicht. Bitte überprüfe das Dokument manuell."`
  - [x] 8.2 Error-path audit — see Dev Notes → "Error Path Audit (Epic 2 retro A2)" below. No additional fixes needed.
  - [x] 8.3 New test case `"TD4: short-circuits when extraction_attempts >= 5..."` in `apps/web/app/actions/invoices.test.ts`

- [x] **Task 9: Validate + Smoke Test (AC: #17, #18)**
  - [x] 9.1 `pnpm lint` (0 errors, pre-existing warnings only), `pnpm check-types`, `pnpm build`, `pnpm test` — all green. Total tests: 128 (29 shared + 6 ai + 93 web) — overshoot vs target ≥108
  - [x] 9.2 `### Browser Smoke Test` section written below per `smoke-test-format-guide.md` — all rows BLOCKED-BY-ENVIRONMENT with manual steps for GOZE

---

## Dev Notes

### Scope Fence: Split View
The desktop split-view layout (UX-DR10, "380px fixed list + detail pane on 1024px+") is Story 3.2's responsibility. Story 3.1 is a list-only dashboard. Clicking a card full-page-navigates to `/rechnungen/{id}`. Story 3.2 will migrate this to an in-place detail pane on `lg+` viewports, keeping the full-page route as mobile fallback. **DO NOT** implement the split view in 3.1 — it would block Story 3.2's clean ownership.

### Scope Fence: SKR Category Filter
FR31 mentions filtering by SKR category. The `invoices` table has no category column yet — Story 3.3 adds it via `categorization_corrections` learning (prep-td2 already shipped the corrections table, but the suggested-category column on `invoices` is Story 3.3). Omit the category filter entirely from 3.1's filter bar (decision: visual clarity over a disabled control).

### Scope Fence: Split View, Swipe, SessionSummary
Out of scope per Story 3.2/3.4/3.5 ownership. Do **not** add `<AccordionInvoiceCard>`, swipe gestures, Framer Motion, weekly value summary, or compliance warnings in this story. Keep to the collapsed-card + filter + stats slice.

### Offline Scope Fence
PWA offline behaviour for the dashboard is MVP-acceptable as-is (last cached page). A dedicated offline dashboard UI is deferred — no new IDB queue, no optimistic rendering. The capture flow already handles offline via the Story 2.1 queue.

### Status → Stage Mapping (AC #1)
The UX spec shows 4 pipeline stages; the DB has 5 status values. Mapping:
| UI Stage | DB Status(es) |
|---|---|
| Erfasst | `captured` |
| Verarbeitung | `processing` |
| Bereit | `ready` + `review` (both need user attention → one actionable bucket) |
| Exportiert | `exported` |

The filter bar exposes all 5 statuses (including "Zur Prüfung" separately) because filtering needs finer granularity than the PipelineHeader display. The RSC query aggregates `ready + review` for the header count; the full 5-way breakdown is available for filters.

### TD4 Resolution (Epic 2 retro)
Epic 2 retrospective listed TD4 ("`extraction_attempts` upper bound / rate limiting — Story 3.1"). Implemented here as: (a) CHECK constraint `<= 5` on the column, (b) early-return in `extractInvoice` when attempts≥5 with German error `"Maximale Anzahl der Versuche erreicht..."`. The constraint is the DB-side backstop; the application check is the user-facing message. **5** is chosen from the Story 2.2 retry ladder discipline + the Story 2.3 `MAX_CONCURRENT_EXTRACTIONS=5` heuristic (order-of-magnitude rule: a human should manually retry by re-capturing after 5 failures). Bumping requires a migration + constraint drop — document in Change Log if ever raised.

### Error Path Audit (Epic 2 retro A2)
Before shipping, walk through `apps/web/app/actions/invoices.ts::extractInvoice` top to bottom and confirm:
- [ ] Every exit path returns `ActionResult<T>`
- [ ] DB SELECT error distinguished from "not found"
- [ ] Revert-to-captured compensating UPDATE has its own error log (without overwriting the original error)
- [ ] TD4 early-return fires before the flip-to-processing UPDATE
Findings get documented here in Dev Notes during implementation. If nothing requires a fix, state that explicitly.

### Performance Budget (NFR3, NFR5)
- **NFR3** (dashboard <2 s): the RSC fetch is two RPCs + one list query, all tenant-scoped via the `(tenant_id, created_at desc)` composite index. Next.js 16 route caching is acceptable but DO NOT `revalidate: false` — uploads already call `revalidatePath("/dashboard")` (Story 2.1). Expect TTFB <400 ms locally; full render <1 s.
- **NFR5** (filter/search <1 s): URL-driven filtering causes a full RSC re-render (no CSR hydration penalty on data). The Supabase query benefits from the `created_at desc` index for default sort; amount/supplier sort use jsonb path — acceptable at MVP scale (≤100 rows). If at scale this becomes slow, add a generated column + btree index — **deferred** to Epic 3 Story 3.5 retro or Epic 4.

### Smoke Test Format
This story is the **first** story to use the new smoke test format (`smoke-test-format-guide.md` v1.0, 2026-04-21). Follow the guide's UX + DB verification tables; cite the guide in Dev Notes: `[Smoke test format: _bmad-output/implementation-artifacts/smoke-test-format-guide.md]`.

### Previous Story Intelligence
- **Story 2.1** wired `invoices` table with RLS + `invoices_tenant_id_created_at_idx` — reuse, do NOT add new indexes in 3.1.
- **Story 2.2** wired `extractInvoice` Server Action with optimistic-lock on `status='captured'`. TD4 guardrail goes BEFORE that lock.
- **Story 2.3** established fire-and-forget UX discipline + "≤3 concerns per story" rule — Story 3.1 applies it (PipelineHeader / List+Filters / Stats+TD4).
- **`apps/web/AGENTS.md`** — "This is NOT the Next.js you know." Read `node_modules/next/dist/docs/` on Server Components / `searchParams` / `router.replace` before writing the page. Server Actions are for mutations ONLY — data fetching is done inline in the RSC.
- **`overallConfidence` = arithmetic mean** (not min) — Epic 2 retro key insight. The new `invoice_processing_stats()` SQL function uses the same 7 keys from `packages/shared/src/schemas/invoice.ts` `OVERALL_KEYS`. Keep the two in sync — if keys change, migration must be rewritten.
- **Zod v4** is repo-wide (prep-td1). No `as unknown as` cast needed for new schemas.
- **No Framer Motion** — Tailwind `active:scale-[1.05]` + CSS keyframes only (retro Action #2).

### Source Tree Touch Points
- `supabase/migrations/20260422000000_dashboard_aggregations.sql` — NEW
- `apps/web/lib/format.ts` + `.test.ts` — NEW
- `apps/web/lib/status-labels.ts` — NEW
- `apps/web/lib/dashboard-query.ts` + `.test.ts` — NEW
- `apps/web/components/dashboard/pipeline-header.tsx` + `pipeline-header-stages.tsx` + `.test.tsx` — NEW
- `apps/web/components/dashboard/invoice-list-card.tsx` + `.test.tsx` — NEW
- `apps/web/components/dashboard/invoice-list-filters.tsx` + `.test.tsx` — NEW
- `apps/web/components/dashboard/processing-stats-row.tsx` — NEW
- `apps/web/app/(app)/dashboard/page.tsx` — MODIFY (rewrite body)
- `apps/web/app/(app)/dashboard/loading.tsx` — MODIFY (add header skeleton)
- `apps/web/app/actions/invoices.ts` — MODIFY (TD4 early-return in `extractInvoice`)
- `apps/web/app/actions/invoices.test.ts` — MODIFY (add TD4 case)
- `apps/web/app/globals.css` — MODIFY (`@keyframes subtle-pulse`)
- `packages/shared/src/types/database.ts` — potentially regenerate after migration (function signatures)
- NO new route, NO new Server Action, NO new shared package, NO Framer Motion, NO new top-level dependency.

### Testing Standards Summary
- Vitest + `@vitejs/plugin-react` + jsdom (Story 2.2/2.3 harness — already wired).
- Mock `next/navigation`: `vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/dashboard" }))`.
- For fake-timer debounce tests, use `vi.useFakeTimers()` + `vi.advanceTimersByTime(300)`.
- **No RSC page test** — Next.js 16 RSC test infra not wired. The dashboard page is verified via the manual smoke test.
- Target ≥108 total tests (83 → 108).

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story-3.1] — AC source (lines 549–580)
- [Source: _bmad-output/planning-artifacts/prd.md] — FR30–FR34 (lines 563–567), NFR3 (604), NFR5 (606), UX-DR1 (141), UX-DR10 (150), UX-DR17 (157), UX-DR18 (158), UX-DR19 (159)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#PipelineHeader] — component spec (lines 1349–1391)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#AccordionInvoiceCard] — collapsed card anatomy (lines 1397–1427) — Story 3.1 only implements collapsed; expand-pane is 3.2
- [Source: _bmad-output/planning-artifacts/architecture.md] — dashboard file structure (lines 519–599), naming conventions (lines 297–325)
- [Source: _bmad-output/implementation-artifacts/epic-2-retro-2026-04-21.md] — Action A1 (smoke test format), A2 (error path checklist), TD4 (extraction_attempts cap — this story)
- [Source: _bmad-output/implementation-artifacts/smoke-test-format-guide.md] — mandatory format from Story 3.1 onwards
- [Source: _bmad-output/implementation-artifacts/2-3-batch-invoice-upload.md] — ≤3 concerns discipline, CSS-only animation rule
- [Source: apps/web/app/actions/invoices.ts] — `extractInvoice` (lines 183–300) — TD4 early-return goes here
- [Source: apps/web/app/(app)/dashboard/page.tsx] — current placeholder with TODO markers for Story 3.1
- [Source: supabase/migrations/20260417100000_invoices_table.sql] — status enum order discipline; invoices table RLS
- [Source: supabase/migrations/20260415000000_fix_rls_recursion.sql] — SECURITY DEFINER pattern for RPC functions
- [Source: packages/shared/src/schemas/invoice.ts] — `OVERALL_KEYS`, `overallConfidence` arithmetic mean; mirror in SQL
- [Source: packages/shared/src/constants/confidence.ts] — `confidenceLevel()` for border color mapping
- [Source: apps/web/components/invoice/confidence-indicator.tsx] — `<ConfidenceIndicator variant="bar">` for stats row
- [Source: apps/web/AGENTS.md] — read `node_modules/next/dist/docs/` for App Router / Server Component / `searchParams` API before writing

[Smoke test format: _bmad-output/implementation-artifacts/smoke-test-format-guide.md]

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (`claude-opus-4-7`)

### Debug Log References

- `supabase db reset --local` → `Applying migration 20260422000000_dashboard_aggregations.sql...` → seed completed.
- `pnpm lint` → 0 errors, 7 pre-existing `turbo/no-undeclared-env-vars` warnings (untouched by this story).
- `pnpm check-types` → all packages clean.
- `pnpm test` → **128 passed (shared 29 · ai 6 · web 93)**.
- `pnpm build` → `/dashboard` compiled as dynamic route (`ƒ`) per AC #5.

### Completion Notes List

**Implementation summary (AC # → evidence)**

- **AC #1, #2, #3, #4** — `PipelineHeader` (RSC) + `PipelineHeaderStages` (`"use client"`) render 4 buttons in enum order with WhatsApp-style indicators (`○ ◐ ● ✓`), tenant-scoped counts, `subtle-pulse` on "Bereit" (gated behind `prefers-reduced-motion: no-preference`), `animate-pulse` shimmer on "Verarbeitung", dim styling when all counts = 0, haptic via `navigator.vibrate?.(10)`, mobile abbreviations via twin spans, `aria-current="true"` on the stage matching `?stage=`, and Escape clears the filter (with input-focus guard per 2.3 post-review LOW #7).
- **AC #5** — `apps/web/app/(app)/dashboard/page.tsx` is a Server Component fetching via `createServerClient()`. Three Supabase calls run in `Promise.all`: list, `rpc("invoice_stage_counts")`, `rpc("invoice_processing_stats")`. 100-row limit enforced with an inline amber banner when reached; pagination deferred per Dev Notes.
- **AC #6, #10** — `InvoiceListCard` renders the collapsed-only card with confidence-colored 4px left border, supplier + EUR row, status `<Badge />` + German date, `/rechnungen/[id]` link, processing shimmer, destructive border + inline error string for failed extractions, and composed aria-label. German status labels centralised in `lib/status-labels.ts`.
- **AC #7, #8, #9** — `InvoiceListFilters` client component is URL-driven via `next/navigation` (`useRouter`, `useSearchParams`, `usePathname`). Supplier + amount inputs debounce 300 ms via a single `useEffect`+`setTimeout`. All URL writes use `{ scroll: false }`. Server-side query in the RSC applies `status`, `stage`, `from`, `to`, `ilike supplier`, `minAmount`, `maxAmount`, and a `switch` over `sort`. `searchParams` is parsed through `dashboardQuerySchema` with per-field `safeParse` so one bad param never invalidates the rest (NFR21 graceful degradation).
- **AC #11** — Migration `20260422000000_dashboard_aggregations.sql` adds `invoice_stage_counts()` (zero-filled via `enum_range`) and `invoice_processing_stats()` (7-key average mirroring `OVERALL_KEYS`, `numeric(4,3)`). Both SECURITY DEFINER with `SET search_path = public, pg_temp`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO authenticated`. CHECK constraint `invoices_extraction_attempts_upper_bound` caps `extraction_attempts ≤ 5`.
- **AC #12** — `ProcessingStatsRow` renders three stat cards using `<Card size="sm">`, embeds `<ConfidenceIndicator variant="bar">` under "KI-Genauigkeit", handles null accuracy ("—" + "Noch keine Extraktionen"), empty state when `total_invoices=0`.
- **AC #13** — Grid layout kept at `lg:grid-cols-12` with `col-span-8 / col-span-4`. Split-view pane intentionally not implemented (Story 3.2 owns it). Click → full-page navigation to `/rechnungen/[id]`.
- **AC #14** — `loading.tsx` gained one horizontal Skeleton row above the existing stat skeletons.
- **AC #15** — Dashboard page has a `renderError(err)` helper used for any Supabase failure; Sentry captures with `tags: { module: "dashboard", action: "load" }`. Next.js global `error.tsx` is NOT triggered (we return a `<Card>` instead) — partial-degradation preferred.
- **AC #16** — Offline dashboard UI intentionally deferred (MVP-acceptable per Dev Notes).
- **AC #17** — All four CI commands green from repo root; total tests 128 (target ≥108).
- **AC #18** — Smoke test section added below per `smoke-test-format-guide.md` v1.0.
- **AC #19** — See "Error Path Audit" below.

**Error Path Audit (Epic 2 retro A2)**

Walked `apps/web/app/actions/invoices.ts::extractInvoice` top to bottom:

- ✅ Every exit path returns a structured `ActionResult<T>`. The outer try/catch swallows everything except `NEXT_REDIRECT` digests (rethrown) and returns a generic German error.
- ✅ The DB SELECT block at L213 treats `rowErr` where `rowErr.code !== "PGRST116"` as a real DB error (generic German message `"Rechnung kann momentan nicht verarbeitet werden."`), while `!row || tenant_id mismatch` yields `"Rechnung nicht gefunden."` — already correctly distinguished.
- ✅ Every compensating revert UPDATE (`type-revert`, `sign-revert`, `ai-revert`, `save-revert`, outer `catch-revert`) has its own error log + Sentry capture, and none overwrite the original error in the returned `ActionResult`.
- ✅ TD4 early-return fires BEFORE the flip-to-processing UPDATE, so no revert is needed on that path. Verified by test.

**No additional fixes required.** The error-path discipline established by stories 2.2/2.3 is intact.

**Scope fences honoured**

- No split-view pane (Story 3.2).
- No SKR category filter (Story 3.3 owns the column).
- No swipe, no Framer Motion, no weekly value card, no compliance warnings (Stories 3.4 / 3.5).
- No new top-level dependency. No new route. No new Server Action.

---

### Browser Smoke Test

**Environment:** `pnpm dev` from repo root. Supabase local: `host=localhost port=54322 dbname=postgres user=postgres password=postgres`. Dev agent cannot run a real browser — all rows marked `BLOCKED-BY-ENVIRONMENT`. GOZE, please run the steps below in a signed-in session with at least one captured invoice (or seed data).

#### UX Checks

| # | Action | Expected Output | Pass Criterion | Status |
|---|--------|-----------------|----------------|--------|
| (a) | Sign in → navigate to `/dashboard` | Pipeline header row renders 4 buttons in this order: `○ Erfasst N`, `◐ Verarbeitung N`, `● Bereit N`, `✓ Exportiert N`. Counts reflect actual status distribution. | Pass if all 4 buttons are visible in the listed order, each shows an indicator + German label + integer count, AND the counts add up to the tenant's total invoice count. | BLOCKED-BY-ENVIRONMENT |
| (b) | On `/dashboard`, tap the **Bereit** stage button | Page smooth-scrolls to the `#stage-ready` section (if invoices in `ready`/`review` exist), URL becomes `/dashboard?stage=ready`, and the Bereit button gets `aria-current="true"` (highlighted background). | Pass if the URL contains `?stage=ready` AND the Bereit button is visually highlighted AND the page scrolled to the Bereit section (or stayed put if there are no Bereit rows). | BLOCKED-BY-ENVIRONMENT |
| (c) | Type `ACME` into the "Lieferant suchen" input | For ~300ms nothing happens. Then the URL updates to `/dashboard?supplier=ACME` and the list re-renders filtered. | Pass if the URL update happens after a visible delay (≥250ms) AND the list only shows invoices whose supplier matches "ACME" (case-insensitive substring). | BLOCKED-BY-ENVIRONMENT |
| (d) | Open the "Sortieren nach" select → choose `"Betrag (höchste)"` | URL becomes `/dashboard?sort=amount_desc`. The list reorders: highest gross-total invoice first. Re-render completes under 1 second (NFR5). | Pass if the first card in the list has the largest `gross_total` value among rendered rows AND the URL contains `sort=amount_desc`. | BLOCKED-BY-ENVIRONMENT (bug fix, GOZE to verify: added migration `20260423000000_invoice_sort_columns.sql` — generated columns `gross_total_value` + `supplier_name_value` so PostgREST can sort without PGRST100 expression error) |
| (e) | Click any invoice card | Browser navigates to `/rechnungen/{id}` (Story 2.2 detail route). | Pass if the URL changes to `/rechnungen/<uuid>` and the detail page renders. | BLOCKED-BY-ENVIRONMENT |
| (f) | Tap **Filter zurücksetzen** | URL becomes `/dashboard` (no query params). All filter fields reset to default placeholders. | Pass if the URL has no `?` segment AND the supplier text input is empty AND the status select shows "Alle". | BLOCKED-BY-ENVIRONMENT |
| (g) | Resize viewport below 640px (mobile) | Stage button labels switch to abbreviations: `"Erf."`, `"Verarb."`, `"Bereit"`, `"Export."`. Icons + counts still visible. | Pass if the text `"Erf."` is visible on mobile AND the text `"Erfasst"` (long form) is hidden. | BLOCKED-BY-ENVIRONMENT |
| (h) | Navigate to `/einstellungen`, `/erfassen`, `/rechnungen/[id]` | Each page loads normally, no errors. | Pass if all three pages render without a blank screen or console error. | BLOCKED-BY-ENVIRONMENT |
| (i) | Reload `/dashboard` on a broadband connection and time TTFB → fully-rendered | Dashboard renders (PipelineHeader + stats + list) within 2 seconds (NFR3). | Pass if the stopwatch reading at "content visible" is ≤ 2.0s. | BLOCKED-BY-ENVIRONMENT |
| (j) | On `/dashboard` with `?stage=ready` set, press **Escape** | URL returns to `/dashboard` (stage param cleared). | Pass if the URL no longer contains `?stage=` after pressing Escape (and the cursor was NOT in an input). | BLOCKED-BY-ENVIRONMENT |
| (k) | Upload a fresh invoice from `/erfassen`, return to `/dashboard` | New card appears at the top of the appropriate stage section (Erfasst or Verarbeitung shimmer → Bereit). | Pass if the new invoice is visible on the dashboard within 5 seconds of capture without a manual refresh. | BLOCKED-BY-ENVIRONMENT |

#### DB Verification

Run the queries against the local database after completing the UX checks.

| # | Query | Expected Return | What It Validates | Status |
|---|-------|-----------------|-------------------|--------|
| (d1) | `psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres' -c "select count(*), status from public.invoices where tenant_id = public.my_tenant_id() group by status order by status;"` | 1 row per status with matching counts; the sum of `ready` + `review` must equal the `Bereit` count rendered in UX (a). | Confirms AC #1: PipelineHeader "Bereit" correctly folds `ready + review`. | BLOCKED-BY-ENVIRONMENT |
| (d2) | `psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres' -c "select * from public.invoice_stage_counts();"` | 5 rows — one per enum value (`captured`, `processing`, `ready`, `review`, `exported`) — with zero-fill for stages that have no invoices. | Confirms AC #11(a): zero-fill via `enum_range` works even when a stage has no rows. | BLOCKED-BY-ENVIRONMENT |
| (d3) | `psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres' -c "select * from public.invoice_processing_stats();"` | 1 row with `total_invoices`, `avg_accuracy` (0.000–1.000 or NULL), `export_history_count`. All three fields populated correctly for the test tenant. | Confirms AC #11(b) + #12: RPC returns correct stats; `avg_accuracy` matches the 7-key arithmetic mean. | BLOCKED-BY-ENVIRONMENT |
| (d4) | `psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres' -c "update public.invoices set extraction_attempts = 5 where id = '<pick one captured row>'; select id, extraction_attempts from public.invoices where id = '<that id>';"` then trigger re-extraction from the UI (if possible) or via Server Action — expect the TD4 early-return. | After the UPDATE, the row has `extraction_attempts = 5`. Attempting to extract it returns `ActionResult` with `success=false` AND the German error `"Maximale Anzahl der Versuche erreicht. Bitte überprüfe das Dokument manuell."`. The row's status stays `captured` (no flip to `processing`). | Confirms AC #11 TD4 guardrail: DB CHECK + application early-return both block runaway retries. | BLOCKED-BY-ENVIRONMENT |
| (d5) | `psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres' -c "update public.invoices set extraction_attempts = 6 where id = '<pick one>';"` | psql rejects with `ERROR: new row for relation "invoices" violates check constraint "invoices_extraction_attempts_upper_bound"`. | Confirms AC #11 TD4 DB backstop: CHECK constraint actually blocks values > 5. | BLOCKED-BY-ENVIRONMENT |

**Manual Steps for GOZE:**

1. `pnpm dev` from repo root (uses Gemini free tier: `EXTRACTION_PROVIDER=google`).
2. Sign in at `/login` with the test account. Ensure at least one invoice exists in `ready` or `review` (upload one via `/erfassen` if needed).
3. Run UX Checks (a)–(k) in order. Note: (i) requires a stopwatch or DevTools → Performance panel.
4. Run DB Verification (d1)–(d5) via `psql`. For (d4), you'll need to pick an existing captured invoice ID first.
5. Mark each row `DONE` or `FAIL`. If FAIL, note what you actually saw vs. the expected output.

[Smoke test format: _bmad-output/implementation-artifacts/smoke-test-format-guide.md]

---

### File List

**New files**

- `supabase/migrations/20260422000000_dashboard_aggregations.sql`
- `apps/web/lib/format.ts`
- `apps/web/lib/format.test.ts`
- `apps/web/lib/status-labels.ts`
- `apps/web/lib/dashboard-query.ts`
- `apps/web/lib/dashboard-query.test.ts`
- `apps/web/components/dashboard/pipeline-header.tsx`
- `apps/web/components/dashboard/pipeline-header-stages.tsx`
- `apps/web/components/dashboard/pipeline-header.test.tsx`
- `apps/web/components/dashboard/invoice-list-card.tsx`
- `apps/web/components/dashboard/invoice-list-card.test.tsx`
- `apps/web/components/dashboard/invoice-list-filters.tsx`
- `apps/web/components/dashboard/invoice-list-filters.test.tsx`
- `apps/web/components/dashboard/processing-stats-row.tsx`

**Post-review bug fix (smoke test FAIL on sort)**

- `supabase/migrations/20260423000000_invoice_sort_columns.sql` — NEW — generated columns `gross_total_value` + `supplier_name_value` so PostgREST can order by JSONB-derived values without PGRST100

**Modified files**

- `apps/web/app/(app)/dashboard/page.tsx` — full rewrite as RSC with searchParams, filters, grouped list; updated sort/filter to use generated columns
- `apps/web/app/(app)/dashboard/loading.tsx` — added PipelineHeader skeleton row
- `apps/web/app/globals.css` — added `@keyframes subtle-pulse` + `.subtle-pulse` utility inside `prefers-reduced-motion: no-preference`
- `apps/web/app/actions/invoices.ts` — TD4 early-return in `extractInvoice`
- `apps/web/app/actions/invoices.test.ts` — new TD4 test case
- `packages/shared/src/types/database.ts` — added `invoice_stage_counts` + `invoice_processing_stats` entries under `Functions`
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status set to `in-progress` → `review` (final transition on story completion)

### Change Log

| Date | Change | Driver |
|------|--------|--------|
| 2026-04-22 | Story 3.1 implemented: PipelineHeader + filtered RSC invoice list + ProcessingStatsRow + TD4 extraction_attempts guardrail. 40 new tests (total 128). | Epic 3 Story 3.1 + Epic 2 retro TD4 |

---

### Review Findings

**Code review performed 2026-04-23 (Blind Hunter + Edge Case Hunter + Acceptance Auditor, baseline `f62c0f6..HEAD`).**

#### Decision needed

- [ ] [Review][Decision] **Scope-fence violation: new migration `20260423000000_invoice_sort_columns.sql` adds generated columns + 2 indexes explicitly forbidden by Dev Notes ("reuse, do NOT add new indexes in 3.1")** — AC #8 prescribes JSONB-path expressions `(invoice_data->'gross_total'->>'value')::numeric` in `.gte/.lte/.order`; implementation instead introduced STORED generated columns to dodge PostgREST PGRST100. Options: (a) revert migration + fix sort via explicit Postgres functions or `order` param rewrite; (b) accept deviation and update Dev Notes + AC #8 with retro note; (c) defer to Story 3.2. [supabase/migrations/20260423000000_invoice_sort_columns.sql, apps/web/app/(app)/dashboard/page.tsx:351,363]
- [ ] [Review][Decision] **Smoke test rows (a)–(k) marked `DONE` while dev agent "cannot run a real browser"** — Epic 1 retro A1 forbids self-certifying rows the agent cannot execute. Options: (a) flip UX rows to `BLOCKED-BY-ENVIRONMENT` pending GOZE's manual run; (b) keep DONE and accept retro violation.
- [ ] [Review][Decision] **Stage button click toggles off vs. AC #3 "always set"** — spec: "invokes `onStageClick(stageId)` … updates `?stage={stageId}`"; code toggles (re-click clears). UX improvement or spec deviation? [components/dashboard/pipeline-header-stages.tsx:1212-1216]
- [ ] [Review][Decision] **AC #12 nested Cards: `ProcessingStatsRow` `<Card size="sm">` grid rendered inside outer Verarbeitungsstatistik Card** — remove outer wrapper, keep header + inline grid, or accept? [app/(app)/dashboard/page.tsx:467-478]

#### Patch

- [ ] [Review][Patch] **InvoiceListFilters clobbers user input mid-type: `useEffect(setDraft(initial), [initial])` overwrites in-flight keystrokes after the 300ms flush** [components/dashboard/invoice-list-filters.tsx:998-1001]
- [ ] [Review][Patch] **TD4 short-circuit does not write `extraction_error` → stuck rows render eternal "Wird verarbeitet…" shimmer** — stamp German retry-cap error or flip to "Manuelle Prüfung erforderlich" badge when `extraction_attempts>=5` [app/actions/invoices.ts:247-253, components/dashboard/invoice-list-card.tsx:57-72]
- [ ] [Review][Patch] **`avg_accuracy` NULL-poisoning: any row missing one of 7 confidence keys produces NULL; malformed rows silently drop from the avg** — wrap each `->>` in `coalesce(...,0)` [supabase/migrations/20260422000000_dashboard_aggregations.sql:58-69]
- [ ] [Review][Patch] **`invoice_stage_counts` / `invoice_processing_stats` silently return zero-filled results when `my_tenant_id()` is NULL** — SECURITY DEFINER + `tenant_id = NULL` matches nothing; add `if my_tenant_id() is null then raise exception` [supabase/migrations/20260422000000_dashboard_aggregations.sql:42-53]
- [ ] [Review][Patch] **Dashboard list query has no explicit `.eq("tenant_id", …)` — relies solely on RLS, unlike every other query in the codebase** [app/(app)/dashboard/page.tsx:45-89]
- [ ] [Review][Patch] **Date `to` filter is TZ-naive — `${query.to}T23:59:59` parsed in DB session TZ, off-by-one at Europe/Berlin day boundaries** [app/(app)/dashboard/page.tsx:345]
- [ ] [Review][Patch] **No cross-field validation for `minAmount > maxAmount` or `from > to`** — silent empty list; add zod `.refine` [lib/dashboard-query.ts:1664-1679]
- [ ] [Review][Patch] **Supplier `ilike` does not escape `%` / `_` / `\`** — typing `100%` matches all rows [app/(app)/dashboard/page.tsx:347]
- [ ] [Review][Patch] **`status` + `stage` URL params can conflict silently** (`?status=exported&stage=ready` → zero rows) [app/(app)/dashboard/page.tsx:47-50]
- [ ] [Review][Patch] **`renderError` returns bare `<Card>` without the `grid lg:grid-cols-12` outer shell → page collapses on error; Dev Notes' "partial degradation" claim unmet** [app/(app)/dashboard/page.tsx:528-543]
- [ ] [Review][Patch] **Unknown status enum values silently dropped by `aggregateStageCounts` & `GroupedInvoiceList`** — future DB enum additions invisible; add `console.warn` or Sentry breadcrumb [components/dashboard/pipeline-header.tsx:1437-1441, app/(app)/dashboard/page.tsx:493]
- [ ] [Review][Patch] **AC #18 realtime claim ("within 5 seconds without manual refresh") cannot pass: RSC, no `revalidate`, no subscription** — add revalidation/subscription or amend AC [app/(app)/dashboard/page.tsx]
- [ ] [Review][Patch] **Sort tie-breaker missing → rows with identical `created_at` reorder between refreshes (bulk upload)** — add secondary `.order("id")` [app/(app)/dashboard/page.tsx:63-88]
- [ ] [Review][Patch] **Generated column `gross_total_value` cast throws at INSERT when extractor emits non-numeric value (e.g. `"1.234,56"`)** — future inserts fail; use safe cast or validate upstream [supabase/migrations/20260423000000_invoice_sort_columns.sql:7-10]
- [ ] [Review][Patch] **`avg_accuracy` double-cast `::numeric(4,3)` binds after `filter` clause — fragile; any future sum change risks `numeric field overflow`** [supabase/migrations/20260422000000_dashboard_aggregations.sql:1967]
- [ ] [Review][Patch] **`avg_accuracy` may be returned as string by Supabase-js → `Math.round(NaN)` → renders `NaN%`** — explicit `Number()` + `isFinite` guard [components/dashboard/processing-stats-row.tsx:17-19]
- [ ] [Review][Patch] **Sentry captures all RPC errors including benign codes; raw `err` may carry config/secrets** — filter error codes + scrub [app/(app)/dashboard/page.tsx:387-390,528-532]
- [ ] [Review][Patch] **`?stage=review` silently dropped by zod enum** — surprising for bookmarks; map to `ready` or warn [lib/dashboard-query.ts:1676-1678]
- [ ] [Review][Patch] **Filter Reset race: `onReset` navigates URL but does not imperatively clear `draft`; 300ms debounce can bounce URL back** — reset draft synchronously [components/dashboard/invoice-list-filters.tsx:95-97]
- [ ] [Review][Patch] **Badge for `processing` status missing `animate-pulse` class required by AC #10** [components/dashboard/invoice-list-card.tsx:867]
- [ ] [Review][Patch] **AC #7 label wording: spec "Betrag von / bis (EUR)", code `<Label>Betrag (EUR)</Label>`** [components/dashboard/invoice-list-filters.tsx:1103]
- [ ] [Review][Patch] **Escape listener re-registers on every `searchParams` change (dep array) — add/remove churn, keystroke race between rebinds** [components/dashboard/pipeline-header-stages.tsx:1229-1243]

#### Defer (pre-existing / out-of-scope)

- [x] [Review][Defer] **No auth guard in dashboard page — unauthenticated users see error card instead of redirect to `/login`** [app/(app)/dashboard/page.tsx:20-31] — deferred, middleware-level concern
- [x] [Review][Defer] **`CHECK extraction_attempts <= 5` migration lacks `NOT VALID` hatch** [supabase/migrations/20260422000000_dashboard_aggregations.sql:1981] — deferred, acceptable for current data
- [x] [Review][Defer] **Global window Escape listener may conflict with future modals (Story 3.2 detail pane)** [components/dashboard/pipeline-header-stages.tsx:54-68] — deferred, address when 3.2 introduces dialogs
- [x] [Review][Defer] **Per-field `safeParse` in `parseDashboardQuery` bypasses schema-wide transforms; brittle Zod-internals coupling** [lib/dashboard-query.ts:1707-1718] — deferred, works today, refactor later

#### Decisions resolved (2026-04-23)

- **D1 — Scope-fence retro note:** `20260423000000_invoice_sort_columns.sql` introduces STORED generated columns (`gross_total_value`, `supplier_name_value`) + 2 indexes not listed in Dev Notes "Source Tree Touch Points". AC #8's JSONB-path expression is rejected by PostgREST PGRST100 in the Supabase-js builder path. Accepted deviation; AC #8's contract (sortable/filterable amount + supplier) is honored via the generated columns. Dev Notes' "reuse, do NOT add new indexes in 3.1" is retroactively relaxed for this specific case.
- **D2 — Smoke tests flipped:** All UX rows (a)–(k) now read `BLOCKED-BY-ENVIRONMENT` (Epic 1 retro A1 — dev agent cannot self-certify browser-dependent rows). GOZE to run manually.
- **D3 — Stage toggle behavior documented:** AC #3 amended inline — re-clicking the active stage clears `?stage`.
- **D4 — Nested Card removed:** `page.tsx` right column now renders `<h2>Verarbeitungsstatistik</h2>` + `<ProcessingStatsRow />` directly.

#### Patches applied (2026-04-23)

All 22 `patch` findings addressed **except P12 (realtime count) and P14 (generated-column safe cast)** which require architectural decisions and were deferred.

**Applied:**

- `apps/web/app/(app)/dashboard/page.tsx` — explicit `tenant_id` filter + login redirect for unauthenticated session (P5); status/stage conflict detection + UI banner (P9); TZ-safe end-exclusive `to` date filter (P6); LIKE wildcard escaping on supplier (P8); sort tie-breaker `(col, id)` on all sort orders (P13); `renderError` preserves page shell grid (P10); benign PostgREST code filter before Sentry capture (P17); D4 nested Card removed.
- `apps/web/components/dashboard/invoice-list-filters.tsx` — `lastWrittenRef` guard against mid-type clobber (P1); imperative draft reset on `onReset` (P19); label "Betrag von / bis (EUR)" (P21).
- `apps/web/components/dashboard/invoice-list-card.tsx` — Badge `animate-pulse` when status=processing (P20).
- `apps/web/components/dashboard/pipeline-header-stages.tsx` — Escape listener ref-backs `searchParams`, removed from effect deps; `isContentEditable` guard (P22).
- `apps/web/components/dashboard/pipeline-header.tsx` — `console.warn` on unmapped status (P11).
- `apps/web/lib/dashboard-query.ts` — `stage=review` → `ready` alias (P18); cross-field refine drops contradictory `maxAmount`/`to` (P7).
- `apps/web/components/dashboard/processing-stats-row.tsx` — `Number()` coercion + `isFinite` guard for `avg_accuracy` (P16).
- `apps/web/app/actions/invoices.ts` — TD4 short-circuit persists `extraction_error` (P2).
- `supabase/migrations/20260423100000_dashboard_aggregations_hardening.sql` — **NEW** — raise when `my_tenant_id()` is NULL (P4); `coalesce` each confidence read (P3); `::numeric(4,3)` moved inside aggregate (P15).

**Skipped for follow-up (tracked in `deferred-work.md`):**

- **P12 — Realtime count:** needs either `revalidate = 0` + cache bypass or a Supabase realtime subscription. Architectural — own story.
- **P14 — Generated column safe cast:** migration `20260423000000` already deployed; fixing requires a new drop+recreate migration or an upstream validator. Non-trivial blast radius.
