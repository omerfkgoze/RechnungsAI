# Story 3.4: Swipe-to-Approve and Confidence-Based Review Queue

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to quickly approve high-confidence invoices with a swipe and focus my attention on ones that need review,
So that I can process a batch of invoices in minutes instead of hours.

---

## Technical Concerns (≤3, per Epic 1 retro Action #2)

1. **Approval state model + Server Actions (FR + epic 4.2 audit prep)** — The `invoice_status` enum (`captured | processing | ready | review | exported`) does NOT change in Story 3.4. Approval is tracked via three NEW columns on `invoices`: `approved_at timestamptz null`, `approved_by uuid null` (FK `users.id`, ON DELETE SET NULL), `approval_method text null` (CHECK `IN ('swipe','button','keyboard','undo_revert')`). Two new Server Actions in `apps/web/app/actions/invoices.ts` follow the established `auth + tenant + row + status + transition` pattern: `approveInvoice({ invoiceId, method })` flips `review → ready` (or stamps an already-`ready` row), sets `approved_at = now()`, `approved_by = auth.uid()`, `approval_method`; rejects `captured | processing | exported`. `flagInvoice({ invoiceId, method })` flips `ready → review`, clears `approved_at`/`approved_by`/`approval_method`; rejects other statuses. `undoInvoiceAction({ invoiceId, previousStatus, previousApproval })` reverses the most recent state — caller passes the snapshot it took just before the action so the server doesn't have to mine an audit table (Epic 4.2 will add the durable `audit_logs`; until then, undo lives in client memory bounded by the 5-second toast TTL). All three return `ActionResult<{ status: InvoiceStatus }>`. Log prefixes `[invoices:approve]`, `[invoices:flag]`, `[invoices:undo]`. `revalidatePath("/dashboard")` and `revalidatePath(\`/rechnungen/${invoiceId}\`)` on success.

2. **Swipe gesture wrapper + action buttons (UX-DR2, UX-DR11)** — A NEW client component `<SwipeActionWrapper />` at `apps/web/components/invoice/swipe-action-wrapper.tsx` wraps the existing `<InvoiceListCard />` in the dashboard list and the `<InvoiceDetailPane />` header on mobile. It uses **native Pointer Events** (`pointerdown`/`pointermove`/`pointerup`/`pointercancel`) — **NO Framer Motion** (Epic 1 retro discipline carried forward from Story 3-3). Swipe physics: activation threshold 20px horizontal movement (below this, click/tap passes through to the underlying `<Link>`); action threshold 40% of card width; below threshold → spring snap-back via CSS transition `transform 200ms cubic-bezier(0.34,1.56,0.64,1)`; above threshold → momentum slide `transform 300ms ease-out` then call `approveInvoice`/`flagInvoice`. Right-swipe = approve (green gradient overlay), left-swipe = flag (amber gradient overlay). `navigator.vibrate(50)` at threshold crossing (gracefully no-ops where unsupported). Keyboard alternatives are NEW Freigeben/Flaggen buttons in `<InvoiceDetailPane />` header (desktop) and as a sticky bar at the bottom of `/rechnungen/[id]` on mobile — these call the same Server Actions with `method: 'button'` (or `'keyboard'` when invoked via the global `A` shortcut from UX-DR16). `prefers-reduced-motion: reduce` disables the swipe animations and keeps buttons as the only path.

3. **Undo toast + SessionSummary + ExportAction (UX-DR5, UX-DR7, UX-DR11)** — A NEW lightweight in-app toast system at `apps/web/components/ui/action-toast-stack.tsx` (still NO `sonner` dep — built from a single React Context in `apps/web/components/ui/action-toast-context.tsx` plus a portal mount in the `(app)` layout). Toasts auto-dismiss after 5 seconds with a CSS-animated linear countdown bar; max 3 stacked; oldest replaced when a 4th fires; "Rückgängig" link fires `undoInvoiceAction` with the snapshot captured at action time. The wrapper exposes `showActionToast({ kind: 'approved' | 'flagged', invoiceId, snapshot })`. Two NEW dashboard components consume this: `<SessionSummary />` at `apps/web/components/dashboard/session-summary.tsx` renders a card when the in-page review queue (`status='review'` count) drops from >0 to 0 during the user's session — derived client-side from a `useEffect` watching the prop; states: `Perfect Session` (errorCount=0), `With Corrections` (errorCount>0), `First Session` (sessionStorage flag), `Streak Milestone` (placeholder — `streakWeeks` is computed from `tenants.created_at` weeks-ago heuristic for MVP since durable streak tracking is Story 8.3), `Export Prompt` (when `readyCount >= 10`). `<ExportAction />` at `apps/web/components/dashboard/export-action.tsx` renders Dormant/Available/Prominent/Month-End-Urgent variants per UX-DR7 with `onExport` wired to `console.info('[export:cta] click')` for now (Epic 5 implements the actual flow). Both components are server-component-friendly (props in, render out) — only `<SessionSummary />` has a small client island for the dismiss button.

**Deferred to Story 3.5:** Compliance warnings, weekly value summary, persistent streak counter.
**Deferred to Story 4.2:** Durable `audit_logs` table (until then, undo is in-memory only and `approval_method` lives on the row).
**Deferred to Epic 5:** DATEV CSV generation, ExportAction `onExport` implementation.
**Deferred to Story 8.3:** Persistent multi-week streak tracking (MVP uses computed-from-`tenants.created_at`).

---

## Acceptance Criteria

1. **Given** the dashboard renders with a mix of `ready` and `review` invoices
   **When** the list query runs with the new default `sort=confidence`
   **Then** within the queue, invoices are ordered green (overall ≥0.95) → amber (0.70–0.94) → red (<0.70), so the user experiences instant-approve momentum before exceptions (UX-DR13)
   **And** an explicit `sort=confidence` URL parameter is added to the `sort` Zod enum in `parseDashboardQuery` and is the new default; existing options (`date_desc`, `date_asc`, `amount_desc`, `amount_asc`, `supplier_asc`) remain unchanged
   **And** server-side ordering is implemented via two new generated columns on `invoices` (added in this story's migration — see Dev Notes "Sort Implementation"): `review_priority_key SMALLINT` (status rank: review=0, ready=1, others later) and `confidence_sort_key SMALLINT` (0=green, 1=amber, 2=red, 3=null/no-data) — composite `.order("review_priority_key").order("confidence_sort_key")` ascending

2. **Given** a `ready` or `review` invoice card on the dashboard list (touch device)
   **When** the user pointer-down + horizontal-drag the card
   **Then** below 20px movement, the gesture is treated as a click (existing `<Link>` navigation passes through unchanged)
   **And** between 20px and 40% card width, the card translates with the finger; right-drag shows a green gradient overlay layered behind the card content; left-drag shows amber
   **And** at threshold crossing (40% card width), `navigator.vibrate(50)` fires; if `prefers-reduced-motion: reduce`, no vibration and no overlay animation
   **And** released below threshold → CSS transition `transform 200ms cubic-bezier(0.34,1.56,0.64,1)` snaps the card back to `translateX(0)`
   **And** released above threshold → CSS transition `transform 300ms ease-out` slides the card off, then on `transitionend` calls `approveInvoice` (right) or `flagInvoice` (left) with `method: 'swipe'`

3. **Given** the user swipes right on a `review` invoice past threshold
   **When** the swipe completes
   **Then** `approveInvoice({ invoiceId, method: 'swipe' })` is called
   **And** on `{ success: true, data: { status: 'ready' } }` the row's status flips `review → ready` (DB-side), `approved_at`/`approved_by`/`approval_method='swipe'` are persisted (FR — see audit prep)
   **And** the existing `<DashboardRealtimeRefresher />` triggers a `router.refresh()` so the row reflows out of the `review` group into `ready`
   **And** within ≤200ms a green `<ActionToast>` appears at the bottom of the viewport: `"Rechnung freigegeben."` with a `Rückgängig` link and 5-second countdown bar
   **And** total swipe-to-approval round trip completes in <1 second on a local environment (NFR5-equivalent budget)

4. **Given** the user swipes left on a `ready` invoice past threshold
   **When** the swipe completes
   **Then** `flagInvoice({ invoiceId, method: 'swipe' })` is called and persists `status='review'`, `approved_at=NULL`, `approved_by=NULL`, `approval_method=NULL`
   **And** an amber `<ActionToast>` appears: `"Zur Prüfung markiert."` with `Rückgängig` and 5-second countdown
   **And** the same 200ms-snap / 300ms-slide physics apply as for right-swipe

5. **Given** a `<ActionToast>` is currently visible
   **When** the user clicks `Rückgängig` within 5 seconds
   **Then** `undoInvoiceAction({ invoiceId, previousStatus, previousApproval })` is called with the snapshot captured client-side at the moment the original action fired (`{ status, approved_at, approved_by, approval_method }`)
   **And** the server restores all four columns to the snapshot values, only if the row's current state matches what we'd have produced with the original action (concurrency guard: WHERE clause filters on `id`+`tenant_id`+the post-action expected `status`)
   **And** the toast disappears immediately
   **And** if the user does not click `Rückgängig`, the toast auto-dismisses at 5000ms via CSS animation `@keyframes countdown` and no further action fires

6. **Given** multiple actions fire in sequence
   **When** more than 3 toasts would be visible at once
   **Then** the toast stack caps at 3 — the oldest is replaced (not animated-out) when a 4th fires (UX-DR11 stacking rule)
   **And** each toast has its own independent 5s countdown timer (cleanup via `useEffect` return on unmount)
   **And** if a toast for invoice X is still visible and a new action fires on invoice X, the old toast is removed and replaced (one toast per invoice maximum)

7. **Given** the `<InvoiceDetailPane />` is rendered for a `ready` or `review` invoice
   **When** the pane header section renders
   **Then** TWO new buttons appear next to the existing confidence badge: `[Freigeben]` (Primary green, success variant) and `[Flaggen]` (Secondary outlined, amber variant)
   **And** both buttons are full-width on mobile (<640px) and inline on desktop
   **And** clicking `[Freigeben]` calls `approveInvoice` with `method: 'button'`; clicking `[Flaggen]` calls `flagInvoice` with `method: 'button'`
   **And** both buttons are disabled (and visually muted) when `isExported === true` or when the action is in flight (`useTransition` pending state)
   **And** the global keyboard shortcut `A` (existing UX-DR16 hook) — when no input/textarea has focus and a single invoice detail pane is visible — invokes `approveInvoice` with `method: 'keyboard'`

8. **Given** the `<InvoiceDetailPane />` header is rendered (deferred-work item from Story 3.3 review)
   **When** the user wants to inspect the source document
   **Then** an always-visible `[Beleg ansehen]` button appears in the header next to `[Freigeben]`/`[Flaggen]` (icon: `📄` plus label) — works for high-confidence invoices that previously had no entry point
   **And** clicking opens the existing `<SourceDocumentViewer>` via the `<SourceDocumentViewerWrapper>` (reuse the wrapper; pass a new `headerTrigger={true}` prop OR mount a sibling instance with `isInteractive={true}` and no `confidence` filter)
   **And** the existing per-field amber/red dot triggers continue to work unchanged (no regression)

9. **Given** the dashboard's review-queue review count transitions from `>0` to `0` during the user's session
   **When** the transition is detected client-side (a `useEffect` in `<SessionSummary />` watching the `reviewCount` prop)
   **Then** the `<SessionSummary />` card renders inline above the invoice list (or as a top-of-list banner) showing: invoice count processed in session, session duration (seconds since first action), estimated time saved (`invoiceCount * 12 minutes` per UX-DR5 reference), error/correction count (count of `flag` or undo events), `streakWeeks` (computed from `tenants.created_at`), `exportReady` count (props `readyCount`)
   **And** the rendered state is one of: `Perfect Session` (errorCount=0), `With Corrections` (errorCount>0), `Streak Milestone` (`streakWeeks > 0 && streakWeeks % 4 === 0`), `Export Prompt` (`readyCount >= 10`), `First Session` (`sessionStorage.getItem('rai_session_seen') === null`)
   **And** clicking the dismiss button (`onDismiss`) hides the summary for the rest of the session and writes `sessionStorage.setItem('rai_session_seen', '1')`

10. **Given** the dashboard renders with `readyCount` of approved-and-ready invoices
    **When** `<ExportAction />` renders
    **Then** it reflects the correct state per UX-DR7: `Dormant` (`readyCount=0` → text-only `"Exportiert: N (Apr)"` reusing pipeline-header style), `Available` (`readyCount` 1–9 → subtle card, no emphasis), `Prominent` (`readyCount >= 10` → Primary Light bg + pulse border + "→ Jetzt DATEV Export erstellen"), `Month-End-Urgent` (last 5 days of month AND `readyCount > 0` → stronger emphasis + `"Monat endet in [X] Tagen"`)
    **And** `onExport` callback fires `console.info('[export:cta] click', { readyCount })` and navigates nowhere yet (Epic 5)
    **And** the component is rendered as a sibling of `<ProcessingStatsRow />` in `apps/web/app/(app)/dashboard/page.tsx`

11. **Given** an invoice is `captured`, `processing`, or `exported`
    **When** `approveInvoice` or `flagInvoice` is called for it
    **Then** the Server Action returns `{ success: false, error: "..." }` with these German messages:
    - `captured` / `processing` → `"Die Extraktion ist noch nicht abgeschlossen."`
    - `exported` → `"Exportierte Rechnungen können nicht mehr bearbeitet werden."`
    **And** no DB writes occur, no toast shows on the client, the swipe physics snap back even if past threshold (release path checks the action result before sliding off)

12. **Given** the user swipes on an invoice and the action succeeds
    **When** the same user immediately re-acts on the same invoice (e.g., approve, then flag)
    **Then** the second action snapshot captures the post-first-action state (not pre-first-action), so undo of action #2 reverts to action #1's state, not the original state
    **And** rapid sequential actions on different invoices each get their own toast (capped at 3 stacked)

13. **Given** unit tests exercise the new surface
    **When** `pnpm test` runs
    **Then** the suite gains:
    - `apps/web/components/invoice/swipe-action-wrapper.test.tsx` — NEW. Cases: (a) below 20px does not preventDefault on the click; (b) above-threshold right-swipe calls `onSwipeRight`; (c) above-threshold left-swipe calls `onSwipeLeft`; (d) below-threshold release snaps back via transform reset; (e) `prefers-reduced-motion: reduce` disables swipe (matchMedia mock); (f) keyboard `Enter` on the wrapper does not interfere. ≥6 cases.
    - `apps/web/components/ui/action-toast-stack.test.tsx` — NEW. Cases: (a) toast appears via context `showActionToast`; (b) auto-dismiss after 5000ms (`vi.useFakeTimers()`); (c) `Rückgängig` click invokes the supplied undo callback; (d) max 3 stacked — 4th replaces oldest; (e) per-invoice dedup — second toast for same invoice replaces the first. ≥5 cases.
    - `apps/web/components/dashboard/session-summary.test.tsx` — NEW. Cases: (a) renders Perfect Session when `errorCount=0`; (b) renders With Corrections when `errorCount>0`; (c) Export Prompt when `readyCount >= 10`; (d) First Session when sessionStorage empty; (e) dismiss writes sessionStorage and hides. ≥5 cases.
    - `apps/web/components/dashboard/export-action.test.tsx` — NEW. Cases: (a) Dormant for `readyCount=0`; (b) Available for 1–9; (c) Prominent for ≥10; (d) Month-End-Urgent for last-5-days+>0; (e) onExport callback fires with readyCount. ≥5 cases.
    - `apps/web/app/actions/invoices.test.ts` — MODIFY. Add: (a) `approveInvoice` happy path on `review` invoice → flips status, stamps approved_at/by/method; (b) `approveInvoice` on `exported` → German error; (c) `approveInvoice` on `captured`/`processing` → German error; (d) `approveInvoice` on `ready` already → idempotent stamp, status unchanged; (e) `flagInvoice` happy path on `ready` → flips to `review`, clears approval columns; (f) `flagInvoice` on `review` → idempotent; (g) `flagInvoice` on `exported` → German error; (h) `undoInvoiceAction` happy path restores snapshot when post-action state matches; (i) `undoInvoiceAction` rejects when concurrent change broke the WHERE guard; (j) tenant isolation rejects cross-tenant invoiceId. ≥10 new cases.
    - `apps/web/lib/dashboard-query.test.ts` — MODIFY. Add: (a) `sort=confidence` parses; (b) default sort is `confidence` when no `sort` param; (c) invalid `sort=foo` falls back to `confidence`. ≥3 new cases.
    - **Target:** +4 new test files, +≥34 new cases. Total test count: 209 → **≥243**.

14. **Given** CI-equivalent commands run from the repo root
    **When** they execute
    **Then** `pnpm lint`, `pnpm check-types`, `pnpm build`, `pnpm test` all pass with zero new errors. `supabase db reset` applies all migrations cleanly including the new `20260427000000_invoice_approval_columns.sql`.

15. **Given** the smoke-test format (per `_bmad-output/implementation-artifacts/smoke-test-format-guide.md`) is mandatory
    **When** the story completes
    **Then** Completion Notes include a `### Browser Smoke Test` section covering at minimum:
    - **UX (a)** Right-swipe a `review` invoice past 40% threshold → row leaves `review` group → green toast `"Rechnung freigegeben."` with `Rückgängig`.
    - **UX (b)** Left-swipe a `ready` invoice past threshold → amber toast `"Zur Prüfung markiert."` → row reappears in `review` group.
    - **UX (c)** Below-20px tap on a card → still navigates to `/rechnungen/[id]` (regression check).
    - **UX (d)** Click `Rückgängig` within 5s on the green toast → invoice returns to `review`, toast disappears.
    - **UX (e)** Wait 5s without clicking — toast auto-dismisses, action remains permanent.
    - **UX (f)** Open detail pane → `[Freigeben]` / `[Flaggen]` / `[Beleg ansehen]` all visible. Press `A` keyboard shortcut → approve fires.
    - **UX (g)** `prefers-reduced-motion: reduce` (DevTools emulate) → swipe disabled, buttons still work.
    - **UX (h)** Process the last `review` invoice → `<SessionSummary />` card appears with correct counts.
    - **UX (i)** With ≥10 ready invoices in DB → `<ExportAction />` renders Prominent variant.
    - **UX (j)** Regression: SKR select still works, EditableField still works, source viewer dot still works.
    - **DB (d1)** After approve: `SELECT status, approved_at, approved_by, approval_method FROM invoices WHERE id='<X>'` → `ready / <ts> / <uuid> / 'swipe'`.
    - **DB (d2)** After flag: same query → `review / null / null / null`.
    - **DB (d3)** After undo of approve: row reverts to pre-action state.
    - Mark BLOCKED-BY-ENVIRONMENT per smoke-test guide.

---

## Tasks / Subtasks

- [x] **Task 1: DB migration + types update (AC: #3, #4, #5, #11)**
  - [x] 1.1 `supabase/migrations/20260427000000_invoice_approval_columns.sql` NEW — adds `approved_at timestamptz`, `approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL`, `approval_method text CHECK (approval_method IN ('swipe','button','keyboard','undo_revert') OR approval_method IS NULL)` to `public.invoices`. Index on `(tenant_id, status, approved_at)` for dashboard list queries. Extends the existing UPDATE grant on the `authenticated` role to include the three new columns.
  - [x] 1.2 `packages/shared/src/types/database.ts` — MODIFY: add `approved_at`, `approved_by`, `approval_method` to `invoices` Row/Insert/Update.
  - [x] 1.3 Verify `supabase db reset` applies cleanly.

- [x] **Task 2: Server Actions — approveInvoice / flagInvoice / undoInvoiceAction (AC: #3, #4, #5, #11)**
  - [x] 2.1 `apps/web/app/actions/invoices.ts` — MODIFY. Add `approveInvoice({ invoiceId, method }): Promise<ActionResult<{ status: InvoiceStatus }>>`. Auth + tenant + row + status validation. Idempotent stamp on `ready`. Optimistic concurrency: WHERE filter includes prior status. Log prefix `[invoices:approve]`. Sentry tag `{ module: "invoices", action: "approve" }`.
  - [x] 2.2 `apps/web/app/actions/invoices.ts` — Add `flagInvoice({ invoiceId, method })`. Same shape. Clears all three approval columns. Log prefix `[invoices:flag]`.
  - [x] 2.3 `apps/web/app/actions/invoices.ts` — Add `undoInvoiceAction({ invoiceId, expectedCurrentStatus, snapshot: { status, approved_at, approved_by, approval_method } })`. Server-side concurrency guard: only restore if current row matches `expectedCurrentStatus`. `method='undo_revert'` for telemetry. Log prefix `[invoices:undo]`.
  - [x] 2.4 `apps/web/app/actions/invoices.test.ts` — MODIFY. Add 11 new cases (approve happy/exported/captured-processing/idempotent-ready/tenant-isolation/invalid-uuid; flag happy/idempotent-review/exported; undo happy/concurrency-miss).

- [x] **Task 3: Swipe gesture wrapper (AC: #2, #3, #4, #11, #12)**
  - [x] 3.1 `apps/web/components/invoice/swipe-action-wrapper.tsx` NEW — `"use client"`. Generic wrapper accepting `{ children, onSwipeRight, onSwipeLeft, disabled, className }`. Uses Pointer Events (with `touch-pan-y` CSS so vertical scroll still works). Activation 20px, threshold 40% width via `containerRef.current.offsetWidth`. Vibration via `'vibrate' in navigator && navigator.vibrate(50)`. Honors `window.matchMedia('(prefers-reduced-motion: reduce)').matches` — when true, no transform animation and below-20px-only behavior. Click-capture suppresses underlying nav after a committed swipe.
  - [x] 3.2 `apps/web/components/invoice/swipe-action-wrapper.test.tsx` NEW — 7 cases (below-20px no-commit, right-swipe past threshold, left-swipe past threshold, snap-back, vibrate at threshold, prefers-reduced-motion disables, disabled prop).

- [x] **Task 4: ActionToast stack + context (AC: #3, #4, #5, #6, #12)**
  - [x] 4.1 `apps/web/components/ui/action-toast-context.tsx` NEW — React Context exposing `showActionToast({ kind, invoiceId, message, undo })`. Provider keeps an array of up to 3 toast records. Per-invoice dedup. 5s timer per toast via `setTimeout` cleared on unmount/dismiss.
  - [x] 4.2 `apps/web/components/ui/action-toast-stack.tsx` NEW — Renders the stacked toast portal. Inline `@keyframes rai-toast-countdown` for the linear bar. Each toast: title in German, `Rückgängig` button, countdown bar. Exports `<ActionToastRoot>` convenience that wraps children with provider + stack.
  - [x] 4.3 `apps/web/app/(app)/layout.tsx` — MODIFY: wrap `<AppShell>` with `<ActionToastRoot>`.
  - [x] 4.4 `apps/web/components/ui/action-toast-stack.test.tsx` NEW — 5 cases (show, auto-dismiss, undo callback, max 3 stacked, per-invoice dedup).

- [x] **Task 5: Action buttons in InvoiceDetailPane header (AC: #7, #8)**
  - [x] 5.1 `apps/web/components/invoice/invoice-actions-header.tsx` NEW — `"use client"`. Renders `[Freigeben]`, `[Flaggen]`, `[📄 Beleg ansehen]`. Uses `useTransition` for pending state. Calls `useActionToast` for post-action toasts. Captures `{ status, approved_at, approved_by, approval_method }` snapshot pre-action so undo restores via `undoInvoiceAction`.
  - [x] 5.2 `apps/web/components/invoice/invoice-detail-pane.tsx` — MODIFY: header restructured into a flex-wrap row with the title+badge on the left and `<InvoiceActionsHeader />` on the right. New optional props `approvedAt`, `approvedBy`, `approvalMethod` (null defaults).
  - [x] 5.3 `apps/web/app/(app)/rechnungen/[id]/page.tsx` — MODIFY: extend SELECT with `approved_at, approved_by, approval_method`; pass to `<InvoiceDetailPane />`.
  - [x] 5.4 `apps/web/app/(app)/dashboard/page.tsx` — MODIFY: same SELECT extension + prop wiring for split-view detail pane.
  - [x] 5.5 Keyboard `A` shortcut: scoped `useEffect` listener inside `<InvoiceActionsHeader />` (only mounted when a single detail pane is visible), with input/textarea/select/contentEditable focus-guard mirroring `KeyboardShortcutsHelp`.
  - [x] 5.6 `apps/web/components/invoice/invoice-detail-pane.test.tsx` — MODIFY: 2 new cases (header buttons render for ready; buttons disabled when `isExported`). Existing tests wrapped in `<ActionToastProvider>` via `renderInProvider` helper.

- [x] **Task 6: Dashboard list — swipe wrapper + confidence sort (AC: #1, #2)**
  - [x] 6.1 `apps/web/components/dashboard/invoice-list-card-swipe-wrapper.tsx` NEW — client-side bridge that calls `approveInvoice`/`flagInvoice`/`undoInvoiceAction` and shows toasts; passes through children for non-ready/review statuses.
  - [x] 6.1b `apps/web/components/dashboard/invoice-list-card.tsx` — MODIFY: wrap the `<InvoiceListCardLink>` content with `<InvoiceListCardSwipeWrapper>`.
  - [x] 6.2 `apps/web/lib/dashboard-query.ts` — MODIFY: add `confidence` to the `sort` Zod enum + export `DEFAULT_SORT = "confidence"`. `invoice-list-filters.tsx` updated to default to confidence and offer "Empfohlen (Prüfung zuerst)" option.
  - [x] 6.3 `apps/web/app/(app)/dashboard/page.tsx` — MODIFY: ordering uses generated columns `review_priority_key`, `confidence_sort_key` (ascending) with `created_at desc, id desc` tie-breakers. `effectiveSort = query.sort ?? DEFAULT_SORT` so confidence is the default. SELECT extended with `approved_at, approved_by, approval_method`.
  - [x] 6.4 `apps/web/lib/dashboard-query.test.ts` — MODIFY: 3 new cases (sort=confidence valid; missing sort → undefined; invalid sort dropped).
  - [x] 6.5 `apps/web/components/dashboard/invoice-list-card.test.tsx` — MODIFY: wrap renders in `<ActionToastProvider>`, mock `@/app/actions/invoices`, assert border classes via the inner `<a>` element to survive the swipe wrapper.

- [x] **Task 7: SessionSummary + ExportAction (AC: #9, #10)**
  - [x] 7.1 `apps/web/components/dashboard/session-summary.tsx` NEW — `"use client"`. Watches `reviewCount` prop transitions (>0 → 0). Variants: `Perfect | WithCorrections | FirstSession | StreakMilestone | ExportPrompt`. Dismiss writes `sessionStorage`.
  - [x] 7.2 `apps/web/components/dashboard/session-summary.test.tsx` NEW — 5 cases (Perfect, WithCorrections, ExportPrompt, FirstSession, dismiss persistence).
  - [x] 7.3 `apps/web/components/dashboard/export-action.tsx` NEW — `"use client"` for the click handler. Pure render: variants `Dormant | Available | Prominent | MonthEndUrgent` derived from `readyCount` and current-date last-5-days check. `onExport` callback fires `console.info('[export:cta] click', { readyCount })`.
  - [x] 7.4 `apps/web/components/dashboard/export-action.test.tsx` NEW — 5 cases (each variant + onExport callback).
  - [x] 7.5 `apps/web/app/(app)/dashboard/page.tsx` — MODIFY: render `<SessionSummary />` (above filters) + `<ExportAction />` (above filters as well; lives in the left list column rather than the right widget rail per the actual layout). `reviewCount`/`readyCount` derived from raw `stageRes.data` so the `review`-folds-into-`ready` aggregation in `aggregateStageCounts` doesn't lose the distinction.

- [x] **Task 8: Validate + Smoke Test (AC: #14, #15)**
  - [x] 8.1 `pnpm check-types` clean; `pnpm lint` 0 errors (14 pre-existing warnings unchanged); `pnpm build` succeeds; `pnpm test` → 247 passed (shared 41 + ai 11 + web 195) — exceeds 243 target.
  - [x] 8.2 `npx -y supabase db reset --no-seed` applied all migrations cleanly including `20260427000000_invoice_approval_columns.sql`.
  - [x] 8.3 Smoke test section authored below in Completion Notes.

---

## Dev Notes

### Scope Fences (from epics + Story 3.3 deferred list)
- **Compliance warnings, weekly value summary** → Story 3.5. SessionSummary in 3.4 ships only the queue-cleared card; weekly value totals are 3.5.
- **Durable audit_logs table** → Story 4.2. The `approval_method` column on `invoices` is an interim stash. When 4.2 ships the audit table, migrate this data forward.
- **DATEV CSV export** → Epic 5. `<ExportAction onExport>` logs and no-ops; the click target stays.
- **Persistent multi-week streak counter** → Story 8.3 (subscription/usage). MVP computes weeks from `tenants.created_at` for the milestone display only.
- **Source viewer redesign** (deferred from Story 3.3 review) → covered by AC #8 in this story (always-visible header trigger).
- **Custom dropdown a11y, sonner**, Framer Motion → still NOT introduced. Same discipline.
- **Test fragility items from 3.3 deferred list** → not addressed here; tracked separately.

### Sort Implementation
Two viable approaches for confidence-based ordering — choose ONE and document the choice in the dev record:

**Two generated columns** added in `20260427000000_invoice_approval_columns.sql` (composes with the Supabase JS client's `.order()` chain — no raw SQL needed):

```sql
ALTER TABLE invoices
  ADD COLUMN review_priority_key SMALLINT GENERATED ALWAYS AS (
    CASE status
      WHEN 'review'     THEN 0
      WHEN 'ready'      THEN 1
      WHEN 'processing' THEN 2
      WHEN 'captured'   THEN 3
      WHEN 'exported'   THEN 4
    END
  ) STORED,
  ADD COLUMN confidence_sort_key SMALLINT GENERATED ALWAYS AS (
    -- Compute from invoice_data->'gross_total'->'confidence' (or NULL when invoice_data is null).
    -- Bucket boundaries match `confidenceLevel` in packages/shared:
    -- >= 0.95 → 0 (green), >= 0.70 → 1 (amber), < 0.70 → 2 (red), null → 3.
    CASE
      WHEN invoice_data IS NULL THEN 3
      WHEN (invoice_data->'gross_total'->>'confidence')::numeric >= 0.95 THEN 0
      WHEN (invoice_data->'gross_total'->>'confidence')::numeric >= 0.70 THEN 1
      ELSE 2
    END
  ) STORED;
CREATE INDEX invoices_review_sort_idx
  ON invoices (tenant_id, review_priority_key, confidence_sort_key);
```

**Edge case to note:** the `gross_total.confidence` field uses raw decimal (e.g. `0.973`). The same `safe-cast` discipline from migration `20260424100000` (regex-guarded `::numeric` casts) applies — wrap the cast in `CASE WHEN value ~ '^[0-9.]+$' THEN ...::numeric END` if any extractor output deviates. Currently the AI emits plain decimals, so the simple cast is acceptable. Document the assumption in the migration comment.

**Tie-breaker:** chain `.order("created_at", { ascending: false })` after the two priority keys to keep stable pagination semantics.

### Approval State Model (clarification)
- `review → ready`: approve. Stamps approval columns.
- `ready → ready`: approve. Idempotent stamp (updates `approved_at`, `approval_method`).
- `ready → review`: flag. Clears approval columns.
- `review → review`: flag. Idempotent (no-op DB write avoided — Server Action returns success without UPDATE).
- `captured | processing | exported`: both reject with German error.
- Undo restores ALL prior columns by snapshot, gated by post-action state guard.

### Why no `audit_logs` yet
Story 4.2 (Epic 4) owns durable audit. Adding it in 3.4 would create a half-finished GoBD primitive — better to ship the column trio now and migrate forward when 4.2 designs the immutable hash chain. The `approval_method` column carries enough info that 4.2's migration can backfill the audit table from existing rows.

### Why no Framer Motion
Epic 1 retro discipline: every dependency added doubles bundle review work and can be replaced by Pointer Events + CSS for swipe physics. Story 3.3 also avoided it. The 200ms-snap and 300ms-slide are CSS transitions — JS only manages the live-tracking transform during the drag.

### Why no `sonner` for toasts
Story 3.2 explicitly chose to NOT wire `<Toaster>` (sonner). 3.4 needs richer features (countdown, undo callback, dedup) so a thin context-based stack is cheaper than adopting sonner. Total component is ~120 LOC — small enough to maintain.

### Sticky bottom action bar on mobile
The action buttons in the detail pane header position naturally on desktop. On mobile (`<sm`), they should be a sticky bar at the bottom of the viewport (so the buttons remain reachable while the user scrolls long invoices). Use `sticky bottom-0` on the container and `safe-area-inset-bottom` padding (existing pattern from 3-1's PipelineHeader). Don't introduce a separate mobile-only component — same buttons, different positioning class via responsive Tailwind.

### Snapshot capture pattern for undo
At swipe/button trigger time, capture `{ status, approved_at, approved_by, approval_method }` from the props the client already has (drilled from the RSC). Pass into `showActionToast` so the undo handler can call `undoInvoiceAction` with the snapshot. The server-side concurrency guard prevents undo from clobbering a third-party concurrent change (e.g., another browser tab).

### Existing files to read BEFORE coding
Per Story 3.3 review discipline (read every UPDATE file completely):
- `apps/web/components/invoice/invoice-detail-pane.tsx` — header section, where buttons land. Note SKR row pattern.
- `apps/web/components/invoice/skr-category-select.tsx` — reference pattern for `useTransition`-based Server Action calls + result handling + `prefers-reduced-motion` discipline (none, but note the inline message fade).
- `apps/web/components/dashboard/invoice-list-card.tsx` — wrap target. Confirm the swipe wrapper does not break the existing `<Link>` semantics or the URL-driven detail pane on desktop.
- `apps/web/components/dashboard/invoice-list-card-link.tsx` — already a client wrapper for the `matchMedia` desktop intercept; coordinate with the swipe wrapper so they don't fight for pointerdown.
- `apps/web/app/actions/invoices.ts` — auth+tenant+row pattern to copy verbatim (line ~200 for `extractInvoice`, ~700 for `categorizeInvoice`).
- `apps/web/lib/dashboard-query.ts` — sort enum location.
- `apps/web/components/invoice/source-document-viewer-wrapper.tsx` — confirm a non-confidence-gated mount path (probably needs a new `forceInteractive` or `headerTrigger` prop).
- `apps/web/app/(app)/layout.tsx` — provider mount target. If the route group layout doesn't exist yet, create it.

### Previous Story Intelligence (3.3 patches that affect 3.4)
- **Tenant filter on invoice fetch** is mandatory in `/rechnungen/[id]/page.tsx`. 3.4's SELECT extension must keep `.eq("tenant_id", tenantId)`.
- **idempotency early-return** is the right pattern. `approveInvoice` should NOT overwrite a still-fresh `approved_at` if the row hasn't changed status — but a re-stamp is fine (cheap, atomic). Decide based on cost; prefer always-stamp for simplicity.
- **`InvoiceListCardLink` desktop intercept**: the `matchMedia` listener fires on `useEffect` mount, so swipe wrapper logic must coexist — verify by hand that pointerdown on the card on desktop still navigates via the intercept handler (no swipe activation on click-only motion).
- **Test count baseline:** 209 (post-3.3). New target: ≥243 (delta +34).
- **Smoke test format** mandatory; follow `smoke-test-format-guide.md` exactly.
- **`apps/web/AGENTS.md`** — "This is NOT the Next.js you know." Read `node_modules/next/dist/docs/` before writing client components / Server Actions / route handlers.

### Schema Already Applied vs. New
- New: `20260427000000_invoice_approval_columns.sql` adds the three approval columns + index + grant.
- New: same migration adds `review_priority_key SMALLINT GENERATED ALWAYS AS (...) STORED` per Sort Implementation Option A.
- Confirm both can coexist in one migration file (PostgreSQL is fine with multiple DDL statements per migration).

### Error Path Audit (Epic 2 retro A2 — carried forward) — for `approveInvoice`/`flagInvoice`/`undoInvoiceAction`
- Every exit path returns `ActionResult<T>` — no throws escape (except `NEXT_REDIRECT`).
- DB SELECT errors distinguished from "not found" (PGRST116).
- Concurrency: WHERE-clause-guard on UPDATE for transition + undo; if 0 rows affected, return user-friendly German error.
- `approval_method` enum violation → caller passes a typed string; reject in Zod input schema before DB.
- Sentry tags: `{ module: "invoices", action: "approve" | "flag" | "undo" }`.
- User errors: German, conversational. No status codes leak.

### Source Tree Touch Points
**NEW:**
- `supabase/migrations/20260427000000_invoice_approval_columns.sql`
- `apps/web/components/invoice/swipe-action-wrapper.tsx` + `.test.tsx`
- `apps/web/components/invoice/invoice-actions-header.tsx`
- `apps/web/components/ui/action-toast-context.tsx`
- `apps/web/components/ui/action-toast-stack.tsx` + `.test.tsx`
- `apps/web/components/dashboard/session-summary.tsx` + `.test.tsx`
- `apps/web/components/dashboard/export-action.tsx` + `.test.tsx`

**MODIFIED:**
- `packages/shared/src/types/database.ts` (add 3 columns + generated key column)
- `apps/web/app/actions/invoices.ts` (add 3 Server Actions)
- `apps/web/app/actions/invoices.test.ts` (≥10 new cases)
- `apps/web/components/invoice/invoice-detail-pane.tsx` (mount header + extra props)
- `apps/web/components/invoice/invoice-detail-pane.test.tsx` (2 cases)
- `apps/web/app/(app)/dashboard/page.tsx` (sort + new components + extra SELECT)
- `apps/web/app/(app)/rechnungen/[id]/page.tsx` (extra SELECT + props)
- `apps/web/app/(app)/layout.tsx` (mount toast provider — create if absent)
- `apps/web/components/dashboard/invoice-list-card.tsx` (swipe wrap)
- `apps/web/components/dashboard/invoice-list-card.test.tsx` (regression case)
- `apps/web/lib/dashboard-query.ts` (sort enum)
- `apps/web/lib/dashboard-query.test.ts` (3 cases)
- `apps/web/components/invoice/source-document-viewer-wrapper.tsx` (allow always-on header-mounted variant — minimal prop add)

**FORBIDDEN:**
- New top-level dependencies (no `framer-motion`, no `sonner`, no `react-spring`, no `react-use-gesture`).
- New Route Handlers, new Edge Functions.
- New `<Toaster>` mount.
- Touching the `invoice_status` enum (Story 4.2 territory).

### Testing Standards
- Vitest + jsdom (already wired).
- Mock pointer events via `Element.prototype.setPointerCapture` and synthesizing `PointerEvent`-shaped objects (jsdom limitation: PointerEvent constructor is patchy — use `new MouseEvent('pointerdown')` cast where needed).
- Mock `navigator.vibrate` → spy; test that it's called only at threshold.
- Mock `window.matchMedia` for `prefers-reduced-motion: reduce` test.
- Mock `next/navigation` (`router.refresh`).
- Mock `@/lib/supabase/server` — use the same fake client pattern from existing `invoices.test.ts`.
- `vi.useFakeTimers()` for the 5s toast countdown.
- For SessionSummary: mock `sessionStorage` (jsdom provides; just clear between tests).

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story-3.4] — AC source (lines 651–692)
- [Source: _bmad-output/planning-artifacts/prd.md] — UX-DR2 (142), UX-DR5, UX-DR7, UX-DR11 (151), UX-DR13
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md] — AccordionInvoiceCard expanded (lines 1407–1473), Swipe Gesture Spec (1458–1466), SessionSummary (1574–1623), ExportAction (1644–1680), Toast Pattern (1797–1838), Approve button styling (1769)
- [Source: _bmad-output/planning-artifacts/architecture.md] — approveInvoice Server Action (line 309, 344, 416, 822), Framer-Motion-replacement note (279 — we deviate per Epic 1 discipline)
- [Source: _bmad-output/implementation-artifacts/3-3-skr-categorization-and-bu-schluessel-mapping.md] — Scope Fences (line ~167), Error Path Audit pattern, useTransition pattern, deferred items pointing to 3.4
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — Story 3.3 review item (line 5): always-visible source-viewer trigger ← AC #8
- [Source: _bmad-output/implementation-artifacts/smoke-test-format-guide.md] — mandatory format
- [Source: apps/web/components/invoice/invoice-detail-pane.tsx:81-100] — header section to extend
- [Source: apps/web/components/dashboard/invoice-list-card.tsx] — swipe-wrap target
- [Source: apps/web/components/invoice/skr-category-select.tsx] — useTransition + ActionResult handling reference
- [Source: apps/web/app/actions/invoices.ts:200-230, 690-770] — auth+tenant+row pattern + concurrency guard
- [Source: apps/web/lib/dashboard-query.ts] — sort enum location
- [Source: supabase/migrations/20260424000000_invoice_field_corrections.sql] — recent migration template

[Smoke test format: _bmad-output/implementation-artifacts/smoke-test-format-guide.md]

---

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- `pnpm test` → 247 passing (shared 41, ai 11, web 195). Baseline pre-3.4 was 209; +38 cases across approve/flag/undo (11), swipe wrapper (7), action-toast (5), session-summary (5), export-action (5), invoice-detail-pane (2), dashboard-query (3).
- `pnpm --filter @rechnungsai/web check-types` clean.
- `pnpm --filter @rechnungsai/web lint` → 0 errors, 14 warnings (all pre-existing — env-var declarations, `<img>` element, prefer-const on a touched-but-unmodified line).
- `pnpm --filter @rechnungsai/web build` succeeds; all routes compile (`/dashboard`, `/rechnungen/[id]` are dynamic as expected).
- `npx -y supabase db reset --no-seed` applied migration `20260427000000_invoice_approval_columns.sql` cleanly with no NOTICEs or errors.

### Completion Notes List

**What shipped**

- DB: 3 approval columns (`approved_at timestamptz`, `approved_by uuid → users.id ON DELETE SET NULL`, `approval_method text` CHECK in `'swipe'|'button'|'keyboard'|'undo_revert'`) + 2 generated SMALLINT keys (`review_priority_key`, `confidence_sort_key`) on `public.invoices`. Two indexes: `(tenant_id, status, approved_at)` and `(tenant_id, review_priority_key, confidence_sort_key)`. Column-level UPDATE grant extended (Postgres has no incremental grant — full list re-issued). Generated columns are not granted (Postgres rejects column-level grants on generated columns).
- Server Actions: `approveInvoice`, `flagInvoice`, `undoInvoiceAction` follow the established auth + tenant + row + status pattern from `correctInvoiceField`/`updateInvoiceSKR`. Optimistic concurrency via `WHERE id = ? AND status = ?` with `maybeSingle()` + 0-rows-affected → "zwischenzeitlich geändert" German error. `flagInvoice` on `review` is a no-op early-return (avoids needless `updated_at` churn). `approveInvoice` on `ready` does an idempotent re-stamp (cheap, atomic) — Dev Notes' "always-stamp for simplicity" choice. All three return `ActionResult<{ status: InvoiceStatus }>`. Sentry tags `{ module: "invoices", action: "approve" | "flag" | "undo" }`.
- Swipe wrapper: native Pointer Events, no Framer Motion. 20 px activation, 40% width threshold, snap-back `200ms cubic-bezier(0.34,1.56,0.64,1)`, commit slide `300ms ease-out`. `navigator.vibrate(50)` once at threshold crossing. `prefers-reduced-motion: reduce` disables both the gesture and the vibrate. Vertical-dominant motion (|dy| > |dx|) is left to native scroll. Click-capture suppresses underlying nav after a committed swipe so the `<Link>` inside doesn't navigate.
- Toast system: lightweight context (~120 LoC) — no `sonner`. `<ActionToastProvider>` keeps an array capped at 3, per-invoice dedup, 5 s setTimeout per toast cleared on dismiss. Inline `@keyframes rai-toast-countdown` for the linear bar. `<ActionToastRoot>` is the convenience wrapper mounted in `app/(app)/layout.tsx`.
- Action buttons: `<InvoiceActionsHeader>` mounts `[Freigeben]`, `[Flaggen]`, `[📄 Beleg ansehen]`. `useTransition` for pending state; `disabled` collapses to `pending || isExported || isProcessing`. Snapshot of `{ status, approved_at, approved_by, approval_method }` is captured pre-action so the Rückgängig handler can call `undoInvoiceAction` with it. Keyboard `A` shortcut wired via a `useEffect` listener inside the component (input/textarea/select/contentEditable focus-guard) — only active while the detail pane is mounted.
- Dashboard list: `<InvoiceListCardSwipeWrapper>` wraps the existing card link; passes through children as-is for `captured`/`processing`/`exported`. Confidence sort defaults via `DEFAULT_SORT = "confidence"`; `parseDashboardQuery` accepts the new `sort=confidence`; `<InvoiceListFilters>` defaults to confidence and labels it "Empfohlen (Prüfung zuerst)". Server-side ordering uses the two generated SMALLINT columns; tie-break `created_at desc, id desc`.
- Dashboard widgets: `<SessionSummary>` watches `reviewCount` prop transitions from `>0` to `0`, picks one of 5 variants (Perfect, WithCorrections, FirstSession, StreakMilestone, ExportPrompt) and writes `rai_session_seen` to sessionStorage on dismiss. `<ExportAction>` derives Dormant/Available/Prominent/Month-End-Urgent from `readyCount` + a date check (last 5 days of month). `onExport` logs `[export:cta] click`; the actual DATEV flow is Epic 5.

**Notable design decisions**

- Idempotent re-stamp on `approveInvoice` for `ready` rows. Picked simplicity over branchy "skip if approved_at is fresh"; per Dev Notes, the cost is negligible (atomic single-row UPDATE) and tests assert the `approval_method` does update on a re-approve.
- `<SessionSummary>` and `<ExportAction>` rendered as left-column siblings of `<InvoiceListFilters>` rather than the right-rail widget area noted in the story spec — the right rail only renders when no invoice is selected (split-view), so banners-style widgets need to live in the left column to remain visible during typical review work. Both still render as siblings of the existing list, satisfying AC #9/#10.
- Generated `confidence_sort_key` uses the same regex-guarded numeric cast as migration `20260424100000` — the AI emits plain decimals today, but the guard prevents a future locale-string regression from breaking the dashboard query.

### File List

**NEW**
- `supabase/migrations/20260427000000_invoice_approval_columns.sql`
- `apps/web/components/invoice/swipe-action-wrapper.tsx`
- `apps/web/components/invoice/swipe-action-wrapper.test.tsx`
- `apps/web/components/invoice/invoice-actions-header.tsx`
- `apps/web/components/ui/action-toast-context.tsx`
- `apps/web/components/ui/action-toast-stack.tsx`
- `apps/web/components/ui/action-toast-stack.test.tsx`
- `apps/web/components/dashboard/invoice-list-card-swipe-wrapper.tsx`
- `apps/web/components/dashboard/session-summary.tsx`
- `apps/web/components/dashboard/session-summary.test.tsx`
- `apps/web/components/dashboard/export-action.tsx`
- `apps/web/components/dashboard/export-action.test.tsx`

**MODIFIED**
- `packages/shared/src/types/database.ts`
- `apps/web/app/actions/invoices.ts`
- `apps/web/app/actions/invoices.test.ts`
- `apps/web/components/invoice/invoice-detail-pane.tsx`
- `apps/web/components/invoice/invoice-detail-pane.test.tsx`
- `apps/web/app/(app)/layout.tsx`
- `apps/web/app/(app)/dashboard/page.tsx`
- `apps/web/app/(app)/rechnungen/[id]/page.tsx`
- `apps/web/components/dashboard/invoice-list-card.tsx`
- `apps/web/components/dashboard/invoice-list-card.test.tsx`
- `apps/web/components/dashboard/invoice-list-filters.tsx`
- `apps/web/lib/dashboard-query.ts`
- `apps/web/lib/dashboard-query.test.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

**Note:** `source-document-viewer-wrapper.tsx` was not modified — `<InvoiceActionsHeader>` mounts `<SourceDocumentViewer>` directly (skipping the wrapper's confidence-dot indirection), which satisfies AC #8 ("always-visible header trigger") without changing the existing per-field dot path.

### Browser Smoke Test

**Environment:** `pnpm dev` from repo root. Local Supabase: `host=localhost port=54322 dbname=postgres user=postgres password=postgres`. Sign in at `/login`, ensure at least 3 `review` and 12 `ready` invoices exist (re-extract a few or upload + force confidence by editing).

#### UX Checks

| # | Action | Expected Output | Pass Criterion | Status |
|---|--------|----------------|----------------|--------|
| (a) | On a touch device, open `/dashboard` → on the first card in the **Bereit** group whose status is `Zur Prüfung` (red badge), put your finger on the card and drag it to the right past the right edge of the card. | While dragging: a green gradient slides in from the right behind the card content; near the threshold a single haptic tick fires. On release past threshold: the card slides off-screen, the row reflows out of the list, and a green toast appears at the bottom reading exactly `"Rechnung freigegeben."` with a `Rückgängig` link and a thin countdown bar that empties left-to-right. | Pass if the green toast text matches verbatim AND the card no longer appears in `Zur Prüfung` after the toast is visible AND the haptic was felt at threshold (skip the haptic check if the device has vibration disabled). | DONE |
| (b) | On the same dashboard, find a card in **Bereit** whose badge reads `Bereit` (green, not `Zur Prüfung`) → put your finger on the card and drag it to the left past the left edge. | Amber gradient overlay during drag; on release past threshold an amber toast reads exactly `"Zur Prüfung markiert."` with `Rückgängig`. The card now reappears with a `Zur Prüfung` badge in the same Bereit group. | Pass if the amber toast text matches verbatim AND the card's badge changes from `Bereit` to `Zur Prüfung`. | DONE |
| (c) | On `/dashboard`, on any card, do a quick tap (no horizontal drag — release within 1 second, finger stays within 20 px). | The browser navigates to `/rechnungen/<that invoice id>`. No toast fires. The card does not move. | Pass if the route changes to `/rechnungen/...` AND no toast appeared during the tap. | DONE |
| (d) | Repeat (a) to make the green `"Rechnung freigegeben."` toast visible → within 5 seconds tap **Rückgängig**. | Toast disappears immediately. The just-approved row reappears in the list with a `Zur Prüfung` badge. | Pass if the row's badge returns to `Zur Prüfung` AND the toast is gone after the tap. | DONE |
| (e) | Repeat (a) to make the green toast appear → start a stopwatch and do nothing for 5 seconds. | At ~5 seconds the toast fades out by itself. The countdown bar reaches zero just before fade-out. The approval persists (the row stays out of `Zur Prüfung`). | Pass if the toast disappears within 5–6 seconds without any tap AND the row remains approved (does not return to `Zur Prüfung`). | DONE |
| (f) | Tap any `review` or `ready` card to open `/rechnungen/<id>` → in the header next to the confidence badge, three buttons are visible: `Freigeben`, `Flaggen`, `📄 Beleg ansehen`. On a desktop browser, with no input field focused, press the `A` key. | All three buttons render side-by-side at the top of the detail pane. Pressing `A` fires the same flow as tapping `Freigeben`: a green toast `"Rechnung freigegeben."` appears at the bottom of the viewport. Tapping `📄 Beleg ansehen` opens the source document viewer (image/PDF/XML preview). | Pass if all three buttons are visible AND `A` triggers a green toast AND `📄 Beleg ansehen` opens the document viewer. | DONE |
| (g) | DevTools → Rendering → enable **Emulate CSS media feature prefers-reduced-motion: reduce** → reload `/dashboard` → try the right-swipe from (a). Then tap `Freigeben` from a detail pane. | Right-swipe: the card does not visibly translate during drag, the gradient overlay does not appear, and on release nothing happens (no toast, no DB write). The `Freigeben` button still works normally and produces the green toast. | Pass if the swipe gesture produces no visible animation AND no toast/DB write AND the button-based flow still produces a green toast. | DONE |
| (h) | Bring the **Zur Prüfung** queue down to zero by approving every red-badge card in it (swipe right or use the buttons). After the last one's toast appears, watch the area above the invoice list. | A card titled `Perfekte Session ✨` (or `Session abgeschlossen` if you flagged anything) appears above the filters with: count processed in this session, session duration, estimated minutes saved (`count × 12`), correction count. A `Schließen` button dismisses it for the rest of the session. | Pass if a SessionSummary card with the correct title appears above the list when the last `Zur Prüfung` row is processed AND the count matches the number of approvals you just performed. | DONE |
| (i) | With ≥ 10 invoices in `ready` status (no `review`), look above the filters on the dashboard. | A prominent card (primary-tinted background, soft pulse border) reads roughly `"<N> Rechnungen bereit → Jetzt DATEV Export erstellen"` with a `DATEV Export` button. With < 10 ready invoices it shows a quieter Available variant. With 0 ready invoices it collapses to a small text line `"Exportiert: <N> (Apr)"`. | Pass if the Prominent variant appears for ≥ 10 ready AND the button is present (clicking it currently logs `[export:cta] click` to the browser console — no nav yet, that's Epic 5). | DONE |
| (j) | Open `/rechnungen/<id>` for an invoice with at least one amber/red field and one high-confidence field. Click the per-field amber dot. Then change the SKR-Konto via the SKR select. Then edit any field via inline edit. | The per-field dot still opens the source viewer. The SKR select still updates and persists. The inline EditableField still saves. None of the three regress. | Pass if all three pre-existing flows still work after wrapping the dashboard cards with the swipe wrapper and adding the action header buttons. | DONE |

UX issue:
  - mobil ekrandayken, toaster  logic'i gayet iyi calisiyor ancak toaster mesaji ekranin en altinda gorunuyor yani navigation tab'in gorunmesine engel oluyor. toaster mesajini navigation tab'inin hemen yukarisinda gosterilecek sekilde guncelle. 

#### DB Verification

Run after the matching UX checks above.

| # | Query | Expected Return | What It Validates | Status |
|---|-------|----------------|-------------------|--------|
| (d1) | `psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres' -c "SELECT status, approved_at IS NOT NULL AS has_ts, approved_by IS NOT NULL AS has_user, approval_method FROM invoices WHERE id = '<the id from (a)>';"` | Single row: `status=ready`, `has_ts=t`, `has_user=t`, `approval_method=swipe`. | Confirms AC #3: swipe-right approve flips status and stamps all three approval columns. | DONE |
| (d2) | `psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres' -c "SELECT status, approved_at, approved_by, approval_method FROM invoices WHERE id = '<the id from (b)>';"` | Single row: `status=review`, `approved_at=NULL`, `approved_by=NULL`, `approval_method=NULL`. | Confirms AC #4: swipe-left flag flips status to `review` and clears all three approval columns. | DONE |
| (d3) | After clicking `Rückgängig` in (d): `psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres' -c "SELECT status, approved_at, approved_by, approval_method FROM invoices WHERE id = '<same id as (a)>';"` | Single row matches the pre-action state captured before (a) — for an originally-`review` invoice: `status=review`, `approved_at=NULL`, `approved_by=NULL`, `approval_method=NULL`. | Confirms AC #5: undo restores ALL four columns to the snapshot, gated by the post-action concurrency guard. | DONE |

**Manual Steps for GOZE:**

1. From repo root: `pnpm dev` (extraction provider Gemini free tier is fine for this story).
2. Sign in with a test account; ensure local DB has ≥ 3 `review` and ≥ 12 `ready` invoices. If not enough exist, use `/erfassen` to upload a handful of files and re-run the AI extraction; confidence below 95% lands them in `review`.
3. Run UX (a)–(j) in order on a real touch device (phone in browser dev mode is OK for the tactile checks, but the haptic in (a) requires a physical device).
4. After (a), (b), (d): paste the matching DB query from the table above.
5. Mark each row `DONE` or `FAIL`. If FAIL, write what you saw vs. expected.
6. If `prefers-reduced-motion` (g) cannot be emulated on your browser, mark it BLOCKED-BY-ENVIRONMENT with the reason — it is OS-level emulation that some mobile browsers do not honour.

### Review Findings

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-04-27 | Story file created — comprehensive context engine output | claude-opus-4-7 |
| 2026-04-27 | Implementation complete — all 8 tasks, 247 tests passing, status → review | claude-opus-4-7 |
