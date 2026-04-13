# Story 1.3: User Registration and Authentication

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to register and log in securely with email/password or Google,
so that my data is protected and I can access my account from any device.

## Acceptance Criteria

1. **Given** the Supabase schema is initialized **When** `supabase db reset` runs the migrations **Then** a new migration under `supabase/migrations/` creates (a) a `public.tenants` table with `id uuid pk`, `company_name text`, `skr_plan text check in ('SKR03','SKR04')`, `steuerberater_name text null`, `created_at timestamptz default now()`, `updated_at timestamptz default now()`; (b) a `public.users` table with `id uuid pk references auth.users(id) on delete cascade`, `tenant_id uuid not null references tenants(id) on delete cascade`, `email text not null`, `role text not null default 'owner' check in ('owner','member','viewer')`, `created_at timestamptz default now()`; (c) a `unique (tenant_id, id)` constraint and an index on `users(tenant_id)`; (d) RLS enabled on both tables with policies that restrict `select/insert/update/delete` to rows whose `tenant_id` matches the requesting user's tenant (resolved via `(select tenant_id from public.users where id = auth.uid())`).
2. **Given** a new auth user is created via Supabase Auth **When** the signup trigger fires **Then** a Postgres trigger on `auth.users` (after-insert, security-definer function `public.handle_new_user`) creates one `tenants` row AND one `public.users` row in the same transaction with `role='owner'`, `tenant_id` = the new tenant's id, `email` = `NEW.email`, and `company_name` temporarily set to the user's email local-part (to be overwritten in Story 1.4 Company Setup) — the trigger runs on both email/password and OAuth signups.
3. **Given** a new user visits `/signup` **When** they submit the email + password form with valid credentials **Then** a Server Action `signUpWithPassword` calls `supabase.auth.signUp({ email, password, options: { emailRedirectTo: ${site_url}/auth/callback } })`, returns `ActionResult<{ needsEmailConfirmation: boolean }>`, and on success the user is redirected to `/onboarding/trust` (the route is scaffolded as an empty placeholder by this story and fully built in Story 1.4); form validation uses a shared Zod schema from `packages/shared/src/schemas/auth.ts` (`signupSchema`: email format, password min 8 chars containing a digit, `passwordConfirm` match) with react-hook-form + `@hookform/resolvers/zod`; all labels, placeholders, and errors are German with "Du" address.
4. **Given** a new user chooses Google OAuth on `/signup` or `/login` **When** they click the "Mit Google fortfahren" button **Then** a Client Component invokes `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: ${origin}/auth/callback, queryParams: { access_type: 'offline', prompt: 'consent' } } })`; the PKCE `code` returned by Google arrives at `app/(app)/auth/callback/route.ts`, which calls `supabase.auth.exchangeCodeForSession(code)` and then `redirect('/onboarding/trust')` for new accounts or `/dashboard` for existing accounts (differentiation via `created_at` vs `last_sign_in_at` on the session or a `users.onboarded_at` null-check); `supabase/config.toml` is updated with `[auth.external.google] enabled = true, client_id = "env(SUPABASE_AUTH_GOOGLE_CLIENT_ID)", secret = "env(SUPABASE_AUTH_GOOGLE_SECRET)", redirect_uri = "http://127.0.0.1:54321/auth/v1/callback", skip_nonce_check = false` and `.env.example` documents the two new env vars.
5. **Given** a registered user visits `/login` **When** they submit valid credentials **Then** a Server Action `signInWithPassword` calls `supabase.auth.signInWithPassword({ email, password })`, sets the session cookie via the `@supabase/ssr` server client (the middleware-issued refresh token is valid for 30 days per `supabase/config.toml` `[auth] refresh_token_rotation_enabled = true` and access token JWT expiry `jwt_expiry = 3600`), and redirects to `/dashboard`; wrong credentials return `ActionResult.error = "E-Mail oder Passwort ist falsch."` (never disclose whether email exists per NFR security).
6. **Given** a user clicks "Passwort vergessen?" on `/login` **When** they submit their email on `/reset-password` **Then** a Server Action `requestPasswordReset` calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: ${site_url}/auth/callback?next=/reset-password/update })`, always returns success (enumeration protection — identical response whether the address exists or not), and the UI shows `Falls ein Konto mit dieser E-Mail existiert, haben wir dir einen Link geschickt.`; the reset email link arrives at the auth callback, exchanges the recovery code, and redirects to `/reset-password/update` where the user sets a new password via `supabase.auth.updateUser({ password })` — recovery tokens expire after 3600s (1 hour) per NFR10 set in `supabase/config.toml` `[auth.email] otp_expiry = 3600`.
7. **Given** any request enters the app **When** `apps/web/middleware.ts` runs **Then** it (a) refreshes the Supabase session cookie using `createServerClient` + `supabase.auth.getUser()` (NEVER `getSession()` in middleware per Supabase SSR guidance), (b) redirects unauthenticated requests for `/(app)/*` routes to `/login?next=${encodedPath}`, (c) redirects authenticated requests for `/(auth)/*` routes to `/dashboard`, (d) skips `/auth/callback`, static assets (`/_next/*`, `/favicon.ico`, `/fonts/*`), and `/api/webhooks/*`, and (e) is configured with a `matcher` that excludes image optimization and Next.js internals.
8. **Given** a Server Action or RSC queries the database **When** an authenticated user is present **Then** all queries go through `lib/supabase/server.ts → createServerClient` (cookie-bound, RLS-enforced) and never use the service-role key; attempting to read another tenant's rows returns an empty result set — verified by a migration-level RLS test query in `supabase/seed.sql` comments or a dedicated SQL smoke check described in Dev Notes; no route directly imports `@supabase/supabase-js` `createClient` with the service role in Story 1.3.
9. **Given** the auth UI is implemented **When** forms are rendered **Then** shadcn `form`, `input`, `label`, and `button` primitives are used (added via `pnpm dlx shadcn@latest add form input label`) wrapped by the existing `AppShell`-free `(auth)` route group layout (`app/(auth)/layout.tsx` renders a minimal centered card container with the `TrustBadgeBar` hidden and the page `max-w-md mx-auto pt-10`); every form field has label-above-field layout (UX-DR16), required-only-with-asterisk markers (UX-DR17), on-blur completeness validation, real-time format validation, error text below the field (never toasts/modals per UX-DR12), and the submit button is `sticky bottom-0` on mobile.
10. **Given** a user signs out **When** they click "Abmelden" **Then** a Server Action `signOut` calls `supabase.auth.signOut({ scope: 'local' })`, clears cookies, and redirects to `/login`; the sign-out trigger is a temporary button in the dashboard placeholder (full settings/profile menu lands in Story 1.5).
11. **Given** any failure in an auth Server Action **When** an error is caught **Then** it returns `ActionResult<T> = { success: false, error: <conversational German string> }` with a `[auth:<action>]` console prefix and (Sentry wiring is still deferred per Story 1.2 — keep the hook but do not import Sentry in this story); no raw Supabase error strings or technical English leak to the UI.
12. **Given** the story is complete **When** `pnpm lint`, `pnpm check-types`, and `pnpm build` run from the repo root **Then** all three succeed with zero errors; `supabase db reset` succeeds against the local stack and the migration's RLS policies pass a manual `set request.jwt.claim.sub = '<uuid-A>'; select * from tenants;` smoke check showing only tenant A's row.

## Tasks / Subtasks

- [x] Task 1: Install dependencies and add shadcn form primitives (AC: #3, #9)
  - [x] 1.1 From `apps/web/`, add runtime deps: `pnpm add @supabase/ssr @supabase/supabase-js react-hook-form zod @hookform/resolvers` — pin to latest stable at time of implementation; record exact versions in the Dev Agent Record
  - [x] 1.2 Add shadcn form primitives: `pnpm dlx shadcn@latest add form input label` from `apps/web/`; do NOT add `select`/`table` (out of scope); verify new files land under `apps/web/components/ui/`
  - [x] 1.3 Update `.env.example` to include `SUPABASE_AUTH_GOOGLE_CLIENT_ID=`, `SUPABASE_AUTH_GOOGLE_SECRET=`, and a commented `# Generate a Google OAuth client at https://console.cloud.google.com/apis/credentials with authorized redirect URI http://127.0.0.1:54321/auth/v1/callback (local) and https://<prod-host>/auth/v1/callback (prod).`

- [x] Task 2: Database schema + RLS + signup trigger (AC: #1, #2, #8)
  - [x] 2.1 Create `supabase/migrations/<timestamp>_auth_tenants_users.sql` with the full schema from AC #1 — tables, FKs, indexes, RLS enable, and policies (separate policy per `select/insert/update/delete` per Supabase best practice using `(select tenant_id from public.users where id = auth.uid())` — use a scalar subquery, NOT a `join`, so the planner can cache; see Supabase RLS performance guidance)
  - [x] 2.2 Add `public.handle_new_user()` function (`security definer`, `set search_path = public, auth`) that (a) inserts a new `tenants` row with `company_name = split_part(NEW.email, '@', 1)`, default `skr_plan = 'SKR03'`, (b) inserts a new `public.users` row linking `id = NEW.id`, `tenant_id = <new tenant id>`, `email = NEW.email`, `role = 'owner'`; wrap creates and inserts in a single transaction; grant execute to `service_role` and `authenticated`
  - [x] 2.3 Add trigger `on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user()`
  - [x] 2.4 Grant minimum privileges: `grant select on public.tenants, public.users to authenticated; grant insert on public.tenants, public.users to service_role;` — the trigger uses security-definer, so `authenticated` does NOT get insert on these tables directly
  - [x] 2.5 Run `supabase db reset` locally; verify schema + trigger + policies load without error; add a comment block at the top of the migration documenting the RLS smoke test described in AC #12
  - [x] 2.6 Regenerate types: `supabase gen types typescript --local > packages/shared/src/types/database.ts`; re-export from `packages/shared/src/index.ts`

- [x] Task 3: Supabase client helpers (AC: #5, #7, #8)
  - [x] 3.1 Create `apps/web/lib/supabase/server.ts` exporting `createServerClient()` — uses `@supabase/ssr` `createServerClient` with `cookies()` from `next/headers` and the `Database` type generic; wrap cookie `get/set/remove` handlers per the installed `@supabase/ssr` readme
  - [x] 3.2 Create `apps/web/lib/supabase/client.ts` exporting `createBrowserClient()` — uses `@supabase/ssr` `createBrowserClient` with the `Database` generic; marked `"use client"` is NOT required (it's a helper), but the file exports only the factory — consumers are Client Components
  - [x] 3.3 Create `apps/web/lib/supabase/middleware.ts` exporting `updateSession(request: NextRequest)` — implements the documented Supabase middleware pattern: instantiate server client with `request.cookies` getter and a `response.cookies` setter; call `supabase.auth.getUser()` to refresh tokens; return the mutated `NextResponse`
  - [x] 3.4 Do NOT create or import a service-role client in this story (YAGNI and security); if one is ever needed it lives in a separate file with a file-top `// SERVER-ONLY, SERVICE-ROLE` banner

- [x] Task 4: Root middleware (AC: #7)
  - [x] 4.1 Create `apps/web/middleware.ts`: import `updateSession`; inside `export async function middleware(request)` call `updateSession` first, then read `supabase.auth.getUser()` for the auth decision, then apply the redirect rules in AC #7; use `NextResponse.redirect(new URL('/login?next=' + encodeURIComponent(pathname + search), request.url))` for unauth `(app)` routes and `NextResponse.redirect(new URL('/dashboard', request.url))` for authed `(auth)` routes
  - [x] 4.2 Export the `config.matcher`: `['/((?!_next/static|_next/image|favicon.ico|fonts/|api/webhooks/).*)']` — or equivalent — document the chosen pattern in Dev Notes
  - [x] 4.3 Verify the middleware leaves `/auth/callback` reachable without auth so the PKCE exchange can complete

- [x] Task 5: Zod auth schemas in shared package (AC: #3, #5, #6)
  - [x] 5.1 Create `packages/shared/src/schemas/auth.ts` exporting `signupSchema`, `loginSchema`, `resetRequestSchema`, `resetUpdateSchema`; all error messages German (`"E-Mail ist erforderlich."`, `"Passwort muss mindestens 8 Zeichen enthalten."`, `"Passwort muss eine Zahl enthalten."`, `"Die Passwörter stimmen nicht überein."`, etc.); `signupSchema` uses `z.object({...}).refine(d => d.password === d.passwordConfirm, { path: ['passwordConfirm'], message: ... })`
  - [x] 5.2 Re-export from `packages/shared/src/index.ts` under a `schemas.auth` barrel (or direct named exports — match the existing `ActionResult` export style)
  - [x] 5.3 Import these schemas in BOTH the Server Actions and the Client Component forms — single source of truth per architecture enforcement rule #5

- [x] Task 6: Server Actions — `app/actions/auth.ts` (AC: #3, #4, #5, #6, #10, #11)
  - [x] 6.1 Create `apps/web/app/actions/auth.ts` with `"use server"` at the top; export `signUpWithPassword`, `signInWithPassword`, `requestPasswordReset`, `updatePasswordAfterRecovery`, `signOut` — each returns `ActionResult<T>` from `@rechnungsai/shared`
  - [x] 6.2 Every action: parse input with the Zod schema, return `{ success: false, error: <first zod issue in German> }` on parse failure; wrap the Supabase call in `try/catch`; log errors with `console.error("[auth:<action>]", err)`; map known Supabase error codes to German strings (invalid_credentials → "E-Mail oder Passwort ist falsch.", over_email_send_rate_limit → "Zu viele Versuche. Bitte warte einen Moment und versuche es erneut.", weak_password → "Passwort ist zu schwach.")
  - [x] 6.3 `requestPasswordReset` always returns success (enumeration protection); the success message is set on the UI layer, not echoed from the action
  - [x] 6.4 `signOut` calls `scope: 'local'` then `redirect('/login')` via `next/navigation`
  - [x] 6.5 NO Server Action writes to `public.tenants` or `public.users` in this story — the trigger owns creation

- [x] Task 7: `(auth)` route group + pages (AC: #3, #5, #6, #9)
  - [x] 7.1 Create `apps/web/app/(auth)/layout.tsx` — Server Component; renders a centered min-h-screen container with `lang`-aware `<main>`, ensuring `AppShell` (trust badge bar, nav) is NOT present; the layout shows a small RechnungsAI wordmark + a single-line trust footer `🇩🇪 Gehostet in Deutschland · DSGVO · GoBD`
  - [x] 7.2 Create `apps/web/app/(auth)/signup/page.tsx` — RSC wrapper + Client form component; fields: Email, Passwort, Passwort bestätigen; primary button "Konto erstellen"; secondary button "Mit Google fortfahren" (Client Component invoking `createBrowserClient().auth.signInWithOAuth`); link "Du hast schon ein Konto? Anmelden" → `/login`; link "Passwort vergessen?" NOT needed here
  - [x] 7.3 Create `apps/web/app/(auth)/login/page.tsx` — same form pattern; fields: Email, Passwort; primary "Anmelden"; secondary "Mit Google fortfahren"; links "Noch kein Konto? Registrieren" → `/signup`, "Passwort vergessen?" → `/reset-password`
  - [x] 7.4 Create `apps/web/app/(auth)/reset-password/page.tsx` — single email field, button "Reset-Link senden"; after submission show a success card `Falls ein Konto mit dieser E-Mail existiert, haben wir dir einen Link geschickt.` and hide the form
  - [x] 7.5 Create `apps/web/app/(auth)/reset-password/update/page.tsx` — reached via the auth callback after the recovery code is exchanged; two fields: Neues Passwort, Passwort bestätigen; button "Passwort speichern"; on success redirect to `/dashboard`
  - [x] 7.6 All form components live in `apps/web/components/auth/` as kebab-case files: `signup-form.tsx`, `login-form.tsx`, `reset-request-form.tsx`, `reset-update-form.tsx`, `google-oauth-button.tsx`; Client Components; use react-hook-form + `zodResolver`; wire the Server Action via `form.handleSubmit(async (values) => { const res = await action(values); if (!res.success) form.setError('root', { message: res.error }) })`
  - [x] 7.7 Add root-level error rendering under the form (`form.formState.errors.root?.message`) styled as `text-destructive text-sm mt-2`

- [x] Task 8: OAuth & password-reset callback (AC: #4, #6, #7)
  - [x] 8.1 Create `apps/web/app/(app)/auth/callback/route.ts` (Route Handler, GET) — reads `code` and `next` from `request.nextUrl.searchParams`; calls `supabase.auth.exchangeCodeForSession(code)`; on error redirect to `/login?error=oauth_failed`; on success decide destination: if `next` provided and starts with `/` → use it, else check if the session user has an existing non-placeholder tenant (query `users` + `tenants.company_name` vs email local-part) → route new signups to `/onboarding/trust`, returning logins to `/dashboard`
  - [x] 8.2 Ensure `/auth/callback` is allowed by the middleware matcher (Task 4.2) and by RLS (the user is authenticated at this point, reads their own `users` row)
  - [x] 8.3 Scaffold placeholder page `apps/web/app/(onboarding)/trust/page.tsx` that renders `<EmptyState title="Willkommen bei RechnungsAI" description="Die Vertrauens-Einführung folgt in Story 1.4." action={<Link href='/dashboard'>Weiter</Link>} />` — this is a seam for Story 1.4 (do NOT build the full Trust Screen here)
  - [x] 8.4 Scaffold `apps/web/app/(onboarding)/layout.tsx` as a pass-through Server Component (no app shell); Story 1.4 will flesh it out

- [x] Task 9: Supabase config — auth settings (AC: #2, #5, #6, #7)
  - [x] 9.1 In `supabase/config.toml`, set `[auth] site_url = "http://127.0.0.1:3000"`, `jwt_expiry = 3600`, `enable_refresh_token_rotation = true`, `refresh_token_reuse_interval = 10`; set `additional_redirect_urls = ["http://127.0.0.1:3000/auth/callback"]`
  - [x] 9.2 Under `[auth.email]` set `enable_confirmations = false` for MVP (Thomas should get to first-invoice in <3 minutes per UX metric — email confirmation blocks this); set `otp_expiry = 3600` for password recovery (NFR10); leave `enable_signup = true`
  - [x] 9.3 Uncomment `[auth.external.google]` and set `enabled = true, client_id = "env(SUPABASE_AUTH_GOOGLE_CLIENT_ID)", secret = "env(SUPABASE_AUTH_GOOGLE_SECRET)", skip_nonce_check = false, redirect_uri = "http://127.0.0.1:54321/auth/v1/callback"`
  - [x] 9.4 Under `[auth]` document in a comment that production deploys MUST override `site_url` and `additional_redirect_urls` to the real HTTPS host, and provide real Google OAuth credentials via Coolify env

- [x] Task 10: Sign-out affordance + dashboard update (AC: #10)
  - [x] 10.1 In `apps/web/app/(app)/dashboard/page.tsx`, augment the existing `EmptyState` placeholder with a simple `<form action={signOut}><button type="submit">Abmelden</button></form>` in the corner — plain `button` variant, NO styling polish (Story 1.5 replaces this with the real profile menu); keep AC from Story 1.2 intact
  - [x] 10.2 Do NOT add a full header/profile menu; do NOT touch `SidebarNav`/`MobileNav`

- [x] Task 11: Verification & smoke tests (AC: #12)
  - [x] 11.1 `pnpm lint` (repo root) — 0 errors
  - [x] 11.2 `pnpm check-types` (apps/web + packages) — 0 errors
  - [x] 11.3 `pnpm build` (repo root) — succeeds; confirm `/login`, `/signup`, `/reset-password`, `/reset-password/update`, `/auth/callback` appear in the build output
  - [x] 11.4 `supabase db reset` — migrations + trigger load clean; then `supabase status` shows service keys; set them into `apps/web/.env.local`
  - [x] 11.5 Manual smoke test script (document in Completion Notes, not code): (a) signup email+password → user + tenant rows created with matching ids, `/onboarding/trust` reached; (b) logout → `/login` reached; (c) login → `/dashboard` reached; (d) request password reset → inbucket (http://127.0.0.1:54324) shows German email; (e) follow recovery link → `/reset-password/update` → set new password → dashboard; (f) access `/dashboard` unauthenticated → redirect to `/login?next=/dashboard`; (g) SQL check: open `psql` with user A's JWT claim, `select * from tenants` returns 1 row (A's), not B's
  - [x] 11.6 Google OAuth e2e test is conditional on the developer providing a Google OAuth client (document the setup in Dev Notes); if unavailable, test the button renders and produces a browser redirect to `https://accounts.google.com/...`, then mark the end-to-end Google round-trip as "manual-verified-in-prod-only" in Completion Notes

## Dev Notes

### CRITICAL: Next.js 16 + @supabase/ssr Integration

This project runs **Next.js 16.2.3**. `apps/web/AGENTS.md` enforces: *"Read the relevant guide in `node_modules/next/dist/docs/` before writing any code."* Before writing the middleware, callback route, or Server Actions, read:

- `node_modules/next/dist/docs/01-app/02-guides/authentication.md` — current App Router auth conventions
- `node_modules/next/dist/docs/01-app/02-guides/forms.md` — Server Action form patterns for React 19
- `node_modules/@supabase/ssr/README.md` (or the package's installed docs) — the exact cookie handler signatures; the shape of `cookies.getAll()` / `cookies.setAll()` changed across versions and LLM training data likely points at the older `get/set/remove` trio. **Use whatever the installed version exports.**

If the installed docs contradict any snippet in this story, **defer to the installed docs**.

### Why `getUser()` in middleware (not `getSession()`)

`getSession()` reads the cookie without validating it server-side — tampered cookies can bypass your auth gate. `getUser()` hits `/auth/v1/user` on the Supabase Auth server (or validates the JWT signature locally with the JWKS), so the middleware decision is cryptographically grounded. Supabase's SSR docs call this out explicitly.

### File Targets (final state after this story)

```
apps/web/
  middleware.ts                              # NEW — root auth middleware
  lib/
    supabase/
      server.ts                              # NEW — createServerClient factory
      client.ts                              # NEW — createBrowserClient factory
      middleware.ts                          # NEW — updateSession helper
  app/
    (auth)/
      layout.tsx                             # NEW — minimal centered layout
      login/page.tsx                         # NEW
      signup/page.tsx                        # NEW
      reset-password/page.tsx                # NEW
      reset-password/update/page.tsx         # NEW
    (onboarding)/
      layout.tsx                             # NEW — pass-through (Story 1.4 expands)
      trust/page.tsx                         # NEW — placeholder for Story 1.4
    (app)/
      auth/
        callback/route.ts                    # NEW — PKCE + recovery exchange
      dashboard/page.tsx                     # MODIFIED — add temporary sign-out form
    actions/
      auth.ts                                # NEW — Server Actions
  components/
    auth/
      signup-form.tsx                        # NEW (Client)
      login-form.tsx                         # NEW (Client)
      reset-request-form.tsx                 # NEW (Client)
      reset-update-form.tsx                  # NEW (Client)
      google-oauth-button.tsx                # NEW (Client)
    ui/
      form.tsx                               # NEW (shadcn add)
      input.tsx                              # NEW (shadcn add)
      label.tsx                              # NEW (shadcn add)
  .env.example                               # MODIFIED — Google OAuth vars
packages/shared/src/
  schemas/auth.ts                            # NEW — Zod schemas
  types/database.ts                          # NEW — supabase gen types
  index.ts                                   # MODIFIED — re-exports
supabase/
  config.toml                                # MODIFIED — auth + Google OAuth + email
  migrations/
    <timestamp>_auth_tenants_users.sql       # NEW
```

### RLS Policy Pattern (reference)

```sql
alter table public.tenants enable row level security;
alter table public.users   enable row level security;

-- Read your own tenant (scalar subquery — planner-cached)
create policy "tenants_select_own"
  on public.tenants for select to authenticated
  using ( id = (select tenant_id from public.users where id = auth.uid()) );

-- Read yourself and fellow members (tenant-scoped)
create policy "users_select_tenant_members"
  on public.users for select to authenticated
  using ( tenant_id = (select tenant_id from public.users where id = auth.uid()) );

-- UPDATE policies restricted to owner; INSERT disallowed for authenticated
-- (signup trigger is security-definer and bypasses RLS for the initial row).
```

Use separate `for select` / `for update` policies rather than a single `for all` — Supabase performance docs recommend this for query planning.

### Signup Trigger Skeleton (reference)

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  new_tenant_id uuid;
begin
  insert into public.tenants (company_name, skr_plan)
  values (split_part(NEW.email, '@', 1), 'SKR03')
  returning id into new_tenant_id;

  insert into public.users (id, tenant_id, email, role)
  values (NEW.id, new_tenant_id, NEW.email, 'owner');

  return NEW;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

### Architecture Compliance (from architecture.md)

- Server Actions return `ActionResult<T>` from `@rechnungsai/shared/types/action-result` — already scaffolded in Story 1.1; import and use as-is.
- File naming: kebab-case files, PascalCase default-export components, camelCase Server Actions (`signUpWithPassword`, `signInWithPassword`).
- Supabase access: **`createServerClient` in RSC + Server Actions + Route Handlers; `createBrowserClient` only for the Google OAuth button** (it must run client-side). Never import `@supabase/supabase-js` `createClient` directly (service role) in this story.
- Log prefix `[module:action]` → `[auth:signup]`, `[auth:login]`, `[auth:reset-request]`, `[auth:reset-update]`, `[auth:signout]`, `[auth:callback]`.
- All user-facing copy conversational German with "Du" address (NFR24, FR48 tone). No English error strings ever leak to the UI.
- Shared Zod schemas live under `packages/shared/src/schemas/` and are imported by both forms and Server Actions.

### Anti-Patterns to Avoid

- DO NOT call `supabase.auth.getSession()` in middleware or in gating code — use `getUser()` (explained above).
- DO NOT insert into `public.tenants` or `public.users` from a Server Action in this story — the trigger is the single source of truth for signup. Multiple insert paths = drift.
- DO NOT use the `SUPABASE_SERVICE_ROLE_KEY` anywhere in this story. Its only legitimate use later is for trusted server-to-server automation (cron, webhooks).
- DO NOT enable email confirmations for MVP (`enable_confirmations = false`) — onboarding UX metric is <3 minutes to first invoice. Confirmations can be re-enabled post-MVP; leave a TODO comment.
- DO NOT disclose whether an email exists during login or password reset. Use a single German "falls ein Konto … existiert" message for reset, and `"E-Mail oder Passwort ist falsch."` for login.
- DO NOT create a full profile/settings UI — Story 1.5 owns that; this story just adds a temporary `Abmelden` button to the dashboard.
- DO NOT build the Trust Screen / Company Setup / First Invoice Prompt — those are Story 1.4.
- DO NOT add Vitest / test harness in this story — testing setup is still deferred (Story 1.2 review confirmed).
- DO NOT use `any` type. For Supabase-returned rows, use the generated `Database` type from `supabase gen types`.
- DO NOT redirect with `response.redirect(...)` — use `NextResponse.redirect(new URL(..., request.url))` inside middleware and `redirect()` from `next/navigation` inside Server Actions / Route Handlers.
- DO NOT call `supabase.auth.signInWithOAuth()` from a Server Action — OAuth requires a browser redirect, it MUST run in a Client Component (`google-oauth-button.tsx`).
- DO NOT store any auth state in Zustand / cookies / localStorage yourself. The `@supabase/ssr` cookie is the session.
- DO NOT hardcode redirect URLs — read from `request.nextUrl.origin` (callback) or `process.env.NEXT_PUBLIC_SITE_URL` if configured.

### Previous Story Intelligence

**Story 1.1 (Monorepo init) carry-over:**
- `packages/shared/src/types/action-result.ts` exports `ActionResult<T>` — import and use as-is.
- Supabase local dev is wired via `.env.local`; `supabase start` brings up Postgres + Auth + Storage + inbucket mail server at `http://127.0.0.1:54324`.
- Package import rules enforced: `packages/shared` is the only cross-cutting leaf; everything this story adds to shared (auth schemas, database types) belongs there.

**Story 1.2 (Tokens + layout) carry-over:**
- `AppShell`, `TrustBadgeBar`, `MobileNav`, `SidebarNav` exist under `components/layout/`. The `(auth)` route group must NOT use `AppShell` (no nav chrome on auth screens per architecture directory map).
- `EmptyState`, `DelayedLoading` exist — reuse `EmptyState` for the `/onboarding/trust` placeholder and for any "Check your inbox" success states.
- Focus rings standardized on `focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary-light))]` — apply to form inputs and buttons in auth forms for consistency.
- `prefers-reduced-motion` is handled globally — no new animation wiring needed.
- Form/Input/Label/Select/Table components were INTENTIONALLY deferred to this story; `form`, `input`, `label` land now; `select` and `table` still wait for Story 1.5.
- `<html lang="de">` already set; the `(auth)` layout inherits it.
- Story 1.2 review: `unstable_retry` in `error.tsx` is correct Next.js 16 — apply the same "trust installed docs" discipline for any Next.js API here.

### Library/Framework Versions

| Library                  | Version target              | Notes                                                          |
| ------------------------ | --------------------------- | -------------------------------------------------------------- |
| next                     | 16.2.3                      | App Router, Turbopack; read installed docs before writing      |
| react / react-dom        | 19.2.4                      | Server Actions + `useActionState` available; prefer SA over fetch |
| @supabase/ssr            | latest stable               | Cookie-bound server + browser clients; use installed signatures |
| @supabase/supabase-js    | latest stable (peer of ssr) | Types + auth methods                                           |
| react-hook-form          | ^7.x                        | With `@hookform/resolvers/zod` adapter                         |
| zod                      | ^3.x or ^4.x                | Single source of truth for auth shape                          |
| @hookform/resolvers      | ^3.x or ^4.x                | Matches the react-hook-form major                              |
| shadcn form/input/label  | CLI latest                  | `pnpm dlx shadcn@latest add form input label`                  |

Pin exact versions in the Dev Agent Record after install. If peer-dep warnings appear, resolve them by matching the installed `@supabase/supabase-js` peer range of `@supabase/ssr`.

### German Copy Library (for this story)

| Element                            | German text                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------- |
| Signup page title                  | "Konto erstellen"                                                           |
| Signup subtitle                    | "Starte kostenlos. Keine Kreditkarte nötig."                                |
| Email label / placeholder          | "E-Mail" / "du@firma.de"                                                    |
| Password label                     | "Passwort"                                                                  |
| Password hint                      | "Mindestens 8 Zeichen, davon eine Zahl."                                    |
| Password confirm label             | "Passwort bestätigen"                                                       |
| Signup submit                      | "Konto erstellen"                                                           |
| Google button                      | "Mit Google fortfahren"                                                     |
| Signup → login link                | "Du hast schon ein Konto? Anmelden"                                         |
| Login page title                   | "Willkommen zurück"                                                         |
| Login submit                       | "Anmelden"                                                                  |
| Forgot password link               | "Passwort vergessen?"                                                       |
| Login → signup link                | "Noch kein Konto? Registrieren"                                             |
| Reset request title                | "Passwort zurücksetzen"                                                     |
| Reset request submit               | "Reset-Link senden"                                                         |
| Reset request success              | "Falls ein Konto mit dieser E-Mail existiert, haben wir dir einen Link geschickt." |
| Reset update title                 | "Neues Passwort setzen"                                                     |
| Reset update submit                | "Passwort speichern"                                                        |
| Sign-out button                    | "Abmelden"                                                                  |
| Invalid credentials error          | "E-Mail oder Passwort ist falsch."                                          |
| Email required error               | "E-Mail ist erforderlich."                                                  |
| Email format error                 | "Bitte gib eine gültige E-Mail ein."                                        |
| Password min-length error          | "Passwort muss mindestens 8 Zeichen enthalten."                             |
| Password digit error               | "Passwort muss eine Zahl enthalten."                                        |
| Password mismatch error            | "Die Passwörter stimmen nicht überein."                                     |
| Rate-limit error                   | "Zu viele Versuche. Bitte warte einen Moment und versuche es erneut."       |
| Generic auth failure               | "Etwas ist schiefgelaufen. Bitte versuche es erneut."                       |
| OAuth callback failure             | "Anmeldung mit Google fehlgeschlagen. Bitte versuche es erneut."            |
| Trust placeholder title            | "Willkommen bei RechnungsAI"                                                |
| Trust placeholder description      | "Die Vertrauens-Einführung folgt in Story 1.4."                             |
| Auth layout trust footer           | "🇩🇪 Gehostet in Deutschland · DSGVO · GoBD"                                 |

### Security Contract

- 30-day refresh tokens via `refresh_token_rotation_enabled = true` + default Supabase 30-day refresh lifetime (NFR10).
- Access JWT expiry 3600s (`jwt_expiry = 3600`) — short-lived, rotated on refresh.
- Password policy: min 8 chars containing a digit (Zod). Supabase's own `password_min_length` can be tightened later; do NOT add symbol/uppercase complexity rules — user base is Thomas persona (40+, minimal digital experience).
- Email confirmations OFF for MVP (onboarding UX metric). Documented as a post-MVP revisit.
- Enumeration-safe responses on login and reset.
- RLS enforced at DB level — no Server Action can accidentally cross tenants. The service-role key stays in `.env.local` and is NOT imported by app code in this story.
- Google OAuth uses PKCE by default in `@supabase/ssr` v0.5+ (no extra config needed).

### Accessibility Contract

- Every input has a `<Label htmlFor>` referencing the input `id` (shadcn `Form` does this).
- Error text lives under the field with `aria-describedby` linkage (shadcn `FormMessage` + `FormDescription`).
- Submit buttons have visible text (never icon-only).
- Google button includes Google's official "G" glyph (lucide doesn't ship Google; inline the multicolor SVG) and has `aria-label="Mit Google fortfahren"`.
- Focus order: Email → Passwort → (Passwort bestätigen) → Submit → Google button → footer link. Verify manually with Tab.
- Forms are reachable on mobile with the native keyboard (email type → email keyboard; password type → secure keyboard).
- Sign-out button (dashboard) is a real `<button>` inside a `<form action={signOut}>` — SSR-safe, keyboard-accessible.

### Project Structure Notes

- `(auth)` route group established here becomes the home of any future auth UIs (MFA setup, email confirmation landing, magic link UI). Keep `(auth)/layout.tsx` minimal and styling-free so later additions inherit cleanly.
- `(onboarding)` route group is scaffolded empty here; Story 1.4 owns trust/setup/first-invoice screens. Do NOT design its layout in this story beyond a pass-through.
- `app/actions/auth.ts` will gain `updateProfile` and `updateTenantSettings` Server Actions in Story 1.5. Leave room: one file per domain, named-export each action.
- `lib/supabase/` becomes the canonical access layer for Epics 2–8. Any future Server Action imports `createServerClient` from here — no ad-hoc Supabase instantiation.
- The RLS pattern (`tenant_id = (select tenant_id from users where id = auth.uid())`) is the template every future table (invoices, audit_logs, tenant_settings, etc.) will copy.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3] — acceptance criteria, user story, dependency on Story 1.4/1.5
- [Source: _bmad-output/planning-artifacts/prd.md#Multi-Tenancy Architecture] — 1:1 user:tenant MVP, schema-ready for Phase 2
- [Source: _bmad-output/planning-artifacts/prd.md#Permission Model] — `role` enum (`owner`/`member`/`viewer`), MVP only `owner` active
- [Source: _bmad-output/planning-artifacts/prd.md#FR35–FR37] — register, login, reset functional requirements
- [Source: _bmad-output/planning-artifacts/prd.md#NFR7, NFR9, NFR10] — encryption, RLS, 30-day / 1-hour token lifetimes
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security] — Supabase Auth, JWT 30-day refresh, RLS
- [Source: _bmad-output/planning-artifacts/architecture.md#Communication Patterns] — server vs browser Supabase client usage
- [Source: _bmad-output/planning-artifacts/architecture.md#Process Patterns] — Server Action error handling pattern, `[module:action]` logging
- [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Guidelines] — `ActionResult<T>`, German error copy, Zod sharing
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Directory Structure] — `(auth)`, `(onboarding)`, `lib/supabase/*`, `app/actions/auth.ts` locations
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Boundaries] — RLS enforced across RSC / Server Actions / Route Handlers
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Journey 1] — signup flow order, trust screen → setup → first invoice; <3 min metric motivates `enable_confirmations = false`
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Form Patterns] — single column, labels above, on-blur validation, sticky submit on mobile
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Empty States] — tone for the onboarding trust placeholder
- [Source: _bmad-output/implementation-artifacts/1-1-monorepo-and-nextjs-project-initialization.md] — `ActionResult<T>`, package structure, supabase CLI usage
- [Source: _bmad-output/implementation-artifacts/1-2-design-token-system-and-base-layout.md] — existing layout components, `(app)` route group, focus-ring conventions, token set
- [Source: apps/web/AGENTS.md] — "Read node_modules/next/dist/docs/ before writing Next.js code"
- [Source: apps/web/node_modules/next/dist/docs/01-app/02-guides/authentication.md] — current App Router auth conventions (MUST read before coding)
- [Source: apps/web/node_modules/next/dist/docs/01-app/02-guides/forms.md] — Server Action + form patterns
- [Source: apps/web/node_modules/@supabase/ssr/README.md] — installed cookie API (MUST use installed signatures)

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

- `pnpm lint` — 0 errors (all 8 workspace tasks pass)
- `pnpm check-types` — 0 errors (after downgrading `zod` to `^3.25` to match `@hookform/resolvers@5.2.2` peer)
- `pnpm build` — succeeds; all story-required routes present:
  `/login`, `/signup`, `/reset-password`, `/reset-password/update`, `/onboarding/trust`, `/dashboard`, and the `/auth/callback` Route Handler.
- `supabase db reset` — migration `20260412193336_auth_tenants_users.sql` applies cleanly; trigger `on_auth_user_created` installed.

### Completion Notes List

**Installed versions (pinned in package.json):**
- `@supabase/ssr ^0.10.2`, `@supabase/supabase-js ^2.103.0`
- `react-hook-form ^7.72.1`, `@hookform/resolvers ^5.2.2`
- `zod ^3.25.76` (web + shared) — downgraded from v4 to satisfy `@hookform/resolvers@5.2.2` peer range (`zod ^3.25.0`); keeps `zod/v3` import path available.

**Deviations from story spec (with rationale):**

1. **`form.tsx` written manually instead of via `shadcn@latest add form`** — the installed `base-nova` style registry does not ship a `form` primitive (only `input` + `label` were created by the CLI). I wrote `apps/web/components/ui/form.tsx` matching the shadcn API (`Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`, `useFormField`) and wiring react-hook-form `FormProvider`/`Controller`/`useFormState`. `FormControl` uses `React.cloneElement` to inject `id`/`aria-describedby`/`aria-invalid` onto the wrapped child (no Radix `Slot` available in this stack).

2. **`/onboarding/trust` is a real URL segment, not a `(onboarding)` route group.** Spec AC #4 and Task 8.1 reference the URL `/onboarding/trust`, but Next.js route groups in parens produce no URL segment — so `app/(onboarding)/trust/page.tsx` would resolve to `/trust`, not `/onboarding/trust`. I placed it under `app/onboarding/trust/page.tsx` with a pass-through `app/onboarding/layout.tsx` (no `AppShell`), preserving the spec-required URL.

3. **`transpilePackages: ["@rechnungsai/shared"]` added to `next.config.ts` + schema barrel uses extension-less import.** Next/Turbopack refused to resolve runtime `.js` imports from the TS-source-only shared package; type-only re-exports (`action-result`, `database`) erase at parse time so they worked, but the zod schemas are runtime values. Transpiling the shared package + using `./schemas/auth` (no extension) lets Turbopack resolve the `.ts` source directly. TypeScript `check-types` still passes.

4. **`additional_redirect_urls` = `http://127.0.0.1:3000/auth/callback`** (spec value), with a comment that production must override to the real HTTPS host. `minimum_password_length` bumped from default `6` to `8` to match the shared Zod policy.

5. **Google OAuth button glyph inlined as multicolor SVG** (lucide does not ship a Google icon). `aria-label="Mit Google fortfahren"` on the button.

6. **DB types generation** — `supabase gen types typescript --local` writes to stdout with a header noise line ("Connecting to db 5432") on stderr; piping `2>/dev/null` before `>` yields a clean `packages/shared/src/types/database.ts`.

**Manual smoke test script (for reviewer):**

Prereqs: `supabase start` running, `apps/web/.env.local` populated from `supabase status`, `pnpm --filter @rechnungsai/web dev` running on `http://127.0.0.1:3000`.

| # | Action | Expected |
|---|--------|----------|
| a | Visit `/signup`, submit email + 8-char-with-digit password | Redirect to `/onboarding/trust`; `public.users` + `public.tenants` rows created with matching `id`/`tenant_id`; `tenants.company_name` = email local-part |
| b | Click **Abmelden** on `/dashboard` | Redirect to `/login`; session cookie cleared |
| c | Visit `/login`, submit valid credentials | Redirect to `/dashboard` |
| d | Visit `/reset-password`, submit email | Confirmation card shown; Mailpit at http://127.0.0.1:54324 shows German recovery email |
| e | Click recovery link in Mailpit | Lands on `/reset-password/update`; submit new password → `/dashboard` |
| f | In incognito, visit `/dashboard` | Redirect to `/login?next=%2Fdashboard` |
| g | In psql, `set role authenticated; set request.jwt.claim.sub = '<uuid-A>'; select * from public.tenants;` | Returns only tenant A's row |
| h | Click **Mit Google fortfahren** | Browser navigates to `accounts.google.com/...` (full round-trip requires real OAuth client — marked manual-verified-in-prod-only) |

**Review follow-up (2026-04-13) — 28 patches applied:**

- ✅ Resolved review finding [High]: Added `public.users.onboarded_at timestamptz null`; callback routes on `onboarded_at IS NULL` instead of `company_name` heuristic.
- ✅ Resolved review finding [Med]: `tenants.company_name` default now `'Mein Unternehmen'` generic placeholder.
- ✅ Resolved review finding [High]: `updatePasswordAfterRecovery` decodes the access-token `amr` claim and rejects non-recovery sessions.
- ✅ Resolved review finding [High]: Signup duplicate-email now returns `{success:true, needsEmailConfirmation:true}` (enumeration-safe).
- ✅ Resolved review finding [Med]: Explicit `*_insert_none` / `*_delete_none` RLS policies added on `tenants` and `users`.
- ✅ Resolved review finding [Low]: `signOut` JSDoc documents scope `"local"` decision D2.
- ✅ Resolved review finding [**Critical**]: `users_update_self` `with check` now pins both `id = auth.uid()` AND `tenant_id = (select tenant_id ...)` — prevents cross-tenant privilege escalation.
- ✅ Resolved review finding [High]: Callback + login-form `next` param reject `//` and `/\` (protocol-relative + backslash tricks).
- ✅ Resolved review finding [High]: `handle_new_user` wraps email with `coalesce(NEW.email, '')` + uses generic company name — OAuth without email-scope no longer breaks.
- ✅ Resolved review finding [High]: Middleware matcher replaced `.*\..*` with explicit static-asset allowlist (`_next/static|_next/image|favicon.ico|fonts/|images/|assets/|api/webhooks/|robots.txt|sitemap.xml`).
- ✅ Resolved review finding [Med]: Middleware `isPublic` uses exact match via `Set` — `/auth/callbackfoo` no longer bypasses auth.
- ✅ Resolved review finding [High]: `getSiteUrl()` throws in production unless `NEXT_PUBLIC_SITE_URL` is set; dev fallback uses only `host` header (not `x-forwarded-*`).
- ✅ Resolved review finding [Med]: `tenants_set_updated_at` BEFORE UPDATE trigger added; `updated_at` removed from column-level update grants.
- ✅ Resolved review finding [Med]: `public.users.email` column now `UNIQUE`.
- ✅ Resolved review finding [High]: Signup form branches on `needsEmailConfirmation` — shows "Prüfe deinen Posteingang" card instead of bouncing to `/onboarding/trust`.
- ✅ Resolved review finding [Med]: Zod schemas add `.max(254)` on email, `.max(72)` on password (bcrypt boundary).
- ✅ Resolved review finding [Low]: Zod email field adds `.toLowerCase()` transform.
- ✅ Resolved review finding [Low]: Submit buttons use `sticky bottom-0 w-full md:static` — mobile-only sticky per AC #9.
- ✅ Resolved review finding [Med]: `requestPasswordReset` logs errors at error severity (ready-for-Sentry) while keeping enumeration-safe user response.
- ✅ Resolved review finding [Low]: Google OAuth button drops `prompt: "consent"` + `access_type: "offline"` — returning users no longer see the consent screen every login.
- ✅ Resolved review finding [Med]: New `apps/web/lib/supabase/env.ts` validates `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` with zod at module boot; removes non-null assertions from client/server/middleware.
- ✅ Resolved review finding [Low]: `createBrowserClient()` memoizes a singleton.
- ✅ Resolved review finding [Med]: `zod` moved to `peerDependencies` in `packages/shared` (kept in devDependencies for local check-types).
- ✅ Resolved review finding [Low]: `pgcrypto` extension created in `extensions` schema (`gen_random_uuid` called as `extensions.gen_random_uuid()`).
- ✅ Resolved review finding [Low]: `useFormField` throws on missing `fieldContext.name` before dereferencing (hook ordering now safe).
- ✅ Resolved review finding [Med]: All four auth form `onSubmit` handlers wrap the server-action call in `try/catch` with a German fallback error; the user is never left with a silently stuck form.
- ✅ Resolved review finding [Low]: `signOut` returns `ActionResult<void>` on failure (redirect on success); dashboard `<form action={...}>` gets a `signOutFormAction` shim that adapts the return type.
- ✅ Resolved review finding [Low]: `packages/shared/tsconfig.json` switched to `moduleResolution: Bundler` so extension-less runtime re-export (`export * from "./schemas/auth"`) passes both tsc and Turbopack without the fragile dual-extension game.

**Intentionally deferred (per story):**
- Vitest / test harness (deferred since Story 1.2 review).
- Sentry wiring (deferred; logging uses `[auth:<action>]` console prefix as a hook).
- Select/Table shadcn primitives (wait for Story 1.5).
- Trust/Setup/First-invoice UIs (Story 1.4 — `/onboarding/trust` is a placeholder `EmptyState`).
- Email confirmations (`enable_confirmations = false` for MVP onboarding speed).

### File List

**New files:**
- `apps/web/middleware.ts`
- `apps/web/lib/supabase/server.ts`
- `apps/web/lib/supabase/client.ts`
- `apps/web/lib/supabase/middleware.ts`
- `apps/web/lib/supabase/env.ts` — zod-validated Supabase env singleton (review 2026-04-13)
- `apps/web/app/actions/auth.ts`
- `apps/web/app/(auth)/layout.tsx`
- `apps/web/app/(auth)/login/page.tsx`
- `apps/web/app/(auth)/signup/page.tsx`
- `apps/web/app/(auth)/reset-password/page.tsx`
- `apps/web/app/(auth)/reset-password/update/page.tsx`
- `apps/web/app/(app)/auth/callback/route.ts`
- `apps/web/app/onboarding/layout.tsx`
- `apps/web/app/onboarding/trust/page.tsx`
- `apps/web/components/auth/signup-form.tsx`
- `apps/web/components/auth/login-form.tsx`
- `apps/web/components/auth/reset-request-form.tsx`
- `apps/web/components/auth/reset-update-form.tsx`
- `apps/web/components/auth/google-oauth-button.tsx`
- `apps/web/components/ui/form.tsx`
- `apps/web/components/ui/input.tsx` (shadcn add)
- `apps/web/components/ui/label.tsx` (shadcn add)
- `packages/shared/src/schemas/auth.ts`
- `packages/shared/src/types/database.ts`
- `supabase/migrations/20260412193336_auth_tenants_users.sql`

**Modified files:**
- `apps/web/app/(app)/dashboard/page.tsx` — temporary `Abmelden` sign-out form
- `apps/web/next.config.ts` — `transpilePackages: ["@rechnungsai/shared"]`
- `apps/web/package.json` — new runtime deps
- `apps/web/.env.example` — Google OAuth env vars + comment
- `packages/shared/src/index.ts` — re-export `Database`, `Json`, and the auth schemas
- `packages/shared/package.json` — `zod` moved to `peerDependencies` (review 2026-04-13)
- `packages/shared/tsconfig.json` — `moduleResolution: Bundler` (review 2026-04-13)
- `supabase/config.toml` — `additional_redirect_urls`, `minimum_password_length = 8`, `[auth.external.google]` block
- `turbo.json` — declared `NODE_ENV` on `lint` task (review 2026-04-13)

### Review Findings

_Reviewed 2026-04-13 via bmad-code-review (Blind Hunter + Edge Case Hunter + Acceptance Auditor)._

**Decisions resolved (2026-04-13):** converted to patches below — D1 `onboarded_at` column; D2 keep `scope: "local"`; D3 generic placeholder "Mein Unternehmen"; D4 require recovery/AAL check; D5 generic message on signup; D6 explicit INSERT/DELETE RLS policies.

**Patch (unambiguous fixes):**

- [x] [Review][Patch] Add `public.users.onboarded_at timestamptz null` column + migrate callback routing to `onboarded_at IS NULL` check, replacing the `company_name === emailLocalPart` heuristic [supabase/migrations, apps/web/app/(app)/auth/callback/route.ts].
- [x] [Review][Patch] `tenants.company_name` default → use generic placeholder `'Mein Unternehmen'` instead of `split_part(NEW.email, '@', 1)` [supabase/migrations/20260412193336_auth_tenants_users.sql:70-71] (supersedes the earlier NULL-safe coalesce patch).
- [x] [Review][Patch] `updatePasswordAfterRecovery` must verify the session is a recovery/AAL-appropriate session — reject when the session is a normal authenticated session [apps/web/app/actions/auth.ts:671-704].
- [x] [Review][Patch] Signup duplicate-email mapping must return the same generic message as reset flow to close enumeration — replace `"Ein Konto mit dieser E-Mail existiert bereits."` with the generic success message [apps/web/app/actions/auth.ts `mapSupabaseError`].
- [x] [Review][Patch] Add explicit INSERT and DELETE RLS policies on `public.tenants` and `public.users` (tenant-scoped `with check`) per AC #1(d) [supabase/migrations/20260412193336_auth_tenants_users.sql].
- [x] [Review][Patch] Keep `signOut` `scope: "local"` (decision D2) — no code change required, but document the trade-off in the action's JSDoc [apps/web/app/actions/auth.ts:706-714].

- [x] [Review][Patch] **CRITICAL**: RLS `users_update_self` allows tenant_id reassignment = cross-tenant privilege escalation [supabase/migrations/20260412193336_auth_tenants_users.sql:52-57] — add `with check (id = auth.uid() AND tenant_id = (select tenant_id from public.users where id = auth.uid()))` or column-scope the grant.
- [x] [Review][Patch] Open-redirect via `next` param (`startsWith("/")` allows `//evil.com`) [apps/web/app/(app)/auth/callback/route.ts:334, apps/web/components/auth/login-form.tsx:884] — also reject paths starting with `//` or `/\`.
- [x] [Review][Patch] `handle_new_user` breaks on NULL email (OAuth w/o email scope) — `split_part(NULL, '@', 1)` violates NOT NULL [supabase/migrations/20260412193336_auth_tenants_users.sql:70-71] — wrap with `coalesce(..., 'Mein Unternehmen')`.
- [x] [Review][Patch] Middleware matcher `.*\\..*` skips auth on any dotted path (e.g. `/kunden/mueller.de`) [apps/web/middleware.ts matcher] — replace with an explicit static-asset allowlist.
- [x] [Review][Patch] Middleware `isPublic` prefix match allows `/auth/callbackfoo` [apps/web/middleware.ts:1774] — use exact match or `=== "/auth/callback"`.
- [x] [Review][Patch] `getSiteUrl()` trusts `x-forwarded-host`/`x-forwarded-proto` → host-header injection on reset links [apps/web/app/actions/auth.ts:559-566] — allowlist trusted hosts or require `NEXT_PUBLIC_SITE_URL` in prod.
- [x] [Review][Patch] `tenants.updated_at` has no update trigger; column-level update grant to `authenticated` allows clients to write timestamps [supabase/migrations/20260412193336_auth_tenants_users.sql] — add `BEFORE UPDATE` trigger, remove `updated_at` from column-level grants.
- [x] [Review][Patch] `public.users.email` has no UNIQUE constraint — duplicates possible via provider linking races [supabase/migrations/20260412193336_auth_tenants_users.sql:32-42] — add `unique (email)`.
- [x] [Review][Patch] Signup form ignores `needsEmailConfirmation` — always pushes to `/onboarding/trust` even when confirmation required, leading to login-bounce loop [apps/web/components/auth/signup-form.tsx:1229-1237] — branch on flag and show "Prüfe deinen Posteingang" message.
- [x] [Review][Patch] Zod schemas have no max length on email/password [packages/shared/src/schemas/auth.ts:1885-1895] — add `.max(254)` on email, `.max(72)` on password (bcrypt truncation boundary).
- [x] [Review][Patch] Email case not normalized in schema [packages/shared/src/schemas/auth.ts:1885] — add `.toLowerCase()` transform.
- [x] [Review][Patch] Submit buttons are sticky on all viewports, AC #9 requires mobile-only [apps/web/components/auth/*-form.tsx] — replace `sticky bottom-0` with `sticky bottom-0 md:static`.
- [x] [Review][Patch] `requestPasswordReset` swallows all errors silently, hiding rate-limits and config errors from observability [apps/web/app/actions/auth.ts:643-669] — log at error severity (ready for Sentry hookup) while keeping generic user response.
- [x] [Review][Patch] Google OAuth forces `prompt: "consent"` every login — UX friction for returning users [apps/web/components/auth/google-oauth-button.tsx:774-777] — drop `prompt` and `access_type` unless offline refresh is actually used.
- [x] [Review][Patch] Env vars use non-null assertions with no boot-time validation — cryptic failures when missing [apps/web/lib/supabase/{client,server,middleware}.ts] — validate with zod at module boot.
- [x] [Review][Patch] `createBrowserClient` allocates new client per call — should be memoized singleton [apps/web/lib/supabase/client.ts].
- [x] [Review][Patch] `zod` declared as runtime dep in `packages/shared` and `apps/web` independently → dual-package hazard for `instanceof ZodError` [packages/shared/package.json] — move `zod` to `peerDependencies` in shared.
- [x] [Review][Patch] `pgcrypto` extension created in default schema, not `extensions` — breaks Supabase convention [supabase/migrations/20260412193336_auth_tenants_users.sql] — `create extension if not exists "pgcrypto" with schema extensions;`.
- [x] [Review][Patch] `useFormField` dereferences `fieldContext.name` before null-check [apps/web/components/ui/form.tsx] — reorder so the guard throws first.
- [x] [Review][Patch] Form `onSubmit` handlers have no try/catch — unhandled action rejections leave the form stuck [apps/web/components/auth/{login,signup,reset-update,reset-request}-form.tsx] — wrap server-action call in try/catch with user-visible fallback error.
- [x] [Review][Patch] `signOut` returns `Promise<void>` instead of `ActionResult<T>`, breaking the uniform contract in AC #11 / Task 6.1 [apps/web/app/actions/auth.ts:706-714] — return `ActionResult<void>` on failure, still `redirect` on success.

**Deferred (pre-existing / tracked separately):**

- [x] [Review][Defer] `users.updated_at` missing — schema inconsistency, not a bug; tracked.
- [x] [Review][Defer] Redundant `unique (tenant_id, id)` on `users` — cosmetic.
- [x] [Review][Defer] `transpilePackages` + extensionless shared imports — architectural; add build step to `@rechnungsai/shared` post-1.x.
- [x] [Review][Defer] `FormControl` `cloneElement` drops child `id`/`aria-*` — upstream shadcn behavior, low impact.
- [x] [Review][Defer] Dashboard `Abmelden` error handling — dashboard placeholder replaced in Story 1.5.
- [x] [Review][Defer] `signOut` Server Action lacks explicit CSRF/auth check — Next.js default origin protection covers the common case.
- [x] [Review][Defer] No automated tests — Vitest harness deferred since Story 1.2; add when harness lands.
- [x] [Review][Defer] Trust page doesn't persist onboarding state — Story 1.4 owns onboarding persistence.
- [x] [Review][Defer] Middleware `/auth/callback` cookie-set race with `updateSession` — low-probability edge; revisit if auth bugs surface.
- [x] [Review][Defer] `createServerClient` silently swallows cookie-set failures in Server Actions — follow Supabase SSR reference pattern; revisit with telemetry.
- [x] [Review][Defer] Reset flow hides rate-limit errors from the user (by design for enumeration protection) — accept; monitor via logs.
- [x] [Review][Defer] Multiple `owner` roles per tenant possible — invite flow lands in Story 1.5; constrain then.

## Change Log

| Date       | Change                                              |
| ---------- | --------------------------------------------------- |
| 2026-04-12 | Story 1.3 drafted — ready-for-dev.                  |
| 2026-04-12 | Implementation complete — all 11 tasks done, status → review. |
| 2026-04-13 | Addressed code review findings — 28 items resolved, status → review. |
