# Deferred Work

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
