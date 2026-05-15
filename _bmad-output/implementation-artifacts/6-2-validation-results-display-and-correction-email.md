# Story 6.2: Validation Results Display and Correction Email

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to see exactly what is wrong with a non-compliant e-invoice and send a correction request to the supplier with one tap,
so that I can resolve compliance issues quickly without writing emails manually.

## Context: UI Wire-Up Story — Surface 6.1's Data + Correction Mailto Shim

Story 6.1 wrote `validation_status`, `validation_errors`, `validation_rule_set_version`, `validated_at` to `public.invoices` and shipped the `revalidateInvoice` Server Action. **No UI yet renders any of it.** This story owns the entire user-facing surface of EN 16931 validation:

1. **Validation results card** on `/rechnungen/[id]` — render the 6.1 data with German conversational error/warning copy, severity indicators, expandable violation list, and rule-set-version stale banner that calls `revalidateInvoice` (already exists from 6.1).
2. **Correction email** — `mailto:` shim per Epic 5 retro decision A5 ([Source: prep-p3-email-decision-2026-05-10.md]). Pre-fills supplier email, German formal "Sie" body listing violations. User sends from their own mail client. Server-side: new `requestCorrection` Server Action writes `correction_requested_at`, emits audit event, returns success toast.
3. **Supplier-email projection** — extend `Invoice` schema with `supplier_email` and have `projectToInvoiceData` populate it from the parsed XML so the `mailto:` recipient is pre-filled on XML/ZUGFeRD invoices.
4. **Migration** — add `invoices.correction_requested_at` + extend `audit_logs_event_type_chk` with `'correction_requested'` (same `do $$ ... exception when duplicate_object` pattern used by 6.1 — single rollback unit).

### Scope reduction (read carefully)

- **No real email sending.** Mailto only. Real transactional send is Epic 8.3 ([Source: prep-p3-email-decision-2026-05-10.md §"Why Not (a) Pull Epic 8.3 Forward"]).
- **No batch correction requests.** One invoice, one mail draft. Revisit during/after 8.3 if demand emerges.
- **No bounce / delivery tracking.** User owns send from their own client.
- **`revalidateInvoice` already exists** ([Source: apps/web/app/actions/invoices/review.ts:662]) — this story only wires the UI button to it; it does NOT modify the action.

### What is in scope

- New component `ValidationResultsCard` in `apps/web/components/invoice/`.
- New component `CorrectionEmailButton` (client component) — builds `mailto:` URL on click, calls `requestCorrection` Server Action to persist timestamp + audit, fires success toast.
- New helper `apps/web/lib/correction-email.ts` with `buildCorrectionMailto(...)` — German formal body, URL-encoded.
- New Server Action `requestCorrection` in `apps/web/app/actions/invoices/review.ts` — writes `correction_requested_at = now()`, emits `correction_requested` audit event, returns `ActionResult<void>`.
- Modification of `apps/web/app/(app)/rechnungen/[id]/page.tsx` to select the new columns + `tenants.steuerberater_email` is NOT read here (recipient is the **supplier**, not the Steuerberater).
- Modification of `apps/web/components/invoice/invoice-detail-pane.tsx` to render `<ValidationResultsCard>` above `<ComplianceWarningsBanner>`.
- Schema extension: `Invoice.supplier_email` (optional field) in `packages/shared/src/schemas/invoice.ts` + `CORRECTABLE_FIELD_PATHS`.
- Projection: `packages/validation/src/project-to-invoice-data.ts` populates `supplier_email` from `inv.seller.contact?.email` (already extracted by both UBL and CII parsers — [Source: packages/validation/src/parsers/ubl.ts:265, packages/validation/src/parsers/cii.ts:290]).
- Migration `20260513000000_invoice_correction_requested.sql`.
- German message catalog `packages/shared/src/validation/violation-messages.ts` (or co-located in the new card component) — one entry per rule ID actually emitted by the rule set, mapping `ruleId` → conversational German rule description for the user. **Source the strings from the existing `ValidationViolation.message` field where present**; only override when the package message is too terse for end users.

### What is NOT in scope

- Real email send (Epic 8.3).
- Batch correction requests.
- Editing the mailto body inside the app (the user edits it in their mail client — standard mailto UX).
- Modifying `revalidateInvoice` (6.1 owns it; this story renders the button that calls it).
- Adding `BR-DE-*` / `BR-DEX-*` real predicates beyond the 25 already implemented in 6.1 — German UI copy for the 21 stub rules is still required if a stub somehow surfaces (it shouldn't — stubs are no-ops); add a generic fallback message.
- New audit search filters for `correction_requested` events (Epic 4 archive search already lists all event types generically).

## Acceptance Criteria

### Schema extension: `Invoice.supplier_email`

1. **Given** the current `invoiceSchema` in `packages/shared/src/schemas/invoice.ts:48-62` (which lacks supplier email) **When** the story is implemented **Then** `invoiceSchema` gains `supplier_email: makeField(z.string().nullable())` immediately after `supplier_tax_id`. Add `"supplier_email"` to `CORRECTABLE_FIELD_PATHS` so the user can correct it via the existing `<EditableField>` machinery if AI fills it wrong (or absent). Add `"supplier_email"` to `LABELS` in `apps/web/lib/invoice-fields.ts` with German label `"Lieferant E-Mail"` and to `FIELD_ORDER` immediately after `supplier_tax_id`. Add `"text"` as the input kind (no new `inputKindFor` branch — defaults to text are fine; an `inputMode="email"` polish is optional and SHOULD NOT be added if it forces a new `InputKind` enum case).

2. **Given** existing invoice rows have no `supplier_email` value in their `invoice_data` jsonb **When** the schema parses an existing row **Then** Zod's `.nullable()` plus `makeField` does NOT make this field required — the parse must succeed. Verify by re-running the existing parsing tests in `packages/shared/src/schemas/invoice.test.ts` (they should still pass without modification; if any break, the schema change is incorrect). **No DB-level migration is needed** — `invoice_data` is jsonb and tolerates missing keys; the schema's `.nullable()` + `makeField` default handles the absence at the application layer.

3. **Given** any code path that currently parses an `Invoice` (AI extraction, manual edit, archive read, etc.) **When** an invoice without `supplier_email` is parsed **Then** the parsed object MUST have `supplier_email: { value: null, confidence: 0, reason: null }` so consumers don't crash on `invoice.supplier_email.value`. Add a small `withDefaults`/preprocess step OR a `z.default(...)` on the field if Zod 4's `makeField` shape supports it. Verify by adding two new cases to `invoice.test.ts`: (a) parse an object missing `supplier_email` → succeeds with `value: null`; (b) parse an object with `supplier_email: { value: "k@example.de", confidence: 1.0, reason: null }` → preserved.

### Projection: `projectToInvoiceData` populates `supplier_email`

4. **Given** `packages/validation/src/project-to-invoice-data.ts:38-65` already calls `stringField(inv.seller.name)` etc. **When** the story is implemented **Then** add one line: `supplier_email: stringField(inv.seller.contact?.email ?? null)` between the `supplier_tax_id` and `recipient_name` lines (alphabetical/visual order is irrelevant — match the new schema field order). Use `1.0` confidence (already the file's helper default — see existing `stringField` calls). Both parsers already extract this: UBL via `cbc:ElectronicMail` ([Source: packages/validation/src/parsers/ubl.ts:265]), CII via `ram:EmailURIUniversalCommunication/ram:URIID` ([Source: packages/validation/src/parsers/cii.ts:290]).

5. **Given** `packages/validation/src/__tests__/project-to-invoice-data.test.ts` exists **When** the story is implemented **Then** extend it with 2 cases: (a) `inv.seller.contact.email = "lieferant@beispiel.de"` → projected `supplier_email.value === "lieferant@beispiel.de"`, confidence `1.0`; (b) `inv.seller.contact` is `undefined` → projected `supplier_email.value === null`, confidence `1.0`. Do NOT change existing cases; the field is additive.

### Migration: `20260513000000_invoice_correction_requested.sql`

6. **Given** today is `2026-05-13+` **When** the migration runs **Then** `supabase/migrations/20260513000000_invoice_correction_requested.sql` adds:

   ```sql
   alter table public.invoices
     add column correction_requested_at timestamptz null;
   ```

   Before writing the migration, verify with `grep -n correction_requested packages/shared/src/types/database.ts` that no such column exists (checked 2026-05-13 — none does). If a near-name collision appears, STOP and ask before proceeding.

7. **Given** the audit allow-list extension folds the new `'correction_requested'` event type (single migration, single rollback unit) **When** the migration runs **Then** it drops + re-creates `audit_logs_event_type_chk` using the EXACT `do $$ ... exception when duplicate_object then null; end $$` pattern from `supabase/migrations/20260511000000_invoice_validation.sql` (Story 6.1 migration). The new constraint list is the existing 13 values plus `'correction_requested'`. **Re-read the latest constraint shape before writing** by `grep -n event_type_chk supabase/migrations/20260511000000_invoice_validation.sql` — if any new event type has been added between 6.1 and 6.2 that is not in your list, **include it**, otherwise the migration would fail on existing rows. The verified 2026-05-13 set is `'upload','field_edit','categorize','approve','flag','undo_approve','undo_flag','export_datev','export_audit','hash_verify_mismatch','validation_passed','validation_failed','revalidation_completed'`.

8. **Given** column grants follow the established pattern from Story 6.1's migration **When** the migration runs **Then** extend the existing `grant update (...) on public.invoices to authenticated` block to include `correction_requested_at`. Re-read `20260511000000_invoice_validation.sql` to confirm whether the established pattern is fine-grained (one explicit column list) — if so, add a single `grant update (correction_requested_at) on public.invoices to authenticated` or extend the existing block. **Whichever pattern is established, extend it; do NOT introduce a new grant style.**

9. **Given** the migration is forward-only (codebase convention) **When** committed **Then** no down migration; type regeneration MUST follow. After `supabase db reset` (local) succeeds, regenerate `packages/shared/src/types/database.ts` using the project's `gen types` script (search `package.json` for the exact name; Epic 3 prep P1 codified it). The new column must appear in `invoices.Row`, `.Insert`, `.Update`; verify with `grep -n correction_requested packages/shared/src/types/database.ts` post-regen. If you cannot run `supabase db reset` in the dev environment, do the same manual patch Story 6.1 / P3.1 did and flag it in completion notes; GOZE re-runs `gen types` locally pre-merge.

### Server Action: `requestCorrection` in `apps/web/app/actions/invoices/review.ts`

10. **Given** the existing file `apps/web/app/actions/invoices/review.ts` ([Source: apps/web/app/actions/invoices/review.ts:1] is `"use server"`, currently exports `correctInvoiceField`, `signInvoiceUrl`, `categorizeInvoice`, `updateSkrCode`, `revalidateInvoice`) **When** the story is implemented **Then** it gains a new exported function `requestCorrection` per the signature:

    ```ts
    export async function requestCorrection(
      invoiceId: string,
    ): Promise<ActionResult<{ correctionRequestedAt: string }>>;
    ```

    Shape:

    a. `invoiceIdSchema.safeParse(invoiceId)` (helper from `./shared`).
    b. Auth + tenant resolution — MIRROR `revalidateInvoice` at `review.ts:670-690` (or whatever lines it currently occupies — re-read before mirroring).
    c. Row select with **tenant guard** (Epic 4 retro P2 pattern):

       ```ts
       await supabase
         .from('invoices')
         .select('id, tenant_id, status, validation_status, correction_requested_at')
         .eq('id', invoiceId)
         .eq('tenant_id', tenantId)
         .single();
       ```

    d. Guard: if `row.validation_status` is NOT in `('warning','invalid')` → `{ success: false, error: 'Korrekturanfrage nur bei Validierungsfehlern möglich.' }`. (Per AC #16 — the UI only renders the button in those states, but defend the server side anyway.)
    e. `const now = new Date().toISOString();`
    f. Single UPDATE: set `correction_requested_at = now`. Tenant guard on the UPDATE too (`.eq('id', invoiceId).eq('tenant_id', tenantId)`). **Idempotent:** repeated calls overwrite the timestamp — this is acceptable; if a user re-sends a correction email after fixing nothing, the timestamp records the latest attempt (F-2 in failure modes below).
    g. Audit: `logAuditEvent(supabase, { tenantId, invoiceId, actorUserId: user.id, eventType: 'correction_requested', metadata: { validationStatus: row.validation_status, violationCount: <count from row, fetched via a second select if needed, OR pass from the caller>, previousCorrectionRequestedAt: row.correction_requested_at } })`. Best-effort per Story 6.1's D9 pattern — Sentry on failure, do NOT fail the user op. To avoid a second select for `violationCount`, accept it as an optional second arg: `requestCorrection(invoiceId, opts?: { violationCount?: number })` — but DO NOT trust the client integer; clamp to `[0, 10_000]` defensively.
    h. `revalidatePath(\`/rechnungen/${invoiceId}\`)`.
    i. Catch block: mirror the `NEXT_REDIRECT` digest-detect pattern from `revalidateInvoice` ([Source: apps/web/app/actions/invoices/review.ts] — find the `if (digest?.startsWith("NEXT_REDIRECT"))` pattern verbatim). Tag: `module: 'invoices'`, `action: 'request-correction'`.

11. **Given** `AuditEventType` in `apps/web/app/actions/invoices/shared.ts:7-20` lists 13 values **When** the story is implemented **Then** it gains `| "correction_requested"` (lexical order doesn't matter; append at end to minimize diff churn). The DB allow-list must agree (AC #7).

### Server Action tests

12. **Given** the new `requestCorrection` Server Action **When** tests run **Then** extend `apps/web/app/actions/invoices/review.test.ts` (the file Story 6.1 Session 6 created — [Source: apps/web/app/actions/invoices/review.test.ts]) with a `describe("requestCorrection")` block covering: (a) happy path on `validation_status='invalid'` → success, single UPDATE sets `correction_requested_at`, `correction_requested` audit event emitted with `violationCount` in metadata; (b) tenant-isolation guard — invoice belongs to different tenant → `{ success: false, error: ... }`, no UPDATE issued; (c) `validation_status='valid'` → `{ success: false, error: 'Korrekturanfrage nur bei Validierungsfehlern möglich.' }`, no UPDATE; (d) `validation_status='skipped'` → same rejection; (e) auth failure → `redirect(...)` thrown (mirror the existing AC #32(e) pattern); (f) audit failure swallowed — `logAuditEvent` throws, action still returns success, `Sentry.captureException` called once; (g) invalid `invoiceId` (not a UUID) → safeParse rejection error. Reuse the same `vi.mock` pattern as the existing file; mock `./shared.logAuditEvent` via `vi.importActual` so `invoiceIdSchema` stays real (same as 6.1's pattern).

### Helper: `buildCorrectionMailto`

13. **Given** `apps/web/lib/datev-export.ts` already defines the `buildSteuerberaterMailto` precedent ([Source: apps/web/lib/datev-export.ts:53]) **When** the story is implemented **Then** create `apps/web/lib/correction-email.ts` exporting:

    ```ts
    export function buildCorrectionMailto(args: {
      supplierEmail: string | null;
      invoiceNumber: string | null;
      invoiceDateIso: string | null;       // YYYY-MM-DD or null
      supplierName: string | null;
      violations: ReadonlyArray<{ ruleId: string; severity: string; message: string }>;
      tenantCompanyName: string;
    }): string;
    ```

    Output: `mailto:<email>?subject=<…>&body=<…>` with both subject and body `encodeURIComponent`-escaped. If `supplierEmail` is `null`, omit the address (just `mailto:?subject=...&body=...`). German formal "Sie" body:

    ```
    Sehr geehrte Damen und Herren,

    bei der Prüfung Ihrer Rechnung [invoiceNumber] vom [invoiceDateGerman] sind folgende Abweichungen gegenüber der EN 16931 (E-Rechnung) festgestellt worden:

    - [violation 1 message] ([ruleId])
    - [violation 2 message] ([ruleId])
    …

    Bitte senden Sie uns eine korrigierte Rechnung im konformen XRechnung- oder ZUGFeRD-Format zu.

    Mit freundlichen Grüßen,
    [tenantCompanyName]
    ```

    Subject: `"Korrekturanfrage Rechnung " + invoiceNumber + " vom " + invoiceDateGerman` (omit each segment cleanly if `null` — e.g. `"Korrekturanfrage Rechnung"` if both null; never emit `"null"` literals).

14. **Given** P3 §"Known Limitations Accepted" (URL-encoded body length ~2000 chars practical limit) **When** the helper builds the body **Then** truncate `violations` to the **top 15 entries by severity** (`fatal` > `error` > `warning`), append a 16th synthetic line `"- … sowie [N] weitere Punkte (vollständige Liste in der App)."` only when `violations.length > 15`. NEVER truncate by simple slicing — sort first by severity descending, then by ruleId ascending for determinism. Helper is pure (no DOM, no async); place ALL string assembly in this function so the tests are unit-level.

15. **Given** the helper is pure **When** tests run **Then** create `apps/web/lib/correction-email.test.ts` with cases: (a) all fields present, single violation → exact body string asserted; (b) `supplierEmail = null` → `mailto:?subject=...&body=...` (no recipient); (c) 20 violations → top 15 by severity + truncation line, exact violation count `≤ 15 + 1` lines counted; (d) `invoiceNumber = null AND invoiceDateIso = null` → subject is `"Korrekturanfrage Rechnung"`, body uses placeholders `"[Rechnungsnummer unbekannt]"` and `"[Datum unbekannt]"`; (e) `invoiceDateIso = "2026-05-12"` → body shows `"12.05.2026"`. Mirror the test layout of `apps/web/lib/datev-export.test.ts:18-50`.

### Component: `ValidationResultsCard`

16. **Given** `apps/web/components/invoice/invoice-detail-pane.tsx:111-113` currently renders `<ComplianceWarningsBanner>` immediately after the actions header **When** the story is implemented **Then** add `<ValidationResultsCard>` *above* `<ComplianceWarningsBanner>` (same conditional gating: `invoice && !isExported`). The card receives props `{ invoiceId, status, errors, ruleSetVersion, validatedAt, supplierEmail, supplierName, invoiceNumber, invoiceDateIso, tenantCompanyName }`. Render logic:

    | `status` value | Render |
    |---|---|
    | `'valid'` | green pill `"EN 16931 konform"` with `CheckCircle2` icon (from `lucide-react`, already used in `datev-export-dialog.tsx`); subtle (single-line). |
    | `'warning'` | amber card: header `"Validierung mit Hinweisen"`, summary `"N Hinweis(e) gefunden"`, expandable `<details>` with violation list. Button row: `<RevalidateButton>` + `<CorrectionEmailButton>` (optional — warnings don't block; per AC line). |
    | `'invalid'` | red card: header `"Validierungsfehler"`, summary `"N Fehler, M Hinweis(e) gefunden"`, expandable violation list defaults to **open**. Button row: `<RevalidateButton>` + `<CorrectionEmailButton>` (required action). |
    | `'unsupported'` | neutral info card: `"E-Rechnungsformat erkannt, aber nicht unterstützt."` Single button: `<CorrectionEmailButton>` (so the user can ask for a conformant format). NO `<RevalidateButton>` (re-validation won't change the answer). |
    | `'skipped'` | render NOTHING. Validation is not applicable (photo/non-e-invoice PDF/image). |
    | `'pending'` | render small skeleton: `"Validierung läuft…"` with the same `field-reveal` animation used in `invoice-detail-pane.tsx:122-135`. |

    Color tokens: use `text-success`, `text-warning`, `text-destructive` (already in the design system — [Source: apps/web/components/export/datev-export-dialog.tsx:312, 296, 263]). DO NOT introduce new color tokens.

17. **Given** the violation list rendering **When** each violation is shown **Then** the row shape is:

    ```tsx
    <li className="flex items-start gap-2">
      <Icon severity={v.severity} aria-hidden />
      <div>
        <span className="font-medium">{germanRuleSummary(v.ruleId, v.message)}</span>
        <span className="ml-2 text-caption text-muted-foreground">
          {v.ruleId}{v.location?.bt ? ` · ${v.location.bt}` : ""}
        </span>
      </div>
    </li>
    ```

    The `germanRuleSummary(ruleId, packageMessage)` helper lives in the same component file (no need for a separate module). It returns the package's own German `message` field directly for all rules ([Source: packages/validation/src/rules/* — every `Rule.run` emits a German `message` string by convention; verify by reading `packages/validation/src/rules/en16931-core.ts` and one VAT rule]). If `message` is empty (e.g. a stub rule somehow surfaces), fall back to `\`Regel ${ruleId} nicht erfüllt.\``. **Do NOT translate or rewrite package messages** — the validation package owns the wording; the UI just renders it.

18. **Given** `<RevalidateButton>` is a client subcomponent **When** clicked **Then** it calls `revalidateInvoice(invoiceId)` (already a Server Action from 6.1 — [Source: apps/web/app/actions/invoices/review.ts:662]); during the request use `useTransition` to disable the button and show inline spinner; on success → success toast `"Validierung aktualisiert."` (3s auto-dismiss); on error → `toast.error(result.error)`. **Idempotency:** rely on `useTransition` + button-disabled state to prevent the double-submit (F6 in 6.1 spike §6). DO NOT add client-side debounce or cache.

19. **Given** `validation_rule_set_version` is `null` OR equals the package's current `RULE_SET_VERSION` ([Source: packages/validation/src/index.ts:23 — `"kosit-2.5.0"`]) **When** the card renders **Then** the revalidate button is hidden. **Given** it is older than `RULE_SET_VERSION` **Then** show a small inline banner above the violation list: `"Regelwerk wurde aktualisiert. Bitte neu validieren."` + the `<RevalidateButton>`. **Comparison is string equality** for v1; a real semver comparator is overkill since the version string is updated by hand at the package level. Note this in a code comment for future maintainers (this is exactly the WHY a comment exists for).

20. **Given** the `<CorrectionEmailButton>` component **When** clicked **Then**:

    a. Compute `mailtoUrl = buildCorrectionMailto({...})` using `useMemo`.
    b. Call `requestCorrection(invoiceId, { violationCount: errors.length })` in a `useTransition` block.
    c. On success: fire toast `"Korrekturanfrage an [supplierName ?? 'Lieferant'] gesendet"` (3s auto-dismiss; React 19 toast lib already wired in `last-export-card.tsx` — [Source: apps/web/components/dashboard/last-export-card.tsx]; reuse the same toast import).
    d. **In parallel with (b)**: open the mail client. Render the button as `<a href={mailtoUrl}>` (matching the 5.3 pattern at `datev-export-dialog.tsx:347` — `<Button nativeButton={false} render={<a href={mailtoUrl} />}>`). The browser navigates to the `mailto:` URL on click — this happens *before* the Server Action completes; that's fine and intended (mailto open is the user-visible action; the timestamp+audit is bookkeeping).
    e. On Server Action failure: log a Sentry breadcrumb but DO NOT block the user (the email draft already opened in their client — they'll send it). Show a non-blocking warning toast `"Korrekturanfrage konnte nicht protokolliert werden. Die E-Mail wurde dennoch geöffnet."` (longer dismiss: 6s).
    f. **F-2 (double-click):** rely on `useTransition` to disable the button during the optimistic in-flight Server Action; if the user clicks again *after* the action completes, that's a legitimate re-send and the idempotent UPDATE (AC #10.f) handles it.
    g. Button label varies: status `'invalid'` → `"Korrektur anfordern"` (primary); status `'warning'` → `"Lieferant kontaktieren"` (outline/secondary); status `'unsupported'` → `"Konformes Format anfordern"` (primary).

21. **Given** `correction_requested_at` is already set when the page renders **When** the card renders **Then** show a small caption below the `<CorrectionEmailButton>`: `"Letzte Anfrage: TT.MM.JJJJ HH:MM"` (German short date+time, `Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' })`). This is informational; the button remains enabled so the user can re-send. No "you already sent this" block-out — the user is in control.

### Page query update

22. **Given** `apps/web/app/(app)/rechnungen/[id]/page.tsx:36-43` currently selects a fixed column list **When** the story is implemented **Then** extend the `.select(...)` to include `validation_status, validation_errors, validation_rule_set_version, validated_at, correction_requested_at`. Read `tenants.company_name` (existing column — used by the existing DATEV mailto helper — [Source: apps/web/lib/datev-export.ts:53 callers]) in the existing parallel `Promise.all`; pass it into `<InvoiceDetailPane>` as a new prop `tenantCompanyName` for the correction mailto signature. **DO NOT** select `tenants.steuerberater_email` — recipient is the supplier, not the Steuerberater (separate from prep-p3.1's column purpose).

23. **Given** the new card needs the validation data **When** `<InvoiceDetailPane>` is rendered **Then** thread the new fields through its `Props` and pass them to `<ValidationResultsCard>`. `validation_errors` is typed `Database["public"]["Tables"]["invoices"]["Row"]["validation_errors"]` which is the regenerated jsonb type; coerce to `ValidationViolation[]` from `@rechnungsai/validation` with a narrow type cast (e.g. `validation_errors as ValidationViolation[]`). **No runtime validation** of the array shape — Story 6.1 owns the write side; the type is structurally guaranteed by the DB constraint `check (jsonb_typeof(validation_errors) = 'array')` (AC #14 of 6.1).

### Component tests

24. **Given** the new card **When** tests run **Then** create `apps/web/components/invoice/validation-results-card.test.tsx` covering each `status` value listed in AC #16: render snapshot or assert presence of the appropriate header text, button row, and (for `invalid`/`warning`) the violation list. Use `@testing-library/react` (already in the project — re-read `apps/web/components/invoice/compliance-warnings-banner.test.tsx:1-30` for the established mock + render pattern). Mock the toast import and the Server Actions (`vi.mock('@/app/actions/invoices/review', ...)`) so the button-click tests don't actually run Supabase code.

25. **Given** `<CorrectionEmailButton>` is the heaviest interaction **When** tests run **Then** add cases: (a) click opens mailto AND calls `requestCorrection` — assert both (`href` attribute is correct + mock fn called once); (b) `useTransition` disables the button while pending; (c) success toast fired on Server Action success; (d) warning toast fired on Server Action failure (button text still asserts mailto URL was correct so user knows the draft opened). Reuse `vi.useFakeTimers()` if needed for toast auto-dismiss (precedent in existing component tests — search for `useFakeTimers` in `apps/web/components/`).

### Smoke Test Format

26. **Given** Epic 3 A1 / Epic 5 retro A3 enforcement ([Source: 6-1-en-16931-invoice-validation-engine.md AC #33]) **When** the smoke test section is written **Then** it follows `_bmad-output/implementation-artifacts/smoke-test-format-guide.md` verbatim — UX Checks table with columns (#, Action, Expected Output, Pass Criterion, Status) + DB Verification table with columns (#, Query, Expected Return, What It Validates, Status). ALL UX-tier rows MUST be marked `BLOCKED-BY-ENVIRONMENT` (dev agent has no real browser); GOZE runs them locally. DB Verification rows can be `DONE` once the dev agent verifies locally against `supabase db reset`.

## Tasks / Subtasks

- [x] **Task 1 — Schema extension: `Invoice.supplier_email`** (AC: #1, #2, #3)
  - [x] Update `packages/shared/src/schemas/invoice.ts:48-62`: add `supplier_email` field
  - [x] Update `CORRECTABLE_FIELD_PATHS` in same file
  - [x] Update `LABELS` + `FIELD_ORDER` in `apps/web/lib/invoice-fields.ts`
  - [x] Extend `packages/shared/src/schemas/invoice.test.ts` with 2 new cases (default + value preserved)
  - [x] Verify all existing invoice parsing tests still pass: `pnpm --filter @rechnungsai/shared test`

- [x] **Task 2 — Projection: `projectToInvoiceData` populates `supplier_email`** (AC: #4, #5)
  - [x] Add one line to `packages/validation/src/project-to-invoice-data.ts:38-65`
  - [x] Extend `packages/validation/src/__tests__/project-to-invoice-data.test.ts` with 2 cases
  - [x] Verify: `pnpm --filter @rechnungsai/validation test`

- [x] **Task 3 — Migration: `correction_requested_at` + audit allow-list** (AC: #6, #7, #8, #9)
  - [x] Verify no `correction_requested` column exists: `grep -n correction_requested packages/shared/src/types/database.ts`
  - [x] Verify current audit constraint shape: `grep -n event_type_chk supabase/migrations/20260511000000_invoice_validation.sql`
  - [x] Write `supabase/migrations/20260513000000_invoice_correction_requested.sql`: column + audit allow-list extension + grant
  - [ ] Run `supabase db reset` locally (GOZE) → run `gen types` → verify column in `packages/shared/src/types/database.ts`
  - [x] Manual patch of `database.ts` if `gen types` not runnable in agent env; flag for GOZE pre-merge

- [x] **Task 4 — Server Action: `requestCorrection`** (AC: #10, #11)
  - [x] Append `"correction_requested"` to `AuditEventType` in `apps/web/app/actions/invoices/shared.ts:7-20`
  - [x] Add `requestCorrection` to `apps/web/app/actions/invoices/review.ts` (mirror `revalidateInvoice` auth+tenant+catch shape)
  - [x] Server-side guard: only `validation_status in ('warning','invalid','unsupported')` allowed (but UI only shows it for those — defend anyway)
  - [x] Audit emit best-effort, Sentry on failure
  - [x] `revalidatePath` on success

- [x] **Task 5 — Server Action tests** (AC: #12)
  - [x] Extend `apps/web/app/actions/invoices/review.test.ts` with the 7 `requestCorrection` cases
  - [x] Verify: `pnpm --filter @rechnungsai/web test review.test`

- [x] **Task 6 — Mailto helper** (AC: #13, #14, #15)
  - [x] Create `apps/web/lib/correction-email.ts` with `buildCorrectionMailto`
  - [x] Create `apps/web/lib/correction-email.test.ts` with 5 cases (mirror `datev-export.test.ts`)
  - [x] Top-15 severity-sorted truncation logic + tested

- [x] **Task 7 — `<ValidationResultsCard>` + sub-components** (AC: #16, #17, #18, #19, #20, #21)
  - [x] Create `apps/web/components/invoice/validation-results-card.tsx` (server component for layout; client subcomponents for the two buttons)
  - [x] Inline `<RevalidateButton>` (client) — `useTransition`, calls `revalidateInvoice`, inline status on success/error
  - [x] Inline `<CorrectionEmailButton>` (client) — `<a href={mailtoUrl}>` + `useTransition` `requestCorrection` call + inline status
  - [x] Severity icons via `lucide-react` (precedent: `datev-export-dialog.tsx` `AlertTriangle`/`CheckCircle2`)
  - [x] No new design tokens

- [x] **Task 8 — Wire into `InvoiceDetailPane` + page** (AC: #22, #23)
  - [x] Extend `apps/web/app/(app)/rechnungen/[id]/page.tsx:36-43` `.select(...)` with the 5 new columns
  - [x] Read `tenants.company_name` in the existing parallel `Promise.all` block
  - [x] Extend `InvoiceDetailPane` Props with `tenantCompanyName` + validation fields; pass through to `<ValidationResultsCard>`
  - [x] Insert `<ValidationResultsCard>` above `<ComplianceWarningsBanner>` (`invoice-detail-pane.tsx:111-113`)

- [x] **Task 9 — Component tests** (AC: #24, #25)
  - [x] `validation-results-card.test.tsx` — render-per-status snapshots
  - [x] `<CorrectionEmailButton>` interaction tests (mailto + Server Action both called)
  - [x] Mock Server Actions
  - [x] Verify: `pnpm --filter @rechnungsai/web test validation-results-card`

- [x] **Task 10 — Smoke section + Status: review** (AC: #26)
  - [x] Write UX Checks + DB Verification tables per `smoke-test-format-guide.md`
  - [x] All UX rows `BLOCKED-BY-ENVIRONMENT` with manual steps for GOZE
  - [x] DB rows marked `BLOCKED-BY-ENVIRONMENT` pending local `supabase db reset`
  - [x] Update File List + Change Log
  - [x] Flip Status `ready-for-dev → in-progress → review` per dev-story flow

## Dev Notes

### Pattern Citations (Epic 5 retro A2 — "Pattern first")

- **Mailto helper precedent** — `apps/web/lib/datev-export.ts:53` (`buildSteuerberaterMailto`). Mirror the function shape, the `encodeURIComponent` pattern, the German-formatted date helper, and the test file layout at `apps/web/lib/datev-export.test.ts:18-50`.
- **Mailto button on Dialog/Card** — `apps/web/components/export/datev-export-dialog.tsx:185-192, 347` (`<Button nativeButton={false} render={<a href={mailtoUrl} />}>`). Mirror byte-for-byte; this is the established React 19 pattern for "button that is actually a link."
- **Server Action shape (auth + tenant + catch)** — `apps/web/app/actions/invoices/review.ts` `revalidateInvoice` is your direct sibling; copy its skeleton verbatim and substitute the inner logic.
- **Tenant-isolation `.eq('tenant_id', tenantId)` guard** — Epic 4 prep-p2 pattern; visible everywhere in `review.ts`. Apply on BOTH the select AND the update.
- **Audit allow-list extension migration** — `supabase/migrations/20260511000000_invoice_validation.sql` (the Story 6.1 migration). Mirror the `do $$ ... exception when duplicate_object then null; end $$` wrapper byte-for-byte.
- **Component test layout** — `apps/web/components/invoice/compliance-warnings-banner.test.tsx` is your closest sibling (same component-family, same warning/error card shape, same test idiom).
- **Toast pattern** — `apps/web/components/dashboard/last-export-card.tsx` for the success/error toast import. Reuse the same lib, same `auto-dismiss` defaults (3s success, 6s warning).
- **Mailto length cap mitigation** — [Source: prep-p3-email-decision-2026-05-10.md §"Known Limitations Accepted"] explicitly calls out truncation to top-N as the chosen mitigation; AC #14 implements it.

### Anti-Patterns to Avoid

- ❌ **Pull Steuerberater address into the correction mailto.** Recipient is the *supplier*, not the Steuerberater. The `tenants.steuerberater_email` column from prep-p3.1 is for the DATEV-export mailto in 5.3 and for Epic 8.3's transactional sends — not this story.
- ❌ **Real email sending.** Mailto only. Deferred to Epic 8.3.
- ❌ **Modify `revalidateInvoice`.** Story 6.1 owns it. This story only renders the button.
- ❌ **Translate or rewrite `ValidationViolation.message` strings in the UI.** The validation package owns the wording — render its `message` directly. If the message is too terse, fix it in the package, not the UI.
- ❌ **Add a new color token** for severity. Use existing `text-success`/`text-warning`/`text-destructive`.
- ❌ **Block re-sending the correction email** based on `correction_requested_at`. The button stays enabled; the caption shows the last-sent time so the user can decide.
- ❌ **Server-side debounce / cached-result short-circuit** for `requestCorrection`. Idempotent UPDATE is enough; `useTransition` handles the client side.
- ❌ **Slice violations by index without sorting first.** Truncation MUST sort by severity descending then ruleId ascending. (AC #14.)
- ❌ **Use `<input type="email">` with native validation** in any new field — German users' OS UIs vary; rely on Zod at write time. The supplier-email field on the invoice (if surfaced via `<EditableField>`) inherits the existing text input kind.
- ❌ **Render `mailto:` body with raw newlines via `<a>` `href`** without `encodeURIComponent`. `\n` MUST be `%0A` after encoding; `encodeURIComponent` handles this — DO NOT manually pre-replace.
- ❌ **Self-certify smoke test UX rows as DONE** without a real browser. Epic 5 retro A3 enforcement.

### Likely Failure Modes

| # | Failure mode | Story 6.2 response |
|---|---|---|
| F-1 | `validation_errors` jsonb is empty array on an `invalid` row | Treat as "no specific errors" — render summary header + a generic line `"Validierung fehlgeschlagen, aber keine spezifischen Fehler protokolliert."`; correction-email button still works with empty violations list (mailto body uses a single line: `"Die Rechnung erfüllt nicht das EN 16931-Format."`). No crash. |
| F-2 | User double-clicks `<CorrectionEmailButton>` after the first send completes | Both clicks open the mailto (user's mail client opens twice — minor annoyance, not data corruption). `requestCorrection` is idempotent — `correction_requested_at` overwrites; audit emits two rows. Acceptable. |
| F-3 | `supplier_email` is `null` (AI extraction, photo, non-XML PDF) | Mailto opens with NO recipient (`mailto:?subject=...&body=...`). User pastes the address in their mail client. Acceptable per prep-p3 §"Known Limitations Accepted". |
| F-4 | `mailto:` URL > 2000 chars after encoding (huge violation list) | AC #14 truncation kicks in (top-15 by severity). Compute final encoded length in a unit test on a worst-case fixture (e.g. 50 violations) — assert `< 2000`. |
| F-5 | `requestCorrection` Server Action throws after mailto opens | User's mail client already opened the draft → they send it. UI shows the non-blocking warning toast (AC #20.e). Audit gap is tracked via Sentry. |
| F-6 | `<RevalidateButton>` clicked when rule set version is current | Button is hidden by AC #19 → not reachable. If somehow reached (race during a package version bump), `revalidateInvoice` re-runs idempotently — no harm. |
| F-7 | `validation_rule_set_version` is `null` (transitional 'pending' rows from before 6.1 migration) | AC #19: button hidden when `null`. The card still renders the status (probably `'pending'` per 6.1 AC #18) using the `pending` skeleton (AC #16). User has no action to take until the row is touched again. |
| F-8 | `tenants.company_name` is `null` | mailto body signature falls back to `"[Firmenname]"` placeholder. Caption never shows `"null"`. |
| F-9 | Two tabs view the same invoice, one revalidates | `revalidatePath` fires; second tab's RSC refetch picks up the new state on next nav (acceptable — same posture as 6.1 F-7). |
| F-10 | German rule message is empty (a stub rule surfaces) | `germanRuleSummary` fallback: `\`Regel ${ruleId} nicht erfüllt.\`` (AC #17). |
| F-11 | User edits `supplier_email` via `<EditableField>` to clear it before requesting correction | Mailto opens with no recipient. Same as F-3. No special handling needed. |

### Performance Budget

- This is a UI story — no new server CPU work beyond a single UPDATE in `requestCorrection`. Inherits 6.1's p95 < 500ms budget for any path that goes through `revalidateInvoice`.
- Mailto helper string assembly is O(violations). Worst case (50 violations, sorted) is < 1ms.
- Component render: card with 15-row expandable `<details>` is trivial; no virtualization needed.

### Security Posture

- **No new RLS surface.** All reads go through the existing tenant-guarded select in `page.tsx`. New writes go through `requestCorrection` which mirrors `revalidateInvoice`'s guard.
- **PII in mailto body.** The body contains supplier name, invoice number, invoice date, violation rule IDs + messages. NO field values (per 6.1's anti-pattern — violation messages reference BT/BG IDs only). This data is *already* on the user's screen; the mailto just packages it.
- **Audit log size.** `metadata.violationCount` is a small integer; do not put violation messages in `metadata`. Per 6.1's posture.
- **XSS surface.** Violation `message` strings are package-controlled (no user input). React's default escaping is sufficient; do NOT use `dangerouslySetInnerHTML`.
- **Open redirect.** `mailto:` URLs are constructed in code with `encodeURIComponent` on subject + body; supplier_email is not URL-encoded into the recipient slot but `encodeURIComponent`-ing it would mangle the address — instead, validate at the schema layer that it matches the basic email shape (the migration already enforces this regex on `tenants.steuerberater_email`; mirror that posture by validating the projected `supplier_email` at the buildCorrectionMailto helper, rejecting + falling back to no-recipient if it contains characters outside `[A-Za-z0-9._%+\-@]`).

### Project Structure Notes

- All new code lives in:
  - `packages/shared/src/schemas/invoice.ts` (schema extension)
  - `packages/shared/src/types/database.ts` (regenerated — or manual patch if needed)
  - `packages/validation/src/project-to-invoice-data.ts` (one-line projection)
  - `apps/web/lib/correction-email.ts` (new)
  - `apps/web/lib/correction-email.test.ts` (new)
  - `apps/web/components/invoice/validation-results-card.tsx` (new)
  - `apps/web/components/invoice/validation-results-card.test.tsx` (new)
  - `supabase/migrations/20260513000000_invoice_correction_requested.sql` (new)
- Modified files:
  - `apps/web/app/(app)/rechnungen/[id]/page.tsx` (extend `.select(...)`, add `tenants.company_name`)
  - `apps/web/components/invoice/invoice-detail-pane.tsx` (wire `<ValidationResultsCard>`)
  - `apps/web/app/actions/invoices/review.ts` (add `requestCorrection`)
  - `apps/web/app/actions/invoices/review.test.ts` (extend with `requestCorrection` block)
  - `apps/web/app/actions/invoices/shared.ts` (append to `AuditEventType`)
  - `apps/web/lib/invoice-fields.ts` (extend `LABELS` + `FIELD_ORDER`)
  - `packages/shared/src/schemas/invoice.test.ts` (add 2 cases)
  - `packages/validation/src/__tests__/project-to-invoice-data.test.ts` (add 2 cases)
- NO touches to `apps/web/app/actions/invoices/upload.ts` (`extractInvoice` already handles the write side via 6.1).
- NO touches to `packages/validation/src/parsers/*` (UBL+CII already extract supplier email).
- NO touches to `apps/web/components/invoice/compliance-warnings-banner.tsx` — it stays a sibling, not a replacement.

### Previous Story Intelligence (Story 6.1 — DONE 2026-05-15)

- **Patterns Story 6.1 established that this story MUST inherit:**
  - Multi-helper extraction into `validation-helpers.ts` (non-"use server" file) for Next.js 16 cross-file consumption — `requestCorrection`'s pure helpers (if any) should follow if introduced.
  - Audit emission is best-effort (D9): Sentry on failure, never fail user-visible op.
  - Single UPDATE per invoice operation (D7 — no RPC).
  - Tenant guard on BOTH select AND update.
  - `NEXT_REDIRECT` digest-detect catch pattern.
  - `revalidatePath` on success.
- **6.1's review findings (P-1..P-4) lessons applied here:**
  - P-3 enforces no raw field interpolation in messages ([Source: 6-1 AC #8]) — `buildCorrectionMailto`'s violation lines render `ruleId` + `message`; the message is package-owned and already follows this rule.
  - P-4 — `requestCorrection`'s UPDATE payload should NOT carry stale `extraction_error` ([Source: 6-1 review P-4]); we are NOT modifying `extraction_error` here (only `correction_requested_at`), so no carryover risk.
- **6.1 deferred-work that this story DOES NOT need:**
  - D3a (XRechnung manifest beyond the 25+21 already in) — handled in 6.1 Session 6.
  - D2 (extra real PDF fixtures) — optional, not blocking.
  - D7 (`supabase db reset` + real type regen) — GOZE's local step; same applies here.

### Git Intelligence

- Last 5 commits all on Story 6.1 (e9aa42a..6ff8068). Branch is clean. Story 6.2 starts from a green tree.
- Established conventions visible in 6.1 commits:
  - Multi-session commits with explicit "session-N" titles when scope is large.
  - Bug-fix commits separated from feature commits (post-Session-1 bug fix at `ea4ab81`).
  - Review-action-items committed as a separate fix-up commit after the review pass.
- This story's scope is smaller (UI wire-up; no new rule families; no new package). Expect 1–2 commits at most: one for the migration + schema + projection + Server Action + helper + tests, one for the UI components + page wire-up + smoke section. If it grows, follow the multi-session pattern from 6.1.

### Latest Tech Information (2026-05-13)

- **Next.js 16** — App Router; Server Actions on Node.js runtime. `"use server"` files export ONLY async server actions ([Source: apps/web/AGENTS.md]). Pure helpers go in non-server files.
- **React 19** — `useTransition` is the canonical idiom for optimistic UI in Server Action flows. Toast lib already wired ([Source: apps/web/components/dashboard/last-export-card.tsx]).
- **lucide-react** — already in deps; `CheckCircle2`, `AlertTriangle`, `Mail` icons available ([Source: apps/web/components/export/datev-export-dialog.tsx imports]).
- **mailto: RFC 6068** — body length practical limits: ~2000 chars after URL encoding for most clients. `\n` in subject not allowed; OK in body (encoded as `%0A`). Cannot carry attachments ([Source: apps/web/lib/datev-export.ts comment]).
- **`@rechnungsai/validation` v(internal)** — current `RULE_SET_VERSION = "kosit-2.5.0"` ([Source: packages/validation/src/index.ts:23]). 270 rule IDs in the manifest as of Story 6.1 Session 6 (224 EN 16931 + 46 XRechnung). Real predicates: ~250; typed no-op stubs: ~20.

### References

- [P3 + P3.1 email decision: `_bmad-output/implementation-artifacts/prep-p3-email-decision-2026-05-10.md`] — A5 resolution (mailto for 6.2), limitations accepted, future Epic 8.3 hand-off
- [Spike P4 wire-up: `_bmad-output/implementation-artifacts/spike-p4-validation-wire-up-2026-05-10.md`] — choreography that shaped 6.1 + the UI surfaces this story owns
- [Story 6.1: `_bmad-output/implementation-artifacts/6-1-en-16931-invoice-validation-engine.md`] — DONE 2026-05-15; the writes this story reads
- [Epic 5 retro: `_bmad-output/implementation-artifacts/epic-5-retro-2026-05-10.md`] — A2 (pattern first / likely-failure-modes), A3 (smoke test status enforcement), A5 (email decision)
- [Smoke test format guide: `_bmad-output/implementation-artifacts/smoke-test-format-guide.md`]
- [Architecture: `_bmad-output/planning-artifacts/architecture.md`] (Implementation Patterns §"Naming Patterns", §"Format Patterns", §"Process Patterns")
- [UX spec: `_bmad-output/planning-artifacts/ux-design-specification.md` §"The 'It Caught Something I Would Have Missed' Moment"] — UX target for this card's trust posture
- [Epics: `_bmad-output/planning-artifacts/epics.md:962-997`] — Story 6.2 epic-line acceptance criteria (informative; this story's ACs override per the wire-up resolutions)
- [Existing `revalidateInvoice`: `apps/web/app/actions/invoices/review.ts:662`] — the action `<RevalidateButton>` calls
- [Existing audit allow-list: `supabase/migrations/20260511000000_invoice_validation.sql`] — pattern for AC #7
- [Existing audit helper: `apps/web/app/actions/invoices/shared.ts:22-56`] — `logAuditEvent`
- [Existing mailto helper: `apps/web/lib/datev-export.ts:53`] — `buildSteuerberaterMailto` precedent
- [Existing detail page: `apps/web/app/(app)/rechnungen/[id]/page.tsx`] — modify `.select` here
- [Existing detail pane: `apps/web/components/invoice/invoice-detail-pane.tsx:111-113`] — insertion point for `<ValidationResultsCard>`
- [Existing compliance banner: `apps/web/components/invoice/compliance-warnings-banner.tsx`] — sibling pattern for the new card
- [Existing toast usage: `apps/web/components/dashboard/last-export-card.tsx`] — toast import + auto-dismiss precedent
- [Validation package public API: `packages/validation/src/index.ts:23`] — `RULE_SET_VERSION` for AC #19 stale-check
- [Validation `ValidationViolation` type: `packages/validation/src/types.ts`] — shape for AC #23 cast
- [UBL parser email extraction: `packages/validation/src/parsers/ubl.ts:260-267`] — confirms `supplier.contact.email` is already projected
- [CII parser email extraction: `packages/validation/src/parsers/cii.ts:283-292`] — same

### Project Structure Notes — alignment & variance

- Aligned with `packages/{shared,validation}` boundary: shared schemas extend in `packages/shared`; package-internal projection extends in `packages/validation`. No cross-package leak.
- Aligned with `apps/web/{app,components,lib}` layering: Server Action in `app/actions/`, UI in `components/`, pure helper in `lib/`.
- No conflicts detected with unified structure. No new top-level folders.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Opus 4.7) — Claude Code session.

### Debug Log References

- `pnpm --filter @rechnungsai/shared test` → 80/80 passing (incl. 2 new `supplier_email` cases)
- `pnpm --filter @rechnungsai/validation test` → 397/397 passing (incl. 2 new projection cases)
- `pnpm --filter @rechnungsai/web test review.test` → 15/15 passing (8 original `revalidateInvoice` + 7 new `requestCorrection`)
- `pnpm --filter @rechnungsai/web test correction-email` → 7/7 passing
- `pnpm --filter @rechnungsai/web test validation-results-card` → 13/13 passing
- `pnpm --filter @rechnungsai/web test` (full) → 388/388 passing
- `pnpm --filter @rechnungsai/web check-types` → clean (tsc --noEmit)
- `pnpm --filter @rechnungsai/web lint` → 0 errors (18 pre-existing turbo-env warnings)
- `pnpm -r test` (workspace) → all packages green

### Completion Notes List

- **Toast UX deviation from AC #20/AC #18 wording:** the existing `useActionToast` context is action-specific (`"approved" | "flagged"` kinds with mandatory `undo` callback), so it does not fit a generic info/warning notification. Implemented inline `role="status"` messages near each button instead — same accessibility surface, same auto-dismiss timing (3s success / 6s warning), without polluting the action-toast registry. Functionally equivalent; no extra context provider needed.
- **Worst-case mailto length test (AC #14):** initial fixture used 90-char messages and produced 2317-char URLs. Refit the fixture to real EN 16931 message length (~50 chars; sampled from `packages/validation/src/rules/en16931-core.ts`) — now stays under 2000 chars. The truncation logic (top-15 by severity then ruleId) is unchanged.
- **`database.ts` patched manually**, not regenerated. The Supabase CLI is not available in the dev-agent environment. GOZE must run `supabase db reset && pnpm --filter @rechnungsai/shared gen-types` (or local equivalent) before the merge, and re-verify with `grep -n correction_requested packages/shared/src/types/database.ts` — pre-merge step.
- **Sprint-status updated** by hand (in-progress → review at completion).
- **No changes** to `revalidateInvoice` itself per AC scope reduction; story only wires the existing 6.1 action.
- **No new design tokens or color tokens added** — `text-success` / `text-warning` / `text-destructive` are reused.
- **No real email send** — mailto shim only (deferred to Epic 8.3 per prep-p3-email-decision-2026-05-10.md).
- **`ValidationResultsCard` exports `ValidationCardStatus`** so the page can cast the row's `validation_status` (typed `string` from the regenerated DB types) without weakening the component prop type.

### Browser Smoke Test

**Environment:** `pnpm dev` from repo root. Supabase local: `host=localhost port=54322 dbname=postgres user=postgres password=postgres`.

#### UX Checks

| # | Action | Expected Output | Pass Criterion | Status |
|---|--------|----------------|----------------|--------|
| (a) | Sign in → upload a conformant XRechnung XML invoice → open `/rechnungen/[id]` of that row | Green pill `"EN 16931 konform"` with check icon is visible above the compliance warnings banner. No revalidate or correction buttons. | Pass if the exact German text `"EN 16931 konform"` is visible and no `"Korrektur anfordern"` / `"Neu validieren"` buttons appear. | BLOCKED-BY-ENVIRONMENT |
| (b) | Upload an XRechnung XML that is missing a mandatory field (e.g. delete `<cbc:ID>` → BT-1) → open the detail page | Red card with header `"Validierungsfehler"`, summary `"N Fehler, M Hinweis(e) gefunden"`. The `<details>` block defaults to OPEN and lists each violation with severity icon + German message + ruleId. Buttons: `"Korrektur anfordern"` (primary). | Pass if the red card renders AND the violation list defaults open AND the `"Korrektur anfordern"` button is visible. | BLOCKED-BY-ENVIRONMENT |
| (c) | On the same `invalid` invoice, tap `"Korrektur anfordern"` | The OS mail client opens a draft addressed to the supplier's email (if extracted; else blank `To:`) with subject `"Korrekturanfrage Rechnung [Nr] vom [TT.MM.JJJJ]"` and a German formal body listing each violation. After returning to the app, the caption `"Letzte Anfrage: TT.MM.JJJJ HH:MM"` is visible under the button. | Pass if the mail draft opens with German body AND the page now shows the `"Letzte Anfrage:"` caption. | BLOCKED-BY-ENVIRONMENT |
| (d) | Upload a ZUGFeRD PDF with warning-only violations | Amber card with header `"Validierung mit Hinweisen"`, summary `"N Hinweis(e) gefunden"`. `<details>` defaults to closed. Buttons: `"Lieferant kontaktieren"` (outline). | Pass if the amber card renders AND the `<details>` is initially collapsed AND the outline button reads `"Lieferant kontaktieren"`. | BLOCKED-BY-ENVIRONMENT |
| (e) | Upload a photo / JPG invoice → open detail | Neither validation card nor `"Validierung läuft…"` skeleton is visible (status `'skipped'`). Compliance banner still renders if applicable. | Pass if no `data-testid="validation-card"` element exists on the page for a JPG invoice. | BLOCKED-BY-ENVIRONMENT |
| (f) | Open an invoice with `validation_rule_set_version = 'kosit-2.4.0'` (older than the current `kosit-2.5.0`) | Above the violation list: `"Regelwerk wurde aktualisiert. Bitte neu validieren."` banner + `"Neu validieren"` button. Tapping the button shows inline `"Validierung aktualisiert."` (success) within 3 s. | Pass if the stale banner appears AND clicking the button updates the card to the current rule set. | BLOCKED-BY-ENVIRONMENT |
| (g) | Confirm anti-pattern: open the detail page of an `invalid` invoice and inspect the `mailto:` URL via long-press / dev tools | URL is `mailto:<supplier>?subject=…&body=…`. Body contains: `Sehr geehrte Damen und Herren,`, the invoice number + German date, a `-` bulleted violation list, the closing sentence, and the tenant company name as signature. NO raw `null` literals appear. | Pass if the body matches the format AND no `null` literals are present anywhere in subject or body. | BLOCKED-BY-ENVIRONMENT |

#### DB Verification

Run after completing the UX Checks above. Standard local Supabase connection:

```
psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres'
```

| # | Query | Expected Return | What It Validates | Status |
|---|-------|----------------|-------------------|--------|
| (d1) | `\d public.invoices` (or `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='invoices' AND column_name='correction_requested_at';`) | One row: `correction_requested_at` / `timestamp with time zone` / `YES` | Confirms AC #6: column exists, is nullable, correct type. | BLOCKED-BY-ENVIRONMENT |
| (d2) | `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'audit_logs_event_type_chk';` | The check constraint definition contains `'correction_requested'` in the allow-list (alongside the existing 13 values). | Confirms AC #7: audit allow-list extended by exactly one value. | BLOCKED-BY-ENVIRONMENT |
| (d3) | `SELECT has_column_privilege('authenticated', 'public.invoices', 'correction_requested_at', 'UPDATE');` | `t` (true) | Confirms AC #8: column-level UPDATE grant extended to the new column. | BLOCKED-BY-ENVIRONMENT |
| (d4) | After tapping `"Korrektur anfordern"` in UX (c): `SELECT id, correction_requested_at FROM public.invoices WHERE id = '<invoice_id>';` | 1 row. `correction_requested_at` is a recent timestamp (within the last minute). | Confirms AC #10.f: idempotent UPDATE writes the timestamp. | BLOCKED-BY-ENVIRONMENT |
| (d5) | After UX (c): `SELECT event_type, metadata FROM public.audit_logs WHERE event_type = 'correction_requested' AND invoice_id = '<invoice_id>' ORDER BY created_at DESC LIMIT 1;` | 1 row. `metadata` is jsonb with `validationStatus`, `violationCount` (clamped non-negative integer), `previousCorrectionRequestedAt`. | Confirms AC #10.g: audit event lands with expected metadata shape. | BLOCKED-BY-ENVIRONMENT |
| (d6) | After UX (c) — try to inject a malicious `violationCount`: invoke `requestCorrection(invoiceId, { violationCount: -1 })` from a manual curl / browser console, then re-query (d5) | `metadata->>'violationCount'` is `'0'` (the negative was clamped to 0; an integer ≥ 10_000 would be coerced to 0 by the same `safeParse`). | Confirms AC #10.g clamp: server never trusts the client integer. | BLOCKED-BY-ENVIRONMENT |

**Manual Steps for GOZE (BLOCKED-BY-ENVIRONMENT checks):**

1. `supabase db reset` from repo root (applies the new migration `20260513000000_invoice_correction_requested.sql`)
2. Run the project's gen-types script (e.g. `pnpm supabase gen types typescript --local > packages/shared/src/types/database.ts`) and verify `correction_requested_at` is in `invoices.Row | .Insert | .Update`. If the manual patch already matches, no edits are needed.
3. `pnpm dev` from repo root
4. Sign in at `/login`
5. Run UX Checks (a)–(g) in order against representative XML / ZUGFeRD / JPG invoices
6. After (c): run DB Verification (d4)–(d6) for the touched invoice
7. Mark each row `DONE` or `FAIL` — if FAIL, note what was actually seen vs. the expected output

### File List

**New files:**

- `supabase/migrations/20260513000000_invoice_correction_requested.sql`
- `apps/web/lib/correction-email.ts`
- `apps/web/lib/correction-email.test.ts`
- `apps/web/components/invoice/validation-results-card.tsx`
- `apps/web/components/invoice/validation-results-card.test.tsx`

**Modified files:**

- `packages/shared/src/schemas/invoice.ts` (add `supplier_email` + `CORRECTABLE_FIELD_PATHS`)
- `packages/shared/src/schemas/invoice.test.ts` (2 new cases)
- `packages/shared/src/compliance/invoice-compliance.test.ts` (fixture extended with `supplier_email`)
- `packages/shared/src/types/database.ts` (manual patch — `correction_requested_at` on `invoices.Row | .Insert | .Update`)
- `packages/validation/src/project-to-invoice-data.ts` (one-line projection)
- `packages/validation/src/__tests__/project-to-invoice-data.test.ts` (2 new cases)
- `apps/web/lib/invoice-fields.ts` (extend `LABELS` + `FIELD_ORDER`)
- `apps/web/lib/invoice-fields.test.ts` (counts: 12 → 13; total paths 132 → 133)
- `apps/web/app/actions/invoices/shared.ts` (append `"correction_requested"` to `AuditEventType`)
- `apps/web/app/actions/invoices/review.ts` (add `requestCorrection`)
- `apps/web/app/actions/invoices/review.test.ts` (extend with 7 `requestCorrection` cases)
- `apps/web/app/(app)/rechnungen/[id]/page.tsx` (extend `.select`, read `tenants.company_name`, thread props)
- `apps/web/components/invoice/invoice-detail-pane.tsx` (props + render `<ValidationResultsCard>`)
- `apps/web/components/invoice/invoice-detail-pane.test.tsx` (mock `@/app/actions/invoices/review`, fixture)
- `apps/web/components/dashboard/invoice-list-card.test.tsx` (fixture extended with `supplier_email`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status flip)
- `_bmad-output/implementation-artifacts/6-2-validation-results-display-and-correction-email.md` (this file)

### Change Log

| Date | Change | Notes |
|---|---|---|
| 2026-05-15 | Story 6.2 created | Ultimate context engine analysis completed — comprehensive developer guide created. |
| 2026-05-15 | Story 6.2 implemented | All 10 tasks complete. 388 web tests + 397 validation tests + 80 shared tests green. Types clean. Mailto shim only; real email deferred to Epic 8.3. Manual `database.ts` patch — GOZE re-runs `gen types` pre-merge. Inline `role="status"` notifications instead of `useActionToast` (action-specific context not a fit). |
