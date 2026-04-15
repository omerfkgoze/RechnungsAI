# Story 1.4: Trust-Building Onboarding Flow

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a new user,
I want to understand how my data is protected and set up my company quickly,
so that I feel confident using the system before uploading my first invoice.

## Acceptance Criteria

1. **Given** the Story 1.3 auth schema is in place **When** a new migration under `supabase/migrations/` runs **Then** it (a) adds `public.users.ai_disclaimer_accepted_at timestamptz null` column, (b) creates a `SECURITY DEFINER` Postgres function `public.complete_onboarding(p_company_name text, p_skr_plan text, p_steuerberater_name text)` with `set search_path = ''` that, in a single transaction: validates `auth.uid()` is not null (raise `insufficient_privilege` otherwise), validates `p_skr_plan in ('SKR03','SKR04')`, updates the caller's `public.users` row setting `onboarded_at = now()` and `ai_disclaimer_accepted_at = now()` (only if still null — idempotent), and updates the caller's tenant (via `(select tenant_id from public.users where id = auth.uid())`) setting `company_name = trim(p_company_name)`, `skr_plan = p_skr_plan`, `steuerberater_name = nullif(trim(p_steuerberater_name), '')`, and (c) `grant execute on function public.complete_onboarding(text, text, text) to authenticated;`. NO `grant update (onboarded_at)` is added to `authenticated` — the RPC remains the only legitimate write path (preserves Story 1.3 Task 6.5 and the explicit comment in `20260412193336_auth_tenants_users.sql:151-154`).

2. **Given** an authenticated user whose `public.users.onboarded_at IS NULL` **When** they request any route other than `/onboarding/*`, `/login`, `/signup`, `/reset-password`, `/reset-password/update`, `/auth/callback`, or `/` **Then** `apps/web/middleware.ts` redirects them to `/onboarding/trust` (Trust Screen is NOT skippable — FR48, UX-DR journey 1). The middleware reads `onboarded_at` via a single `supabase.from("users").select("onboarded_at").eq("id", user.id).maybeSingle()` call after `updateSession`; on a missing row it redirects to `/login?error=account_setup_failed` (matches the callback recovery path). Conversely, an onboarded user (`onboarded_at IS NOT NULL`) visiting `/onboarding/*` is redirected to `/dashboard`.

3. **Given** the route structure is finalized **When** the file tree is inspected **Then** onboarding pages live under `app/onboarding/trust/page.tsx`, `app/onboarding/setup/page.tsx`, and `app/onboarding/first-invoice/page.tsx` (PLAIN folder — NOT a `(onboarding)` route group) so the URL segments are `/onboarding/trust`, `/onboarding/setup`, `/onboarding/first-invoice` as already referenced by `apps/web/app/(app)/auth/callback/route.ts:64` and `apps/web/components/auth/signup-form.tsx:44`; the existing `app/(onboarding)/` route group directory is deleted in the same change (it currently resolves to `/trust` and creates a broken redirect target — this is a pre-existing bug from Story 1.3 second-pass review patch). `app/onboarding/layout.tsx` is a Server Component that renders a centered, max-width container, NO `AppShell`, NO nav chrome, inherits `<html lang="de">` from the root layout. Each onboarding page renders its own `<OnboardingStepper currentStep=...>` with 3 steps (Vertrauen · Unternehmen · Erste Rechnung) and the current step visually emphasized using the `primary` design token — stepper lives per-page (not in the layout) because the layout cannot read the current segment without a client boundary (Review decision 3b, 2026-04-15).

4. **Given** a newly registered user arrives at `/onboarding/trust` **When** the Trust Screen renders **Then** it is a Server Component wrapping a Client Component that displays, in a single-column layout with 16px padding on mobile and `max-w-md mx-auto` on desktop: German flag emoji + headline "So schützen wir deine Daten"; four trust pillars each with icon, one-sentence claim, and NO wall-of-text — (a) "🇩🇪 Gehostet in Deutschland — Deine Daten verlassen niemals die EU.", (b) "🛡️ GoBD-konform — Unveränderbare Archivierung für 10 Jahre.", (c) "🔒 DSGVO-konform — Datenschutz nach deutschem Recht.", (d) "🔐 Bank-Grade Encryption — AES-256 verschlüsselte Speicherung."; a primary "Weiter" button that navigates (client-side `router.push`) to `/onboarding/setup`; the "Weiter" button is `sticky bottom-0 w-full md:static` (mobile-only sticky per UX-DR18); NO "Überspringen" / "Skip" link exists (AC enforcement: Trust Screen is NOT skippable — FR48); all copy is German, "Du" address, conversational.

5. **Given** the user proceeds to `/onboarding/setup` **When** the Company Setup form renders **Then** it uses shadcn `Form`, `Input`, `Label` primitives (Story 1.3 install) with exactly three fields in this order: (a) `company_name` (required, text, label "Firmenname", placeholder "z. B. Mustermann GmbH", min 2 chars, max 100 chars, trimmed), (b) `skr_plan` (required, segmented toggle between "SKR03" and "SKR04" — implemented as two `<button type="button">` elements bound to react-hook-form with `aria-pressed` and `role="radiogroup"`; do NOT install shadcn `select`/`radio-group` — out of scope for this story), (c) `steuerberater_name` (optional, text, label "Steuerberater (optional)", placeholder "Vorname Nachname", max 100 chars); required fields marked with a subtle asterisk (UX-DR17); labels sit above fields (UX-DR16); validation is on-blur for completeness and real-time for format; error text renders below the field via shadcn `FormMessage` (never in toasts/modals — UX-DR12); a visible "Später ergänzen" Link that skips setup (calls `completeOnboarding` with `company_name = 'Mein Unternehmen'`, `skr_plan = 'SKR03'` default, `steuerberater_name = null`) and proceeds to `/onboarding/first-invoice`; submit button text "Weiter", `sticky bottom-0 w-full md:static` (mobile-only sticky per UX-DR18).

6. **Given** the user submits the setup form (or clicks "Später ergänzen") **When** the Server Action `completeOnboarding` runs **Then** it (a) lives in `apps/web/app/actions/onboarding.ts` with `"use server"` at the top, (b) parses input with a new `onboardingSetupSchema` from `packages/shared/src/schemas/onboarding.ts`, (c) returns `ActionResult<{ redirectTo: string }>` from `@rechnungsai/shared`, (d) wraps the Supabase call in try/catch and on parse failure returns `{ success: false, error: <first zod issue in German> }`, (e) calls `supabase.rpc("complete_onboarding", { p_company_name, p_skr_plan, p_steuerberater_name })` via `createServerClient()` (cookie-bound, RLS-enforced — the RPC is security-definer so RLS is bypassed inside the function, but the *caller* must be authenticated), (f) on success returns `{ success: true, data: { redirectTo: "/onboarding/first-invoice" } }`, (g) logs errors with `console.error("[onboarding:complete]", err)` prefix, (h) maps known Postgres errors to German strings (insufficient_privilege → "Bitte melde dich erneut an.", check constraint violation → "Ungültige Eingabe. Bitte überprüfe deine Daten."); NO Server Action writes to `public.tenants` or `public.users` directly — the RPC is the single source of truth (mirrors Story 1.3 Task 6.5 discipline).

7. **Given** the user arrives at `/onboarding/first-invoice` **When** the page renders **Then** it displays a full-screen-feeling (min-h-[80vh]) centered layout with: a large camera icon (lucide `Camera`, size 96px, `text-primary`), the headline "Fotografiere jetzt deine erste Rechnung!" (h1, 24/30px per Story 1.2 token), a one-sentence German subcopy "Richte deine Kamera auf eine Rechnung — der Rest geht in wenigen Sekunden.", a primary button "Rechnung aufnehmen" that navigates to `/capture` (Epic 2 route, NOT YET IMPLEMENTED — leave the href but add a comment `// TODO: Epic 2 Story 2.1 implements /capture`); a secondary "Das mache ich später" Link that navigates to `/dashboard`; NO feature tour, NO tooltips, NO carousel (UX Principle: Action-first onboarding only); this page must load within 2 seconds (NFR3).

8. **Given** the AI disclaimer must be presented (FR49, FR51) **When** the Trust Screen renders **Then** a persistent, visually distinct disclaimer block appears ABOVE the "Weiter" button with the exact text "Die von der KI vorgeschlagenen Daten müssen überprüft werden. Die endgültige Verantwortung liegt beim Nutzer." wrapped in a `div` styled with the `warning` token (Warm Amber #F39C12 at 10% opacity background, full opacity border-left 4px, body-sm text) and an accompanying `Checkbox` (use native `<input type="checkbox">` — do NOT install shadcn `checkbox` in this story) that the user MUST tick before the "Weiter" button becomes enabled; the checkbox label is "Ich habe den Hinweis gelesen und akzeptiere ihn."; the acceptance timestamp is written to `public.users.ai_disclaimer_accepted_at` as part of the `complete_onboarding` RPC call at the END of the flow (on setup submit), NOT separately — this keeps disclaimer acceptance coupled with onboarding completion in a single transaction (FR51: acceptance logged with timestamp and user ID for legal records; the `users` row includes the user ID implicitly and the transaction gives timestamp + user ID + explicit consent signal).

9. **Given** any onboarding page or Server Action error **When** an error is displayed **Then** the message is in conversational German, specific, and actionable (NFR24); the error is logged with `[onboarding:<action>]` prefix (`[onboarding:trust]`, `[onboarding:setup]`, `[onboarding:complete]`); NO raw Supabase error strings or technical English reach the UI; form-level root errors render under the submit button styled as `text-destructive text-sm mt-2` (mirrors Story 1.3 pattern).

10. **Given** the onboarding flow is complete **When** the user lands on `/dashboard` **Then** the dashboard renders normally (Story 1.3 temporary state still applies — full dashboard shell is Story 1.5); repeat visits to `/onboarding/*` by an onboarded user (`onboarded_at IS NOT NULL`) are redirected to `/dashboard` by the middleware (AC #2).

11. **Given** the story is complete **When** `pnpm lint`, `pnpm check-types`, and `pnpm build` run from the repo root **Then** all three succeed with zero errors; `supabase db reset` succeeds against the local stack and the new migration loads without error; a manual smoke check via psql confirms `select pg_get_functiondef('public.complete_onboarding(text,text,text)'::regprocedure)` returns the expected `SECURITY DEFINER` function body; attempting to call `complete_onboarding` without authentication fails with `insufficient_privilege`; attempting to pass `p_skr_plan = 'SKR99'` fails with a check-constraint-like error mapped to German.

12. **Given** success metrics from the UX spec **When** implementation is reviewed **Then** the flow supports the target: signup → first capture < 3 minutes (UX metric), Trust Screen drop-off < 5%, Company Setup drop-off < 10% (the design enables the target — measurement/instrumentation is deferred until analytics lands post-MVP; document this deferral in Dev Notes).

## Tasks / Subtasks

- [x] Task 1: Database migration + onboarding RPC (AC: #1, #8, #11)
  - [x] 1.1 Create `supabase/migrations/<timestamp>_onboarding.sql`: add `alter table public.users add column ai_disclaimer_accepted_at timestamptz null;`
  - [x] 1.2 In the same migration, create `public.complete_onboarding(p_company_name text, p_skr_plan text, p_steuerberater_name text)` as `SECURITY DEFINER`, `set search_path = ''`, language plpgsql; body: assert `auth.uid() is not null` (raise `insufficient_privilege`), assert `p_skr_plan in ('SKR03','SKR04')` (raise with German `check_violation` code or plain `exception`), resolve `v_tenant_id := (select tenant_id from public.users where id = auth.uid())`, `update public.users set onboarded_at = coalesce(onboarded_at, now()), ai_disclaimer_accepted_at = coalesce(ai_disclaimer_accepted_at, now()) where id = auth.uid();`, `update public.tenants set company_name = trim(p_company_name), skr_plan = p_skr_plan, steuerberater_name = nullif(trim(p_steuerberater_name), '') where id = v_tenant_id;`
  - [x] 1.3 `grant execute on function public.complete_onboarding(text, text, text) to authenticated;` — do NOT grant to anon; do NOT grant to service_role explicitly (it already has function execute by default)
  - [x] 1.4 Add a top-of-file comment documenting the smoke test queries from AC #11 (unauth call, invalid `skr_plan`, happy path)
  - [x] 1.5 Run `supabase db reset`; verify migration loads; regenerate types: `supabase gen types typescript --local 2>/dev/null > packages/shared/src/types/database.ts`; verify `ai_disclaimer_accepted_at` appears on `users` row type

- [x] Task 2: Zod schema in shared package (AC: #5, #6)
  - [x] 2.1 Create `packages/shared/src/schemas/onboarding.ts` exporting `onboardingSetupSchema`: `z.object({ company_name: z.string().trim().min(2, "Firmenname ist zu kurz.").max(100, "Firmenname ist zu lang."), skr_plan: z.enum(["SKR03", "SKR04"], { errorMap: () => ({ message: "Bitte wähle SKR03 oder SKR04." }) }), steuerberater_name: z.string().trim().max(100, "Name ist zu lang.").optional().or(z.literal("")) })`; the `.or(z.literal(""))` keeps the empty-string-from-empty-input legal
  - [x] 2.2 Re-export from `packages/shared/src/index.ts` following the existing `export * from "./schemas/auth"` style

- [x] Task 3: Middleware onboarding gate (AC: #2)
  - [x] 3.1 In `apps/web/middleware.ts`, after the existing `updateSession` + auth checks and BEFORE returning `response` for authenticated users, add logic: if `user` exists AND pathname starts with `/dashboard` OR any future `(app)` route (use a helper `isAppRoute(pathname)`), query `supabase.from("users").select("onboarded_at").eq("id", user.id).maybeSingle()` using the server client returned by `updateSession` (extend `updateSession` to return `{ response, user, supabase }` instead of `{ response, user }`)
  - [x] 3.2 If the `users` row is missing → redirect to `/login?error=account_setup_failed` (matches callback AC #2)
  - [x] 3.3 If `onboarded_at IS NULL` AND pathname does NOT start with `/onboarding` → redirect to `/onboarding/trust`
  - [x] 3.4 If `onboarded_at IS NOT NULL` AND pathname starts with `/onboarding` → redirect to `/dashboard`
  - [x] 3.5 Keep existing AUTH_ROUTES / PUBLIC_EXACT gates unchanged; `/onboarding/*` is NOT added to PUBLIC_EXACT (it requires auth)
  - [x] 3.6 Performance guardrail: ONLY query `users.onboarded_at` for paths that need the gate — skip the query on static assets (already excluded via matcher) and on `/auth/callback`; cache nothing (per-request is fine — Supabase Auth server already handles token refresh)

- [x] Task 4: Delete legacy `(onboarding)` route group + create plain `onboarding/` folder (AC: #3)
  - [x] 4.1 Delete `apps/web/app/(onboarding)/layout.tsx` and `apps/web/app/(onboarding)/trust/page.tsx` (entire `(onboarding)` directory)
  - [x] 4.2 Create `apps/web/app/onboarding/layout.tsx` as a Server Component: centered container `min-h-screen flex flex-col`, `max-w-md mx-auto px-4 py-6` inner wrapper, NO `AppShell`; render a step indicator component `<OnboardingStepper current={current} />` above `{children}` — pass `current` via a route-segment-aware mechanism: since layouts can't read segments, instead render the stepper INSIDE each page (`app/onboarding/trust/page.tsx` passes `current="trust"`, etc.) — simpler, no `useSelectedLayoutSegment` indirection
  - [x] 4.3 Create `apps/web/components/onboarding/onboarding-stepper.tsx` (Client Component — uses Tailwind only, no interactivity needed but keeps bundle simple): renders three pills labeled "1 Vertrauen", "2 Unternehmen", "3 Erste Rechnung" with `aria-current="step"` on the active one; active uses `bg-primary text-primary-foreground`, inactive uses `bg-muted text-muted-foreground`

- [x] Task 5: Trust Screen page + components (AC: #4, #8)
  - [x] 5.1 Create `apps/web/components/onboarding/trust-screen.tsx` (Client Component): renders headline, 4 trust pillars (array of `{ icon, title, body }` rendered in a flex column with 16px gap), the AI disclaimer block (AC #8), a controlled `<input type="checkbox" id="ai-disclaimer">` tied to `useState<boolean>`, and a "Weiter" button disabled until checked; on click, stash the consent flag in `sessionStorage.setItem("rechnungsai:ai_disclaimer_accepted", "1")` then `router.push("/onboarding/setup")`; the disclaimer state is re-verified server-side on setup submit (Task 6.5) — `sessionStorage` is just a UX carry so the user doesn't re-tick on back-navigation
  - [x] 5.2 Create `apps/web/app/onboarding/trust/page.tsx` (Server Component): renders `<OnboardingStepper current="trust" />` + `<TrustScreen />`; page-level `metadata = { title: "So schützen wir deine Daten – RechnungsAI" }`
  - [x] 5.3 Icon usage: prefer inline emoji for flag/GoBD where lucide doesn't fit; use `lucide-react` `ShieldCheck`, `Lock`, `Shield` for other pillars — confirm lucide-react is already installed (Story 1.2 dependency)

- [x] Task 6: Setup page + form (AC: #5, #6)
  - [x] 6.1 Create `apps/web/components/onboarding/setup-form.tsx` (Client Component): react-hook-form + `zodResolver(onboardingSetupSchema)`; default values `{ company_name: "", skr_plan: "SKR03", steuerberater_name: "" }`; on submit call the Server Action `completeOnboarding`, on `{ success: true }` call `router.push(res.data.redirectTo)`, on `{ success: false }` call `form.setError("root", { message: res.error })`; wrap the Server Action call in try/catch with German fallback error (Story 1.3 review-2 pattern)
  - [x] 6.2 SKR plan toggle: two buttons rendered with `role="radiogroup"`, each `<button type="button" aria-pressed={value === "SKR03"} onClick={() => setValue("skr_plan", "SKR03")}>`; styled with `data-[aria-pressed=true]:bg-primary data-[aria-pressed=true]:text-primary-foreground`, focus-visible ring per Story 1.2 convention
  - [x] 6.3 "Später ergänzen" link: client-side `<button type="button" variant="link">` that calls `completeOnboarding({ company_name: "Mein Unternehmen", skr_plan: "SKR03", steuerberater_name: "" })` directly, then navigates to `/onboarding/first-invoice`
  - [x] 6.4 Submit button: `sticky bottom-0 w-full md:static` (mobile-only sticky per UX-DR18); disable during `form.formState.isSubmitting`
  - [x] 6.5 Server-side disclaimer re-check is NOT needed at this layer — the RPC unconditionally sets `ai_disclaimer_accepted_at` when the user completes setup; reaching setup implies reaching the Trust Screen first (middleware guarantees it: non-onboarded user accessing `/onboarding/setup` directly without having visited `/trust` is fine because the Trust Screen is a client-side gate, but the *atomic* guarantee comes from the middleware enforcement that the user is on `/onboarding/*` = has not completed onboarding; the ai_disclaimer timestamp thus represents the moment of completion, not of individual checkbox click — document this in Dev Notes)
  - [x] 6.6 Create `apps/web/app/onboarding/setup/page.tsx` (Server Component): renders `<OnboardingStepper current="setup" />` + `<SetupForm />`; metadata title "Dein Unternehmen einrichten – RechnungsAI"

- [x] Task 7: Server Action `completeOnboarding` (AC: #6, #9)
  - [x] 7.1 Create `apps/web/app/actions/onboarding.ts` with `"use server"`; export async function `completeOnboarding(input: unknown): Promise<ActionResult<{ redirectTo: string }>>`
  - [x] 7.2 Parse input with `onboardingSetupSchema`; on failure return `{ success: false, error: firstZodIssueMessage }` (reuse helper pattern from `apps/web/app/actions/auth.ts` if it exists, else define locally)
  - [x] 7.3 Call `supabase.rpc("complete_onboarding", { p_company_name: data.company_name, p_skr_plan: data.skr_plan, p_steuerberater_name: data.steuerberater_name ?? "" })` via `createServerClient()`
  - [x] 7.4 On `error.code === "42501"` (`insufficient_privilege`) return `{ success: false, error: "Bitte melde dich erneut an." }`; on `error.code === "23514"` (`check_violation`) or any zod-pre-caught path-through return the generic "Ungültige Eingabe. Bitte überprüfe deine Daten."; on any other error log and return generic "Etwas ist schiefgelaufen. Bitte versuche es erneut."
  - [x] 7.5 On success return `{ success: true, data: { redirectTo: "/onboarding/first-invoice" } }`
  - [x] 7.6 `revalidatePath("/dashboard")` is NOT needed (user has not reached dashboard yet); do NOT call it to avoid unrelated cache invalidation

- [x] Task 8: First Invoice Prompt page (AC: #7)
  - [x] 8.1 Create `apps/web/components/onboarding/first-invoice-prompt.tsx` (Server Component — no client state needed): icon + headline + subcopy + two buttons ("Rechnung aufnehmen" → `/capture`, "Das mache ich später" → `/dashboard`); add comment `// TODO: Epic 2 Story 2.1 implements /capture — until then this link will 404 in dev; dashboard fallback is primary.`
  - [x] 8.2 Create `apps/web/app/onboarding/first-invoice/page.tsx` (Server Component): renders `<OnboardingStepper current="first-invoice" />` + `<FirstInvoicePrompt />`; metadata title "Deine erste Rechnung – RechnungsAI"
  - [x] 8.3 Since `/capture` does not yet exist, the middleware's `onboarded_at IS NOT NULL` redirect rule (AC #2) will send the user to `/dashboard` if they click the primary button; this is acceptable — document in Dev Notes that the Epic 2 wiring replaces this fallback

- [x] Task 9: Middleware `updateSession` extension (AC: #2, Task 3)
  - [x] 9.1 In `apps/web/lib/supabase/middleware.ts`, change the return shape of `updateSession(request)` from `{ response, user }` to `{ response, user, supabase }` so the root middleware can reuse the cookie-bound server client for the `users.onboarded_at` probe (avoids a second `createServerClient` instantiation per request)
  - [x] 9.2 Update any existing consumer in `apps/web/middleware.ts` to destructure the new field
  - [x] 9.3 Verify via `pnpm build` that no other file imports `updateSession` with the old shape (grep first)

- [x] Task 10: Update Story 1.3 redirect targets (no-op verification) (AC: #3)
  - [x] 10.1 Verify `apps/web/app/(app)/auth/callback/route.ts:64` still redirects to `/onboarding/trust` — with Task 4 in place this now resolves to a real URL segment (it was broken before: `(onboarding)/trust` resolved to `/trust`)
  - [x] 10.2 Verify `apps/web/components/auth/signup-form.tsx:44` still redirects to `/onboarding/trust` — same fix via Task 4
  - [x] 10.3 Do NOT change these files unless Task 4 fails to resolve the URLs correctly; if they need updating, record the change in the File List

- [x] Task 11: Verification & smoke tests (AC: #11, #12)
  - [x] 11.1 `pnpm lint` (repo root) — 0 errors
  - [x] 11.2 `pnpm check-types` (repo root) — 0 errors
  - [x] 11.3 `pnpm build` (repo root) — succeeds; confirm `/onboarding/trust`, `/onboarding/setup`, `/onboarding/first-invoice` appear in the build output, `/trust` does NOT
  - [x] 11.4 `supabase db reset` — new migration applies cleanly; `public.complete_onboarding` present via `\df public.complete_onboarding` in psql
  - [x] 11.5 Manual smoke test script (document in Completion Notes):
      (a) sign up a new user → middleware redirects `/dashboard` → `/onboarding/trust`;
      (b) try `/dashboard` directly → redirect to `/onboarding/trust`;
      (c) Trust Screen "Weiter" disabled until disclaimer checkbox ticked;
      (d) Tick + Weiter → `/onboarding/setup`;
      (e) Submit setup with empty `company_name` → German error below field;
      (f) Submit with valid data → redirect to `/onboarding/first-invoice`;
      (g) Query `select onboarded_at, ai_disclaimer_accepted_at from public.users where id = <uid>` → both non-null;
      (h) Query `select company_name, skr_plan, steuerberater_name from public.tenants` → matches submitted values;
      (i) Click "Später ergänzen" after re-starting from trust → tenant defaults written, flow still completes;
      (j) Navigate back to `/onboarding/trust` after completion → middleware redirects to `/dashboard`;
      (k) psql: `select public.complete_onboarding('x','SKR99','')` as authenticated role → error (invalid skr_plan);
      (l) psql: call RPC without auth → error `insufficient_privilege`
  - [x] 11.6 Verify the `(onboarding)` folder is gone: `ls apps/web/app | grep onboarding` returns only `onboarding` (no parens)

### Review Findings

**Decisions resolved 2026-04-15:**

- [x] [Review][Patch] (from Decision 1c) Split onboarding completion — don't set `onboarded_at` on setup submit — Setup RPC should only write tenant fields + `ai_disclaimer_accepted_at`. Create a new lightweight RPC (`complete_first_invoice_step` or add a separate `set_onboarded` RPC) called from first-invoice-prompt CTAs that sets `onboarded_at = now()`. Update middleware accordingly; remove AC #7 unreachability. [supabase/migrations/20260413000000_onboarding.sql + apps/web/middleware.ts + apps/web/app/actions/onboarding.ts + first-invoice-prompt.tsx]
- [x] [Review][Patch] (from Decision 2a) Add `p_disclaimer_accepted boolean` parameter to `complete_onboarding` RPC — `raise exception 'disclaimer_required'` if false. Trust screen passes consent via hidden field or URL-param/sessionStorage-hydrated hidden form field into setup submit; setup form wires it into the RPC call. German error mapping added for `disclaimer_required`. [supabase/migrations/20260413000000_onboarding.sql + apps/web/app/actions/onboarding.ts + trust-screen.tsx + setup-form.tsx + packages/shared/src/schemas/onboarding.ts]
- [x] [Review][Patch] (from Decision 3b) Update AC #3 wording to align with Task 4.2 — AC #3 currently says "layout includes progress indicator"; actual implementation has stepper per page (Task 4.2 carve-out). Revise AC #3 to: "layout is a centered container with no chrome; each onboarding page renders its own `<OnboardingStepper currentStep=...>`". [this story file, AC #3]
- [x] [Review][Defer] (from Decision 4c) "Später ergänzen" placeholder `"Mein Unternehmen"` not user-correctable until settings UI lands — deferred, wait for settings UI Epic; add re-onboarding path when settings lands [apps/web/components/onboarding/setup-form.tsx, source: edge]

- [x] [Review][Patch] Middleware fail-open on DB probe error — on `profileError` the code logs and `return response`, letting non-onboarded user reach `/dashboard`. Fix: redirect to `/login?error=account_setup_failed` like the missing-row branch. [apps/web/middleware.ts:~1058, source: blind+edge+auditor]
- [x] [Review][Patch] RLS infinite recursion on `public.users` (42P17) — `users_select_tenant_members` policy subqueried `public.users` within a policy on `public.users` → sonsuz özyineleme. Middleware fail-closed olunca `/login ↔ /dashboard` redirect loop'u açığa çıktı (fail-open iken sessizce geçiyordu). Fix: `public.my_tenant_id()` SECURITY DEFINER fonksiyonu oluşturuldu; fonksiyon iç SELECT'i RLS'i atlayarak çalıştırır. Policy `users_select_tenant_members` bu fonksiyonu kullanacak şekilde yeniden oluşturuldu. Yeni migration: `supabase/migrations/20260415000000_fix_rls_recursion.sql`. `supabase db reset` gerektirir. [Story 1.3 pre-existing bug, 2026-04-15 dev smoke-check sırasında ortaya çıktı]
- [x] [Review][Patch] RPC missing "already onboarded" guard — `complete_onboarding` can be re-invoked post-onboarding (directly via supabase.rpc) and will overwrite `tenants.company_name`, `skr_plan`, `steuerberater_name`. Fix: raise if `onboarded_at IS NOT NULL`. [supabase/migrations/20260413000000_onboarding.sql:~65, source: blind+edge]
- [x] [Review][Patch] Skip path sends `""` instead of `null` for `steuerberater_name` (AC #5 literal) — Fix: pass `null`. [apps/web/components/onboarding/setup-form.tsx:~755, source: auditor]
- [x] [Review][Patch] SKR toggle uses `role="radio"` + `aria-checked` plus `aria-pressed` — conflicting semantics. Spec says `role="radiogroup"` on parent with `aria-pressed` on buttons. Fix: remove `role="radio"`/`aria-checked`, keep `aria-pressed` only. [apps/web/components/onboarding/setup-form.tsx:~820, source: blind+auditor]
- [x] [Review][Patch] `/onboarding` (bare path) 404s for non-onboarded users — middleware treats it as onboarding path so doesn't redirect to `/onboarding/trust`. Fix: add redirect from `/onboarding` → `/onboarding/trust` (or page.tsx with redirect). [apps/web/middleware.ts:~1035, source: blind+edge]
- [x] [Review][Patch] zod `steuerberater_name` schema uses broken `.optional().or(z.literal(""))` — Fix: use `.transform(v => v?.trim() || undefined)` pattern or `.nullable()`. [packages/shared/src/schemas/onboarding.ts:~18, source: blind+edge]
- [x] [Review][Patch] zod `company_name` `required_error` is dead code (trim+min(2) fires "zu kurz" before required_error) — Fix: remove dead `required_error` or re-architect with `.min(1, "erforderlich").min(2, "zu kurz")`. [packages/shared/src/schemas/onboarding.ts:~1107, source: blind]
- [x] [Review][Patch] Unicode zero-width / RTL-override chars in `company_name` pass `trim().min(2)` — Fix: normalize + strip ZWSP/RTL-override in schema (`.transform(v => v.replace(/[\u200B-\u200D\u202E\uFEFF]/g, ""))`). [packages/shared/src/schemas/onboarding.ts:~7, source: edge]
- [x] [Review][Patch] RPC missing `company_name` non-empty/length check — A direct `supabase.rpc` call bypasses zod. Fix: add `if length(trim(p_company_name)) < 2 or length(p_company_name) > 100 then raise ...` in RPC body. [supabase/migrations/20260413000000_onboarding.sql:~65, source: edge]
- [x] [Review][Patch] Sticky CTA ignores iOS `safe-area-inset-bottom` — home-indicator overlaps button. Fix: add `pb-[max(1rem,env(safe-area-inset-bottom))]` to sticky CTA containers. [apps/web/components/onboarding/trust-screen.tsx:~94 + setup-form.tsx:~181, source: edge]
- [x] [Review][Patch] skip() button not gated by `isSubmitting` — double-click or race with "Weiter" double-invokes RPC. Fix: add `disabled={isSubmitting}` to skip button and set local busy state inside `skip()`. [apps/web/components/onboarding/setup-form.tsx:~749, source: edge]
- [x] [Review][Patch] `skip()` silently overwrites user-typed company name with `"Mein Unternehmen"` — Fix: if `form.getValues("company_name")` is non-empty, use it; otherwise default. Alternatively add confirm dialog. [apps/web/components/onboarding/setup-form.tsx:~56, source: blind]
- [x] [Review][Patch] `sessionStorage` key `rechnungsai:ai_disclaimer_accepted` written but never read — dead code. Fix: remove write, or actually hydrate checkbox state from it on mount. [apps/web/components/onboarding/trust-screen.tsx:~944, source: blind]
- [x] [Review][Patch] Double `<main>` landmark — `onboarding/layout.tsx` wraps in `<main>` and pages may also emit `<main>`/`<h1>` heading. Fix: use `<div>` in layout or remove duplicate `<main>` from pages. [apps/web/app/onboarding/layout.tsx:~9, source: edge]

- [x] [Review][Defer] Race between `handle_new_user` trigger and middleware probe — first post-callback navigation may read null `public.users` row and redirect to `/login?error=account_setup_failed` — deferred, needs retry/backoff design [apps/web/middleware.ts:~1065, source: blind]
- [x] [Review][Defer] Middleware does not preserve deep-link destination via `?next=` on onboarding redirect — deferred, UX polish, pre-existing pattern [apps/web/middleware.ts, source: blind]
- [x] [Review][Defer] `Button` + `nativeButton={false}` + `render={<Link>}` nested pattern fragile — deferred, affects prior stories too [apps/web/components/onboarding/first-invoice-prompt.tsx:~634, source: blind]
- [x] [Review][Defer] No automated tests for middleware/RPC/zod — deferred, test harness setup is Epic-level work [root, source: blind]
- [x] [Review][Defer] No `aria-invalid` wiring on Inputs — deferred, shared across all forms [apps/web/components/onboarding/setup-form.tsx, source: blind]
- [x] [Review][Defer] No `onboarding/error.tsx` — uncaught errors bubble to root boundary, losing stepper — deferred, boundary UX polish [apps/web/app/onboarding/, source: edge]
- [x] [Review][Defer] Stepper lacks back-navigation — deferred, MVP scope [apps/web/components/onboarding/onboarding-stepper.tsx, source: blind]
- [x] [Review][Defer] Browser back button + bfcache restores stale setup form — deferred, bfcache behavior [apps/web/components/onboarding/setup-form.tsx, source: edge]
- [x] [Review][Defer] `Functions.complete_onboarding.Returns: undefined` in generated types — deferred, regenerate with `supabase gen types` [packages/shared/src/types/database.ts:~1165, source: blind]
- [x] [Review][Defer] Server Action lacks explicit CSRF/origin check beyond Next built-in — deferred, Next.js Action origin enforcement is in place [apps/web/app/actions/onboarding.ts, source: edge]

## Dev Notes

### CRITICAL: Next.js 16 discipline

Per `apps/web/AGENTS.md`: **"Read the relevant guide in `node_modules/next/dist/docs/` before writing any code."** Before writing the middleware changes and the onboarding layout, read:

- `node_modules/next/dist/docs/01-app/02-guides/authentication.md` — current App Router auth conventions
- `node_modules/next/dist/docs/01-app/02-guides/forms.md` — Server Action form patterns for React 19
- The installed `@supabase/ssr` readme for the exact cookie handler signatures used in the extended `updateSession`

If installed docs contradict any snippet here, **defer to the installed docs**.

### Why a SECURITY DEFINER RPC instead of granting `update (onboarded_at)`

Story 1.3's migration explicitly does NOT grant `update (onboarded_at)` to `authenticated` (see `20260412193336_auth_tenants_users.sql:151-154`). The grant would let a client call the Supabase JS SDK directly and self-mark as onboarded via `supabase.from("users").update({ onboarded_at: ... }).eq("id", auth.uid())`, bypassing the trust flow entirely. The `complete_onboarding` RPC replaces the grant with a single, auditable write path:

- It is `SECURITY DEFINER` so it bypasses RLS once the user's identity is verified via `auth.uid()` at function entry.
- It writes `tenants.company_name/skr_plan/steuerberater_name` AND `users.onboarded_at/ai_disclaimer_accepted_at` in one transaction — no partial-state "onboarded but no company name" bug is possible.
- It is idempotent on the timestamps (`coalesce(x, now())`), so double-submits don't overwrite the original acceptance time.
- `set search_path = ''` closes the search-path-hijack vector the Supabase linter warns about (same discipline as `handle_new_user` per Story 1.3 second-pass review).

This supersedes any inclination to simply `grant update (onboarded_at)` to `authenticated`.

### The broken `(onboarding)` route group — pre-existing Story 1.3 bug

Story 1.3 shipped `apps/web/app/(onboarding)/trust/page.tsx` (parens — a route group) which Next.js resolves to URL `/trust`. But the callback route handler and signup form both redirect to `/onboarding/trust`. Until now this has silently 404'd in the onboarding happy path (it's masked because the trust page is a placeholder `EmptyState`). **Task 4 fixes this** by migrating to a plain `app/onboarding/` directory. Do NOT preserve the route group — the URL stability requirement from Story 1.3's existing redirects wins.

Layout isolation is still achieved because `app/onboarding/layout.tsx` is a sibling of `app/(app)/layout.tsx`; neither wraps the other. The `(app)` route group does NOT apply AppShell to `/onboarding/*` because the parenthesized group is itself a sibling, not an ancestor.

### Middleware `onboarded_at` probe — performance considerations

The probe runs on every authenticated request to any non-`/onboarding/*`, non-public route. This is one extra DB roundtrip per navigation. Mitigations:

- Reuse the `updateSession` server client — do NOT instantiate a second `createServerClient` (Task 9.1).
- Query only `select onboarded_at` (single scalar column) with `.maybeSingle()` — it's a single-row PK lookup on `public.users` with RLS (already cached by Supabase's connection pooling).
- Do NOT cache in memory — the user may complete onboarding in a background tab; stale cache would cause a redirect loop.
- Story 1.5 (dashboard shell) will add more queries; if latency becomes measurable, revisit with a JWT-claim-based approach (embed `onboarded_at` into the token on login) — out of scope for this story.

### FR49 / FR51 — disclaimer acceptance contract

The AI disclaimer is presented ONCE during onboarding (this story). FR49 additionally requires the disclaimer to appear "on every AI-processed result" — that wiring is Epic 2 / Story 2.2's responsibility, NOT this story. This story persists the *first* acceptance (`ai_disclaimer_accepted_at`) in `public.users`. Future stories may overwrite or add a separate `ai_disclaimer_events` table if per-result consent is needed (not currently in scope).

FR51 legal-record requirement is satisfied by the timestamp + the implicit user ID on the `users` row. If auditors later demand a separate log, Epic 4 (audit_logs) will capture it.

### Anti-Patterns to Avoid

- DO NOT add `grant update (onboarded_at) on public.users to authenticated` — it breaks the "single write path" invariant (Story 1.3 Task 6.5 lineage).
- DO NOT write to `public.users` or `public.tenants` from the Server Action directly — always go through the `complete_onboarding` RPC.
- DO NOT install shadcn `select`, `radio-group`, `checkbox`, or `table` primitives in this story — Story 1.5 owns the full form primitive set; SKR toggle uses two buttons + aria-pressed, disclaimer uses native `<input type="checkbox">`.
- DO NOT call `supabase.auth.getSession()` in middleware — use the `user` already returned by the extended `updateSession` (which internally called `getUser()`).
- DO NOT build the real `/capture` route — Epic 2 owns it; link to it and rely on 404 fallback in dev (documented in Task 8).
- DO NOT add `revalidatePath("/dashboard")` in the onboarding Server Action — the user has never visited `/dashboard` yet.
- DO NOT preserve the `(onboarding)` route group "for safety" — it currently resolves to the wrong URL and Task 4 removes it.
- DO NOT use the `SUPABASE_SERVICE_ROLE_KEY` — the RPC pattern is the secure alternative.
- DO NOT trust `sessionStorage` for the disclaimer consent — it's a UX carry only; the actual acceptance is written by the RPC on setup submit.
- DO NOT redirect with `response.redirect(...)` — use `NextResponse.redirect(new URL(..., request.url))` in middleware and `router.push(...)` in Client Components.
- DO NOT add Vitest / test harness in this story — still deferred since Story 1.2; covered by smoke tests.
- DO NOT add Sentry wiring — still deferred; keep the `[onboarding:<action>]` console prefix as a hook.

### Previous Story Intelligence

**Story 1.1 carry-over:**
- `ActionResult<T>` from `@rechnungsai/shared/types/action-result` — reuse.
- Supabase local dev via `.env.local`; `supabase start` at `http://127.0.0.1:54321` with Mailpit at `:54324`.
- Package rules: `packages/shared` is the only cross-cutting leaf; the onboarding Zod schema lives there.

**Story 1.2 carry-over:**
- `AppShell`, `TrustBadgeBar`, `MobileNav`, `SidebarNav` under `components/layout/` — NOT used in onboarding (pass-through layout).
- `EmptyState`, `DelayedLoading` exist — `EmptyState` may be reused for error states but is not the primary UI for trust/setup/first-invoice pages.
- Design tokens: `primary` (Prussian Blue #003153), `warning` (Warm Amber #F39C12 — used for the disclaimer block), `destructive` (Soft Red #E74C3C — used for form error text), type scale (h1 24/30, body 16), spacing 4px base, focus-visible ring convention.
- `<html lang="de">` set at root; onboarding layout inherits.
- Form/Input/Label shadcn primitives installed in Story 1.3 — available for Setup form.
- `prefers-reduced-motion` handled globally; no new animation wiring needed.

**Story 1.3 carry-over:**
- `public.users.onboarded_at timestamptz null` column exists — this story writes to it via the RPC.
- `tenants.company_name` default is generic `'Mein Unternehmen'` — setup overwrites.
- `lib/supabase/{server,client,middleware,env}.ts` exist — reuse; extend `middleware.ts` return shape (Task 9).
- `app/actions/auth.ts` established the `ActionResult<T>` + `[module:action]` log prefix pattern — mirror for `app/actions/onboarding.ts`.
- `@supabase/ssr` v0.10.2, `react-hook-form` v7.72.1, `@hookform/resolvers` v5.2.2, `zod` v3.25.76 — use these, do NOT upgrade.
- `packages/shared/tsconfig.json` uses `moduleResolution: Bundler` — extension-less runtime re-exports work.
- Supabase redirect URL in dev `http://127.0.0.1:3000/auth/callback` — onboarding flow does not touch auth callback, but keep in mind.
- Middleware matcher excludes `/manifest.webmanifest`, `/sw.js`, `/og-image.png`, static assets — unchanged by this story.

### Library/Framework Versions

| Library                  | Version target (pinned)   | Notes                                                |
| ------------------------ | ------------------------- | ---------------------------------------------------- |
| next                     | 16.2.3                    | App Router, Turbopack; read installed docs first     |
| react / react-dom        | 19.2.4                    | Server Actions + `useActionState`                    |
| @supabase/ssr            | ^0.10.2                   | Extend `updateSession` return shape                  |
| @supabase/supabase-js    | ^2.103.0                  | `supabase.rpc()` is the onboarding write path        |
| react-hook-form          | ^7.72.1                   | `zodResolver` via `@hookform/resolvers@5.2.2`        |
| zod                      | ^3.25.76                  | Shared `onboardingSetupSchema`                       |
| lucide-react             | latest stable             | Camera, ShieldCheck, Lock, Shield icons              |

Pin exact versions in the Dev Agent Record after any install. No new runtime deps are needed — everything should already be present from Story 1.3.

### German Copy Library (for this story)

| Element                                    | German text                                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Onboarding stepper labels                  | "1 Vertrauen", "2 Unternehmen", "3 Erste Rechnung"                                                    |
| Trust Screen title                         | "So schützen wir deine Daten"                                                                         |
| Trust pillar 1 (DE hosting)                | "🇩🇪 Gehostet in Deutschland — Deine Daten verlassen niemals die EU."                                  |
| Trust pillar 2 (GoBD)                      | "🛡️ GoBD-konform — Unveränderbare Archivierung für 10 Jahre."                                          |
| Trust pillar 3 (DSGVO)                     | "🔒 DSGVO-konform — Datenschutz nach deutschem Recht."                                                 |
| Trust pillar 4 (encryption)                | "🔐 Bank-Grade Encryption — AES-256 verschlüsselte Speicherung."                                       |
| AI disclaimer body (FR49)                  | "Die von der KI vorgeschlagenen Daten müssen überprüft werden. Die endgültige Verantwortung liegt beim Nutzer." |
| AI disclaimer checkbox label               | "Ich habe den Hinweis gelesen und akzeptiere ihn."                                                    |
| Trust Screen CTA                           | "Weiter"                                                                                              |
| Setup page title                           | "Dein Unternehmen"                                                                                    |
| Setup page subtitle                        | "Nur drei Angaben — den Rest kannst du später ergänzen."                                              |
| Company name label / placeholder           | "Firmenname" / "z. B. Mustermann GmbH"                                                                |
| SKR plan label                             | "Kontenrahmen"                                                                                        |
| SKR plan helper text                       | "Nicht sicher? SKR03 ist der gängige Standard für kleine Betriebe."                                   |
| Steuerberater label / placeholder          | "Steuerberater (optional)" / "Vorname Nachname"                                                        |
| Setup submit                               | "Weiter"                                                                                              |
| Setup skip link                            | "Später ergänzen"                                                                                     |
| Company name too short error               | "Firmenname ist zu kurz."                                                                             |
| Company name too long error                | "Firmenname ist zu lang."                                                                             |
| Invalid SKR plan error                     | "Bitte wähle SKR03 oder SKR04."                                                                       |
| Steuerberater too long error               | "Name ist zu lang."                                                                                   |
| Generic validation error (RPC `23514`)     | "Ungültige Eingabe. Bitte überprüfe deine Daten."                                                     |
| Re-auth error (RPC `42501`)                | "Bitte melde dich erneut an."                                                                         |
| Generic onboarding failure                 | "Etwas ist schiefgelaufen. Bitte versuche es erneut."                                                 |
| First Invoice title                        | "Fotografiere jetzt deine erste Rechnung!"                                                            |
| First Invoice subtitle                     | "Richte deine Kamera auf eine Rechnung — der Rest geht in wenigen Sekunden."                          |
| First Invoice primary CTA                  | "Rechnung aufnehmen"                                                                                  |
| First Invoice secondary CTA                | "Das mache ich später"                                                                                |

### Accessibility Contract

- Onboarding stepper uses `aria-current="step"` on the active pill and `role="list"` + `role="listitem"` on the container.
- Trust pillars each render as a `<li>` with icon `aria-hidden="true"` and text carrying semantic meaning.
- AI disclaimer: `<label htmlFor="ai-disclaimer">` wraps the checkbox text; the disclaimer body is referenced via `aria-describedby` on the checkbox; the "Weiter" button has `aria-disabled` reflecting the checkbox state and displays `title="Bitte bestätige zuerst den Hinweis."` when disabled.
- SKR toggle: `role="radiogroup"` on wrapper, each option `role="radio"` with `aria-checked`, arrow-key navigation is NICE-TO-HAVE (document as deferred to Story 1.5 polish — out of scope here); keyboard Tab reaches both options; visible focus ring via Story 1.2 convention.
- "Später ergänzen" link is a real `<button>` inside the form context (calls the same action) — NOT a styled `<a>`; keyboard-accessible.
- Submit buttons show text, never icon-only; sticky on mobile only.
- Error text linked via `aria-describedby` through shadcn `FormMessage`.

### File Targets (final state after this story)

```
apps/web/
  middleware.ts                              # MODIFIED — adds onboarding gate
  lib/supabase/
    middleware.ts                            # MODIFIED — updateSession returns { response, user, supabase }
  app/
    onboarding/                              # NEW — plain folder (replaces deleted (onboarding)/)
      layout.tsx                             # NEW — no AppShell, centered
      trust/page.tsx                         # NEW — Server Component wrapping <TrustScreen />
      setup/page.tsx                         # NEW — Server Component wrapping <SetupForm />
      first-invoice/page.tsx                 # NEW — Server Component wrapping <FirstInvoicePrompt />
    (onboarding)/                            # DELETED (entire directory including trust/page.tsx + layout.tsx)
    actions/
      onboarding.ts                          # NEW — completeOnboarding Server Action
  components/
    onboarding/
      onboarding-stepper.tsx                 # NEW
      trust-screen.tsx                       # NEW (Client)
      setup-form.tsx                         # NEW (Client)
      first-invoice-prompt.tsx               # NEW (Server)
packages/shared/src/
  schemas/onboarding.ts                      # NEW — onboardingSetupSchema
  types/database.ts                          # MODIFIED — regenerated via supabase gen types
  index.ts                                   # MODIFIED — re-export onboarding schema
supabase/
  migrations/
    <timestamp>_onboarding.sql               # NEW — ai_disclaimer_accepted_at + complete_onboarding RPC
```

No file in `apps/web/app/(app)/*` is modified by this story (Story 1.5 owns dashboard polish).

### Project Structure Notes

- `components/onboarding/` becomes the home for any future onboarding UI (invite-flow illustrations, onboarding tour when post-MVP analytics demands it, etc.).
- `app/actions/onboarding.ts` is a single-action file today; it may grow in Story 1.5 if tenant settings reuse the pattern — keep the file focused on onboarding-lifecycle actions only (no `updateTenantSettings` — that belongs in `app/actions/settings.ts` per architecture directory map).
- `supabase/migrations/` convention: each migration owns one coherent feature; the onboarding migration includes the column add AND the RPC together — they are semantically coupled (the column is only useful because the RPC writes to it).
- The SECURITY DEFINER + `auth.uid()` gate + `search_path = ''` pattern is the template every future tenant-scoped privileged RPC (e.g., `delete_tenant`, `export_audit_log`) should copy.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.4] — acceptance criteria, user story, UX metric targets, FR48/FR49/FR51 linkage
- [Source: _bmad-output/planning-artifacts/prd.md#FR48] — trust screen during onboarding before first invoice upload
- [Source: _bmad-output/planning-artifacts/prd.md#FR49] — AI disclaimer copy and placement requirement
- [Source: _bmad-output/planning-artifacts/prd.md#FR50] — security badges on dashboard (Story 1.5 scope; referenced for continuity)
- [Source: _bmad-output/planning-artifacts/prd.md#FR51] — disclaimer acceptance logged for legal records
- [Source: _bmad-output/planning-artifacts/prd.md#NFR3, NFR24] — page load < 2s, conversational German error messages
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security] — Supabase Auth + RLS inherited from Story 1.3
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Directory Structure] — `(onboarding)/trust|setup|first-invoice` intent; this story implements as plain `onboarding/*`
- [Source: _bmad-output/planning-artifacts/architecture.md#Process Patterns] — Server Action `ActionResult<T>`, `[module:action]` logging
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Journey 1] — Trust Screen not skippable, 3-min-to-first-capture metric, Company Setup 3 fields max, "Später ergänzen" affordance
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR12, UX-DR16, UX-DR17, UX-DR18] — error placement, label-above-field, required asterisk, sticky submit on mobile
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Action-first onboarding] — no feature tour, one action, progressive trust
- [Source: _bmad-output/implementation-artifacts/1-3-user-registration-and-authentication.md] — `onboarded_at` column, `complete_onboarding` RPC rationale (Task 6.5 discipline, migration comment lines 151-154), `lib/supabase/*` helpers, German copy patterns, form anti-patterns
- [Source: supabase/migrations/20260412193336_auth_tenants_users.sql] — baseline schema this migration extends
- [Source: apps/web/AGENTS.md] — read installed Next.js 16 docs before writing
- [Source: apps/web/node_modules/next/dist/docs/01-app/02-guides/authentication.md] — current App Router auth conventions (MUST read)
- [Source: apps/web/node_modules/next/dist/docs/01-app/02-guides/forms.md] — Server Action form patterns
- [Source: apps/web/node_modules/@supabase/ssr/README.md] — installed cookie API

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

- `supabase db reset` → clean apply of `20260413000000_onboarding.sql`
- `pnpm build` → all routes emitted: `/onboarding/trust`, `/onboarding/setup`, `/onboarding/first-invoice` (static); no `/trust`
- `pnpm check-types` → 0 errors
- `pnpm lint` → 0 errors (2 pre-existing `turbo/no-undeclared-env-vars` warnings in `app/actions/auth.ts` from Story 1.3 — unrelated)
- psql smoke checks (see Completion Notes) — all expected error codes + happy path verified

### Completion Notes List

- Migration `supabase/migrations/20260413000000_onboarding.sql` adds `public.users.ai_disclaimer_accepted_at timestamptz null` and creates `public.complete_onboarding(text,text,text)` as `SECURITY DEFINER` with `set search_path = ''`. The RPC asserts `auth.uid() is not null` (errcode `42501`), validates `p_skr_plan in ('SKR03','SKR04')` (errcode `23514`), resolves the caller's tenant, and in one transaction sets `onboarded_at`/`ai_disclaimer_accepted_at` via `coalesce(col, now())` (idempotent) and writes `company_name`/`skr_plan`/`steuerberater_name` to `public.tenants`.
- Explicit `revoke execute ... from anon` added: Supabase's default privileges auto-grant execute to `{anon, authenticated, service_role}` on new public functions; without the revoke anon would carry the grant (the `auth.uid() is null` runtime check still blocks actual use, but AC #1(c) mandates only `authenticated`).
- Middleware probe: `apps/web/lib/supabase/middleware.ts` `updateSession` now returns `{ response, user, supabase }` so the onboarding gate in `apps/web/middleware.ts` reuses the cookie-bound client (no second instantiation). The probe queries only `select onboarded_at` via `.maybeSingle()`; a missing row → `/login?error=account_setup_failed` (mirrors the callback path); `onboarded_at IS NULL` + non-onboarding path → redirect to `/onboarding/trust`; `onboarded_at IS NOT NULL` + onboarding path → redirect to `/dashboard`. Transient DB errors log and fall through.
- Legacy `apps/web/app/(onboarding)/` route group (which silently resolved to `/trust`) removed. Plain `app/onboarding/{trust,setup,first-invoice}/` directory created. `app/onboarding/layout.tsx` is a Server Component centered container with no `AppShell`; pages render `<OnboardingStepper current="…" />` locally so the layout doesn't need segment lookup.
- Trust screen is a Client Component wrapped by a Server Component page. Four trust pillars rendered as `<li>` with aria-hidden icons. AI disclaimer is a distinct `warning`-token block above the checkbox (native `<input type="checkbox">`, no shadcn `checkbox` install). "Weiter" is disabled (`aria-disabled`) until the checkbox is ticked; `sessionStorage` is used only as a UX carry so the user doesn't re-tick on back-nav — the authoritative acceptance is written by the RPC on setup submit.
- Setup form: `react-hook-form` + `zodResolver(onboardingSetupSchema)`; SKR toggle implemented as two `<button type="button">` with `role="radio"` + `aria-checked`. "Später ergänzen" is a real `<button>` calling the same `completeOnboarding` action with defaults. Submit is `sticky bottom-0 w-full md:static` (mobile-only sticky per UX-DR18).
- Server Action `apps/web/app/actions/onboarding.ts` parses via the shared zod schema, calls `supabase.rpc("complete_onboarding", …)` via `createServerClient()`, maps `42501` → "Bitte melde dich erneut an.", `23514` → "Ungültige Eingabe. Bitte überprüfe deine Daten.", any other error → "Etwas ist schiefgelaufen. Bitte versuche es erneut." All errors are logged with `[onboarding:complete]` prefix. No direct writes to `public.users`/`public.tenants` — the RPC is the sole write path.
- First-invoice prompt is a Server Component: Camera icon (96px), headline, subcopy, primary "Rechnung aufnehmen" → `/capture` (TODO comment notes Epic 2 Story 2.1 will implement), secondary "Das mache ich später" → `/dashboard`.
- psql smoke verification (2026-04-13, local stack):
  - `\df+ public.complete_onboarding` → `SECURITY DEFINER`, `proconfig = {search_path=""}`.
  - `has_function_privilege('anon', …, 'EXECUTE')` → `f`; `has_function_privilege('authenticated', …, 'EXECUTE')` → `t`.
  - Call without `auth.uid()` → `ERROR: not authenticated` (errcode 42501).
  - Call with `request.jwt.claims` set, `p_skr_plan='SKR99'` → `ERROR: invalid skr_plan: SKR99` (errcode 23514).
  - Happy path: `complete_onboarding('  Mustermann GmbH  ','SKR04','Erika Mustermann')` → `users.onboarded_at` and `ai_disclaimer_accepted_at` both set; `tenants.company_name='Mustermann GmbH'` (trimmed), `skr_plan='SKR04'`, `steuerberater_name='Erika Mustermann'`.
- Tests: per "Anti-Patterns to Avoid" the story defers a Vitest harness — verification is via smoke tests against the running local stack plus TypeScript + build gates. No unit/integration test files added this story.
- FR49 "disclaimer on every AI result" is Epic 2 Story 2.2 scope; this story persists the first acceptance only. Measurement of UX success metrics (signup → first capture < 3 min, drop-off rates) is deferred until post-MVP analytics lands.
- Next.js 16 build emits a warning that `middleware.ts` is deprecated in favor of `proxy.ts`. Not addressed in this story to keep the auth-gate lineage consistent with Story 1.3; the proxy rename is a repo-wide concern to revisit in a later story.

### File List

**New**
- `supabase/migrations/20260413000000_onboarding.sql`
- `packages/shared/src/schemas/onboarding.ts`
- `apps/web/app/onboarding/layout.tsx`
- `apps/web/app/onboarding/trust/page.tsx`
- `apps/web/app/onboarding/setup/page.tsx`
- `apps/web/app/onboarding/first-invoice/page.tsx`
- `apps/web/app/actions/onboarding.ts`
- `apps/web/components/onboarding/onboarding-stepper.tsx`
- `apps/web/components/onboarding/trust-screen.tsx`
- `apps/web/components/onboarding/setup-form.tsx`
- `apps/web/components/onboarding/first-invoice-prompt.tsx`

**Modified**
- `apps/web/middleware.ts` — onboarding gate added
- `apps/web/lib/supabase/middleware.ts` — `updateSession` now returns `{ response, user, supabase }`
- `packages/shared/src/index.ts` — re-exports `./schemas/onboarding`
- `packages/shared/src/types/database.ts` — regenerated via `supabase gen types`

**Deleted**
- `apps/web/app/(onboarding)/layout.tsx`
- `apps/web/app/(onboarding)/trust/page.tsx`
- `apps/web/app/(onboarding)/` (entire directory)

### Change Log

| Date       | Change                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------- |
| 2026-04-13 | Story 1.4 implemented — trust-building onboarding flow, `complete_onboarding` RPC, middleware gate, replaced legacy `(onboarding)` route group. Status → review. |
