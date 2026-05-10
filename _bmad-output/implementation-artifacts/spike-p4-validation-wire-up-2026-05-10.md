# Spike P4 — Story 6.1 Validation Wire-up Choreography

**Date:** 2026-05-10
**Author:** Winston (System Architect)
**For:** Story 6.1 — EN 16931 Invoice Validation Engine (Epic 6)
**Triggered by:** Epic 5 Retro Action **A1** (wire-up spike rule for ≥4-surface stories)
**Upstream contracts:**
- P1 — `technical-en-16931-e-invoice-validation-architecture-research-2026-05-10.md` (`packages/validation` shape, sync `validateEN16931(xml, opts) → ValidationReport`)
- P2 — `spike-p2-zugferd-pdf-extraction-2026-05-10.md` (`packages/pdf` `extractZugferdXml(bytes) → ZugferdExtractionResult`, `isLikelyEInvoicePdf(bytes)`)
- P3 — `prep-p3-email-decision-2026-05-10.md` (mailto shim for 6.2; `tenants.steuerberater_email` already landed via P3.1)

---

## 1. Why This Spike Exists

Story 6.1 touches **six surfaces** in the same shape that produced 19 review patches + 2 post-merge fixes on Story 5.3:

1. New package `packages/validation` (P1)
2. New package `packages/pdf` (P2)
3. New DB columns on `invoices` + audit allow-list extension (Epic 6 P5)
4. Caller code in `apps/web/app/actions/invoices/upload.ts` (`extractInvoice`)
5. New Server Action `validateInvoice` (re-trigger / on-demand)
6. Storage-side: source-of-truth XML for re-validation

P1 fixed the *what* (validation engine internals). P2 fixed the *how-do-we-get-XML-out-of-PDFs*. P4 fixes the *who-calls-whom-and-when* — the choreography that bit Story 5.3.

Scope for this spike: **decisions only**. No code; no story tasks beyond what feeds the Story 6.1 file.

---

## 2. Decision Matrix (one-screen reference)

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | When validation runs (initial) | **Sync, inline inside `extractInvoice`** after AI extraction succeeds | Same Server Action context, atomic with extract write, no second user-visible state |
| D2 | When validation runs (re-trigger) | New Server Action `revalidateInvoice(invoiceId)` — explicit user action OR rule-set bump banner | Avoids silent recompute on every page load; auditable |
| D3 | XML source of truth | **Read XML on demand from Storage** (`file_path`) — no `invoices.original_xml` column | XML is already immutable in Storage (Epic 4); duplicating into a column violates SSOT and bloats `invoices` |
| D4 | ZUGFeRD detection point | Inside `extractInvoice`, **before** calling `aiExtractInvoice` for `application/pdf` | If PDF is e-invoice, skip AI extraction entirely (free + faster + structured) |
| D5 | When ZUGFeRD short-circuits AI | When `extractZugferdXml(bytes).kind === "found"` AND `validateEN16931(xml).status !== 'invalid'` | Valid e-invoice → trust structured data over AI; invalid → still run AI as fallback (don't lose the invoice) |
| D6 | Persistence shape | 4 new columns on `invoices` + `validation_errors jsonb` | Matches P1 contract; one row, one UPDATE, no join in 6.2 UI |
| D7 | Atomicity | Single UPDATE per invoice — no RPC wrapper | P1 §"Caller Wiring": `validation_status` is internal UX, not GoBD legal record; differs from `commit_datev_export` |
| D8 | Audit shape | `validation_passed`/`validation_failed` events; metadata carries `{ profile, customizationId, violationCount, ruleSetVersion, durationMs }` only | Audit row stays small; full `violations[]` lives on `invoices.validation_errors` |
| D9 | Audit failure handling | Best-effort — log to Sentry, **do not fail the user-facing operation** | Validation result is the source of truth; audit is secondary log (Epic 4 retro pattern) |
| D10 | Pure-XML upload path | Pure `application/xml` uploads skip AI extraction entirely; project parser → invoice_data direct map | AI on pure XML wastes tokens; Story 2.x already accepts XML mime |
| D11 | Re-validation on rule-set bump | Banner on detail page when `validation_rule_set_version < CURRENT_RULE_SET_VERSION`; user-clicks `revalidateInvoice` | Auto-recompute would invalidate audit trail; manual avoids surprise mutations |
| D12 | Where XML decoding lives | `packages/validation` accepts `string` only | P1 is pure-compute; caller does Storage download + `TextDecoder` |
| D13 | Validation status enum | `pending` (not yet run) \| `valid` \| `warning` \| `invalid` \| `unsupported` (no XML / unknown profile) \| `skipped` (non-e-invoice formats: photos, image-only PDFs) | Six values; covers every realistic terminal state, prevents NULL ambiguity |
| D14 | Migration scope (Story 6.1) | One migration: 4 columns + check constraint + audit allow-list extension (folds Epic 6 P5) | Single rollback unit; matches Story 5.1 single-migration-per-story pattern |
| D15 | Performance budget | p95 < 500 ms for 200-line invoice (parse + project + ~150 rules); measured during Phase 2 | P1 estimate; below Server Action soft budget; failure → revisit Option B (background) per P1 |
| D16 | Failure-mode coverage | Story file gains a `### Likely Failure Modes` section per Epic 5 retro A2 — see §6 of this spike | Pre-empts D1-style review surprises |

---

## 3. The Choreography (textual sequence)

### 3.1 Initial validation (happens inside `extractInvoice`)

```
User uploads file → status='captured', file in Storage, file_path saved
                ↓
extractInvoice(invoiceId)  [existing Server Action]
                ↓
  flip status: captured → processing  [existing optimistic-lock pattern]
                ↓
  read invoice row (file_path, file_type)
                ↓
  ┌─── BRANCH on file_type ───┐
  │                           │
  application/xml             application/pdf            image/jpeg|png
  ──────────────              ──────────────            ──────────────
  download bytes              download bytes            (existing path)
  decode UTF-8                isLikelyEInvoicePdf?      AI extract
  validateEN16931 ──┐         │  yes        no          set validation_
  project to        │         ↓             │              status='skipped'
  invoice_data ─────┤  extractZugferdXml    │
                    │  ┌─ found ─┐  ┌─not─┐ │
                    │  validate  │   AI    │
                    │  EN16931   │  extract│
                    │  ┌─OK?─┐   │   ↓     │
                    │  yes  no   │  set v_
                    │  │    │    │  status=
                    │  │    AI   │  skipped
                    │  │    fallback       │
                    │  │    │              │
                    │  ↓    ↓              ↓
                    │  use  use ai data    use ai data
                    │  XML  + validation   + validation
                    │  data + report       skipped
                    │  + validation report
                    └────────┬─────────────┘
                             ↓
              SINGLE UPDATE on invoices:
                invoice_data           = <projected | ai-extracted>
                status                 = ready | review (existing logic)
                extracted_at           = now
                extraction_error       = null
                validation_status      = <D13 enum>
                validation_errors      = <jsonb array>
                validation_rule_set_version = 'kosit-2.5.0'
                validated_at           = now (when validation ran) | null (skipped)
                              ↓
              emitAuditLog (best-effort) — extract event + validation event
                              ↓
              return { status, overall }
```

### 3.2 Re-validation (separate Server Action)

```
revalidateInvoice(invoiceId)
                ↓
  auth + tenant guard (Epic 4 prep-p2 pattern: .eq('tenant_id', tenantId))
                ↓
  read invoice row (file_path, file_type, validation_rule_set_version)
                ↓
  if file_type ∉ {application/xml, application/pdf}: return { skipped: true }
                ↓
  download bytes from Storage (re-use signed URL helper, 60s TTL)
                ↓
  same XML / PDF branch as §3.1 (extract → validate)
                ↓
  SINGLE UPDATE: validation_status, validation_errors, validation_rule_set_version, validated_at
                ↓
  emit audit: { event_type: 'revalidation_completed', ruleSetVersionBefore, ruleSetVersionAfter, ... }
                ↓
  revalidatePath(`/rechnungen/${invoiceId}`)
```

### 3.3 What `extractInvoice` does **not** do

- **No AI re-call when ZUGFeRD validates clean.** Saves tokens + time; trusts the structured invoice over the model.
- **No separate validation Server Action call from the upload path.** Validation is a step of extraction, not a sibling.
- **No `revalidatePath` shotgun.** `extractInvoice` already revalidates `/dashboard` and `/rechnungen/[id]` (existing); validation result rides the same wave.

---

## 4. Persistence — DB Migration Sketch (Story 6.1 task)

```sql
-- supabase/migrations/YYYYMMDD000000_invoice_validation.sql

alter table public.invoices
  add column validation_status text not null default 'pending'
    check (validation_status in ('pending','valid','warning','invalid','unsupported','skipped')),
  add column validation_errors jsonb not null default '[]'::jsonb
    check (jsonb_typeof(validation_errors) = 'array'),
  add column validation_rule_set_version text null,
  add column validated_at timestamptz null;

-- Allow application role to UPDATE the new columns (mirror Story 5.1 grant pattern)
revoke update on public.invoices from authenticated;
grant update (
  /* existing columns: keep current set; tooling regenerates this */
  status, invoice_data, extraction_error, extracted_at, extraction_attempts,
  approved_at, approved_by, /* … */
  validation_status, validation_errors, validation_rule_set_version, validated_at
) on public.invoices to authenticated;

-- Index for "what needs re-validation when rule set bumps"
create index if not exists invoices_validation_rule_set_idx
  on public.invoices (tenant_id, validation_rule_set_version)
  where validation_status in ('valid','warning','invalid');

-- Audit allow-list extension (folds Epic 6 P5)
alter table public.audit_logs
  drop constraint audit_logs_event_type_chk;
alter table public.audit_logs
  add constraint audit_logs_event_type_chk
  check (event_type in (
    /* existing values */ ...,
    'validation_passed',
    'validation_failed',
    'revalidation_completed'
  ));
```

**Why these choices:**

- **`text + check`, not `enum`.** Story 5.1 precedent — easier to extend in a future migration than `alter type ... add value`. Cost: one check-constraint rewrite when adding values; benefit: rollback-friendly, no enum-cache hassle.
- **`jsonb not null default '[]'`.** UI never reads NULL; "no violations" is `[]`. Saves a "is null then []" guard in 5+ React components.
- **`jsonb_typeof = 'array'` check.** Cheap insurance against a future caller writing an object instead of an array. Same belt-and-braces idea as Story 4.2 audit metadata.
- **Conditional partial index.** `pending`/`unsupported`/`skipped` rows are not candidates for re-validation; excluding them keeps the index small.
- **No new table.** A `validation_runs` history table was considered and rejected for v1 (see §7 Out-of-Scope). Single-row state is sufficient for the 6.2 UI; if a compliance auditor ever wants run history, the audit trail already has it via `validation_passed`/`validation_failed` events.

---

## 5. Server Action Signatures

### 5.1 Modified — `extractInvoice` (in `apps/web/app/actions/invoices/upload.ts`)

Existing signature unchanged externally:

```ts
export async function extractInvoice(
  invoiceId: string,
): Promise<ActionResult<{ status: "ready" | "review"; overall: number }>>;
```

Internal additions, in order:

1. After `flippedToProcessing = true`, **before** `signed.signedUrl` is created (or instead of it for XML/ZUGFeRD branches):
   - For `application/xml`: download bytes via `supabase.storage.from('invoices').download(row.file_path)`, decode UTF-8, call `validateEN16931(xml, { ruleSet: 'xrechnung' })`, project to `invoice_data` shape (helper lives in `packages/validation` — `projectToInvoiceData(report)`).
   - For `application/pdf`: download bytes; if `isLikelyEInvoicePdf(bytes)` is true, call `extractZugferdXml(bytes)`; on `found`, validate; if `valid|warning`, project to `invoice_data` and skip AI; on `invalid`, validate-then-AI (don't lose data).
2. Before the final UPDATE: compose `validationFields = { validation_status, validation_errors, validation_rule_set_version, validated_at }` and merge into the existing UPDATE payload.
3. After UPDATE succeeds: emit a **second** `logAuditEvent` for `validation_passed`/`validation_failed`. Keep existing extract-event emission unchanged.

### 5.2 New — `revalidateInvoice` (in `apps/web/app/actions/invoices/review.ts`)

```ts
export async function revalidateInvoice(
  invoiceId: string,
): Promise<ActionResult<{ status: ValidationStatus; violationCount: number }>>;
```

Following the Story 4.2 / 5.3 patterns: auth → user→tenant → tenant-scoped row select (`.eq('tenant_id', tenantId)`) → branch by `file_type` → download → validate → single UPDATE → audit (best-effort) → `revalidatePath`.

**Why a separate file (`review.ts`) and not `upload.ts`:** re-validation is a review-phase operation; user triggers it from the detail page after seeing the validation banner. Mirrors Epic 5 retro Insight #4 — file-by-lifecycle-phase.

### 5.3 Helper (lives in `packages/validation`)

```ts
// packages/validation/src/project-to-invoice-data.ts
export function projectToInvoiceData(report: ValidationReport): InvoiceData;
```

`InvoiceData` is the `apps/web` AI-extraction shape (`packages/shared` schema). The mapping is mechanical: Invoice.invoiceNumber → invoice_data.invoice_number.value with `confidence: 1.0` (structured data is high-confidence by construction). Lives in `packages/validation` because the projection is parser-output-aware.

---

## 6. Likely Failure Modes (Epic 5 retro A2)

Per the new Dev Notes section rule. Story 6.1's spec **must** carry these explicitly.

| # | Failure mode | What happens today (without this story) | Story 6.1 design response |
|---|---|---|---|
| F1 | User uploads XRechnung XML; XML is malformed (truncated mid-tag) | Currently bypasses validation; AI tries to OCR garbage XML | `parseXml` returns parse-fail → `ValidationReport.violations = [STRUCT-XML-MALFORMED]`, `status='invalid'`; AI does **not** run; row goes to `review` with extraction_error="XML konnte nicht gelesen werden — bitte Lieferant kontaktieren." |
| F2 | ZUGFeRD PDF with broken `/EmbeddedFiles` name tree | `extractZugferdXml` returns `{ kind: 'error' }` | Treat as plain PDF → fall through to AI extraction; `validation_status='skipped'` (we couldn't validate, but extracted by AI); user still gets data |
| F3 | User uploads pure XML for a CustomizationID we don't recognize | Validation currently doesn't exist | `validation_status='unsupported'`; `validation_errors=[STRUCT-PROFILE-UNKNOWN]`; AI extraction does NOT run (we have structured data even if we can't validate it); 6.2 UI shows "Format wird nicht unterstützt: <customizationId>" with mailto-supplier shim |
| F4 | Validation succeeds but DB UPDATE fails (RLS, constraint) | Today: extraction lost too | Existing extractInvoice rollback path (status→'captured', extraction_error set) extends to validation: any failure rolls back the whole transaction; user sees one German error and re-uploads |
| F5 | Audit emit fails after UPDATE succeeds | Today (5.3 P1): inconsistent | D9 — Sentry log only, do not fail user op; user-visible state matches DB; audit gap is observable in Sentry, recoverable from `invoices.validation_*` columns |
| F6 | User clicks "Erneut validieren" twice in quick succession | No protection in current 5.3 patterns either | `revalidateInvoice` uses `useTransition` on the client + idempotent UPDATE: second call sees same `validation_rule_set_version` and is a no-op (or returns cached result via `validated_at >` recent threshold) |
| F7 | Two browser tabs open same invoice; one revalidates, one views stale | Common across the app | Server Components revalidatePath fires; second tab's RSC refetch picks up the new state on next nav. Acceptable — same posture as Story 3.x |
| F8 | Storage download fails (signed URL expiry, network) during initial extract | extractInvoice already handles AI side; XML side is new | Same rollback path: status→'captured', extraction_error="Datei konnte momentan nicht geladen werden — bitte erneut versuchen." |
| F9 | Validation rule set bumps from 2.5.0 → 2.6.0; existing invoices show stale results | N/A today | D11 — banner on detail page when `validation_rule_set_version < CURRENT`; user-clicked `revalidateInvoice` recomputes; **never** auto-recompute (would silently mutate audit-relevant state) |
| F10 | Invoice has 200+ rule violations; URL-encoded mailto body exceeds browser limit (Story 6.2) | Story 6.2 concern, but choreography matters here | Audit metadata carries `violationCount`; Story 6.2 truncates body to top-N (P3 known limitation); full list stays in `invoices.validation_errors` for in-app rendering |
| F11 | AI extraction succeeds with `gross_total = 100`; XML projection gives `gross_total = 99.99` | New conflict class introduced by D5 | D5 says trust XML on `valid|warning`; on `invalid`, AI fallback. Audit metadata records `usedSource: 'xml' | 'ai'` so a future "why did this number change" question is traceable |
| F12 | User uploads PDF that is an *invoice photo* (no embedded XML), `isLikelyEInvoicePdf` returns false | Existing AI path | `validation_status='skipped'`; `validation_errors=[]`; UI in 6.2 shows "Validation nicht anwendbar (Foto-Beleg)" — no error, just informational |

---

## 7. Out of Scope (Stage gates for Story 6.x and beyond)

| Item | Why out of scope for 6.1 | Where it goes |
|---|---|---|
| `validation_runs` history table | Single-row state sufficient; audit trail already records each run | Revisit if compliance ever asks for as-of replay (P1 §Versioning) |
| Background validation queue (P1 Option B) | Sub-500 ms p95 makes sync the right default; future optimization only | Re-evaluate when first 10k-line invoice arrives |
| 6.2 UI rendering of `validation_errors` | Story 6.2 owns the display | 6.2 prep |
| Correction email send (real transactional) | P3 decided mailto shim | Epic 8.3 |
| Multi-language `message` field | German-only for v1 | Future i18n story; `messageParams` field on `ValidationViolation` is the seam |
| ZUGFeRD profile detection (`MINIMUM`/`BASIC`/etc.) | P2 returns `profile: null`; P1 says profile detection lives in validation | Story 6.1 Phase 4 (CII parser) — set from `<GuidelineSpecifiedDocumentContextParameter><ID>` |
| Re-validation cron when rule set bumps | D11 — manual only | Future story; tied to "operations dashboard" if/when one exists |
| Cross-invoice rules (e.g., duplicate detection) | Per-invoice scope only | Out of scope of EN 16931 entirely |
| `invoices.original_xml` column for in-app preview | D3 — Storage is SSOT; UI reads via signed URL | 6.2 UI choice; `<XmlPreview>` component fetches signed URL on demand |

---

## 8. Open Questions for Story 6.1 (must be answered IN the story file, not deferred)

1. **AI vs XML conflict UX.** When XML projection and AI both produce `invoice_data`, do we show *both* in the detail pane (with a "structured data preferred" badge), or only the chosen one? (Recommendation: only the chosen one for v1; AI fallback is invisible to user, only logged in audit. UX choice — confirm during story creation.)
2. **What's the German UI string for `validation_status='unsupported'`?** Story 6.2 owns this, but 6.1 must seed `extraction_error` text for the user-visible row state during initial extract. Suggest: `"E-Rechnungsformat erkannt, aber nicht unterstützt: <customizationId>. Validierung übersprungen."`
3. **Does `revalidateInvoice` require the invoice to be in any particular `status`?** Recommendation: allow any status except `processing`; re-validation is a read-side compute that doesn't affect approval state. Worth confirming.
4. **`projectToInvoiceData` confidence value.** Structured XML data is by construction high-confidence — but setting `confidence: 1.0` everywhere bypasses the existing review-queue routing (`statusFromOverallConfidence`). Decision: validated XML invoices land in `ready`, never `review`. (Tradeoff: skips human review for valid e-invoices. Acceptable for v1 — that's the whole point of EN 16931. Document explicitly in story.)

These are real decisions, not rhetorical questions. The story creation step (`bmad-create-story`) must lock answers before dev-handoff.

---

## 9. Test Plan for the Wire-up (caller-side; supplements P1's package-side tests)

| Tier | What | Where |
|---|---|---|
| Unit | `projectToInvoiceData(report) → InvoiceData` mapping (3 cases: minimal, full, with line items) | `packages/validation/__tests__/project-to-invoice-data.test.ts` |
| Unit (Server Action) | `extractInvoice` XML branch: happy, malformed, unsupported profile (3 cases) | `apps/web/app/actions/invoices/upload.test.ts` (extend existing file) |
| Unit (Server Action) | `extractInvoice` PDF branch: not-e-invoice (skipped), valid ZUGFeRD (XML used, AI skipped), invalid ZUGFeRD (AI fallback) | same file |
| Unit (Server Action) | `revalidateInvoice`: happy, tenant-isolation guard, file-type guard, audit-failure-doesn't-block | new `apps/web/app/actions/invoices/review.test.ts` |
| Integration | Single migration up + reads + writes work; check constraint rejects bad enum | `supabase/migrations/_test/` if pattern exists, else manual smoke |
| Smoke | `BLOCKED-BY-ENVIRONMENT` per Epic 5 retro A3 — dev agent has no real browser; rows for "upload XRechnung XML, see ✓ in detail pane" tier are blocked-by-env until manual run |

**KPI for the wire-up (per P1 §Success Metrics):** patch count + post-merge-fix count vs Story 5.3 baseline (19 + 2). This spike's job is to drive both numbers down.

---

## 10. Changes to Story 6.1 Spec (required before story creation)

The story creation skill (`bmad-create-story`) should produce a Story 6.1 file with:

- **STOP block** (Epic 5 What-Went-Well #3): "wire-up only — package internals belong to phase 1; this story integrates packages/validation + packages/pdf into the existing extractInvoice flow plus a revalidateInvoice Server Action. NO 6.2 UI work, NO correction email."
- **Pattern citations** (Epic 5 retro A2): mirror `apps/web/app/actions/invoices/upload.ts` for Server Action shape; mirror Story 5.3 `commit_datev_export` *only as a reference for what we explicitly chose NOT to do* (no RPC needed — D7).
- **Likely Failure Modes section** — copy F1–F12 from §6 above.
- **Migration scope locked at one file** per D14.
- **Smoke test rows marked `BLOCKED-BY-ENVIRONMENT`** for browser-tier per A3.
- **Open questions §8** answered before dev-handoff (or noted as "deferred to story dev with explicit fallback").

---

## 11. What This Spike Does NOT Decide (handed back to Story 6.1)

- Exact column names if `invoices` already has near-name collisions (verify against `database.ts` during story creation).
- The 6.2 UI surface — owned by Story 6.2.
- Whether `validation_rule_set_version` ships as `'kosit-2.5.0'` or just `'2.5.0'` (string format choice; defer to story creation).
- The exact German wording for each `validation_status` enum value's user-facing label — copy work for 6.2.

---

## 12. Risk Register (this wire-up specifically)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Adding 4 columns + 2 audit event types in one migration triggers RLS regressions | Low | High | Manual smoke per Story 5.1 migration template; column-grant block tested before merge |
| `extractInvoice` becomes too long (already ~250 lines); review-fatigue | Medium | Medium | Extract two helpers: `runStructuredExtraction(bytes, fileType)` and `composeUpdatePayload(...)`. Names are concrete; helpers stay in `upload.ts`, no new file |
| AI fallback path on `invalid` ZUGFeRD doubles the worst-case latency | Low | Medium | Document; measure during Phase 2; revisit if observed > 5% of uploads |
| `projectToInvoiceData` shape drifts from AI extractor's `InvoiceData` shape | Medium | High | Type-check at compile time (shared `InvoiceData` type from `@rechnungsai/shared`); add a Vitest type assertion per Epic 3 prep-td1 pattern |
| Re-validation banner shown to user but `revalidateInvoice` 500s | Low | Medium | Banner click uses `useTransition` + Sentry-instrumented Server Action; F4-style rollback applies |
| Story 6.1 scope creep into 6.2 (UI rendering of errors) | High | High | The STOP block + reviewer enforcement; "no JSX changes outside `extractInvoice`'s German error strings" is the bright line |

---

## 13. Dependencies on Already-Done Prep

- ✅ P1 — validation engine architecture committed (research file)
- ✅ P2 — `packages/pdf` extractor design committed (spike file)
- ✅ P3 + P3.1 — email decision + `tenants.steuerberater_email` migration landed
- ⏸️ P5 (audit allow-list) — folded INTO Story 6.1 migration per D14; can be removed from prep tracker as a standalone item

---

## 14. Outcome — Story 6.1 Is Now Unblocked

After this spike, Story 6.1 is a wire-up story per the original Epic 5 retro intent:
- Choreography: §3
- Persistence: §4
- Server Action signatures: §5
- Failure modes: §6
- Test plan: §9
- Story spec changes: §10
- Open questions: §8 (answer during story creation)

**Estimated patch count target for Story 6.1: ≤ 8.** (Story 5.3 baseline 19 + 2; this spike's purpose is to halve that. KPI lives in Epic 6 retro.)

---

Winston (Architect): "5.3'te öğrendiğimiz şey: paket spike'ı yetmiyor — choreography spike'ı ayrı iş. P1 paketin içini, P2 PDF'in içini çözdü; P4 kim-kimi-ne zaman-çağırır diye karar veriyor. Sync extractInvoice içinde inline validation, single UPDATE, ZUGFeRD valid'se AI'ı atla — bu üç karar Story 6.1'i 'thin wire-up' yapıyor. F1–F12 failure modes Dev Notes'a girer; review'da sürpriz çıkmasın."
