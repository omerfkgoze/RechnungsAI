# Story 5.1: DATEV Settings Configuration

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to configure my DATEV export settings once (Berater-Nr, Mandanten-Nr, Sachkontenlänge, fiscal year start, default Kreditorenkonto),
so that every export in Story 5.2/5.3 is generated with the correct EXTF header values without me re-entering them.

## Context: This Story Is Smaller Than the Epic Suggests

**STOP — read this before reading the ACs.**

Story 1.5 (`1-5-tenant-settings-and-dashboard-shell.md`) already shipped the "DATEV-Konfiguration" form with all four fields the epic line for Story 5.1 mentions (Berater-Nr, Mandanten-Nr, Sachkontenlänge, fiscal year start). The DB columns, Zod schema, server action, and UI exist and are working in production today. **Do not re-implement them.** Verify they exist (see "Existing Code Map" below); if any are missing, treat that as a regression and stop.

Per `prep-p2-datev-settings-scope-2026-05-04.md`, the actual scope of Story 5.1 is:

1. **Add ONE new column** — `datev_default_kreditorenkonto` (the offsetting account / Gegenkonto) — without which Story 5.2 cannot generate valid Buchungsstapel rows.
2. **Add tests** — the four existing DATEV settings fields have ZERO test coverage today. Tests are mandatory before Epic 5 builds on them.
3. **Add a readiness indicator** to the settings UI so users see at a glance whether export is configured.
4. **Verify session/redirect behaviour** still works with the new field.

That is the entire story. If you find yourself touching `tenant-settings-form.tsx` for anything other than the new field + readiness indicator, you are out of scope.

## Acceptance Criteria

1. **Given** the existing tenants table has the four Story 1.5 DATEV columns **When** a new migration `supabase/migrations/20260504000000_datev_default_kreditorenkonto.sql` runs **Then** it adds `datev_default_kreditorenkonto text null` with a check constraint `tenants_datev_default_kreditorenkonto_format` of pattern `^[0-9]{5,9}$ or null`; AND the existing column-level `update` grant on `public.tenants` to `authenticated` is dropped and re-created to include `datev_default_kreditorenkonto` (Postgres has no `grant update add column` syntax — mirror the pattern from `20260415100000_tenant_settings.sql:51-62`); AND `updated_at` and `id` remain excluded from the grant; AND smoke header comments at the top of the migration document the verification queries (one positive insert, one rejected by check, one grant test) following the format of `20260415100000_tenant_settings.sql:5-15`. After `supabase db reset`, regenerate types with `pnpm --filter @rechnungsai/shared types:generate` (or whatever script equivalent — see `packages/shared/package.json`) so `packages/shared/src/types/database.ts` includes `datev_default_kreditorenkonto: string | null` on the `tenants.Row`/`Insert`/`Update` types. The migration is forward-only (project convention — see Story 1.5 review defer line 271).

2. **Given** the shared package owns all cross-boundary schemas **When** `packages/shared/src/schemas/tenant-settings.ts` is updated **Then** `tenantSettingsSchema` gains a `datev_default_kreditorenkonto` field positioned AFTER `datev_fiscal_year_start` in the schema object; the field reuses the exact `optionalString` + `normalizeName` + empty-string-to-null transform pattern already used by `datev_berater_nr` (lines 64-77 of the current file); the inner pipe validates `regex(/^[0-9]{5,9}$/, { message: "Kreditorenkonto darf nur Ziffern enthalten (5–9 Stellen)." }).nullable()`; no other field is altered; `TenantSettingsInput` and `TenantSettingsOutput` types remain inferred (no manual edits) and pick up the new optional field automatically.

3. **Given** the settings page server component already selects all DATEV columns **When** `apps/web/app/(app)/einstellungen/page.tsx` is updated **Then** the `.select(...)` string adds `datev_default_kreditorenkonto` (single line change), and the `defaultValues` prop passed to `<TenantSettingsForm>` adds `datev_default_kreditorenkonto: tenant.datev_default_kreditorenkonto ?? ""` (mirrors the empty-string fallback already used for `datev_berater_nr`/`datev_mandanten_nr` so the controlled `<Input>` does not flip uncontrolled→controlled). No other changes to that file.

4. **Given** the settings form already has a "DATEV-Konfiguration" sub-section inside the "Weitere Angaben" accordion **When** `apps/web/components/settings/tenant-settings-form.tsx` is updated **Then** a new `<FormField name="datev_default_kreditorenkonto">` is added IMMEDIATELY AFTER the `datev_fiscal_year_start` field (last DATEV field in the section); it uses `<Input value={field.value ?? ""} placeholder="z. B. 70000" maxLength={9} inputMode="numeric" />` with `<FormLabel>Standard-Kreditorenkonto</FormLabel>` and a small muted helper text below the field reading `"Wird als Gegenkonto in jeder DATEV-Buchung verwendet (optional — leer lassen für SKR-Standard)."`; the `form.reset({...})` call inside the success branch (lines 73-86 of the current file) is extended to include `datev_default_kreditorenkonto: parsed.data.datev_default_kreditorenkonto ?? ""` (forgetting this line will leave the form stale after save — Story 1.5 review patch line 260 confirmed this is a real bug class); no other field is touched, no toasts, no modals (UX-DR12 — errors stay inline via `<FormMessage>`).

5. **Given** the user has saved at least Berater-Nr and Mandanten-Nr **When** the settings page renders **Then** a small read-only readiness indicator appears at the TOP of the "DATEV-Konfiguration" sub-heading (just above the four input fields) showing one of two states: **(a)** when both `datev_berater_nr` AND `datev_mandanten_nr` are non-null → `<span class="inline-flex items-center gap-1 text-success text-body-sm">✓ DATEV-Export bereit</span>` (use design tokens — `text-success` exists per `app-shell.tsx`/Story 1.5 trust badge usage; do NOT hardcode `green-600`), **(b)** otherwise → `<span class="inline-flex items-center gap-1 text-warning text-body-sm">! Konfiguration unvollständig</span>`. The indicator is computed from the SERVER-fetched values in `page.tsx` (pass a `datevReady: boolean` prop into `<TenantSettingsForm>` OR derive in the form via `form.watch(["datev_berater_nr", "datev_mandanten_nr"])` — pick whichever keeps the prop surface minimal; if you choose `form.watch` document the choice so the next dev does not duplicate the logic on the server). NO emoji icons (project lints/forbids decorative emojis in source files — see CLAUDE.md "no emojis unless asked"); the ✓ and ! shown above are placeholders, replace with `lucide-react` `CheckCircle2` / `AlertTriangle` icons (lucide is already a dep — used throughout `components/ui/`).

6. **Given** the user submits the settings form including an invalid Kreditorenkonto (e.g. `"abc"` or `"123"` — too short) **When** the form validates on blur or on submit **Then** the inline `<FormMessage>` under the field renders the German message from the Zod schema verbatim (`"Kreditorenkonto darf nur Ziffern enthalten (5–9 Stellen)."`); the form does NOT submit; no toast, no modal, no console error in the browser. **AND** if a malicious client bypasses Zod and POSTs `datev_default_kreditorenkonto = "abc"` directly, the Server Action's `tenantSettingsSchema.safeParse` returns `success: false` and the action returns `{ success: false, error: "Kreditorenkonto darf nur Ziffern enthalten (5–9 Stellen)." }` (server-side defence — Story 1.4 pattern: never trust the client). **AND** if Zod somehow misses it, the Postgres `tenants_datev_default_kreditorenkonto_format` check rejects with code `23514` and the action's existing 23514 handler returns `"Ungültige Eingabe. Bitte überprüfe deine Daten."` (defence-in-depth chain — three layers).

7. **Given** the user saves valid DATEV settings **When** `updateTenantSettings` runs **Then** the existing implementation in `apps/web/app/actions/tenant.ts` works without modification — it already spreads `parsed.data` into the `update({ ... })` call (line 47), so the new field flows through automatically; no edits needed to `tenant.ts`. **DO NOT** add field-by-field plumbing — verify by inspection that `parsed.data` includes the new field via the inferred Zod output type, then test the round-trip behaviour (see AC #9). If you find yourself editing `tenant.ts` for this story, stop and re-read the file — Story 1.5's spread pattern was specifically designed for this.

8. **Given** the unit tests for `tenantSettingsSchema` are missing today **When** the story is complete **Then** a new file `packages/shared/src/schemas/tenant-settings.test.ts` exists co-located with the schema, using Vitest (project convention — see `packages/shared/src/schemas/invoice.test.ts:1` and `invoice-upload.test.ts`); the test file covers AT MINIMUM these scenarios with the EXACT error messages asserted (these messages are part of the user contract — drift breaks UX): **(a)** valid full input parses successfully and round-trips through `safeParse(parse(...))` (the form re-parses its own output — see `tenant-settings-form.tsx:71` — so the schema MUST be idempotent), **(b)** `company_name` empty → `"Firmenname ist zu kurz."`, **(c)** `tax_id = "DE 123 456 789"` (with whitespace) normalises to `"DE123456789"` and parses (regression for Story 1.5 review patch line 264), **(d)** `tax_id = "XX123"` → `"USt-IdNr. muss mit DE beginnen und 9 Ziffern enthalten."`, **(e)** `datev_berater_nr = "abc"` → `"Berater-Nr. darf nur Ziffern enthalten (max. 7)."`, **(f)** `datev_berater_nr = "12345678"` (8 digits, max is 7) → same error, **(g)** `datev_berater_nr = ""` → null (empty-to-null transform), **(h)** `datev_mandanten_nr = "123456"` (6 digits, max is 5) → German length error, **(i)** `datev_sachkontenlaenge = 3` → `"Sachkontenlänge muss zwischen 4 und 8 liegen."`, **(j)** `datev_sachkontenlaenge = 9` → same error, **(k)** `datev_sachkontenlaenge = "5"` (string from form) → coerces to number 5 (`z.coerce.number()` behaviour is part of the contract — the form submits string values), **(l)** `datev_fiscal_year_start = 0` and `13` → German error, **(m)** `datev_default_kreditorenkonto = "70000"` → parses, **(n)** `datev_default_kreditorenkonto = "1234"` (4 digits) → `"Kreditorenkonto darf nur Ziffern enthalten (5–9 Stellen)."`, **(o)** `datev_default_kreditorenkonto = "1234567890"` (10 digits) → same error, **(p)** `datev_default_kreditorenkonto = ""` → null. Use `tenantSettingsSchema.safeParse(...)` (NOT `.parse(...)` followed by try/catch — `invoice.test.ts` uses `safeParse` for negative cases, follow the convention).

9. **Given** the integration tests for `updateTenantSettings` are missing today **When** the story is complete **Then** a new file `apps/web/app/actions/tenant.test.ts` exists co-located with the action, mocking `next/cache`, `next/navigation`, `@sentry/nextjs`, and the Supabase server client EXACTLY the way `apps/web/app/actions/invoices.test.ts:1-95` mocks them (re-read that file before writing this one — the chained `.from(...).update(...).eq(...).select(...).single()` pattern needs `vi.fn()` returning `this` from each step). Test cases REQUIRED: **(a)** happy path — valid input, action returns `{ success: true, data: { updatedAt: <iso-string> } }`, the mocked `update` is called once with an object containing all DATEV fields including `datev_default_kreditorenkonto`, **(b)** Zod failure — `tax_id = "XX"` → `{ success: false, error: "USt-IdNr. ..." }`, no DB call made (assert `update` mock not called), **(c)** Postgres 23514 — DB returns `{ error: { code: "23514", message: "..." } }` → action returns `{ success: false, error: "Ungültige Eingabe. Bitte überprüfe deine Daten." }`, **(d)** auth failure — `auth.getUser()` returns `{ user: null, error: ... }` → `redirect("/login?returnTo=/einstellungen")` is thrown (test pattern: `await expect(updateTenantSettings(...)).rejects.toThrow(/NEXT_REDIRECT/)` — see `invoices.test.ts:65-72` for the redirect mock that produces this), **(e)** Postgres 42501 — DB returns insufficient_privilege → also redirects to `/login?returnTo=/einstellungen` (line 61-63 of current `tenant.ts`), **(f)** unknown DB error → `Sentry.captureException` is called with `tags: { action: "settings:update" }` and the action returns the generic German error. **DO NOT** boot a real Supabase client — these are unit tests, not E2E.

10. **Given** all type-checks and tests run **When** the story is verified **Then** `pnpm check-types` from the repo root passes with zero errors; `pnpm lint` passes with zero errors; `pnpm test --filter @rechnungsai/shared` and `pnpm test --filter web` (or whatever the equivalent monorepo invocation is — check root `package.json` scripts) both pass with the new tests included; `supabase db reset` succeeds against the local stack and the new migration loads cleanly without altering any other migration's behaviour; manual smoke check via psql confirms: `\d public.tenants` lists `datev_default_kreditorenkonto`; attempting `update public.tenants set datev_default_kreditorenkonto = 'abc'` as `authenticated` role fails with `23514`; attempting `update public.tenants set updated_at = now()` is still blocked with `42501` (regression check on the grant exclusion).

11. **Given** any user-facing error or success surfaces in this story **When** it is rendered **Then** all text is in conversational German (NFR24); no raw Postgres error codes, no English error fallbacks, no toasts, no modals; errors render via `<FormMessage>` (per-field) or `text-destructive text-sm mt-2` under the submit button (root errors); success continues to use the existing `"Gespeichert · gerade eben"` inline text from Story 1.5 (line 330 of the current form file) — do not change it.

## Tasks / Subtasks

- [ ] **Task 1: Migration + types** (AC: 1, 10)
  - [ ] Create `supabase/migrations/20260504000000_datev_default_kreditorenkonto.sql` mirroring the structure of `20260415100000_tenant_settings.sql` (smoke comment block at top, `alter table add column if not exists`, `add constraint`, `revoke update + grant update (...)` block listing ALL editable columns)
  - [ ] Run `supabase db reset` locally — confirm migration applies cleanly
  - [ ] Regenerate `packages/shared/src/types/database.ts` (use the same script Story 1.5 used — likely `supabase gen types typescript --local > packages/shared/src/types/database.ts`); confirm `datev_default_kreditorenkonto: string | null` appears in `tenants.Row/Insert/Update`
  - [ ] Manual psql verification of the three smoke queries (positive insert, check rejection, grant exclusion) — paste results into Completion Notes
- [ ] **Task 2: Zod schema + tests** (AC: 2, 8, 10, 11)
  - [ ] Add `datev_default_kreditorenkonto` field to `packages/shared/src/schemas/tenant-settings.ts` after `datev_fiscal_year_start`
  - [ ] Create `packages/shared/src/schemas/tenant-settings.test.ts` with all 16 cases from AC #8
  - [ ] Run `pnpm --filter @rechnungsai/shared test` — all green
- [ ] **Task 3: Server action regression test** (AC: 7, 9)
  - [ ] Verify `tenant.ts` needs no edits (read it; `parsed.data` spread is sufficient)
  - [ ] Create `apps/web/app/actions/tenant.test.ts` modelled on `invoices.test.ts:1-95` with all 6 cases from AC #9
  - [ ] Run `pnpm --filter web test` — all green; confirm `updateTenantSettings` mocked `update` call includes `datev_default_kreditorenkonto`
- [ ] **Task 4: Settings page wiring** (AC: 3, 5)
  - [ ] Update `apps/web/app/(app)/einstellungen/page.tsx`: add `datev_default_kreditorenkonto` to the SELECT string and to `defaultValues`
  - [ ] Decide where the readiness indicator's `datevReady` value is computed (server prop vs `form.watch`) and document the choice in Dev Notes
- [ ] **Task 5: Form field + readiness indicator** (AC: 4, 5, 6, 11)
  - [ ] Add the new `<FormField>` block after `datev_fiscal_year_start` with `inputMode="numeric" maxLength={9}`
  - [ ] Extend `form.reset({...})` in the success branch with the new field (regression: Story 1.5 patch line 260)
  - [ ] Add the readiness indicator above the "DATEV-Konfiguration" sub-heading using `lucide-react` icons (`CheckCircle2`, `AlertTriangle`) and `text-success` / `text-warning` design tokens — NO raw colour classes, NO emojis
  - [ ] Verify on-blur validation surfaces the German Kreditorenkonto error inline
- [ ] **Task 6: Type-check + build verification** (AC: 10)
  - [ ] `pnpm check-types` from repo root → 0 errors
  - [ ] `pnpm lint` → 0 errors
  - [ ] `pnpm build` → succeeds
- [ ] **Task 7: Browser smoke test** (AC: 11; format per `smoke-test-format-guide.md`)
  - [ ] Fill in the smoke test table in Completion Notes following the `smoke-test-format-guide.md` v1.0 spec — UX checks Tier 1 + DB verification Tier 2; mark each row `BLOCKED-BY-ENVIRONMENT` if you cannot run a real browser, with manual steps for GOZE

## Dev Notes

### Existing Code Map (read these BEFORE writing any code)

| Concern | File | What's already there |
|---|---|---|
| Tenant DATEV columns + grant pattern | `supabase/migrations/20260415100000_tenant_settings.sql` | All 4 existing DATEV columns + check constraints + grant pattern. Mirror EXACTLY for the new migration. |
| Tenant Zod schema | `packages/shared/src/schemas/tenant-settings.ts` | All 4 DATEV fields + the `optionalString → normalize → pipe` pattern. New field copies the `datev_berater_nr` shape verbatim, only the regex + message change. |
| String normalization helper | `packages/shared/src/schemas/_normalize.ts` | `normalizeName` strips zero-width / bidi chars. The new field's transform reuses it (same as `datev_berater_nr`). |
| Settings page (RSC fetch) | `apps/web/app/(app)/einstellungen/page.tsx` | Selects all DATEV columns, passes `defaultValues`. One-line edits. |
| Settings form (Client) | `apps/web/components/settings/tenant-settings-form.tsx` | "DATEV-Konfiguration" h3 + 4 fields inside `<details>` accordion. New field goes at the bottom; readiness indicator goes ABOVE the h3. |
| Server Action | `apps/web/app/actions/tenant.ts` | Already spreads `parsed.data` — needs ZERO edits for this story. |
| Zod error helper | `apps/web/lib/zod-error.ts` | `firstZodError(error)` returns first issue message. Reused by the action. |
| Action test patterns | `apps/web/app/actions/invoices.test.ts:1-95` | The canonical Supabase mock chain. Copy this header verbatim into `tenant.test.ts`. |
| Schema test patterns | `packages/shared/src/schemas/invoice.test.ts` | Vitest `describe` / `safeParse` patterns. Match this style. |
| Smoke test format | `_bmad-output/implementation-artifacts/smoke-test-format-guide.md` | Tier 1 UX + Tier 2 DB tables. Status values: `DONE` / `FAIL` / `BLOCKED-BY-ENVIRONMENT`. |
| Trust-bar / design-token usage | `apps/web/components/layout/app-shell.tsx`; `tailwind.config` | `text-success`, `text-warning`, `border-warning`, `bg-warning/10` etc. exist. Use them. |

### Why the Default Kreditorenkonto Field Exists

Per `spike-p1-datev-format-2026-05-04.md`, every Buchungsstapel data row requires a `Gegenkonto` (offsetting account). For Eingangsrechnungen this is the **Kreditorenkonto** — the supplier's payable account. Three options were considered:

1. Hardcode SKR-default (`70000` for SKR03, `10000` for SKR04) — works but takes choice away from the user.
2. Per-supplier Kreditorenkonto — correct accounting practice but blows up scope (would require a `suppliers` table or per-invoice override; out of scope for Epic 5).
3. **Tenant-level default with SKR fallback** ← chosen. The user can configure their preferred default (most German bookkeepers have a "Sammel-Kreditor" account); if left null, Story 5.2 falls back to SKR-default. This unblocks Story 5.2 without forcing UI work onto the user.

This is why the field is **optional** (nullable) and why the schema regex is `5–9 digits` rather than a fixed length — DATEV accepts variable-length account numbers (Sachkontenlänge + 1 to + 4 typically; we accept the full DATEV range to avoid blocking edge cases).

### Why Default Suggestion Is `70000` Even Though SKR04 Default Differs

The placeholder text says `"z. B. 70000"` (SKR03 Kreditoren-Sammelkonto). For SKR04 the equivalent is `10000`. We use SKR03's number as the placeholder because (a) SKR03 is the more common plan in DE small businesses, (b) the placeholder is illustrative only — Story 5.2's fallback logic respects the actual `skr_plan` value. **DO NOT** dynamically swap the placeholder based on `skr_plan` — that adds reactivity to the form for marginal value and complicates testing.

### Lucide Icon Imports

The form file already imports from `lucide-react` for other icons in the project — confirm by grepping `import.*lucide-react` in `apps/web/components/`. If `CheckCircle2` and `AlertTriangle` are not yet imported in this file, add them at the top of `tenant-settings-form.tsx`. Both icons exist in lucide-react (verified — they are stable, in lucide v0.x for years).

### Form Schema Idempotency

The form re-parses its own output during the success branch (`tenant-settings-form.tsx:71-87`). This means the schema MUST tolerate already-transformed inputs (e.g. a `string | null` value where the input type expects `string`). The existing pattern uses `optionalString = z.string().nullable()` to accept both. The new field follows the same pattern — do NOT use `.optional()` (different semantic — `undefined`-tolerance vs `null`-tolerance). AC #8(a) tests this idempotency explicitly.

### Where the Readiness Indicator Lives

Two viable placements:
- **(A)** Inside the form, gated by `form.watch(["datev_berater_nr", "datev_mandanten_nr"])` — auto-updates as the user types. Cost: client-side reactivity + `form.watch` re-renders.
- **(B)** As a server-rendered prop from `page.tsx` — true at page load only; reflects PERSISTED state. Cost: stale during in-flight edits.

**Recommendation: (A)** — the user expects "ready" to flicker green as they fill in the fields. Performance cost is negligible (two field watches). Document the choice in Dev Notes when implementing.

### Project Structure Notes

- New schema test → `packages/shared/src/schemas/tenant-settings.test.ts` (co-located, matches `invoice.test.ts` placement)
- New action test → `apps/web/app/actions/tenant.test.ts` (co-located, matches `invoices.test.ts` placement)
- New migration filename uses `20260504` (today, 2026-05-04) — NOT a prior date; Postgres applies migrations alphabetically and using a past date can cause idempotency issues across collaborators
- The story does NOT add any new package, dependency, or shared util — every helper it needs already exists

### Critical Anti-Patterns to Avoid (LLM Failure Modes)

1. **DO NOT** re-implement what Story 1.5 shipped. The four DATEV fields, the form, the action, the page — all exist. You are adding ONE field + tests + an indicator.
2. **DO NOT** edit `apps/web/app/actions/tenant.ts` — the spread of `parsed.data` already covers the new field. If you "feel" you need to touch it, re-read `tenant.ts:46-50`.
3. **DO NOT** introduce a custom date-input or replace the existing `<select>` for fiscal year — that work is done.
4. **DO NOT** add the kreditorenkonto field outside the "DATEV-Konfiguration" sub-section. Keep all four (now five) DATEV fields visually grouped.
5. **DO NOT** use raw colour classes (`green-600`, `text-orange-500`, etc.) — the project uses semantic design tokens (`text-success`, `text-warning`, `text-destructive`). Story 1.4/1.5 reviews caught this multiple times.
6. **DO NOT** add toasts or modals for save success/failure — UX-DR12 forbids it. Inline only.
7. **DO NOT** assume `form.reset(...)` survives without listing the new field — the existing reset call enumerates EVERY field; if you forget to add yours, the field will appear stale after save. Story 1.5 review patch line 260 documents this exact bug class.
8. **DO NOT** boot a real Supabase client in the action test — copy the mock chain from `invoices.test.ts:1-95`.
9. **DO NOT** mark smoke-test rows `DONE` if you (the dev agent) cannot actually run a real browser — mark `BLOCKED-BY-ENVIRONMENT` and provide manual steps. The smoke-test-format-guide is explicit about this.
10. **DO NOT** add emojis (✓, !, etc.) directly in JSX — use `lucide-react` icon components. The CLAUDE.md "no emojis" rule applies to source files.

### Previous Story Intelligence (Story 4.3 — most recent done story)

Key learnings carried forward from `4-3-archive-search-and-audit-export.md` review patches that apply here:

- **Active-mask date inputs:** Story 4.3 introduced `applyGermanDateMask` for German `DD.MM.JJJJ` inputs (`apps/web/lib/format.ts`; convention codified in `apps/web/AGENTS.md`). **Not applicable to this story** — Story 5.1 has no date inputs (fiscal year start is a month select, not a date). But: if you ever extend the export flow with a date-range picker in 5.3, you MUST use the active-mask pattern. Noted for future reference, not action.
- **Sentry tag convention:** Patches confirmed `Sentry.captureException(err, { tags: { action: "settings:update" } })` is the right shape. Reuse exactly that for any new Sentry calls in this story (none expected — `tenant.ts` already has it).
- **Server vs Client component split:** Story 4.3 split `ArchiveResultList` into a Server Component + a Client `ArchiveSelectionLayer` to keep client-state minimal. The settings page already follows this split (RSC `page.tsx` + Client `<TenantSettingsForm>`); preserve it.
- **Mobile `overflow-x-clip` rule:** Story 4.3 review fixed iOS Safari position-fixed regressions with `overflow-x-clip` on AppShell. **Already in place** — do not re-add.

### Git Intelligence (last 8 commits — patterns to match)

```
a228d02 done prep-p1-p2 and epic-4 marked as done
7a6711f refactor: done prep-p0 split invoices.ts (1795 lines) into domain sub-files
07ad4dc update sprint-status, add refactor prep task
1710c38 create epic-4 retro file and epic-5 prep tasks
d9196ef done story 4-3
472923b fix archiv page mobile compatibility
4b737fe fix patches
26620dd story 4-3 in-progress after review patches
```

Patterns observed:
- Commits use a `<verb> <description>` style — concise, lowercase, no Conventional Commit prefixes except for refactors (`refactor:`).
- After implementation, expect a "patches" follow-up commit absorbing review feedback. Plan for this rhythm.
- `prep-p0` recently split `apps/web/app/actions/invoices.ts` into `actions/invoices/{upload,review,approval,archive,shared}.ts` — **but `actions/tenant.ts` was NOT split** (it's only 88 lines). Continue editing `tenant.ts` as a single file. The split pattern is reserved for files that grow beyond ~500 lines.

### Latest Tech Information

- **Zod version in use:** `prep-td1-zod-v4-repo-wide-upgrade.md` was completed in Epic 4 prep — repo is on Zod v4. The schema syntax in `tenant-settings.ts` (uses `z.coerce.number().int().min().max({ message: ... })`, error param shape, `error: () => "..."` for enum) is Zod v4 idiomatic. Match it.
- **lucide-react:** Stable across all recent versions; `CheckCircle2` and `AlertTriangle` exist and have not been renamed.
- **Supabase types regen:** The migration filename pattern (`YYYYMMDDHHmmss_*.sql`) is enforced by Supabase CLI. Use today's date.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.1] — Original ACs and BDD scenarios
- [Source: _bmad-output/implementation-artifacts/prep-p2-datev-settings-scope-2026-05-04.md] — Scope reduction rationale; explicitly identifies kreditorenkonto as the gap
- [Source: _bmad-output/implementation-artifacts/spike-p1-datev-format-2026-05-04.md#3 Header Row — 29 Fields] — Why each existing DATEV field maps to which EXTF position; why kreditorenkonto matters for Story 5.2 data rows
- [Source: _bmad-output/implementation-artifacts/1-5-tenant-settings-and-dashboard-shell.md#File List] — Files Story 1.5 created; everything in that list already exists
- [Source: _bmad-output/implementation-artifacts/smoke-test-format-guide.md#Format Specification] — Tier 1/Tier 2 smoke-test rules
- [Source: _bmad-output/planning-artifacts/architecture.md:294-306] — Naming conventions (snake_case columns, kebab-case files, camelCase Zod + Schema suffix)
- [Source: _bmad-output/planning-artifacts/architecture.md:323-324] — Co-located Vitest tests are the project standard
- [Source: supabase/migrations/20260415100000_tenant_settings.sql] — Migration template to mirror
- [Source: apps/web/CLAUDE.md → AGENTS.md] — Date-input convention (not used in this story; recorded for Epic 5 Story 5.3)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
