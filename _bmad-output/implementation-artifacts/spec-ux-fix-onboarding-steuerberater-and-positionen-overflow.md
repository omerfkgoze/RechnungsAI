---
title: 'UX Fix: Onboarding Steuerberater optional validation + Positionen mobile button overflow'
type: 'bugfix'
created: '2026-05-04'
status: 'draft'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Two independent UX regressions: (1) Onboarding step "Dein Unternehmen" crashes with "Invalid input: expected string, received null" when the optional Steuerberater field is left blank — `zodResolver` transforms `""` → `null` client-side, then the server action re-validates with the same schema where `z.string()` rejects `null`. (2) On mobile, editing any Positionen line-item cell causes the three action buttons ("Übernehmen", "AI-Wert wiederherstellen", "Abbrechen") to overflow the narrow table cell and break the layout — only Positionen cells are affected because the `dl/dd` grid sections have sufficient horizontal space.

**Approach:** Fix (1) by aligning `steuerberater_name` schema input type with `tenant-settings.ts` — accept `string | null` as input so a zodResolver-transformed null re-validates cleanly on the server. Fix (2) by allowing the button row to wrap with `flex-wrap` so buttons stack on narrow viewports.

## Boundaries & Constraints

**Always:**
- Keep server-side re-validation in the onboarding action — do not remove the `safeParse` call.
- The `steuerberater_name` output type must remain `string | null` (no behavior change for callers).
- `EditableField` button layout change must not alter desktop behavior — buttons must remain on a single row on wider viewports.
- No new dependencies.

**Ask First:**
- If changing `OnboardingSetupInput` type signature breaks any callers outside `setup-form.tsx` and `onboarding.ts` action.

**Never:**
- Do not change the `tenant-settings.ts` schema — it already works correctly and is the reference.
- Do not remove the optional `Steuerberater` field from the onboarding form.
- Do not restructure EditableField into multiple components or add responsive breakpoint variants via JS — CSS `flex-wrap` only.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Steuerberater left blank | `steuerberater_name: ""` submitted via onboarding form | No error; `steuerberater_name` stored as `null` | N/A |
| Steuerberater filled | `steuerberater_name: "Max Müller"` | Stored as `"Max Müller"` | N/A |
| Steuerberater whitespace-only | `steuerberater_name: "   "` | Normalized to `null`, no error | N/A |
| zodResolver passes null to action | Server action receives `steuerberater_name: null` | `safeParse` succeeds; null accepted by `z.string().nullable()` input | N/A |
| Positionen field on mobile viewport | User taps any Positionen cell to edit | Input + buttons render; buttons wrap to next line if no space | N/A |
| Positionen field on desktop viewport | User clicks any Positionen cell to edit | Input + buttons render on single row (no visual change from today) | N/A |

</frozen-after-approval>

## Code Map

- `packages/shared/src/schemas/onboarding.ts` -- `onboardingSetupSchema`: `steuerberater_name` chain starts with `z.string()` (null-rejecting) — root cause of bug 1
- `packages/shared/src/schemas/tenant-settings.ts` -- reference: `steuerberater_name` uses `z.string().nullable()` as base + `normalizeToNull` transform — correct pattern to copy
- `apps/web/app/actions/onboarding.ts` -- `completeOnboarding`: calls `onboardingSetupSchema.safeParse` server-side; receives zodResolver-transformed null; no change needed once schema is fixed
- `apps/web/components/onboarding/setup-form.tsx` -- renders the Steuerberater `<Input>` with default `""` — no change needed
- `apps/web/components/invoice/editable-field.tsx` -- edit-mode button row (line ~270): `flex items-center gap-2 mt-1` — root cause of bug 2; buttons overflow narrow table cells

## Tasks & Acceptance

**Execution:**
- [ ] `packages/shared/src/schemas/onboarding.ts` -- Change `steuerberater_name` base from `z.string()` to `z.string().nullable()` and update the transform to handle `string | null` input (pattern: `if (v === null) return null; const cleaned = normalizeName(v); return cleaned.length === 0 ? null : cleaned;`) -- aligns server-side re-validation with zodResolver output type
- [ ] `apps/web/components/invoice/editable-field.tsx` -- Change button-row container class from `flex items-center gap-2 mt-1` to `flex flex-wrap items-center gap-1 mt-1` -- allows buttons to wrap on narrow viewports (Positionen table cells) without affecting desktop layout

**Acceptance Criteria:**
- Given user on onboarding "Dein Unternehmen" step, when Firmenname and Kontenrahmen are filled and Steuerberater is left blank, then form submits successfully with no error.
- Given `steuerberater_name: null` passed directly to `completeOnboarding`, when `onboardingSetupSchema.safeParse` runs, then `parsed.success` is `true`.
- Given a mobile viewport on `/rechnungen/:id`, when user taps a Positionen cell to edit, then all three action buttons are visible and within the viewport without horizontal scroll.
- Given a desktop viewport on `/rechnungen/:id`, when user clicks a Positionen cell to edit, then action buttons remain on a single row (visual parity with current desktop behavior).

## Verification

**Commands:**
- `pnpm --filter @rechnungsai/shared test` -- expected: all tests pass (including tenant-settings steuerberater tests as reference)
- `pnpm --filter web build` -- expected: no TypeScript errors

## Design Notes

The Zod v4 pipeline chain `z.string().transform(v => null).pipe(z.string().nullable())` is technically valid but creates a type mismatch at runtime when the server action receives the already-transformed `null` from `zodResolver` and re-parses it: the leading `z.string()` rejects `null` before the transform even runs. The fix is to accept `null` at the input stage (`z.string().nullable()`) and guard in the transform — exactly what `tenant-settings.ts` already does.
