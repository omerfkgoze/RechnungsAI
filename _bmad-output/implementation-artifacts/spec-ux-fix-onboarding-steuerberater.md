---
title: 'UX Fix: Onboarding Steuerberater optional validation'
type: 'bugfix'
created: '2026-05-04'
status: 'done'
baseline_commit: '0ab8ad819b6156b7de5d740e2240c9da7282bf3f'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Two independent UX regressions: Onboarding step "Dein Unternehmen" crashes with "Invalid input: expected string, received null" when the optional Steuerberater field is left blank — `zodResolver` transforms `""` → `null` client-side, then the server action re-validates with the same schema where `z.string()` rejects `null`. 

**Approach:** Fix by aligning `steuerberater_name` schema input type with `tenant-settings.ts` — accept `string | null` as input so a zodResolver-transformed null re-validates cleanly on the server.

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

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Steuerberater left blank | `steuerberater_name: ""` submitted via onboarding form | No error; `steuerberater_name` stored as `null` | N/A |
| Steuerberater filled | `steuerberater_name: "Max Müller"` | Stored as `"Max Müller"` | N/A |
| Steuerberater whitespace-only | `steuerberater_name: "   "` | Normalized to `null`, no error | N/A |
| zodResolver passes null to action | Server action receives `steuerberater_name: null` | `safeParse` succeeds; null accepted by `z.string().nullable()` input | N/A |

</frozen-after-approval>

## Code Map

- `packages/shared/src/schemas/onboarding.ts` -- `onboardingSetupSchema`: `steuerberater_name` chain starts with `z.string()` (null-rejecting) — root cause of bug 1
- `packages/shared/src/schemas/tenant-settings.ts` -- reference: `steuerberater_name` uses `z.string().nullable()` as base + `normalizeToNull` transform — correct pattern to copy
- `apps/web/app/actions/onboarding.ts` -- `completeOnboarding`: calls `onboardingSetupSchema.safeParse` server-side; receives zodResolver-transformed null; no change needed once schema is fixed
- `apps/web/components/onboarding/setup-form.tsx` -- renders the Steuerberater `<Input>` with default `""` — no change needed

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/schemas/onboarding.ts` -- Change `steuerberater_name` base from `z.string()` to `z.string().nullable()` and update the transform to handle `string | null` input (pattern: `if (v === null) return null; const cleaned = normalizeName(v); return cleaned.length === 0 ? null : cleaned;`) -- aligns server-side re-validation with zodResolver output type

**Acceptance Criteria:**
- Given user on onboarding "Dein Unternehmen" step, when Firmenname and Kontenrahmen are filled and Steuerberater is left blank, then form submits successfully with no error.
- Given `steuerberater_name: null` passed directly to `completeOnboarding`, when `onboardingSetupSchema.safeParse` runs, then `parsed.success` is `true`.

## Verification

**Commands:**
- `pnpm --filter @rechnungsai/shared test` -- expected: all tests pass (including tenant-settings steuerberater tests as reference)
- `pnpm --filter web build` -- expected: no TypeScript errors

## Spec Change Log

<!-- Append-only. Populated by step-04 during review loops. -->

## Suggested Review Order

**Schema validation fix (Bug 1)**

- `steuerberater_name` input type widened to `string | null`; null-guard added before `normalizeName`
  [`onboarding.ts:24`](../../packages/shared/src/schemas/onboarding.ts#L24)

- Null guard short-circuit prevents `normalizeName(null)` crash; empty-string path unchanged
  [`onboarding.ts:28`](../../packages/shared/src/schemas/onboarding.ts#L28)

**Side-effect binding fix**

- `value ?? ""` coerces `null` → `""` for DOM `<input>`; prevents React controlled/uncontrolled warning
  [`setup-form.tsx:208`](../../apps/web/components/onboarding/setup-form.tsx#L208)

## Design Notes

The Zod v4 pipeline chain `z.string().transform(v => null).pipe(z.string().nullable())` is technically valid but creates a type mismatch at runtime when the server action receives the already-transformed `null` from `zodResolver` and re-parses it: the leading `z.string()` rejects `null` before the transform even runs. The fix is to accept `null` at the input stage (`z.string().nullable()`) and guard in the transform — exactly what `tenant-settings.ts` already does.
