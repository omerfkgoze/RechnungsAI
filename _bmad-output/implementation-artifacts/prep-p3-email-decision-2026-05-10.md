# Prep P3: Email Infrastructure Decision for Epic 6

**Date:** 2026-05-10
**Owner:** GOZE
**Status:** Decided
**Triggers:** Epic 5 Retro Action A5; Story 6.2 (Validation Results Display and Correction Email)

---

## Decision

**Option (b): Continue with `mailto:` shim in Story 6.2; defer real transactional email infrastructure to Epic 8 Story 8.3.**

**Additional commitment:** Add a small prep migration before Story 6.1 — `tenants.steuerberater_email` column + Zod validator + settings UI field. The column lands now (one migration) and is used by Story 6.2's `mailto:` pre-fill; it remains the same column when Epic 8.3 wires real send.

---

## Why Not (a) Pull Epic 8.3 Forward

1. **Use case mismatch.** Story 6.2's correction email goes to the **supplier**, not the Steuerberater. One invoice, one-shot, user-initiated. This is the canonical `mailto:` scenario — user reviews content in their own mail client before sending.
2. **Story 8.3's real weight is the weekly value recap** — automated, scheduled, cron-driven, no user interaction. **That** is where transactional infrastructure is actually justified. Pulling 8.3 forward means building the infra *without the use case that justifies it*. Premature.
3. **Pattern consistency.** Story 5.3 already established the `mailto:`-shim pattern for the DATEV CSV handoff. Story 6.2 with the same pattern keeps the user's mental model uniform: *"RechnungsAI prepares the draft, I send it."*
4. **Trust posture.** Correction requests leaving the user's own mail channel (with their signature + reply-to) is arguably more credible to small German bookkeepers than a system-generated email from a SaaS domain.

## Why (b) Is Sufficient for Now

- Volume: correction requests are low-volume, ad-hoc events (a few per month per tenant at most).
- Content: the email body is a formal German correction request — URL-encodable, fits within practical `mailto:` length limits.
- Reversibility: when Epic 8.3 lands transactional send, replacing the `mailto:` button with a "Direkt senden" button is a small UI change, not a re-architecture.

## Known Limitations Accepted

- **Long error lists:** if EN 16931 produces many validation errors for a single invoice, the URL-encoded body may approach browser/OS `mailto:` length limits (~2000 chars practical). Mitigation: truncate the error list in the body to top-N issues; full list remains in the app for the supplier to reference. (Implementation detail for Story 6.2 — not a blocker.)
- **No bounce / delivery tracking:** the user is responsible for verifying delivery from their own mail client. This is acceptable for v1.
- **No batch correction requests** (e.g., "all non-compliant invoices from supplier X"). If demand emerges, revisit during/after Epic 8.3.

---

## Prep Migration: `tenants.steuerberater_email`

**Why add it now (before Story 6.1):**

- Story 6.2 will use it to pre-fill the `mailto:` recipient. Without it, the user pastes the supplier email manually every time.
- Story 5.3's deferred "Direct send to Steuerberater" entry in `deferred-work.md` will use the **same column** when Epic 8.3 lands transactional send. One migration serves both deferred work and Story 6.2.
- Single column + one Zod field + one form input. Trivial scope.

**Scope (to be implemented as part of Epic 6 prep, NOT inside Story 6.1):**

1. **Migration** `supabase/migrations/YYYYMMDD000000_tenant_steuerberater_email.sql`:
   - Add `steuerberater_email text null` to `public.tenants`.
   - Add check constraint with a permissive email regex (mirror the project's existing email validation if any; otherwise a basic `^[^@\s]+@[^@\s]+\.[^@\s]+$` is sufficient — Zod handles the strict validation at write time).
   - Drop + re-create the column-level `update` grant on `public.tenants` to include the new column (same pattern as Story 5.1's migration).
   - Smoke header comments (positive insert, regex rejection, grant verification) per Story 5.1 format.
   - Regenerate `packages/shared/src/types/database.ts` after `supabase db reset`.

2. **Zod schema** `packages/shared/src/schemas/tenant-settings.ts`:
   - Add `steuerberater_email` field using the same `optionalString → normalize → pipe` pattern Story 5.1 introduced.
   - Inner pipe: `z.string().email({ message: "Ungültige E-Mail-Adresse." }).nullable()`.
   - Round-trip safe (idempotent), matches the existing schema's pattern.

3. **Settings form** `apps/web/components/settings/tenant-settings-form.tsx`:
   - Add an email input below the existing `steuerberater_name` field (the "Steuerberater" section already exists from Story 1.5; only adds one new field).
   - `inputMode="email"`, helper text: `"Wird als Empfänger beim DATEV-Export und bei Korrekturanfragen vorgeschlagen."`
   - Extend `form.reset(...)` in the success branch with the new field (Story 1.5 regression class).

4. **Settings page** `apps/web/app/(app)/einstellungen/page.tsx`:
   - Add `steuerberater_email` to the `.select(...)` and `defaultValues` (single-line each).

5. **Tests:**
   - `tenant-settings.test.ts`: add 3 cases (valid email parses, invalid format rejects with German message, empty → null).
   - `tenant.test.ts`: confirm `update` call includes the new field (one assertion in existing happy-path test).

**Out of scope here:**
- Story 5.3's `<DatevExportDialog>` `mailto:` already runs WITHOUT a Steuerberater address pre-fill (subject + body only, recipient blank). Updating it to pre-fill the recipient is a small Story 6.2 sibling task — keep it as a follow-up bullet, not a blocker for Story 6.1.

---

## Impact on Epic 6 Prep Plan

Updated prep critical-path order:

1. **P1** — `packages/validation` architecture spike
2. **P2** — ZUGFeRD PDF attachment extraction spike
3. **P3** — *Decided here (this file)*
4. **P3.1** (new sub-task) — `steuerberater_email` migration + schema + form + tests (estimate: small; can run in parallel with P1/P2)
5. **P4** — Wire-up spike for Story 6.1 (per Action A1 — `packages/validation` + parsers + DB + UI = ≥4 surfaces)

Story 6.2 is unblocked by Epic 8.3 — it ships with the `mailto:` shim using the new column for pre-fill.

---

## Revisit Triggers

Re-evaluate this decision (consider pulling 8.3 forward) if any of these surface during Epic 6:

- User feedback that the `mailto:` correction flow is too friction-heavy for actual use (low adoption).
- A specific compliance or audit requirement that demands system-side proof-of-send for correction requests.
- Batch correction request demand (multiple invoices in one email to one supplier) — `mailto:` body length limits start to bite.

None of these are predicted for Epic 6 based on the current PRD and persona.

---

Amelia (Developer): "(b) net. mailto pattern korunuyor, `steuerberater_email` kolonu hem 6.2'yi hem 5.3 deferred'ı kapatıyor. 8.3'ün asıl işine (weekly recap) doğru zamanda gireriz."
