# Deferred Work

## Deferred from: code review of 4-1-immutable-document-storage-and-sha-256-hashing (2026-04-29)

- [ ] Full file download on every `verifyInvoiceArchive` call — no server-side size guard for large PDFs. Acknowledged in spec ("acceptable on one-document basis," ~500KB ~100ms). Revisit in Story 4.3 when batch-verify path requires streaming. [`apps/web/app/actions/invoices.ts — verifyInvoiceArchive`]
- [ ] No rate limiting on `verifyInvoiceArchive` — any authenticated tenant member can trigger repeated full-file storage downloads. Pre-existing pattern across all Server Actions; address at middleware/infrastructure layer. [`apps/web/app/actions/invoices.ts — verifyInvoiceArchive`]
- [ ] `sha256` column has no DB index — full table scan on any query filtering by hash. Story 4.3 batch-verify will need it. Add `CREATE INDEX IF NOT EXISTS invoices_sha256_idx ON public.invoices (sha256) WHERE sha256 IS NOT NULL;` in a Story 4.3 migration. [`supabase/migrations/20260429000000_invoice_sha256.sql`]
- [ ] `console.error(VERIFY_LOG, …)` passes raw Supabase error objects — may include storage path fragments or tenant data. Pre-existing pattern across all Server Actions; address when structured logging is introduced. [`apps/web/app/actions/invoices.ts — VERIFY_LOG error paths`]
- [ ] `packages/gobd` `package.json`/`tsconfig.json` build config changed from `tsc --noEmit` (type-check only) to `tsc --build` (emit to `dist/`) to fix pre-existing `node:crypto` type failure. `@types/node` devDep added. Verify `dist/` output is gitignored and CI build order is correct. [`packages/gobd/package.json`, `packages/gobd/tsconfig.json`]

## Deferred from: code review of 3-5-compliance-warnings-and-weekly-value-summary (2026-04-28)

- [ ] SQL regex `'^[0-9]+(\.[0-9]+)?$'` rejects negative VAT values — credit notes with negative `vat_total` are silently treated as 0 in `tenant_weekly_value_summary()`. Fix: use `'^-?[0-9]+(\.[0-9]+)?$'` and handle signed arithmetic. Revisit when credit note upload is supported. [`supabase/migrations/20260428000000_weekly_value_summary.sql:43`]
- [x] `(supabase as any).rpc("tenant_weekly_value_summary")` bypasses type safety — **resolved prep-p1**: `pnpm supabase gen types` re-run, cast removed. [`apps/web/components/dashboard/weekly-value-summary.tsx`]
- [ ] `id=\`field-${fieldPath}\`` only on non-editing div in `EditableField` — `jumpToField` silently returns null when the user clicks "Zum Feld springen" while the target field is already in edit mode. Add `id` to the editing branch div in a future a11y pass. [`apps/web/components/invoice/editable-field.tsx:178`]

## Deferred from: code review of 3-4-swipe-to-approve-and-confidence-based-review-queue (2026-04-27)

- [ ] `approveInvoice` always re-stamps `approved_at`/`approved_by` on `ready→ready` — first approver's identity and timestamp lost silently. Acknowledged design decision ("always-stamp for simplicity" per Dev Notes); Story 4.2 will design the durable audit chain and can backfill from the column. Revisit when 4.2 is planned. [apps/web/app/actions/invoices.ts — approveInvoice UPDATE block]
- [ ] `redirect()` NEXT_REDIRECT digest detection in Server Action catch blocks is a fragile internal heuristic (pre-existing across all Server Actions). If Next.js internal digest format changes, redirects silently become error responses. Address when Next.js upgrades or when Server Action infrastructure is refactored. [apps/web/app/actions/invoices.ts — approveInvoice/flagInvoice/undoInvoiceAction catch blocks]
- [x] Row SELECT in Server Actions does not filter by `tenant_id` in the DB query — **resolved prep-p2**: `.eq("tenant_id", tenantId)` added to 6 critical Server Actions (`approveInvoice`, `flagInvoice`, `undoInvoiceAction`, `correctInvoiceField`, `updateInvoiceSKR`, `categorizeInvoice`). [apps/web/app/actions/invoices.ts]
- [ ] Concurrent double-approve race: two simultaneous `approveInvoice` calls on a `ready` invoice can both succeed sequentially (no SELECT FOR UPDATE), with the second call overwriting the first approver's data. Low real-world risk; pre-existing pattern. Address with a version column or advisory lock if race conditions are observed in production. [apps/web/app/actions/invoices.ts — approveInvoice UPDATE]
- [ ] `undoInvoiceAction` trusts client-supplied `expectedCurrentStatus` for the concurrency guard WHERE clause.
- [ ] `SwipeActionWrapper` `reducedMotionRef` set once on mount — not reactive to live OS setting change (e.g. iOS Control Center). Address by adding a `matchMedia` `change` event listener if accessibility compliance requires live detection. [apps/web/components/invoice/swipe-action-wrapper.tsx — useEffect]
- [ ] CSS countdown animation duration (`5000ms`) and JS `setTimeout(5000)` in `ActionToastProvider` are separate hardcoded constants. A future timeout change must update both. Consolidate into a shared constant when touching either file. [apps/web/components/ui/action-toast-context.tsx + action-toast-stack.tsx]
- [ ] `SwipeActionWrapper` activates on desktop mouse horizontal drag ≥20px — no explicit touch-only guard. Low accidental trigger probability (40% card width is a large drag). Add `if (e.pointerType !== "touch") return` in `onPointerMove` if desktop swipe proves disruptive. [apps/web/components/invoice/swipe-action-wrapper.tsx — onPointerMove]
- [ ] Silent 4th-toast eviction closes the undo window for the oldest invoice without user feedback. By spec ("oldest replaced"). If any user confusion is reported, add a brief "Action can no longer be undone" indicator. [apps/web/components/ui/action-toast-context.tsx — MAX_STACK eviction] A determined attacker could probe status values; mitigated by P1/P2/P4 patches (snapshot validation + tenant guard + blocked-status check). Review after those patches are applied to determine if additional server-side state reading is warranted. [apps/web/app/actions/invoices.ts — undoInvoiceAction]
- [ ] `dashboard/page.tsx` date range cross-field sanity (`from > to`) drops `to` silently with no UX error banner. Code comment acknowledges "A UX error banner is a future enhancement." Add an inline warning or query-param feedback when the filter UI is improved. [apps/web/app/(app)/dashboard/page.tsx — from/to cross-field check]
- [ ] `SessionSummary errorCount={0}` hardcoded — `WithCorrections` variant is unreachable in production. Session-level correction tracking requires audit events (Story 4.2 `audit_logs`). Wire it up in Story 4.2 when session tracking lands. [apps/web/app/(app)/dashboard/page.tsx — SessionSummary errorCount prop]
- [ ] `SessionSummary streakWeeks={0}` hardcoded — `StreakMilestone` variant never triggers. Explicitly Story 8.3 work per story's Technical Concerns. [apps/web/components/dashboard/session-summary.tsx — streakWeeks]
- [ ] `InvoiceActionsHeader` renders for all invoice statuses (including `exported`) — action buttons disabled via `isExported` guard but header is still present. Functionally safe; cosmetically could confuse users who see the header with disabled buttons on an exported invoice. Hide entirely when `status === 'exported'` if feedback warrants. [apps/web/components/invoice/invoice-actions-header.tsx]
- [ ] `fireUndo` in `InvoiceActionsHeader` silently logs undo failures to console — no user-facing feedback if undo fails (e.g. concurrent modification or server error). Add a brief error toast in Story 3.5 error-feedback pass. [apps/web/components/invoice/invoice-actions-header.tsx — fireUndo]
- [ ] `SessionSummary` `FirstSession` variant can reappear after browser/tab close without dismissal — sessionStorage is cleared on tab close, so first-session card shows again next visit. Spec does not define persistent-dismiss. Revisit in Story 8.3 (user preferences). [apps/web/components/dashboard/session-summary.tsx — FIRST_SESSION_KEY]

## Deferred from: code review of 3-3-skr-categorization-and-bu-schluessel-mapping (2026-04-26)

- [x] **→ Story 3.4 scope:** Always-visible "Beleg ansehen" / Source Document Viewer trigger in `<InvoiceDetailPane />` header. **Resolved in Story 3.4:** `InvoiceActionsHeader` has "Beleg ansehen" button wired to `SourceDocumentViewer` — confirmed in `apps/web/components/invoice/invoice-actions-header.tsx`. [apps/web/components/invoice/invoice-detail-pane.tsx:162-169]
- [ ] Custom div-based SKR dropdown lacks keyboard a11y (no Escape/Tab/Arrow nav, `aria-haspopup="listbox"` advertised but not honored). Task 5.2 spec said `<Select>` fallback when shadcn Popover+Command absent; implementation rolled custom dropdown instead. Address in dedicated a11y story or when shadcn Popover+Command is added. [apps/web/components/invoice/skr-category-select.tsx:1006-1071]
- [ ] `SkrCategorySelect` lacks AbortController for stale-result race — rapid sequential code selections can interleave; older response may overwrite newer in UI/DB. Real-world incidence low. [apps/web/components/invoice/skr-category-select.tsx:103-123]
- [ ] `updateInvoiceSKR` corrections insert is non-atomic with main update — by design (matches Story 3.2 `correctInvoiceField` pattern: log + Sentry, return success). Audit trail can lose corrections silently if insert fails after main UPDATE commits. Wrap in transaction when refactoring server-action infrastructure. [apps/web/app/actions/invoices.ts:912-946]
- [ ] `skr_plan` string coercion repeated in 3 places (page, component, server action). Tenant `skr_plan = "SKR03"` (uppercase) or future variants silently fall through to `"skr03"`. Add a centralized parser with logging on unknown values. [apps/web/app/(app)/rechnungen/[id]/page.tsx:117 + invoice-detail-pane.tsx:809 + actions/invoices.ts]
- [ ] `recentCodes` cross-plan filter — `categorization_corrections` rows have no `skr_plan` column. If tenant switches plan, prior corrections from old plan silently dropped (correct safety direction, but no UI feedback). Address when plan-migration UX is designed. [apps/web/components/invoice/skr-category-select.tsx:38, app/(app)/rechnungen/[id]/page.tsx:51-58]
- [ ] Test fragility: top-level `await import("ai")` in `categorize-invoice.test.ts:1151` may break across Vitest pool/worker configs; non-null assertion `option3400.querySelector("button")!` in `skr-category-select.test.tsx:889` masks rendering changes as runtime errors instead of meaningful failures. Refactor when next touching these tests.

## Deferred from: code review of 3-2-invoice-detail-view-and-field-editing (2026-04-24)

- [ ] SourceDocumentViewer TTL cache ineffective: `SourceDocumentViewerWrapper` unmounts `<SourceDocumentViewer>` on close, resetting `openedOnce.current`; the 55s re-use branch in the useEffect is unreachable. Every tap fetches a fresh signed URL. Move URL state up to wrapper or use a persistent parent to restore TTL behaviour. [apps/web/components/invoice/source-document-viewer.tsx + source-document-viewer-wrapper.tsx]
- [ ] `revalidatePath("/dashboard")` called from `correctInvoiceField` without `type: "layout"` — may not invalidate RSC cache for `/dashboard?selected=<id>` query-param pages depending on Next.js cache configuration. Monitor after Story 3.3 if stale detail pane data surfaces. [apps/web/app/actions/invoices.ts]
- [ ] Safe-cast migration regex `'^-?[0-9]+(\.[0-9]+)?$'` in `gross_total_value` generated column yields NULL for scientific-notation values (e.g. `1.5e3`) or non-standard AI output formats. Currently safe since the AI extractor emits plain decimal strings. Revisit if extractor format changes. [supabase/migrations/20260424100000_invoice_sort_columns_safe_cast.sql]

## Deferred from: code review of 3-1-pipeline-dashboard-and-invoice-list (2026-04-23)

- [ ] No auth guard in dashboard page — unauthenticated users see German error card instead of redirect to `/login` [apps/web/app/(app)/dashboard/page.tsx:20-31]. Middleware-level concern.
- [ ] `CHECK (extraction_attempts <= 5)` migration added without `NOT VALID` safety hatch [supabase/migrations/20260422000000_dashboard_aggregations.sql:1981]. Currently acceptable; revisit if any row breaches.
- [ ] Global `window` Escape listener in PipelineHeaderStages may conflict with future modals (Story 3.2 detail pane) [apps/web/components/dashboard/pipeline-header-stages.tsx:54-68]. Address when 3.2 introduces dialogs.
- [ ] Per-field `safeParse` loop in `parseDashboardQuery` bypasses schema-wide transforms and couples to Zod internals [apps/web/lib/dashboard-query.ts:1707-1718]. Refactor to a single `schema.safeParse(flat)` with `.partial()`.
- [ ] **P12 — Dashboard realtime count** *(deferred to Story 3.2)* — AC #18 smoke-test row (k) claims "within 5 seconds of capture without a manual refresh". The current RSC dashboard has no `revalidate` or realtime subscription. Story 3.2 introduces the interactive detail pane; realtime count updates fit naturally in that scope. Options: (a) `export const revalidate = 0` + tag-based revalidation from server actions; (b) client-side Supabase `realtime.channel("invoices")` subscription that refreshes counts. [apps/web/app/(app)/dashboard/page.tsx]
- [ ] **P14 — Generated column safe cast** *(deferred to Story 3.2)* — `gross_total_value` / `supplier_name_value` STORED columns cast `invoice_data -> 'gross_total' ->> 'value'` to NUMERIC at INSERT time. If the AI extractor ever emits German-formatted strings (`"1.234,56"`) or non-numeric placeholders (`"n/a"`), every future insert fails. Needs a new migration to drop and recreate the columns with a safe `CASE WHEN value ~ '^[0-9.]+$' THEN value::NUMERIC END` cast. Address in Story 3.2 alongside any other migration work. [supabase/migrations/20260423000000_invoice_sort_columns.sql]

## Deferred from: code review of 2-3-batch-invoice-upload (2026-04-21)

- [ ] Per-file `submitBlob` serializes uploads in multi-file picker path [apps/web/components/capture/camera-capture-shell.tsx onGalleryChange ~526-548] — `for..of + await` serializes 20 uploads plus their retry ladders (1s/3s/5s), potentially blowing NFR2 60s p95 budget on slow networks. Spec wording is ambiguous ("await each enqueue before the next … uploads themselves run in parallel"). Needs design call: keep serial for store-ordering stability, or parallelize with `Promise.all(files.map(...))` / batched fan-out.

## Deferred from: code review of 1-2-design-token-system-and-base-layout (2026-04-12)

- [x] `.dark` theme tokens removed but `dark:` variants remain in shadcn primitives (badge, sheet, dropdown-menu). Latent dead code; no runtime impact while `.dark` class is never applied. Revisit when dark mode is reintroduced or strip `dark:` variants for cleanliness.
- [x] `next/font/local` lacks `adjustFontFallback`. Causes measurable CLS when Inter swaps in over the fallback stack. Optimization, not in AC.
- [x] Four weight-specific Inter woff2 files are all declared `preload: true` (~400-500KB critical-path). A single variable Inter file would cut the font payload ~40% and improve LCP on slow networks.
- [x] `font-feature-settings: "cv11", "ss01"` on body may silently no-op if the subsetted woff2 lacks feature tables. Cosmetic (alternate `a`/`l` glyphs); verify or drop.
- [x] DelayedLoading `aria-busy="true"` never transitions to `false`. Screen readers remain "busy" indefinitely on stuck loads.
- [x] Skeleton loading provides no initial "Lädt…" announcement until the 5s "Dauert etwas länger…" message fires. AT users hear silence for 5s.

## Deferred from: code review of 1-3-user-registration-and-authentication (2026-04-13)

- [ ] `public.users.updated_at` column missing while `users_update_self` policy allows mutation — add column + trigger for audit-trail consistency with `tenants`.
- [ ] Redundant `unique (tenant_id, id)` on `public.users` — `id` is already PK; cosmetic cleanup.

## Deferred from: code review of 1-3-user-registration-and-authentication (2026-04-13, second pass)

- [ ] Browser Supabase client singleton survives `signOut` — stale auth state on rapid account-switch in same tab; rare scenario. [apps/web/lib/supabase/client.ts]
- [ ] `decodeAmr` literal `"recovery"` AMR check may not match actual Supabase recovery tokens (could be `"otp"`); needs token-shape verification with real Supabase recovery flow before patching. [apps/web/app/actions/auth.ts:324-336]
- [ ] `reset-update-form` does not call `signOut` after password change — recovery session becomes implicit login; AC #6 unspecified.
- [ ] `form.formState.errors.root` rendering not added to login-form / reset-update-form — server-action throws may be invisible.
- [ ] `set_updated_at` trigger column-grant interaction — verify with manual `UPDATE tenants` as authenticated role before patching.
- [ ] `transpilePackages: ["@rechnungsai/shared"]` + extensionless imports (`./schemas/auth`) rely on Turbopack source resolution — add a build step to `@rechnungsai/shared` before any non-Next consumer (tests, tooling, other apps).
- [ ] `FormControl` `React.cloneElement` silently overwrites child `id`/`aria-describedby`/`aria-invalid` — merge rather than overwrite, or warn when a child sets them.
- [ ] Dashboard `Abmelden` button has no error-path UX — relies on redirect even when `signOut` fails (cookie still valid → middleware bounces back). Dashboard is replaced in Story 1.5; revisit then.
- [ ] `signOut` Server Action has no explicit CSRF/auth check — Next.js default origin check covers common cases; add explicit origin validation once settings menu (Story 1.5) lands.
- [ ] No automated tests added (auth is security-critical) — Vitest harness deferred since Story 1.2. Blocker for future auth refactors.
- [ ] Trust page `/onboarding/trust` doesn't persist any onboarding-complete marker — Story 1.4 must set `tenants.company_name` or equivalent flag to exit the current callback heuristic.
- [ ] Middleware runs `updateSession` then short-circuits for `/auth/callback` — cookie-set race possible between middleware response and route handler `exchangeCodeForSession`. Revisit if auth flake surfaces.
- [ ] `createServerClient` silently swallows cookie-set failures in Server Actions (not just Server Components). Surface these with telemetry once Sentry is wired.
- [ ] `requestPasswordReset` returns success even on legitimate rate-limit errors (by design for enumeration protection) — add observability/log severity instead of silent pass.
- [ ] Multiple `owner` roles per tenant possible after invite flow lands — constrain with `unique (tenant_id) where role = 'owner'` partial index in Story 1.5.

## Deferred from: code review of 1-4-trust-building-onboarding-flow (2026-04-15)

- [ ] Race between `handle_new_user` trigger and middleware `public.users` row probe — first post-callback navigation may read null row and force `/login?error=account_setup_failed`. Needs retry/backoff or grace period. [apps/web/middleware.ts]
- [ ] Middleware does not preserve deep-link destination via `?next=` on onboarding redirect. UX polish. [apps/web/middleware.ts]
- [ ] `Button` + `nativeButton={false}` + `render={<Link>}` nested pattern fragile; recurring fix history. Affects prior stories. [apps/web/components/onboarding/first-invoice-prompt.tsx]
- [ ] No automated tests for middleware redirect logic, RPC consent semantics, or zod schema edges. Test harness is Epic-level. FR51 legal exposure implies risk. [root]
- [ ] No `aria-invalid` wiring on shadcn `Input` components. Shared across all forms. [apps/web/components/onboarding/setup-form.tsx]
- [ ] No `onboarding/error.tsx` — uncaught errors bubble to root boundary, dropping stepper/layout. Boundary UX polish. [apps/web/app/onboarding/]
- [ ] Stepper lacks back-navigation affordance. MVP scope. [apps/web/components/onboarding/onboarding-stepper.tsx]
- [ ] Browser back button + bfcache restores stale setup form to already-onboarded user before middleware redirect fires. Transient UI glitch. [apps/web/components/onboarding/setup-form.tsx]
- [ ] `Functions.complete_onboarding.Returns: undefined` in generated types (should be `null` for void SQL). Re-run `supabase gen types`. [packages/shared/src/types/database.ts]
- [ ] Server Action lacks explicit CSRF/origin check beyond Next.js built-in Action origin enforcement. Defensive hardening. [apps/web/app/actions/onboarding.ts]
- [ ] "Später ergänzen" placeholder `"Mein Unternehmen"` — after skip sets `onboarded_at`, user is locked out of `/onboarding/setup`. Add re-onboarding / edit-company path when settings UI Epic lands. [apps/web/components/onboarding/setup-form.tsx]
## Deferred from: code review of 1-5-tenant-settings-and-dashboard-shell (2026-04-16)

- Mobile sign-out affordance missing — desktop-only `SidebarNav` footer ships; MobileNav 3-col grid has no 4th slot. Revisit in Epic 3 nav refactor (`apps/web/components/layout/sign-out-menu.tsx`)
- Full-row update without optimistic concurrency on `updateTenantSettings` — concurrent edits silently overwrite; add `updated_at` check or narrow update payload to changed fields (`apps/web/app/actions/tenant.ts:44-50`)
- Migration `add constraint` clauses not idempotent and no down/rollback for `revoke update on public.tenants` — partial failure or rollback requires manual recovery (`supabase/migrations/20260415100000_tenant_settings.sql`)
- Sign-out form discards unsaved settings form edits without `beforeunload` prompt — cross-app UX decision (`apps/web/components/layout/sign-out-menu.tsx`)
- SKR plan two-button `role="radiogroup"` + `aria-pressed` pattern lacks arrow-key navigation; inherited from Story 1.4 setup-form — fix in shared component (`apps/web/components/settings/tenant-settings-form.tsx:101-127`)
- Regenerated `database.ts` surfaces `my_tenant_id` and reordered `complete_onboarding` args with no migration in this diff — verify no missing migration (`packages/shared/src/types/database.ts`)

## Deferred from: code review of 2-1-single-invoice-upload-photo-pdf-image-xml (2026-04-17)

- Tenant ID sourced from `users` DB row (not JWT claim) — pre-existing Story 1.5 pattern explicitly required by spec; RLS `WITH CHECK` enforces tenancy. Revisit if `users` table gains an untrusted update path. (`apps/web/app/actions/invoices.ts:72–78`)
- FK `on delete restrict` on `invoices.tenant_id` blocks GDPR tenant erasure — no service-role cleanup path exists; a GDPR erasure deleting the tenant row will fail at the DB layer. Epic-level retention policy concern. (`supabase/migrations/20260417100000_invoices_table.sql:32`)
- `openDb()` opens a new IDB connection per call — minor design debt; functional for single-tab usage. `versionchange` races only matter on multi-tab access or a future `DB_VERSION` bump. (`apps/web/lib/offline/invoice-queue.ts:18–32`)
- IDB `updateStatus` uses `await` inside a `readwrite` transaction — potential `TransactionInactiveError` in pre-2021 browsers; not a risk in target environments (Chrome 89+, Firefox 82+). (`apps/web/lib/offline/invoice-queue.ts:114–127`)
- `compressJpeg` creates a new `HTMLCanvasElement` per compression attempt — memory pressure on low-memory devices capturing many invoices rapidly; GC-dependent cleanup. (`apps/web/components/capture/camera-capture-shell.tsx:61–74`)
- Storage orphan accumulation: compensating `supabase.storage.remove()` on insert failure is best-effort; if it fails, the orphaned blob has no retry path, no dead-letter queue, and no reconciliation job. Post-Epic-2 infra concern. (`apps/web/app/actions/invoices.ts:133–141`)

## Deferred from: code review of 2-2-ai-data-extraction-pipeline (2026-04-17)

- XML invoice decoded as UTF-8 regardless of declared charset — ISO-8859-1 ZUGFeRD invoices may garble German characters (ä, ö, ü, ß). Fix: parse XML prolog for `encoding=` and pass to `TextDecoder`. Out of AC scope; file for Epic 3/4 ZUGFeRD work. (`packages/ai/src/extract-invoice.ts:83`)
- `as unknown as` cast disables TypeScript on `generateObject` call — Zod v3/v4 peer conflict documented in completion notes. Resolve when upgrading to Zod v4 repo-wide. (`packages/ai/src/extract-invoice.ts`)
- System prompt passed as top-level `system:` arg instead of inside `messages[]` — AI SDK v6 accepts both forms at runtime; minor spec deviation only. (`packages/ai/src/extract-invoice.ts`)
- No timeout / stale-state recovery for `processing` skeleton — row stuck in `processing` causes infinite skeleton with no recovery path. Epic 3 dashboard will surface `extraction_error` for orphaned rows. (`apps/web/components/invoice/extraction-results-client.tsx`)
- NEXT_REDIRECT detection couples to Next.js internals (`digest.startsWith("NEXT_REDIRECT")`) — same pattern from Story 2.1; track against Next.js upgrade. (`apps/web/app/actions/invoices.ts:324-330`)
- `drainQueue` can fire concurrently from mount + `online` event — pre-existing Story 2.1 issue; Story 2.3 batch flow will refactor this path. (`apps/web/components/capture/camera-capture-shell.tsx`)
- Signed URL 60-second TTL may expire under cold-start + large PDF — operational risk only under high load. Monitor p95 latency; bump TTL if needed. (`apps/web/app/actions/invoices.ts:258-260`)
- `extraction_attempts` unbounded + `smallint` overflow — explicitly out of scope per AC #1. Rate-limiting is Epic 3+ concern. (`supabase/migrations/20260417120000_invoices_extraction_columns.sql`)
- `overallConfidence` excludes `supplier_address`, `recipient_name`, `recipient_address`, `payment_terms` from minimum calculation — by spec design (seven scalar keys). Epic 3 may revisit if legal-field confidence needs to affect routing. (`packages/shared/src/schemas/invoice.ts`)
- `globalThis.process?.env` indirection in provider.ts — minor style issue, not new in this story; simplify to `process.env` when environment is confirmed Node-only. (`packages/ai/src/provider.ts`)
- `invoice[key]` cast breaks silently on schema evolution — low risk until schema changes; add a type guard if `Invoice` gains non-envelope fields. (`apps/web/components/invoice/extraction-results-client.tsx`)
- Out-of-range confidence values from manually edited JSONB misclassify confidence level — Epic 3 DB access controls will prevent manual edits; add Zod validation at the RSC boundary if needed. (`apps/web/components/invoice/extraction-results-client.tsx`)
