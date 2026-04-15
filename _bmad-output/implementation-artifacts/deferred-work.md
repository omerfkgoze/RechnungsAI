# Deferred Work

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
