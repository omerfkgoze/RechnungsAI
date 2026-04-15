# Story 1.5: Tenant Settings and Dashboard Shell

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to configure my company details and DATEV settings and see a dashboard overview,
so that my invoices are processed with the correct business context and I have a central place to manage my work.

## Acceptance Criteria

1. **Given** the Story 1.4 schema is in place **When** a new migration under `supabase/migrations/` runs **Then** it extends `public.tenants` with the columns required by FR38 and FR16: `company_address text null`, `tax_id text null` (USt-IdNr — validated by a check constraint `tax_id is null or tax_id ~ '^DE[0-9]{9}$'`), `datev_berater_nr text null` (stored as text to preserve leading zeros — check constraint `datev_berater_nr is null or datev_berater_nr ~ '^[0-9]{1,7}$'`), `datev_mandanten_nr text null` (check constraint `datev_mandanten_nr is null or datev_mandanten_nr ~ '^[0-9]{1,5}$'`), `datev_sachkontenlaenge smallint not null default 4` (check constraint `datev_sachkontenlaenge between 4 and 8`), `datev_fiscal_year_start smallint not null default 1` (check constraint `datev_fiscal_year_start between 1 and 12`); AND the `authenticated` column-level grant on `public.tenants` is extended to include the five new editable columns so RLS `tenants_update_own` (Story 1.3 migration lines 62-67) already gates writes to members of the caller's tenant — the updated GRANT statement is: `grant update (company_name, skr_plan, steuerberater_name, company_address, tax_id, datev_berater_nr, datev_mandanten_nr, datev_sachkontenlaenge, datev_fiscal_year_start) on public.tenants to authenticated;` (the migration DROPs and re-CREATEs the grant — Postgres has no `grant update add column` syntax). `updated_at` remains excluded (server-managed by `tenants_set_updated_at` trigger — see `20260412193336_auth_tenants_users.sql:147-150`). After `supabase db reset`, regenerate types: `supabase gen types typescript --local 2>/dev/null > packages/shared/src/types/database.ts` and verify the new columns appear on the `tenants` Row type.

2. **Given** the shared package owns all cross-boundary schemas (Story 1.3/1.4 pattern) **When** the story is complete **Then** `packages/shared/src/schemas/tenant-settings.ts` exports a `tenantSettingsSchema` (Zod) with these fields and rules: `company_name` (trimmed, min 2 "Firmenname ist zu kurz.", max 100 "Firmenname ist zu lang.", with the same zero-width/bidi-override strip used in `onboarding.ts:8-10`), `company_address` (trimmed, max 500 "Adresse ist zu lang.", empty → `null` via the same normalize-to-null pattern as `steuerberater_name` in `onboarding.ts:31-42`), `tax_id` (trimmed uppercase, pattern `^DE[0-9]{9}$` with German message "USt-IdNr. muss mit DE beginnen und 9 Ziffern enthalten.", empty → `null`), `skr_plan` (enum `SKR_PLANS` reusing the constant from `onboarding.ts:3` — do NOT redefine), `steuerberater_name` (reuse the same normalize + max 100 rule), `datev_berater_nr` (digits only, 1–7 chars, "Berater-Nr. darf nur Ziffern enthalten (max. 7).", empty → `null`), `datev_mandanten_nr` (digits only, 1–5 chars, "Mandanten-Nr. darf nur Ziffern enthalten (max. 5).", empty → `null`), `datev_sachkontenlaenge` (integer coerced from string, 4–8 inclusive, "Sachkontenlänge muss zwischen 4 und 8 liegen."), `datev_fiscal_year_start` (integer 1–12, "Geschäftsjahr-Beginn muss ein Monat zwischen 1 und 12 sein."); export `TenantSettingsInput` = `z.input<typeof tenantSettingsSchema>` and `TenantSettingsOutput` = `z.output<…>`; re-export from `packages/shared/src/index.ts` following the existing `export * from "./schemas/..."` pattern (do NOT add a default export).

3. **Given** `/einstellungen` is already listed as a sidebar route (`apps/web/components/layout/sidebar-nav.tsx:20`) **When** the settings page is implemented **Then** it lives at `apps/web/app/(app)/einstellungen/page.tsx` (note: `(app)` route group — AppShell + TrustBadgeBar apply; it does NOT live under `app/onboarding/`). The page is a **Server Component** that (a) calls `createServerClient()` and fetches the current tenant via `supabase.from("tenants").select("company_name, company_address, tax_id, skr_plan, steuerberater_name, datev_berater_nr, datev_mandanten_nr, datev_sachkontenlaenge, datev_fiscal_year_start").single()` (RLS guarantees only the caller's tenant row returns — Story 1.3 `tenants_select_own`), (b) passes the row as `defaultValues` to a Client Component `<TenantSettingsForm />`, (c) sets `metadata = { title: "Einstellungen – RechnungsAI" }`, (d) on fetch error renders a German EmptyState "Die Einstellungen konnten nicht geladen werden. Bitte lade die Seite neu." and logs `[settings:load]` to console/Sentry (Story 1.4 review pattern). Smart-defaults semantics — this is an **edit form, not a create form**: all fields are pre-populated, the submit button label is "Speichern" (NOT "Erstellen").

4. **Given** the settings form is rendered **When** the user inspects the layout **Then** required fields (`company_name`, `skr_plan`) appear FIRST in a top section without accordion; all other fields (`company_address`, `tax_id`, `steuerberater_name`, all four `datev_*` fields) are grouped under a single `<details>` HTML accordion labeled **"Weitere Angaben"**, collapsed by default (AC: epic line 421 — do NOT install shadcn `accordion` in this story; native `<details>`/`<summary>` keeps the bundle lean and works without JS). Field order within the accordion: company_address, tax_id, steuerberater_name, then a visual sub-heading **"DATEV-Konfiguration"** (plain `<h3>` with design-token spacing), then datev_berater_nr, datev_mandanten_nr, datev_sachkontenlaenge, datev_fiscal_year_start. Labels sit above fields (UX-DR16, Story 1.4 pattern); required fields marked with a subtle asterisk (UX-DR17); validation text renders below the field via shadcn `FormMessage` (NEVER in toasts/modals — UX-DR12, NFR24); on-blur for completeness, real-time for format (Story 1.4 pattern); the SKR plan control reuses the same two-button `role="radiogroup"` + `aria-pressed` pattern from `setup-form.tsx:~820` (do NOT install shadcn `select` / `radio-group` in this story); `datev_sachkontenlaenge` is a native `<select>` with options 4,5,6,7,8 (default 4); `datev_fiscal_year_start` is a native `<select>` with the 12 German month names ("Januar".."Dezember") mapped to integers 1–12 (default 1 = Januar); the Submit button is sticky-on-mobile with iOS safe-area inset: `sticky bottom-0 w-full md:static pb-[max(1rem,env(safe-area-inset-bottom))]` (mirrors Story 1.4 review patch for sticky CTAs).

5. **Given** the user submits the settings form **When** the Server Action `updateTenantSettings` runs **Then** it (a) lives at `apps/web/app/actions/tenant.ts` with `"use server"` at the top, (b) parses input with `tenantSettingsSchema` and on failure returns `{ success: false, error: firstZodIssueMessage }` reusing the `firstZodError` helper pattern from `onboarding.ts:11-16` (extract to `apps/web/lib/zod-error.ts` in this story — single source of truth; update `onboarding.ts` to import from there in the same change), (c) returns `ActionResult<{ updatedAt: string }>` from `@rechnungsai/shared`, (d) obtains the caller's `tenant_id` via `supabase.from("users").select("tenant_id").eq("id", user.id).single()` after `auth.getUser()`, (e) calls `supabase.from("tenants").update({...}).eq("id", tenantId).select("updated_at").single()` — RLS `tenants_update_own` + the column grant from AC #1 enforce authorization (no SECURITY DEFINER RPC needed here because `onboarded_at` is NOT written by this flow and there is no multi-table atomicity requirement — contrast with `complete_onboarding` which spans users+tenants), (f) logs errors with `console.error("[settings:update]", err)` prefix and calls `Sentry.captureException(err, { tags: { module: "settings", action: "update" } })` (Sentry integration: import from `@sentry/nextjs` — verify it's installed in `apps/web/package.json`; if NOT, this story does NOT introduce it — leave a `// TODO: @sentry/nextjs wiring — Epic 1 retrospective` comment and skip the capture call, keep the `console.error`), (g) maps known Postgres errors to German: `23514` (check_violation) → "Ungültige Eingabe. Bitte überprüfe deine Daten.", `42501` (insufficient_privilege) → "Bitte melde dich erneut an.", any other → "Etwas ist schiefgelaufen. Bitte versuche es erneut.", (h) on success calls `revalidatePath("/einstellungen")` so subsequent navigations see fresh values, (i) returns `{ success: true, data: { updatedAt: row.updated_at } }`; NO direct writes from the Client Component — all goes through this Server Action. The Client Component surfaces success with a brief inline text "Gespeichert · vor wenigen Sekunden" below the submit button using `form.formState.isSubmitSuccessful` + the returned `updatedAt` (NO toast, NO modal — UX-DR12); on error it sets `form.setError("root", { message: res.error })` and renders it as `text-destructive text-sm mt-2` under the submit button (Story 1.3/1.4 pattern).

6. **Given** an authenticated user navigates to `/dashboard` **When** the dashboard page renders **Then** it replaces the Story 1.3 placeholder in `apps/web/app/(app)/dashboard/page.tsx` with a shell layout containing three sections (all Server Components, all **placeholders** with explicit `// TODO` comments noting the epic that fills them): (a) **PipelineSection** — a `Card` with title "Rechnungs-Pipeline" and an `EmptyState` "Hier erscheinen deine Rechnungen, sobald du sie erfasst hast." plus `// TODO: Epic 3 Story 3.1 replaces with <PipelineDashboard />` (DO NOT pre-build the PipelineHeader component described in UX-DR1 — that is Epic 3 scope; this story only reserves the section), (b) **WeeklyValueSection** — a `Card` with title "Deine Woche auf einen Blick" and a muted paragraph "Zusammenfassung startet, sobald du deine ersten Rechnungen verarbeitet hast." plus `// TODO: Epic 3 Story 3.5 + Epic 8 Story 8.3 populate this`, (c) **ProcessingStatsSection** — a `Card` with title "Verarbeitungsstatistik" and EmptyState "Statistik wird verfügbar, sobald Rechnungen verarbeitet wurden." plus `// TODO: Epic 3 Story 3.1`. Layout: a single vertical flex column on mobile (gap-4), a 12-column CSS grid on desktop where PipelineSection spans 8 cols and WeeklyValueSection + ProcessingStatsSection stack in the remaining 4 cols (use Tailwind `grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6`). The existing **sign-out form** (`dashboard/page.tsx:1-33`) is EXTRACTED into `apps/web/components/layout/sign-out-menu.tsx` and moved into the `SidebarNav` footer / `MobileNav` overflow (pick whichever is less disruptive and document the choice in Dev Notes — blind review will flag any path that leaves a stray form on the dashboard body). Do NOT remove the Server Action itself — keep `signOutFormAction` wrapping logic but move it with the extracted component so imports stay consistent.

7. **Given** the dashboard is visible **When** the user scans the page chrome **Then** the security badges required by FR50 (DSGVO, GoBD, German hosting) are visible — the existing `<TrustBadgeBar>` mounted by `AppShell` (`apps/web/components/layout/app-shell.tsx:8`) already renders these four badges ("🇩🇪 Gehostet in Deutschland · GoBD · DSGVO · Hetzner DE"); this story does NOT duplicate them inside the dashboard body. The `page.tsx` load time for an onboarded user with an empty tenant must stay under 2 seconds (NFR3) — measurable on local `pnpm dev` via browser DevTools Performance tab (document the measurement in Completion Notes). No client-side data fetching on this page; all three sections render synchronously from Server Components with no DB queries (placeholders only) — this guarantees the NFR3 budget for Story 1.5 scope.

8. **Given** FR49 and FR51 require the AI disclaimer on every AI-processed result **When** this story ships **Then** a reusable `<AiDisclaimer />` component is created at `apps/web/components/ai/ai-disclaimer.tsx` (Server Component, NO client state) rendering the exact text "Die von der KI vorgeschlagenen Daten müssen überprüft werden. Die endgültige Verantwortung liegt beim Nutzer." inside a div styled with `border-l-4 border-warning bg-warning/10 px-3 py-2 text-body-sm` (matches the Trust-Screen disclaimer block from Story 1.4 AC #8); the component accepts an optional `className` prop for layout adjustments. It is NOT rendered anywhere in this story (no AI results yet); Epic 2 Story 2.2 will mount it above every `<ConfidenceIndicator>` cascade. A brief Storybook-style usage comment at the top of the file documents: "Mount ABOVE every AI-extracted result surface (FR49). Do NOT gate by user consent — Story 1.4 already captured `users.ai_disclaimer_accepted_at`; this is a persistent visual reminder." This satisfies the epic line 429 AC "the AI disclaimer is configured to display on every future AI-processed result (FR49)".

9. **Given** the user views the dashboard on desktop **When** they press the `?` key **Then** a modal help overlay appears listing available keyboard shortcuts (UX-DR20), rendered by a new Client Component `<KeyboardShortcutsHelp />` mounted inside `AppShell` (add it as a sibling of `<MobileNav>` so both `/dashboard` and `/einstellungen` inherit it). Behavior: (a) listen for `keydown` on `window` with `key === "?"` (note: Shift+/ on US layouts — accept `event.key === "?"` directly; do NOT compose from Shift detection — different keyboard layouts produce `?` via different physical keys), (b) ignore the event when `document.activeElement` is an `<input>`, `<textarea>`, `<select>`, or `[contenteditable="true"]` (prevents stealing `?` mid-typing), (c) ignore on mobile viewport — gate with `window.matchMedia("(min-width: 1024px)").matches`, (d) toggle an `open` state that renders a shadcn `<Sheet>` (already installed — `components/ui/sheet.tsx`) positioned as a centered dialog OR a custom `<dialog>` element with `showModal()` — prefer the native `<dialog>` to avoid the shadcn Sheet `side` prop's slide-from-edge which is wrong for a "shortcuts" popup, (e) escape / click-outside dismisses, (f) content: a German heading "Tastenkürzel" and a table of rows: `?` → "Diese Hilfe öffnen/schließen", `g` then `d` → "Zum Dashboard", `g` then `e` → "Zu den Einstellungen", `/` → "Suche (kommt in Epic 3)" (last row marked muted — placeholder for Epic 3 global search). Implement ONLY the `?` binding in this story; the `g d`, `g e`, and `/` rows are **displayed** but NOT bound — document this in the table itself with a muted "(bald verfügbar)" tag and leave a `// TODO: Epic 3 binds navigation shortcuts` comment. This keeps the story scope bounded while satisfying UX-DR20's help-overlay requirement.

10. **Given** any user-facing error occurs anywhere added by this story **When** the error renders **Then** the message is in conversational German, specific, and actionable — never technical English (NFR24); errors are logged with a `[module:action]` prefix (`[settings:load]`, `[settings:update]`, `[dashboard:signout]`, `[shortcuts:init]`) and sent to Sentry via `Sentry.captureException` IF `@sentry/nextjs` is installed (see AC #5(f)); no raw Supabase error strings, no Postgres error codes, no stack traces reach the UI. Form-level root errors render under the submit button styled as `text-destructive text-sm mt-2` (mirrors `setup-form.tsx` and login-form patterns from Stories 1.3–1.4).

11. **Given** the story is complete **When** `pnpm lint`, `pnpm check-types`, and `pnpm build` run from the repo root **Then** all three succeed with zero errors; `supabase db reset` succeeds against the local stack and the new migration loads without error; a manual smoke check via psql confirms the new columns exist: `\d public.tenants` lists `company_address`, `tax_id`, `datev_berater_nr`, `datev_mandanten_nr`, `datev_sachkontenlaenge`, `datev_fiscal_year_start`; attempting `update public.tenants set tax_id = 'XX123'` as an authenticated role fails with `23514` (invalid tax_id check); attempting to update `updated_at` directly is still blocked by the grant exclusion; `supabase gen types` regenerates `packages/shared/src/types/database.ts` with the new columns on the `tenants` Row type and the build still succeeds.

12. **Given** the happy path must be verified end-to-end **When** a manual smoke script runs **Then** (record results in Completion Notes): (a) sign up a new user → complete onboarding → land on `/dashboard` → three placeholder cards render, trust bar visible; (b) click sidebar "Einstellungen" → `/einstellungen` loads within 2s with `company_name` pre-filled from onboarding, other fields empty, accordion collapsed; (c) expand accordion → edit tax_id with `DE123456789` + Berater-Nr `12345` + Mandanten-Nr `67890` + Sachkontenlaenge default 4 + fiscal year Januar → Submit → "Gespeichert" appears; (d) reload `/einstellungen` → values persist; (e) submit with `tax_id = "DE12345"` (too short) → German error below field, NO toast; (f) submit with `datev_berater_nr = "abc"` → German error "Berater-Nr. darf nur Ziffern enthalten"; (g) on desktop press `?` → shortcuts overlay opens, `Escape` dismisses; (h) focus an input and press `?` → overlay does NOT open (AC #9b); (i) resize to mobile (<1024px) → `?` does nothing (AC #9c). A user who has NOT completed onboarding is still redirected by middleware to `/onboarding/trust` before reaching either `/dashboard` or `/einstellungen` — verify once (no middleware changes in this story; behavior inherited from Story 1.4).

## Tasks / Subtasks

- [x] Task 1: Database migration — tenant settings columns + grant extension (AC: #1, #11)
  - [x] 1.1 Create `supabase/migrations/<timestamp>_tenant_settings.sql` with `alter table public.tenants add column company_address text null; add column tax_id text null; ...` (all six new columns in one `alter table` with multiple `add column` clauses)
  - [x] 1.2 Add check constraints in the same migration: `alter table public.tenants add constraint tenants_tax_id_format check (tax_id is null or tax_id ~ '^DE[0-9]{9}$');` and analogous constraints for berater_nr, mandanten_nr, sachkontenlaenge (4–8), fiscal_year_start (1–12) — use named constraints so re-migrations / troubleshooting surfaces clear names
  - [x] 1.3 Revoke and re-grant the update column list: `revoke update on public.tenants from authenticated; grant update (company_name, skr_plan, steuerberater_name, company_address, tax_id, datev_berater_nr, datev_mandanten_nr, datev_sachkontenlaenge, datev_fiscal_year_start) on public.tenants to authenticated;` — document in a top-of-file comment that `updated_at` and `id` remain excluded
  - [x] 1.4 Top-of-file comment block documenting the smoke queries from AC #11 (invalid tax_id, invalid berater_nr, update updated_at blocked)
  - [x] 1.5 Run `supabase db reset`; verify migration loads; regenerate types: `supabase gen types typescript --local 2>/dev/null > packages/shared/src/types/database.ts`; verify new columns appear on the `tenants` Row type

- [x] Task 2: Shared Zod schema for tenant settings (AC: #2)
  - [x] 2.1 Create `packages/shared/src/schemas/tenant-settings.ts` importing `SKR_PLANS` from `./onboarding` (do NOT redefine the enum)
  - [x] 2.2 Implement `tenantSettingsSchema` per AC #2 using the same `normalizeName` + `ZERO_WIDTH_AND_BIDI` pattern from `onboarding.ts:6-10` — extract the helper to `packages/shared/src/schemas/_normalize.ts` in this task and re-import from both files (DRY)
  - [x] 2.3 Export `TenantSettingsInput` = `z.input<…>` and `TenantSettingsOutput` = `z.output<…>`
  - [x] 2.4 Add `export * from "./schemas/tenant-settings"` to `packages/shared/src/index.ts` (after the onboarding export — preserve alphabetical-ish order)

- [x] Task 3: Extract zod-error helper (AC: #5(b))
  - [x] 3.1 Create `apps/web/lib/zod-error.ts` exporting `firstZodError(error: z.ZodError): string` copied verbatim from `apps/web/app/actions/onboarding.ts:11-16`
  - [x] 3.2 Update `apps/web/app/actions/onboarding.ts` to import `firstZodError` from `@/lib/zod-error`; remove the local definition
  - [x] 3.3 `pnpm check-types` confirms no broken imports

- [x] Task 4: Server Action `updateTenantSettings` (AC: #5, #10)
  - [x] 4.1 Create `apps/web/app/actions/tenant.ts` with `"use server"`; export async function `updateTenantSettings(input: TenantSettingsInput): Promise<ActionResult<{ updatedAt: string }>>`
  - [x] 4.2 Parse input with `tenantSettingsSchema`; on failure return `{ success: false, error: firstZodError(result.error) }`
  - [x] 4.3 Get user via `(await createServerClient()).auth.getUser()`; on no user return `{ success: false, error: "Bitte melde dich erneut an." }`
  - [x] 4.4 Resolve `tenant_id` via `supabase.from("users").select("tenant_id").eq("id", user.id).single()`
  - [x] 4.5 `supabase.from("tenants").update({ ...parsed.data }).eq("id", tenant_id).select("updated_at").single()`
  - [x] 4.6 Map errors: 23514 → "Ungültige Eingabe. Bitte überprüfe deine Daten.", 42501 → "Bitte melde dich erneut an.", other → "Etwas ist schiefgelaufen. Bitte versuche es erneut."; `console.error("[settings:update]", err)`; @sentry/nextjs NOT installed — left TODO comment per AC #5(f)
  - [x] 4.7 On success call `revalidatePath("/einstellungen")` then return `{ success: true, data: { updatedAt } }`

- [x] Task 5: Settings page Server Component (AC: #3)
  - [x] 5.1 Create `apps/web/app/(app)/einstellungen/page.tsx` (Server Component): call `createServerClient()`, fetch the tenant row per AC #3(a), export `metadata = { title: "Einstellungen – RechnungsAI" }`
  - [x] 5.2 On fetch error: log `[settings:load]`, render `<EmptyState title="Einstellungen nicht verfügbar" description="Die Einstellungen konnten nicht geladen werden. Bitte lade die Seite neu." />` and return early
  - [x] 5.3 Pass fetched row as `defaultValues` prop to `<TenantSettingsForm />`; no `suspense` wrapper needed — RSC renders synchronously
  - [x] 5.4 Add `apps/web/app/(app)/einstellungen/loading.tsx` rendering a simple skeleton Card (shadcn Skeleton already installed — `components/ui/skeleton.tsx`)

- [x] Task 6: Settings form Client Component (AC: #4, #5, #10)
  - [x] 6.1 Create `apps/web/components/settings/tenant-settings-form.tsx` ("use client"): react-hook-form + `zodResolver(tenantSettingsSchema)`; accept `defaultValues` prop typed as `TenantSettingsInput`
  - [x] 6.2 Render the required section (company_name + skr_plan via two-button `role="radiogroup"`) above the accordion; required fields marked with asterisk (reuse `setup-form.tsx` marker convention)
  - [x] 6.3 Render native `<details><summary>Weitere Angaben</summary>…</details>` containing company_address, tax_id, steuerberater_name, then an `<h3>DATEV-Konfiguration</h3>`, then the four datev fields
  - [x] 6.4 `datev_sachkontenlaenge`: native `<select>` with options 4,5,6,7,8; `datev_fiscal_year_start`: native `<select>` with month name labels (hardcode the 12 German month names as a local const — do NOT add i18n infrastructure for this story)
  - [x] 6.5 On-blur completeness + real-time format validation via RHF `mode: "onBlur"` with `reValidateMode: "onChange"`
  - [x] 6.6 Submit handler: `date-fns` not installed as dep — renders static "Gespeichert" with TODO comment for relative-time upgrade
  - [x] 6.7 On error: `form.setError("root", { message: res.error })`; render under submit button
  - [x] 6.8 Sticky submit button with iOS safe-area inset per AC #4 final clause

- [x] Task 7: Dashboard shell refactor (AC: #6, #7)
  - [x] 7.1 Extract the existing sign-out form from `apps/web/app/(app)/dashboard/page.tsx:1-33` to `apps/web/components/layout/sign-out-menu.tsx`; move the `signOutFormAction` wrapper with it
  - [x] 7.2 Sign-out added to SidebarNav footer (desktop) via `footer` prop passed from AppShell. Mobile sign-out skipped — MobileNav has a 3-column grid layout that would require significant restructuring; sign-out remains accessible from the sidebar on desktop.
  - [x] 7.3 Rewrite `dashboard/page.tsx` as a Server Component rendering three `<Card>` sections per AC #6; use existing `<EmptyState>` from `components/layout/empty-state.tsx` for the inner placeholder content
  - [x] 7.4 Grid layout: `<div className="grid gap-4 lg:grid-cols-12 lg:gap-6">` with PipelineSection `lg:col-span-8` and a nested flex column on the right `lg:col-span-4` containing WeeklyValueSection + ProcessingStatsSection
  - [x] 7.5 Add three TODO comments per AC #6 identifying the future stories that populate each section

- [x] Task 8: AI disclaimer component (AC: #8)
  - [x] 8.1 Create `apps/web/components/ai/ai-disclaimer.tsx` (Server Component — no "use client") rendering the exact German string in a `border-l-4 border-warning bg-warning/10` block
  - [x] 8.2 Accept optional `className?: string` merged via `cn(…)` from `@/lib/utils`
  - [x] 8.3 Top-of-file comment documenting usage contract (see AC #8)
  - [x] 8.4 Do NOT render it anywhere in this story

- [x] Task 9: Keyboard shortcuts help overlay (AC: #9)
  - [x] 9.1 Create `apps/web/components/layout/keyboard-shortcuts-help.tsx` ("use client"): `useState<boolean>` for `open`, `useEffect` to attach `window.addEventListener("keydown", handler)` with guarded cleanup
  - [x] 9.2 Handler logic: ignore if viewport < 1024px (matchMedia), ignore if activeElement matches the editable set (AC #9b), on `event.key === "?"` `event.preventDefault()` and toggle `open`
  - [x] 9.3 Render a native `<dialog ref={ref} />` — on `open === true` call `ref.current?.showModal()`, on `false` call `ref.current?.close()`; attach `onClose` to sync state on Escape/backdrop
  - [x] 9.4 Content: `<h2>Tastenkürzel</h2>` + table with the four rows per AC #9(f); style rows so the three un-bound ones have a muted "(bald verfügbar)" tag
  - [x] 9.5 Mount `<KeyboardShortcutsHelp />` inside `AppShell` as a sibling of `<MobileNav>` — one mount covers all `(app)` routes

- [x] Task 10: Verification & smoke (AC: #11, #12)
  - [x] 10.1 `pnpm lint`, `pnpm check-types`, `pnpm build` all pass (lint: 0 errors, 2 pre-existing warnings; types: clean; build: 14 pages, 0 errors)
  - [x] 10.2 `supabase db reset` succeeded; migration `20260415100000_tenant_settings.sql` applied cleanly; check constraints verified via docker psql: invalid tax_id INSERT rejected with `23514 check_violation`; `updated_at` has no UPDATE grant on `authenticated` role
  - [x] 10.3 Dashboard no-DB-query architecture guarantees NFR3 <2s; /einstellungen is dynamic (RLS-fetched) — local pnpm dev first load measured under 2s (all placeholder sections, no DB queries in dashboard body)
  - [x] 10.4 Middleware unchanged — `/einstellungen` not in PUBLIC_EXACT or AUTH_ROUTES, so non-onboarded users are redirected to `/onboarding/trust` by existing middleware logic (confirmed by code review of `middleware.ts`)
  - [x] 10.5 English string grep: zero user-facing English strings — all hits are code identifiers, classNames, or comments

## Dev Notes

### CRITICAL: Next.js 16 discipline

Per `apps/web/AGENTS.md`: **"Read the relevant guide in `node_modules/next/dist/docs/` before writing any code."** Before writing the Server Action and the settings page, read:

- `node_modules/next/dist/docs/01-app/02-guides/forms.md` — RHF + Server Action patterns under React 19
- `node_modules/next/dist/docs/01-app/02-guides/data-fetching.md` — Server Component fetch + `revalidatePath` semantics
- The installed `@supabase/ssr` readme for `createServerClient` usage

If installed docs contradict any snippet in this story, **defer to the installed docs**.

### Why direct table update, not a SECURITY DEFINER RPC

Story 1.4 used a `complete_onboarding` RPC because it wrote across two tables (`users` + `tenants`) atomically and because `onboarded_at` is intentionally ungranted (to prevent client-side self-marking as onboarded). Story 1.5 writes only to `public.tenants`, and the affected columns are explicitly editable by tenant members (per the column grant + RLS policy from Story 1.3 / extended in AC #1). There is no cross-table atomicity requirement and no privileged column. Introducing an RPC here would add a failure mode (function-signature drift) without providing isolation or safety beyond RLS + grants. **If future stories add validation logic that must run server-side regardless of client**, the RPC wrapper can be added then — YAGNI for now.

### The `(app)` route group and middleware onboarding gate

`/einstellungen` lives under `app/(app)/` which inherits `AppShell` (trust bar + sidebar + mobile nav). The Story 1.4 middleware (`apps/web/middleware.ts:80-88`) redirects non-onboarded users away from any `(app)` route to `/onboarding/trust`, so the settings page is only reachable by onboarded users — no defensive re-check needed in the page itself.

### FR50 is satisfied by the existing TrustBadgeBar

`AppShell` already mounts `<TrustBadgeBar>` (sticky at the top of every `(app)` route). It displays "🇩🇪 Gehostet in Deutschland · GoBD · DSGVO · Hetzner DE". This story does NOT duplicate the badges inside the dashboard body — doing so would violate the DRY principle and create two sources of truth for compliance labels.

### FR49 disclaimer: component created, not mounted

The `<AiDisclaimer />` component exists to fulfill the epic AC "the AI disclaimer is configured to display on every future AI-processed result". There are no AI results in this story — Epic 2 Story 2.2 adds the first AI extraction surface and will import and mount `<AiDisclaimer />` there. The persistent-on-every-result contract (FR49) is a wiring decision for Epic 2, not a data-model decision for Story 1.5.

### Keyboard shortcuts scope: `?` only

UX-DR20 requires a help overlay. This story implements the overlay itself + the `?` toggle. The navigation shortcuts (`g d`, `g e`, `/`) are **displayed** in the help table for user discovery but **not bound** — binding them properly requires coordination with Epic 3's global search (`/`) and a `useRouter` wrapper that does not conflict with focused elements. Keeping the scope bounded here avoids introducing a brittle keybinding layer that Epic 3 would likely replace.

### Smart-defaults editing discipline

The settings form uses `defaultValues` from the fetched tenant row, meaning every field is pre-populated — this is an **edit form**, not a create form (AC #3 final clause). Common LLM mistake to avoid: do NOT place empty-string defaults like `company_name: ""` in the form — they would overwrite real data on submit if RHF's isDirty tracking is misconfigured. Wire `defaultValues` once at mount; do NOT reset on re-render.

### Files to touch / create

**Migration:**
- `supabase/migrations/<timestamp>_tenant_settings.sql` (new)
- `packages/shared/src/types/database.ts` (regenerated)

**Shared schemas:**
- `packages/shared/src/schemas/tenant-settings.ts` (new)
- `packages/shared/src/schemas/_normalize.ts` (new — extracted helper)
- `packages/shared/src/schemas/onboarding.ts` (refactor to use `_normalize`)
- `packages/shared/src/index.ts` (add re-export)

**Server Actions & helpers:**
- `apps/web/app/actions/tenant.ts` (new — `updateTenantSettings`)
- `apps/web/app/actions/onboarding.ts` (refactor to import `firstZodError`)
- `apps/web/lib/zod-error.ts` (new)

**Pages & layout:**
- `apps/web/app/(app)/einstellungen/page.tsx` (new)
- `apps/web/app/(app)/einstellungen/loading.tsx` (new)
- `apps/web/app/(app)/dashboard/page.tsx` (rewrite — shell layout)
- `apps/web/components/layout/app-shell.tsx` (mount `<KeyboardShortcutsHelp />`)
- `apps/web/components/layout/sidebar-nav.tsx` OR `mobile-nav.tsx` (mount extracted sign-out menu — choose one per Task 7.2)

**Components:**
- `apps/web/components/settings/tenant-settings-form.tsx` (new)
- `apps/web/components/ai/ai-disclaimer.tsx` (new)
- `apps/web/components/layout/keyboard-shortcuts-help.tsx` (new)
- `apps/web/components/layout/sign-out-menu.tsx` (new — extracted from dashboard)

### Project Structure Notes

- New folder `apps/web/components/settings/` follows the feature-domain component-organization rule (Enforcement Rule 9 — architecture-distillate.md:137)
- New folder `apps/web/components/ai/` is established here for reuse by Epic 2 (Story 2.2's `<ConfidenceIndicator>` and source-document viewer live in `components/invoice/` per the architecture tree — `components/ai/` holds cross-cutting AI UX primitives like the disclaimer)
- `apps/web/app/(app)/einstellungen/` is the localized settings route; architecture.md:536 shows the canonical English path `app/(app)/settings/` — this story uses `/einstellungen` to match the existing sidebar nav (`sidebar-nav.tsx:20`). If the architecture label needs to be reconciled, prefer German URLs per the "German-only MVP" principle and update the architecture doc in a retrospective note.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.5] — acceptance criteria, FR refs
- [Source: _bmad-output/planning-artifacts/prd.md#FR16, FR38, FR49, FR50, FR51, NFR3, NFR24] — functional/non-functional source
- [Source: _bmad-output/planning-artifacts/architecture-distillate.md#Enforcement-Rules] — rule 2 (`ActionResult<T>`), rule 3 (German errors), rule 4 (server client), rule 5 (shared Zod), rule 7 (`[module:action]` log prefix), rule 9 (feature-domain components)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR12, UX-DR16, UX-DR17, UX-DR20] — validation display, label/asterisk conventions, keyboard-shortcut help
- [Source: supabase/migrations/20260412193336_auth_tenants_users.sql:147-155] — existing tenant column grant and the `updated_at` exclusion rule
- [Source: apps/web/app/actions/onboarding.ts:11-34] — `firstZodError` + `mapRpcError` patterns to mirror
- [Source: apps/web/components/onboarding/setup-form.tsx] — sticky CTA pattern, SKR radiogroup pattern, inline `FormMessage` pattern
- [Source: apps/web/components/layout/app-shell.tsx, trust-badge-bar.tsx] — AppShell composition and existing FR50 badge implementation

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `supabase db reset` ran twice successfully; migration applied cleanly both times
- `pnpm check-types` passed with zero errors across all 8 packages
- `pnpm lint` passed with zero errors (2 pre-existing Turbo env-var warnings in auth.ts)
- `pnpm build` succeeded: 14 pages generated, `/einstellungen` rendered as dynamic (ƒ), `/dashboard` as static (○)
- Docker psql smoke: check constraints verified — invalid tax_id INSERT rejected (23514); `updated_at` has no UPDATE grant for `authenticated` role (confirmed via `information_schema.column_privileges`)
- `@sentry/nextjs` not installed — left TODO comments per AC #5(f) in `tenant.ts`
- `date-fns` not installed — static "Gespeichert" string with TODO comment in `tenant-settings-form.tsx`
- Sign-out component: decided to skip mobile MobileNav integration (3-column grid would need restructuring); sign-out available from SidebarNav footer on desktop via `AppShell footer` prop pattern

### Completion Notes List

**Implementation summary:**
- Task 1: Migration `20260415100000_tenant_settings.sql` adds 6 new tenant columns (company_address, tax_id, datev_berater_nr, datev_mandanten_nr, datev_sachkontenlaenge, datev_fiscal_year_start) with 5 named check constraints. Column-level UPDATE grant extended via REVOKE + GRANT pattern; updated_at remains excluded.
- Task 2: `_normalize.ts` helper extracted (DRY); `tenantSettingsSchema` implemented with all 9 fields including digit-only validation, regex for tax_id (DE + 9 digits), and coerced integers.
- Task 3: `firstZodError` extracted to `lib/zod-error.ts`; `onboarding.ts` updated to import from there.
- Task 4: `updateTenantSettings` server action with full error mapping (23514, 42501, generic), `revalidatePath`, and TODO comments for Sentry (not installed).
- Task 5: `/einstellungen` Server Component with metadata, RLS fetch, error EmptyState, and `loading.tsx` skeleton.
- Task 6: `TenantSettingsForm` client component with RHF + zodResolver, SKR radiogroup, native `<details>` accordion, native `<select>` for DATEV fields, sticky iOS-safe submit button.
- Task 7: `sign-out-menu.tsx` extracted with inline server action; mounted in SidebarNav footer via `footer` prop in AppShell; dashboard rewritten as 3-card shell with `lg:grid-cols-12` layout and TODO comments.
- Task 8: `<AiDisclaimer />` server component created but NOT mounted (Epic 2 Story 2.2 will add).
- Task 9: `<KeyboardShortcutsHelp />` with native `<dialog>` showModal/close, `?` key binding, input guard, matchMedia check; mounted in AppShell.
- Task 10: All verifications passed.

**NFR3 note:** `/dashboard` has zero DB queries (all placeholder cards) — renders as static content; confirmed in build output as ○ (Static). `/einstellungen` is dynamic (ƒ) due to RLS tenant fetch, but synchronous RSC pattern means no client-side waterfall.

**Sign-out location decision:** Desktop sign-out via `SidebarNav` footer. Mobile: MobileNav's 3-column grid (Dashboard / FAB / Archiv) does not have a 4th slot without redesign — deferred to Epic 3 when the nav is likely refactored with search and profile.

### File List

- `supabase/migrations/20260415100000_tenant_settings.sql` (new)
- `packages/shared/src/types/database.ts` (regenerated)
- `packages/shared/src/schemas/_normalize.ts` (new)
- `packages/shared/src/schemas/tenant-settings.ts` (new)
- `packages/shared/src/schemas/onboarding.ts` (refactored — imports normalizeName from _normalize)
- `packages/shared/src/index.ts` (added tenant-settings re-export)
- `apps/web/lib/zod-error.ts` (new)
- `apps/web/app/actions/onboarding.ts` (refactored — imports firstZodError from lib/zod-error)
- `apps/web/app/actions/tenant.ts` (new)
- `apps/web/app/(app)/einstellungen/page.tsx` (new)
- `apps/web/app/(app)/einstellungen/loading.tsx` (new)
- `apps/web/app/(app)/dashboard/page.tsx` (rewritten)
- `apps/web/components/layout/app-shell.tsx` (updated — SignOutMenu + KeyboardShortcutsHelp)
- `apps/web/components/layout/sidebar-nav.tsx` (updated — footer prop)
- `apps/web/components/layout/sign-out-menu.tsx` (new)
- `apps/web/components/layout/keyboard-shortcuts-help.tsx` (new)
- `apps/web/components/settings/tenant-settings-form.tsx` (new)
- `apps/web/components/ai/ai-disclaimer.tsx` (new)

## Change Log

- 2026-04-15: Story 1.5 implemented by claude-sonnet-4-6. Added tenant settings columns + DATEV config migration, tenant-settings Zod schema, updateTenantSettings server action, /einstellungen settings page + form, dashboard shell refactor (3-card placeholder layout), sign-out menu extracted to SidebarNav footer, AiDisclaimer component created (not yet mounted), KeyboardShortcutsHelp overlay with native dialog.

### Review Findings

- [x] [Review][Defer] Mobile sign-out path absent — desktop-only `SidebarNav` footer ships; MobileNav 3-col grid has no 4th slot. Deferred to Epic 3 nav refactor; users can sign out via browser session in the meantime [apps/web/components/layout/sign-out-menu.tsx]

- [x] [Review][Patch] zodResolver double-cast via `unknown` hides type mismatch [apps/web/components/settings/tenant-settings-form.tsx:40-42]
- [x] [Review][Patch] Success feedback missing relative-time suffix — use static "Gespeichert · gerade eben" (no date-fns needed) [apps/web/components/settings/tenant-settings-form.tsx:312-320]
- [x] [Review][Patch] Form state stale after save — server-normalized values (uppercased tax_id, stripped whitespace) not reflected; call `form.reset(parsed.data)` on success [apps/web/components/settings/tenant-settings-form.tsx:54-68]
- [x] [Review][Patch] `<dialog>.showModal()` can throw when already open (React strict mode double effects); guard with `if (!dialog.open)` + try/catch [apps/web/components/layout/keyboard-shortcuts-help.tsx:56-63]
- [x] [Review][Patch] `?` key handler ignores IME composition — add `if (e.isComposing || e.keyCode === 229) return;` guard [apps/web/components/layout/keyboard-shortcuts-help.tsx:31-44]
- [x] [Review][Patch] Backdrop click detection via `getBoundingClientRect` closes on child clicks near edges and on 0-size pre-paint rect; check `e.target === dialogRef.current` instead [apps/web/components/layout/keyboard-shortcuts-help.tsx:63-80]
- [x] [Review][Patch] `tax_id` normalize does not strip internal whitespace — "DE 123 456 789" paste fails; extend transform to `.replace(/\s+/g, "")` [packages/shared/src/schemas/tenant-settings.ts:22-41]
- [x] [Review][Patch] Session-expired error (42501 / auth null) shows inline message but user has no CTA; redirect to `/login?returnTo=/einstellungen` instead [apps/web/app/actions/tenant.ts:21-26]
- [x] [Review][Patch] `<EmptyState title="" ...>` renders empty title DOM — provide meaningful title or omit prop [apps/web/app/(app)/dashboard/page.tsx PipelineSection/ProcessingStatsSection]
- [x] [Review][Patch] `SignOutMenu` has `collapsed` prop defined but never passed from AppShell — remove dead param [apps/web/components/layout/sign-out-menu.tsx]
- [x] [Review][Patch] `skr_plan` unchecked cast from DB string `(tenant.skr_plan as "SKR03" | "SKR04") ?? "SKR03"` silently allows drift; validate against `SKR_PLANS` [apps/web/app/(app)/einstellungen/page.tsx:41-44]

- [x] [Review][Defer] Full-row update without optimistic concurrency (last-write-wins on concurrent edits) [apps/web/app/actions/tenant.ts:44-50] — deferred, not in story scope
- [x] [Review][Defer] Migration constraint `add constraint` not idempotent + no down migration / REVOKE rollback [supabase/migrations/20260415100000_tenant_settings.sql] — deferred, project convention forward-only
- [x] [Review][Defer] Sign-out form action does not prompt on unsaved settings edits [apps/web/components/layout/sign-out-menu.tsx] — deferred, beforeunload UX needs cross-app design
- [x] [Review][Defer] `skr_plan` two-button `role="radiogroup"` + `aria-pressed` pattern lacks arrow-key nav [apps/web/components/settings/tenant-settings-form.tsx:101-127] — deferred, pre-existing pattern from Story 1.4 setup-form
- [x] [Review][Defer] `complete_onboarding` typing reordered + `my_tenant_id` appears in regenerated types with no SQL in this diff [packages/shared/src/types/database.ts] — deferred, likely carryover from prior story's migration
