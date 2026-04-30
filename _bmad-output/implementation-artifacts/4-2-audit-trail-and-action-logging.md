# Story 4.2: Audit Trail and Action Logging

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want every action on my documents to be logged in an immutable audit trail,
So that I have a complete history for GoBD compliance and Finanzamt inspections.

---

## Technical Concerns (≤3, per Epic 1 retro Action #2)

1. **Migration: `audit_logs` table + append-only RLS posture (FR22, NFR11, GoBD Tz. 64–67)** — A NEW migration `supabase/migrations/20260430000000_audit_logs.sql` creates `public.audit_logs` exactly per `prep-p4-gobd-audit-scope-research-2026-04-28.md§2`: columns `id uuid pk default gen_random_uuid()`, `tenant_id uuid not null references tenants(id) on delete restrict`, `invoice_id uuid references invoices(id) on delete restrict` (nullable to allow tenant-level events later), `actor_user_id uuid not null references auth.users(id) on delete restrict`, `event_type text not null`, `field_name text`, `old_value text`, `new_value text`, `metadata jsonb not null default '{}'::jsonb`, `created_at timestamptz not null default now()`. A CHECK constraint `audit_logs_event_type_chk` enforces the closed taxonomy: `event_type in ('upload','field_edit','categorize','approve','flag','undo_approve','undo_flag','export_datev','hash_verify_mismatch')`. RLS is enabled with **only** two policies — `audit_logs_insert_own` (`with check (tenant_id = public.my_tenant_id())`) and `audit_logs_select_own` (`using (tenant_id = public.my_tenant_id())`). Crucially, **no UPDATE or DELETE policy is created** — by Postgres default, absence of a policy = denial for that operation under RLS, so authenticated users cannot mutate or delete rows even with explicit GRANTs (mirroring the storage-bucket immutability pattern from `20260417000000_storage_invoices_bucket.sql`). GRANTs are `select, insert` only on the table to `authenticated` (no `update`, no `delete` — column-grant discipline from Story 1.5/2.1/4.1). Three indexes for query performance at 5M-row scale (NFR15): `(tenant_id, created_at desc)` for SessionSummary day-window queries; `(tenant_id, invoice_id, created_at desc)` for per-invoice audit history reads; `(tenant_id, event_type, created_at desc)` for Story 4.3 audit-export filtering. Header comment documents the GoBD legal basis (§§238–241 HGB, GoBD Tz. 14/64–67/100–107) so the Verfahrensdokumentation generator (Epic 7) can cite it.

2. **`logAuditEvent` helper + audit-insert wiring across the 7 mutating Server Actions (FR22, AC-1, AC-2, GoBD §239 Abs. 3 HGB)** — A NEW internal helper `logAuditEvent(supabase, params): Promise<void>` lives at the top of `apps/web/app/actions/invoices.ts` (NOT exported, NOT a `"use server"` function — it is a private utility called from inside Server Actions). Signature: `{ tenantId: string; invoiceId: string | null; actorUserId: string; eventType: AuditEventType; fieldName?: string | null; oldValue?: string | null; newValue?: string | null; metadata?: Record<string, unknown> }`. Behavior: serializes `metadata` to JSONB, calls `supabase.from("audit_logs").insert({ … })`, on error logs `[invoices:audit]` + `Sentry.captureException(err, { tags: { module: "gobd", action: "audit" }, extra: { eventType, invoiceId } })` and **returns without throwing** — audit-insert failure is non-fatal (the user's primary mutation already landed), matching the existing `invoice_field_corrections` pattern from Story 3.2 (`invoices.ts:585-600`). The helper is then called from the success path of each of the 7 mutating actions: `uploadInvoice` (event: `upload`, metadata: `{ file_type, original_filename, size_bytes, sha256 }`), `correctInvoiceField` (event: `field_edit`, fieldName/oldValue/newValue captured per field — `oldValue` and `newValue` are JSON-stringified scalars/objects to fit `text` columns; metadata: `{ corrected_to_ai, supplier_name, confidence_at_edit }`), `updateInvoiceSKR` (event: `categorize`, fieldName: `skr_code`, old/new: previous and new SKR codes; metadata: `{ supplier_name, bu_schluessel }`), `categorizeInvoice` (event: `categorize`, fieldName: `skr_code`, old: `null` / new: AI-suggested code; metadata: `{ confidence, source: "ai", supplier_name, bu_schluessel }`), `approveInvoice` (event: `approve`, metadata: `{ approval_method, previous_status: row.status }`), `flagInvoice` (event: `flag`, metadata: `{ approval_method: method, previous_status: "ready" }`), `undoInvoiceAction` (event: `undo_approve` if `expectedCurrentStatus === "ready"` else `undo_flag`, metadata: `{ restored_status: snapshot.status, expected_current_status: expectedCurrentStatus }`). All inserts use the existing `tenantId` and `user.id` already resolved at the top of each action — no new auth lookups. **`hash_verify_mismatch`** is also wired: `verifyInvoiceArchive` (Story 4.1) calls `logAuditEvent` with event `hash_verify_mismatch` and `metadata: { stored_hash: row.sha256 }` directly before the existing Sentry capture on the mismatch branch — durable record alongside the existing in-viewer amber badge. **`export_datev` is intentionally NOT wired in this story** — Epic 5's DATEV export Route Handler does not exist yet; Story 5 will add the call when the export action is implemented.

3. **`SessionSummary errorCount` wire-up + Story 3.4 deferred fix (AC-5)** — `apps/web/app/(app)/dashboard/page.tsx:279` currently passes `errorCount={0}` hardcoded. Replace with a NEW SELECT against `audit_logs` filtered by `event_type = 'field_edit'` and `created_at >= $sessionStartMs` (UTC ISO conversion). The query lives in the dashboard server component directly above the existing `<SessionSummary>` mount: `const { data: errorRows } = await supabase.from("audit_logs").select("id", { count: "exact", head: true }).eq("event_type", "field_edit").gte("created_at", new Date(sessionStartMs).toISOString());` — `head: true` returns count only (zero-row payload) for cheap counting. Tenant filtering is enforced by RLS (no explicit `.eq("tenant_id", tenantId)` needed since `audit_logs_select_own` policy already gates on `my_tenant_id()`, but ADD `.eq("tenant_id", tenantId)` for defense-in-depth per Epic 3 retro A1 — same discipline as Story 3.4/4.1). On error: `console.error("[dashboard:audit-count]", err)` + `Sentry.captureException` + fallback to `errorCount = 0` (graceful degradation; SessionSummary still renders, just shows the "Perfect" variant instead of "WithCorrections"). The `sessionStartMs` calculation already exists at `dashboard/page.tsx:264` and is unchanged. The dashboard's existing parallel-fetch pattern (`Promise.all([rowsRes, statsRes, stageRes, ...])`) absorbs the new query without latency penalty. **`SessionSummary` component itself is NOT modified** — the prop signature already accepts `errorCount: number` (Story 3.5 shipped this); only the page-level data source changes. This story's delivery directly closes the deferred Story 3.4 finding ("SessionSummary errorCount hardcoded") referenced in `epic-3-retro-2026-04-28.md`.

**Deferred to Story 4.3:** Audit export endpoint (`audit_export` → ZIP with audit_logs CSV/XLSX + invoice metadata + sha256 per row), batch hash verification across the archive, fiscal-year filtering. Story 4.2 ships the data model + write-side; Story 4.3 ships the read/export side.
**Deferred to Story 5.x (DATEV export):** `event_type = 'export_datev'` insert from the export Route Handler. The CHECK constraint already permits this value so no migration change is needed when Story 5 ships.
**Deferred (out of scope, non-GoBD):** `view` event logging (per `prep-p4-gobd-audit-scope-research-2026-04-28.md§3` — GoBD does not require document-view logging; write-heavy with limited compliance value; revisit during a future security/observability pass).
**Deferred (atomicity follow-up):** Postgres SECURITY DEFINER functions (`log_and_approve()`, `log_and_field_edit()`) for transactional audit+mutation. The simpler sequential-insert + Sentry-fallback pattern is shipped first because (a) it matches the existing `invoice_field_corrections` pattern from Story 3.2 (consistency), (b) audit-insert failure is observable in Sentry (operational signal), and (c) the user's primary mutation always lands. If real audit misses are observed in production Sentry, escalate to RPC migration — track in `deferred-work.md` once Story 4.2 lands.
**Deferred (PII & retention):** Audit log retention policy (10-year default by absence of DELETE path — same posture as `invoices` per Story 4.1 migration comment); PII redaction in `metadata.supplier_name` (legal review pending — supplier names are accounting-relevant per §238 HGB so are kept verbatim until the legal team flags otherwise).

---

## Acceptance Criteria

1. **Given** the migration `20260430000000_audit_logs.sql` is applied
   **When** `\d public.audit_logs` is inspected
   **Then** the table has all 10 columns from `prep-p4-gobd-audit-scope-research-2026-04-28.md§2` with the documented types and defaults
   **And** the CHECK constraint `audit_logs_event_type_chk` enforces `event_type in ('upload','field_edit','categorize','approve','flag','undo_approve','undo_flag','export_datev','hash_verify_mismatch')`
   **And** RLS is enabled with exactly TWO policies: `audit_logs_insert_own` (insert, with check `tenant_id = public.my_tenant_id()`) and `audit_logs_select_own` (select, using `tenant_id = public.my_tenant_id()`) — verified by `select policyname, cmd from pg_policies where tablename = 'audit_logs'` returning exactly those two rows
   **And** GRANTs to `authenticated` are `select, insert` only — verified by `\dp public.audit_logs` showing no `UPDATE`/`DELETE` for the role
   **And** indexes exist on `(tenant_id, created_at desc)`, `(tenant_id, invoice_id, created_at desc)`, `(tenant_id, event_type, created_at desc)`
   **And** `pnpm supabase gen types` regenerates `packages/shared/src/types/database.ts` to include `audit_logs` Row/Insert types (with `Insert.id`, `Insert.created_at`, `Insert.metadata` all optional) and **no `Update`** type for `audit_logs` (column-level UPDATE not granted; type-gen reflects this)

2. **Given** an authenticated user as `authenticated` role attempts `update public.audit_logs set event_type='upload' where id = …` or `delete from public.audit_logs where id = …`
   **When** the SQL runs (test executed via `psql` against local Supabase)
   **Then** the operation fails with `permission denied` (no GRANT) OR `new row violates row-level security policy` (no UPDATE/DELETE policy)
   **And** the row remains unchanged in the table (verified by re-SELECT)

3. **Given** an authenticated user uploads a new invoice via `uploadInvoice`
   **When** the action completes successfully
   **Then** exactly ONE row exists in `audit_logs` for this invoice with `event_type = 'upload'`, `actor_user_id = user.id`, `tenant_id = userRow.tenant_id`, `invoice_id = invoiceId`, `metadata` containing `{ file_type, original_filename, size_bytes, sha256 }`
   **And** if the audit insert fails (mocked), `Sentry.captureException` is called with `tags: { module: "gobd", action: "audit" }` and the user-facing return value `{ success: true, data: { invoiceId, filePath } }` is unchanged (audit failure is non-fatal)

4. **Given** an authenticated user edits a field on an invoice via `correctInvoiceField`
   **When** the correction is saved
   **Then** the existing `invoice_field_corrections` row continues to be inserted (Story 3.2 unchanged)
   **AND** a NEW row is inserted in `audit_logs` with `event_type = 'field_edit'`, `field_name = <fieldPath>` (e.g. `gross_total.value`), `old_value = JSON.stringify(previousValue)`, `new_value = JSON.stringify(correctedValue)`, `metadata.corrected_to_ai = isRestoreToAi ?? false`, `metadata.supplier_name = <name|null>`, `metadata.confidence_at_edit = <number|null>`
   **And** the order is: invoice UPDATE → `invoice_field_corrections` INSERT → `audit_logs` INSERT (latter two are independent best-effort writes; either failing logs to Sentry but does not roll back the user's edit)

5. **Given** an authenticated user calls `approveInvoice`, `flagInvoice`, or `undoInvoiceAction`
   **When** the action completes successfully
   **Then** an `audit_logs` row is inserted with the corresponding `event_type` (`approve`, `flag`, `undo_approve` for ready→review undo, `undo_flag` for review→ready undo)
   **And** `metadata.previous_status` and `metadata.approval_method` are populated where applicable (per the wiring matrix in Technical Concern #2)
   **And** if the audit insert fails (mocked), `Sentry.captureException` is called and the user-facing return value (`{ success: true, data: { status: … } }`) is unchanged

6. **Given** `categorizeInvoice` (AI categorization) or `updateInvoiceSKR` (user override) runs successfully
   **When** the SKR code is persisted
   **Then** an `audit_logs` row is inserted with `event_type = 'categorize'`, `field_name = 'skr_code'`, `old_value = <previous code|null>`, `new_value = <new code>`, `metadata.source = "ai"` (categorizeInvoice) or `metadata.source = "user"` (updateInvoiceSKR), and `metadata.bu_schluessel = <number|null>`
   **And** for `updateInvoiceSKR` the existing `categorization_corrections` insert continues to fire (Story 3.3 unchanged) — `audit_logs` is the parallel GoBD-grade record

7. **Given** `verifyInvoiceArchive` (Story 4.1) detects a hash mismatch
   **When** the mismatch branch runs
   **Then** an `audit_logs` row is inserted with `event_type = 'hash_verify_mismatch'`, `invoice_id = invoiceId`, `metadata.stored_hash = row.sha256` BEFORE the existing `Sentry.captureException` call
   **And** the action's return value `{ success: true, data: { status: "mismatch", sha256 } }` is unchanged (Story 4.1 contract preserved)
   **And** if the audit insert itself fails, the catch path falls through to Sentry (the mismatch is still surfaced via Sentry + the in-viewer badge — durable visibility is never lost)

8. **Given** the user is on the dashboard with `sessionStartMs` set to today 00:00 UTC (or any session-start timestamp)
   **When** the dashboard server component renders
   **Then** `errorCount` passed to `<SessionSummary>` equals the count of `audit_logs` rows where `tenant_id = my_tenant_id()` AND `event_type = 'field_edit'` AND `created_at >= new Date(sessionStartMs).toISOString()`
   **And** the SELECT uses `head: true` and `count: "exact"` for a row-less payload
   **And** the SELECT includes `.eq("tenant_id", tenantId)` for defense-in-depth (Epic 3 retro A1 / Epic 4 prep P2 pattern)
   **And** if the SELECT errors, `errorCount = 0` is used as a fallback and the error is sent to Sentry

9. **Given** the Vitest test suite runs (`pnpm test` from repo root)
   **When** all tests complete
   **Then** the following NEW or UPDATED test cases pass:
   - `apps/web/app/actions/invoices.test.ts` — 1 NEW test for `logAuditEvent` happy path; 1 NEW test for `logAuditEvent` Sentry capture on insert failure
   - `apps/web/app/actions/invoices.test.ts` — 7 NEW or UPDATED action-level cases asserting the audit_logs insert payload for: `uploadInvoice` (event:`upload` + metadata sha256/file_type), `correctInvoiceField` (event:`field_edit` + old/new captured), `updateInvoiceSKR` (event:`categorize` + source:user), `categorizeInvoice` (event:`categorize` + source:ai), `approveInvoice` (event:`approve` + previous_status), `flagInvoice` (event:`flag`), `undoInvoiceAction` (event:`undo_approve` for ready→review and `undo_flag` for review→ready)
   - `apps/web/app/actions/invoices.test.ts` — 1 NEW case asserting `verifyInvoiceArchive` mismatch path inserts `event_type:'hash_verify_mismatch'` BEFORE the Sentry capture
   - `apps/web/app/(app)/dashboard/page.test.tsx` (existing or NEW if absent) — 1 case asserting the `audit_logs` count query is wired and `errorCount` reaches `<SessionSummary>` (mock the supabase chain `.select(..., { count: "exact", head: true }).eq("event_type", "field_edit").gte("created_at", …)` returning a count of 3)
   - `apps/web/components/dashboard/session-summary.test.tsx` — no change (component prop contract is unchanged)
   **And** test count baseline: 326 (post-4.1). New target: ≥340 (delta +14 minimum)

10. **Given** the smoke test is executed by GOZE per `smoke-test-format-guide.md`
    **When** all UX Checks and DB Verification queries are run
    **Then** the upload → field-edit → approve → undo → flag flow generates the expected `audit_logs` rows visible in the DB
    **And** the dashboard's "X Korrekturen" line in `<SessionSummary>` reflects the actual count of today's `field_edit` events (verified by editing a field and reloading the dashboard)
    **And** every UX row dev agent cannot run is marked `BLOCKED-BY-ENVIRONMENT` with explicit manual steps for GOZE (per Epic 2 retro A1 — no self-certification)

---

## Tasks / Subtasks

- [x] **Task 1 — Migration: create `audit_logs` table + RLS + indexes (AC: 1, 2)**
  - [x] Create `supabase/migrations/20260430000000_audit_logs.sql`
  - [x] Header comment documents §238–241 HGB, GoBD Tz. 14/64–67/100–107, NFR15 (5M-row scale), and the no-UPDATE/no-DELETE immutability posture (mirrors Story 4.1 migration discipline)
  - [x] `create table public.audit_logs (…)` with all columns per `prep-p4-gobd-audit-scope-research-2026-04-28.md§2`
  - [x] `alter table public.audit_logs add constraint audit_logs_event_type_chk check (event_type in ('upload','field_edit','categorize','approve','flag','undo_approve','undo_flag','export_datev','hash_verify_mismatch'))`
  - [x] `alter table public.audit_logs enable row level security`
  - [x] `create policy audit_logs_insert_own on public.audit_logs for insert to authenticated with check (tenant_id = public.my_tenant_id())`
  - [x] `create policy audit_logs_select_own on public.audit_logs for select to authenticated using (tenant_id = public.my_tenant_id())`
  - [x] **Do NOT** create UPDATE or DELETE policies — absence enforces immutability under RLS
  - [x] `grant select, insert on public.audit_logs to authenticated` — explicitly NO update/delete grants
  - [x] Three indexes: `audit_logs_tenant_created_idx`, `audit_logs_tenant_invoice_created_idx`, `audit_logs_tenant_event_created_idx` (all `(tenant_id, …, created_at desc)` for index-only scans on the most common query patterns)
  - [x] Wrap `add constraint` in `do $$ … exception when duplicate_object then null; end $$` for idempotency (Story 4.1 review patch pattern)
  - [x] Run `pnpm supabase gen types` (BLOCKED-BY-ENVIRONMENT — local Supabase not running; manually updated `packages/shared/src/types/database.ts` per the exact gen output spec: `audit_logs` Row with all 10 columns, Insert with `id?`, `created_at?`, `metadata?`, `Update: { [key in never]: never }` for TypeScript compatibility)

- [x] **Task 2 — `logAuditEvent` helper + `AuditEventType` type (AC: 3, 4, 5, 6, 7)**
  - [x] Add at the top of `apps/web/app/actions/invoices.ts` (near the existing constants): `type AuditEventType = "upload" | "field_edit" | "categorize" | "approve" | "flag" | "undo_approve" | "undo_flag" | "export_datev" | "hash_verify_mismatch";`
  - [x] Add `const AUDIT_LOG = "[invoices:audit]"`
  - [x] Add NEW internal async function `logAuditEvent(supabase, params)` — NOT exported; calls `supabase.from("audit_logs").insert(...)`; on error console.error + Sentry.captureException; never throws
  - [x] Type the params object with optional `fieldName`, `oldValue`, `newValue` (all `string | null`), and `metadata?: Record<string, unknown>` (default `{}`)

- [x] **Task 3 — Wire `logAuditEvent` into `uploadInvoice` (AC: 3)**
  - [x] After the successful insert, BEFORE `revalidatePath("/dashboard")`, call `await logAuditEvent(...)` with `eventType: "upload"`, `metadata: { file_type, original_filename, size_bytes, sha256 }`

- [x] **Task 4 — Wire `logAuditEvent` into `correctInvoiceField` (AC: 4)**
  - [x] After the existing `invoice_field_corrections` insert, call `await logAuditEvent(...)` with `eventType: "field_edit"`, `fieldName`, `oldValue: JSON.stringify(previousValue)`, `newValue: JSON.stringify(correctedValue)`, `metadata: { corrected_to_ai, supplier_name, confidence_at_edit }`
  - [x] Order: invoice UPDATE → `invoice_field_corrections` insert → `audit_logs` insert

- [x] **Task 5 — Wire `logAuditEvent` into `categorizeInvoice` and `updateInvoiceSKR` (AC: 6)**
  - [x] `categorizeInvoice`: log `event_type: "categorize"`, `field_name: "skr_code"`, `old_value: null`, `new_value: skrCode`, `metadata: { source: "ai", confidence, bu_schluessel, supplier_name }`
  - [x] `updateInvoiceSKR`: after `categorization_corrections` insert, log `event_type: "categorize"`, `old_value: row.skr_code ?? null`, `new_value: newSkrCode`, `metadata: { source: "user", bu_schluessel, supplier_name }`

- [x] **Task 6 — Wire `logAuditEvent` into `approveInvoice`, `flagInvoice`, `undoInvoiceAction` (AC: 5)**
  - [x] `approveInvoice`: log `event_type: "approve"`, `metadata: { approval_method: method, previous_status: row.status }`
  - [x] `flagInvoice`: `review → review` early-return does NOT log; `ready → review` success path logs `event_type: "flag"`, `metadata: { approval_method: method, previous_status: "ready" }`
  - [x] `undoInvoiceAction`: log `event_type: expectedCurrentStatus === "ready" ? "undo_approve" : "undo_flag"`, `metadata: { restored_status, expected_current_status, approval_method }`

- [x] **Task 7 — Wire `logAuditEvent` into `verifyInvoiceArchive` mismatch branch (AC: 7)**
  - [x] IMMEDIATELY BEFORE the existing `Sentry.captureException` in the mismatch branch, call `await logAuditEvent(...)` with `eventType: "hash_verify_mismatch"`, `metadata: { stored_hash: row.sha256 }`
  - [x] `verified` and `legacy` branches do NOT log

- [x] **Task 8 — `SessionSummary errorCount` wire-up in dashboard page (AC: 8)**
  - [x] Added `audit_logs` count query after `sessionStartMs` in `apps/web/app/(app)/dashboard/page.tsx`
  - [x] Query uses `.eq("tenant_id", tenantId).eq("event_type", "field_edit").gte("created_at", ...)` with `{ count: "exact", head: true }`
  - [x] On error: Sentry capture + fallback to `errorCount = 0`
  - [x] Replaced `errorCount={0}` with `errorCount={errorCount}`

- [x] **Task 9 — Tests (AC: 9)**
  - [x] Extended `vi.mock("@/lib/supabase/server")` to handle `from("audit_logs").insert(...)` via `auditInsertMock`
  - [x] Added 1 unit test for `logAuditEvent` success (upload event payload shape + metadata sha256)
  - [x] Added 1 test for `logAuditEvent` failure (Sentry.captureException with `tags: { module: "gobd", action: "audit" }`)
  - [x] Added action-level cases for all 7 mutating actions + verifyInvoiceArchive mismatch
  - [x] Verified `verified` and `legacy` paths do NOT call `auditInsertMock` (negative assertions)
  - [x] Added `apps/web/app/(app)/dashboard/page.test.tsx` asserting audit-count query is wired
  - [x] Test count: 340 (baseline 326, delta +14) ✓

- [x] **Task 10 — Smoke test + tenant-isolation checklist (AC: 10)**
  - [x] Smoke test section added to Completion Notes below
  - [x] Tenant-isolation checklist: all INSERTs use resolved `tenantId`; dashboard SELECT uses `.eq("tenant_id", tenantId)` defense-in-depth

---

## Dev Notes

### Scope Fences (from epics + prep-p4 + Story 4.1 deferred items)

- **Audit export (CSV/XLSX/JSON for Betriebsprüfer)** → Story 4.3. This story ships the data model + write side; 4.3 ships the read/export side (GoBD Tz. 100–107 Z2/Z3 access).
- **DATEV export logging (`event_type: 'export_datev'`)** → Story 5.x. The CHECK constraint already permits the value so no migration change is needed when Story 5 ships; just wire `logAuditEvent` from the export Route Handler.
- **`view` event logging** → out of scope per `prep-p4-gobd-audit-scope-research-2026-04-28.md§3`. GoBD does not require document-view logging; write-heavy with limited compliance value. Revisit during a future security/observability pass.
- **SECURITY DEFINER atomic functions (`log_and_approve()`, `log_and_field_edit()`)** → deferred. Sequential-insert + Sentry-fallback matches the existing `invoice_field_corrections` pattern from Story 3.2 and is observable in Sentry. Escalate to RPC migration only if real audit misses are observed in production.
- **PII redaction in `metadata`** → deferred (legal review pending). Supplier names are accounting-relevant per §238 HGB and are kept verbatim; if legal flags otherwise, add a redaction layer.
- **No new top-level dependencies.** Same discipline as Epic 3 + Story 4.1. The audit insert is plain `supabase.from("audit_logs").insert(...)` — no new pgsql function, no new package.

### Audit Insert Discipline (sequential + Sentry fallback)

```ts
// At top of apps/web/app/actions/invoices.ts (private helper):
const AUDIT_LOG = "[invoices:audit]";

type AuditEventType =
  | "upload"
  | "field_edit"
  | "categorize"
  | "approve"
  | "flag"
  | "undo_approve"
  | "undo_flag"
  | "export_datev"
  | "hash_verify_mismatch";

async function logAuditEvent(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  params: {
    tenantId: string;
    invoiceId: string | null;
    actorUserId: string;
    eventType: AuditEventType;
    fieldName?: string | null;
    oldValue?: string | null;
    newValue?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("audit_logs").insert({
    tenant_id: params.tenantId,
    invoice_id: params.invoiceId,
    actor_user_id: params.actorUserId,
    event_type: params.eventType,
    field_name: params.fieldName ?? null,
    old_value: params.oldValue ?? null,
    new_value: params.newValue ?? null,
    metadata: params.metadata ?? {},
  });
  if (error) {
    console.error(AUDIT_LOG, "insert-failed", error);
    Sentry.captureException(error, {
      tags: { module: "gobd", action: "audit" },
      extra: { eventType: params.eventType, invoiceId: params.invoiceId },
    });
  }
}
```

This helper is the **only** place that writes to `audit_logs` from the web app. Every callsite is a sequential `await logAuditEvent(...)` after the primary mutation's success branch, before `revalidatePath`. Failure of the audit insert is non-fatal — the user's action already landed; Sentry surfaces the audit miss as an operational alarm.

### Migration Implementation Sketch

```sql
-- Story 4.2: audit_logs — append-only GoBD audit trail.
--
-- Legal basis (cited so the Verfahrensdokumentation generator (Epic 7) can reference):
--   • §§238-241 HGB — Buchführungspflicht, Vollständigkeit, Unveränderbarkeit
--   • GoBD Tz. 14 — Nachvollziehbarkeit (every step traceable)
--   • GoBD Tz. 64-67 — Unveränderbarkeit: every change logs old + new value, user, timestamp
--   • GoBD Tz. 100-107 — Maschinelle Auswertbarkeit (machine-readable for §147 AO Z1/Z2/Z3)
--
-- Immutability posture (RLS-level, not just app-level):
--   • RLS enabled with INSERT + SELECT policies only.
--   • NO UPDATE policy → any UPDATE attempt by `authenticated` is denied by RLS.
--   • NO DELETE policy → any DELETE attempt is denied by RLS.
--   • GRANTs are `select, insert` only (column-grant discipline from Story 1.5/2.1/4.1).
--   • Only `service_role` could mutate, and `service_role` does NOT exist in this codebase.
--
-- Retention: 10-year retention enforced by absence of any DELETE path (mirrors invoices
-- and storage.objects pattern from Story 4.1).
--
-- Scale (NFR15): supports 5M document records via three composite indexes covering the
-- three common query patterns (dashboard day-window, per-invoice history, event-filter).

create table public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete restrict,
  invoice_id      uuid references public.invoices(id) on delete restrict,
  actor_user_id   uuid not null references auth.users(id) on delete restrict,
  event_type      text not null,
  field_name      text,
  old_value       text,
  new_value       text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

do $$
begin
  alter table public.audit_logs
    add constraint audit_logs_event_type_chk
    check (event_type in (
      'upload','field_edit','categorize','approve','flag',
      'undo_approve','undo_flag','export_datev','hash_verify_mismatch'
    ));
exception
  when duplicate_object then null;
end $$;

alter table public.audit_logs enable row level security;

create policy "audit_logs_insert_own"
  on public.audit_logs for insert to authenticated
  with check (tenant_id = public.my_tenant_id());

create policy "audit_logs_select_own"
  on public.audit_logs for select to authenticated
  using (tenant_id = public.my_tenant_id());

-- Intentionally NO UPDATE policy and NO DELETE policy.

grant select, insert on public.audit_logs to authenticated;
-- Intentionally NO `grant update` and NO `grant delete`.

create index audit_logs_tenant_created_idx
  on public.audit_logs (tenant_id, created_at desc);

create index audit_logs_tenant_invoice_created_idx
  on public.audit_logs (tenant_id, invoice_id, created_at desc);

create index audit_logs_tenant_event_created_idx
  on public.audit_logs (tenant_id, event_type, created_at desc);

comment on table public.audit_logs is
  'GoBD §239 Abs. 3 HGB immutable audit trail. Append-only via RLS posture (no UPDATE/DELETE policies). 10-year retention by absence of deletion path.';
```

### Existing files to read BEFORE coding

Per Story 3.x / 4.1 review discipline (read every UPDATE file completely):

- `apps/web/app/actions/invoices.ts` — full file. Understand: `uploadInvoice` (lines 53-194), `correctInvoiceField` (lines 447-620 — note the existing `invoice_field_corrections` insert at 585-600 as the audit-insert template), `categorizeInvoice` (lines 799-960), `approveInvoice`/`flagInvoice`/`undoInvoiceAction` (lines 996-1358), `updateInvoiceSKR` (lines 1360-1522 — note the existing `categorization_corrections` insert at 1485-1501), `verifyInvoiceArchive` (Story 4.1 — find the mismatch branch in the current file). Mirror the existing `NEXT_REDIRECT` digest re-throw, Sentry capture pattern, and `LOG_PREFIX` discipline.
- `apps/web/app/actions/invoices.test.ts` — existing test setup, fake supabase client structure, how `auth.getUser` and `from("users").select("tenant_id")` are mocked, the existing `correctionInsertMock` pattern (used for `invoice_field_corrections` in Story 3.2 tests). The new `auditInsertMock` follows the same shape.
- `apps/web/app/(app)/dashboard/page.tsx` — full page, especially lines 1-280. Understand the existing parallel-fetch pattern (`Promise.all([…])`), how `tenantId` is resolved, how `sessionStartMs` is computed at line 264, the current `<SessionSummary errorCount={0}>` mount at line 279.
- `apps/web/components/dashboard/session-summary.tsx` — confirm the `errorCount: number` prop is unchanged. **Do not modify the component** — only the data source changes.
- `apps/web/components/dashboard/session-summary.test.tsx` — confirm existing tests still pass with no component changes.
- `supabase/migrations/20260424000000_invoice_field_corrections.sql` — closest precedent. RLS policy pattern, GRANT discipline (only `select, insert`), `my_tenant_id()` usage. Mirror this for `audit_logs`.
- `supabase/migrations/20260421000000_categorization_corrections.sql` — second precedent. Same append-only pattern.
- `supabase/migrations/20260415000000_fix_rls_recursion.sql` — defines `public.my_tenant_id()` SECURITY DEFINER helper. Reuse — do not redefine.
- `supabase/migrations/20260417100000_invoices_table.sql` — column-grant discipline reference (`authenticated` only gets `UPDATE (status, updated_at)`). For `audit_logs`, even `UPDATE` is absent entirely.
- `supabase/migrations/20260429000000_invoice_sha256.sql` (Story 4.1) — header-comment template for GoBD compliance posture documentation.
- `packages/shared/src/types/database.ts` — current `invoices` Row/Insert/Update shapes (lines 133-205). After migration + `pnpm supabase gen types`, `audit_logs` should land cleanly with no Update type generated (since no UPDATE grant exists).
- `apps/web/AGENTS.md` — "This is NOT the Next.js you know." Read `node_modules/next/dist/docs/` before writing client components / Server Actions / route handlers.
- `_bmad-output/implementation-artifacts/prep-p4-gobd-audit-scope-research-2026-04-28.md` — full prep research; this story implements §2 (schema), §3 (event taxonomy), §4 (Server Action wiring), §6 (SessionSummary fix), §8 (task outline), §9 (AC implications).
- `_bmad-output/implementation-artifacts/4-1-immutable-document-storage-and-sha-256-hashing.md` — `verifyInvoiceArchive` mismatch path is where the new `event_type: 'hash_verify_mismatch'` insert lands. Read the action's mismatch branch to confirm `user.id` is in scope at that point.
- `_bmad-output/implementation-artifacts/smoke-test-format-guide.md` — verbatim format for the smoke test section. Do not deviate.
- `_bmad-output/implementation-artifacts/epic-3-retro-2026-04-28.md` — A1 tenant isolation checklist (must add to every story); references the deferred `<SessionSummary errorCount={0}>` hardcode that this story fixes.

### Previous Story Intelligence (from 4.1 review patches and Story 3.x)

- **Smoke test format is mandatory and strict** — Epic 2 retro A1 + Story 3.1 self-certification regression. UX rows the dev agent cannot run MUST be `BLOCKED-BY-ENVIRONMENT` with explicit manual steps. No "all checks passed."
- **Tenant isolation defense-in-depth on row SELECTs** — Epic 3 retro A1 named this as a checklist item from 4.1 onwards. The dashboard's audit-count SELECT must use `.eq("tenant_id", tenantId)` even though RLS already filters.
- **Sentry capture on every error path** — Epic 2 retro A2 carried into Epic 3. Every catch block + audit-insert error path calls `Sentry.captureException` with `tags: { module: "gobd", action: "audit" }` (or `"audit_count"` for the dashboard query).
- **`NEXT_REDIRECT` digest re-throw in catch blocks** — pre-existing pattern across all Server Actions. The `logAuditEvent` helper does NOT need this (it never throws), but every action that calls it already has the pattern in its outer try/catch.
- **Sequential supabase calls + Sentry fallback** — pattern shipped in Story 3.2 (`invoice_field_corrections`) and 3.3 (`categorization_corrections`). Story 4.2 extends the same discipline to a third audit table.
- **No new top-level deps** — Epic 3 + 4.1 ended with no `framer-motion`, `sonner`, etc. Continue.
- **Migration `add constraint` must be idempotent** — Story 4.1 review patch lesson: wrap in `do $$ … exception when duplicate_object then null; end $$`.
- **Type regen quirk** — `pnpm supabase gen types` requires local Supabase running. If BLOCKED-BY-ENVIRONMENT, manually update `packages/shared/src/types/database.ts` per the documented gen output spec.
- **Test count baseline:** 326 (post-4.1). New target: ≥340 (delta +14 minimum).
- **Done = smoke test pass** — post-done bug fixes are GOZE's call (blocker → immediate; improvement → `deferred-work.md`). Do not gold-plate.

### Why Sequential Inserts (not RPC SECURITY DEFINER for atomicity)

The `prep-p4` research recommends a `SECURITY DEFINER` RPC for `approve` and `field_edit` to satisfy §239 Abs. 3 atomicity. For Story 4.2 we ship the **simpler sequential pattern** because:

1. **Pattern consistency:** Story 3.2 (`invoice_field_corrections`) and Story 3.3 (`categorization_corrections`) already use sequential-insert + Sentry fallback. A third pattern would create cognitive load.
2. **Operational visibility:** Audit-insert failures surface in Sentry as a hard alarm. The user's primary mutation always lands. The "audit miss" window is observable, not hidden.
3. **Implementation simplicity:** No new pgsql function, no new test path, no `(supabase as any).rpc(...)` cast risk (Epic 3 retro flagged these casts as type-safety regressions; the prep P1 zod-v4 upgrade resolved one but introduced no new ones).
4. **Escalation path is clear:** If real audit misses are observed in Sentry post-launch, escalate to RPC migration. Track in `deferred-work.md` once 4.2 lands.

This is the operationally pragmatic choice. The RPC pattern remains the canonical answer if compliance authority later requires hard atomicity proof.

### Why `text` for `old_value` / `new_value` (not `jsonb`)

The prep-p4 schema specifies `text` for both columns. Reasoning:

- **Heterogeneous payloads:** `field_edit` may capture a primitive (`gross_total.value`) or a nested object (`line_items[2].vat_rate`); `approve` captures no value; `categorize` captures a string code. `text` accepts any `JSON.stringify(...)` without typing churn at the DB level.
- **`metadata` jsonb already covers structured query needs:** `metadata->>'corrected_to_ai'`, `metadata->>'source'`, etc. are queryable from the dashboard count + future audit export. The `old_value`/`new_value` columns are evidentiary record (read-rarely) — `text` is sufficient.
- **Audit export simplicity (Story 4.3):** CSV/XLSX consumers (Betriebsprüfer tools) handle `text` columns trivially; `jsonb` would require flattening at export time.

If a future requirement needs structured query into `old_value`/`new_value` (e.g. "find all field_edit events where the new value > 1000€"), add a generated column or a `jsonb` view at that point.

### `SessionSummary errorCount` Implementation Sketch

```ts
// In apps/web/app/(app)/dashboard/page.tsx, near the existing sessionStartMs calc:
const sessionStartMs = Date.now(); // (existing line 264 — keep)

// NEW audit-count query (parallel with existing fetches OR sequential just before render):
const { count: errorCount, error: errorCountErr } = await supabase
  .from("audit_logs")
  .select("id", { count: "exact", head: true })
  .eq("tenant_id", tenantId)
  .eq("event_type", "field_edit")
  .gte("created_at", new Date(sessionStartMs).toISOString());

if (errorCountErr) {
  console.error("[dashboard:audit-count]", errorCountErr);
  Sentry.captureException(errorCountErr, {
    tags: { module: "gobd", action: "audit_count" },
  });
}

// Then in the JSX, line 279:
<SessionSummary
  reviewCount={reviewCount}
  readyCount={readyCount}
  invoiceCount={rows.length}
  errorCount={errorCount ?? 0}
  streakWeeks={0}
  sessionStartMs={sessionStartMs}
/>
```

Note: `count: "exact"` + `head: true` returns count without rows — minimal payload, suitable for dashboard hot-path.

### Error Path Audit (Epic 2 retro A2 — carried forward)

For every new code path:
- `logAuditEvent`: never throws; insert error → Sentry + console.error → return void. Caller's primary mutation success is unaffected.
- Each action's audit insert call: sits AFTER `revalidatePath` so the user's mutation persistence is the success criterion; audit is best-effort.
- Dashboard audit-count query: error → fallback `errorCount = 0` → SessionSummary renders the "Perfect" variant. Graceful degradation.
- `verifyInvoiceArchive` mismatch: `audit_logs` insert + `Sentry.captureException` are independent best-effort writes; either failure does not affect the action's `{ status: "mismatch" }` return contract.
- RLS denial on cross-tenant audit query: no error — RLS filters silently. Defense-in-depth `.eq("tenant_id", tenantId)` ensures we never read another tenant's logs.

### Source Tree Touch Points

**NEW:**
- `supabase/migrations/20260430000000_audit_logs.sql`

**MODIFIED:**
- `packages/shared/src/types/database.ts` (regenerated by `pnpm supabase gen types` — do not hand-edit unless Supabase is BLOCKED-BY-ENVIRONMENT)
- `apps/web/app/actions/invoices.ts` (add `AuditEventType` type + `AUDIT_LOG` constant + `logAuditEvent` helper; wire 7 callsites: `uploadInvoice`, `correctInvoiceField`, `categorizeInvoice`, `updateInvoiceSKR`, `approveInvoice`, `flagInvoice`, `undoInvoiceAction`, plus `verifyInvoiceArchive` mismatch branch)
- `apps/web/app/actions/invoices.test.ts` (extend fake client for `audit_logs` insert; ~10 new/updated cases per AC #9)
- `apps/web/app/(app)/dashboard/page.tsx` (add audit-count query; replace `errorCount={0}` with computed value)
- `apps/web/app/(app)/dashboard/page.test.tsx` (NEW or UPDATED — assert audit-count wiring)

**FORBIDDEN:**
- New top-level dependencies. The audit insert is plain Supabase JS client; no new package.
- Modifying `invoice_field_corrections` or `categorization_corrections` migrations or insert callsites. Story 4.2 ADDS a parallel `audit_logs` write — it does NOT replace those tables. They serve different consumers (corrections power the AI learning loop; audit_logs powers GoBD compliance + audit export).
- Adding UPDATE or DELETE policy on `audit_logs` — would break the immutability posture.
- Adding `grant update` or `grant delete` on `audit_logs` to `authenticated` — same.
- Adding a Postgres trigger on `audit_logs` — append-only is enforced by absence of mutation policies, not by triggers (simpler, less code, easier to reason about).
- Wiring `event_type: 'export_datev'` from any code in this story — DATEV export Route Handler does not exist yet; Story 5.x adds the call.
- Wiring `event_type: 'view'` — out of scope per `prep-p4 §3`.
- Modifying `<SessionSummary>` component — only the data source changes; the component prop contract is stable.
- Backfilling pre-existing actions into `audit_logs` from `invoice_field_corrections` or `categorization_corrections` — those tables are the audit record for events that occurred before Story 4.2 shipped; mixing them would corrupt the temporal record. Document this in the migration header.
- Introducing `packages/gobd/src/audit-log.ts` — the architecture document mentions this file but Story 4.2 keeps the audit logic in the Server Action (same rationale as Story 4.1 keeping upload orchestration out of `packages/gobd`). Revisit if Story 4.3 needs batch operations.

### Testing Standards

- Vitest + jsdom (already wired in `apps/web`).
- Mock `@/lib/supabase/server` using the same fake client pattern as existing `invoices.test.ts` cases. The fake `from("audit_logs").insert(...)` chain returns `{ error: null }` by default; expose `auditInsertMock` to spy on payloads (mirror `correctionInsertMock` from Story 3.2 tests).
- Action-level tests assert the exact `audit_logs` insert payload AFTER the primary mutation success: `expect(auditInsertMock).toHaveBeenCalledWith({ tenant_id: TEST_TENANT_ID, invoice_id: TEST_INVOICE_ID, actor_user_id: TEST_USER_ID, event_type: "approve", field_name: null, old_value: null, new_value: null, metadata: { approval_method: "swipe", previous_status: "review" } })`.
- Audit-failure tests: stub `audit_logs.insert` to return `{ error: { message: "…" } }` → assert `Sentry.captureException` called with `tags: { module: "gobd", action: "audit" }` AND the action still returns `{ success: true, … }` (audit failure is non-fatal).
- `verifyInvoiceArchive` order assertion: use `vi.spyOn` ordering or `mock.invocationCallOrder` to confirm `audit_logs` insert fires BEFORE the existing Sentry mismatch capture.
- Dashboard test: mock the supabase chain `from("audit_logs").select("id", { count: "exact", head: true }).eq("event_type", "field_edit").gte("created_at", …)` to return `{ count: 3, error: null }` → assert `<SessionSummary errorCount={3}>` mounts.
- Browser smoke test: standard local Supabase: `psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres'`. Format per `smoke-test-format-guide.md`.

### Project Structure Notes

- Alignment confirmed: `audit_logs` is a NEW table only — no architecture-doc location change. Per `architecture.md:294` the `audit_logs` table is named in the convention example, and per `architecture.md:703` `packages/gobd/src/audit-log.ts` is reserved. Story 4.2 lands the table + write side; the `packages/gobd/src/audit-log.ts` module is intentionally not introduced (same rationale as Story 4.1: keep Server Action concerns in the Server Action; revisit if Story 4.3 needs batch reads from a package). No detected conflicts.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 4 / Story 4.2] — Story statement + ACs (lines 758-788)
- [Source: _bmad-output/implementation-artifacts/prep-p4-gobd-audit-scope-research-2026-04-28.md] — schema (§2), event taxonomy (§3), Server Action integration (§4), atomicity decision (§4 + this story's deviation rationale), `SessionSummary` wire-up (§6), AC implications (§9)
- [Source: _bmad-output/implementation-artifacts/4-1-immutable-document-storage-and-sha-256-hashing.md] — `verifyInvoiceArchive` mismatch branch is the wiring point for `event_type: 'hash_verify_mismatch'`
- [Source: _bmad-output/implementation-artifacts/epic-3-retro-2026-04-28.md§Action Items] — A1 tenant isolation checklist (defense-in-depth `.eq("tenant_id", tenantId)`); deferred `<SessionSummary errorCount={0}>` hardcode that this story closes
- [Source: _bmad-output/implementation-artifacts/smoke-test-format-guide.md] — Smoke test format (mandatory)
- [Source: _bmad-output/planning-artifacts/architecture.md#packages/gobd] — Package layout (lines 696-705); `audit-log.ts` mentioned but intentionally deferred
- [Source: _bmad-output/planning-artifacts/architecture.md#Database conventions] — `snake_case` plural table names (line 294)
- [Source: _bmad-output/planning-artifacts/prd.md#FR22,NFR11,NFR15] — Audit trail FR; ISO 8601 UTC timestamps; 5M-row scale
- [Source: supabase/migrations/20260424000000_invoice_field_corrections.sql] — Closest precedent for append-only audit table (RLS posture, GRANT discipline)
- [Source: supabase/migrations/20260421000000_categorization_corrections.sql] — Second precedent
- [Source: supabase/migrations/20260415000000_fix_rls_recursion.sql] — `public.my_tenant_id()` helper definition (reuse — do not redefine)
- [Source: supabase/migrations/20260429000000_invoice_sha256.sql] — Story 4.1 migration header-comment template for GoBD compliance posture
- [Source: apps/web/app/actions/invoices.ts] — `uploadInvoice` (53), `correctInvoiceField` (447), `categorizeInvoice` (799), `approveInvoice` (996), `flagInvoice` (1107), `undoInvoiceAction` (1221), `updateInvoiceSKR` (1360); existing `invoice_field_corrections` insert (585-600) is the audit-insert template
- [Source: apps/web/app/(app)/dashboard/page.tsx] — `<SessionSummary errorCount={0}>` mount at line 279; `sessionStartMs` calculation at line 264
- [Source: apps/web/components/dashboard/session-summary.tsx] — `errorCount: number` prop (unchanged by this story)
- [Source: apps/web/AGENTS.md] — "This is NOT the Next.js you know." Read `node_modules/next/dist/docs/` first

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- **TypeScript: `Update` key missing → Insert resolves to `never`** — supabase-js `GenericTable` interface requires `Row`, `Insert`, `Update`, `Relationships`. Added `Update: { [key in never]: never }` to `audit_logs` in `database.ts`. Rebuilt shared package via `pnpm --filter @rechnungsai/shared build`.
- **SHA-256 test failure: `result.success` was `false`** — custom supabase mock in that test's `beforeEach` didn't handle `from("audit_logs")`, returning `{}`. `.insert()` was undefined, causing a TypeError caught by the outer try/catch. Fixed by adding `audit_logs` branch to that custom mock.
- **`undo_flag` test: `auditInsertMock` called 0 times** — `snapshot.approved_by: "user-1"` failed `z.guid()` UUID validation, causing early return before audit insert. Fixed by using a valid UUID (`VALID_UUID` constant).
- **TypeScript: `Record<string, unknown>` not assignable to `Json`** — used `// eslint-disable-next-line @typescript-eslint/no-explicit-any` + `(params.metadata ?? {}) as any` to match the existing pattern in `invoices.ts`.

### Completion Notes List

**Implementation Summary (2026-04-30)**

1. **Migration** (`supabase/migrations/20260430000000_audit_logs.sql` — NEW):
   - Append-only `audit_logs` table with 10 columns per `prep-p4` spec.
   - CHECK constraint `audit_logs_event_type_chk` on 9 event types (idempotent `do $$ … exception when duplicate_object`).
   - RLS: INSERT+SELECT policies only (`audit_logs_insert_own`, `audit_logs_select_own`). No UPDATE/DELETE policy — enforces immutability at DB level.
   - GRANTs: `select, insert` to `authenticated` only. No `update`, no `delete`.
   - 3 composite indexes: `(tenant_id, created_at desc)`, `(tenant_id, invoice_id, created_at desc)`, `(tenant_id, event_type, created_at desc)`.

2. **Type update** (`packages/shared/src/types/database.ts` — MODIFIED):
   - Manually added `audit_logs` Row/Insert types (BLOCKED-BY-ENVIRONMENT for `pnpm supabase gen types`).
   - `Update: { [key in never]: never }` included — required by supabase-js `GenericTable` interface so Insert resolves correctly.
   - Rebuilt dist: `pnpm --filter @rechnungsai/shared build`.

3. **`logAuditEvent` helper** (`apps/web/app/actions/invoices.ts` — MODIFIED):
   - Private async helper (NOT exported). Non-fatal: insert error → `console.error` + `Sentry.captureException({ tags: { module: "gobd", action: "audit" } })` → returns void. Never throws.
   - Wired into 8 locations:
     - `uploadInvoice` → `event_type: "upload"`, metadata: `{ file_type, original_filename, size_bytes, sha256 }`
     - `correctInvoiceField` → `event_type: "field_edit"`, `field_name`/`old_value`/`new_value` (JSON.stringify), metadata: `{ corrected_to_ai, supplier_name, confidence_at_edit }`
     - `categorizeInvoice` → `event_type: "categorize"`, `field_name: "skr_code"`, metadata: `{ source: "ai", confidence, bu_schluessel, supplier_name }`
     - `updateInvoiceSKR` → `event_type: "categorize"`, `old_value: row.skr_code`, metadata: `{ source: "user", bu_schluessel, supplier_name }`
     - `approveInvoice` → `event_type: "approve"`, metadata: `{ approval_method, previous_status: row.status }`
     - `flagInvoice` → `event_type: "flag"`, metadata: `{ approval_method, previous_status: "ready" }` (only on `ready → review` path)
     - `undoInvoiceAction` → `event_type: "undo_approve"` or `"undo_flag"`, metadata: `{ restored_status, expected_current_status, approval_method }`
     - `verifyInvoiceArchive` mismatch branch → `event_type: "hash_verify_mismatch"`, metadata: `{ stored_hash: row.sha256 }`, BEFORE existing Sentry capture

4. **Dashboard errorCount fix** (`apps/web/app/(app)/dashboard/page.tsx` — MODIFIED):
   - Replaced hardcoded `errorCount={0}` with live `audit_logs` count query: `.select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("event_type", "field_edit").gte("created_at", ...)`. Closes the deferred Story 3.4 finding.

5. **Tests** (340 total; baseline 326; delta +14):
   - `invoices.test.ts` — extended with `auditInsertMock`, 2 `logAuditEvent` unit tests, 8 action-level audit payload assertions, negative assertions for non-logging paths (verified/legacy branches of `verifyInvoiceArchive`), mismatch call-order test (audit insert BEFORE Sentry capture).
   - `dashboard/page.test.tsx` (NEW) — asserts `audit_logs` count query is wired; `auditCountMock` called exactly once.

**Smoke Test (AC-10)**

| # | Check | Status | Steps |
|---|-------|--------|-------|
| 1 | `audit_logs` table exists with correct schema | DONE | `psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres' -c "\d public.audit_logs"` — verify 10 columns, CHECK constraint, RLS enabled |
| 2 | Only INSERT+SELECT policies exist (no UPDATE/DELETE) | DONE | `SELECT policyname, cmd FROM pg_policies WHERE tablename = 'audit_logs';` — must return exactly 2 rows |
| 3 | GRANTs are select+insert only | DONE | `\dp public.audit_logs` — authenticated role must show no UPDATE/DELETE |
| 4 | Upload an invoice → audit row created | DONE | Upload invoice via UI; `SELECT event_type, metadata FROM audit_logs WHERE event_type = 'upload' ORDER BY created_at DESC LIMIT 1;` — must return 1 row |
| 5 | Edit a field → `field_edit` row created | DONE | Edit any invoice field; query `audit_logs WHERE event_type = 'field_edit'` — verify `field_name`, `old_value`, `new_value` populated |
| 6 | Approve invoice → `approve` row | DONE | Approve invoice via swipe/button; query `audit_logs WHERE event_type = 'approve'` — verify `metadata.approval_method` |
| 7 | Undo approve → `undo_approve` row | DONE | Undo approval; query `audit_logs WHERE event_type = 'undo_approve'` |
| 8 | Dashboard SessionSummary shows correction count | DONE | Edit a field, reload dashboard — "X Korrekturen" in SessionSummary should reflect count > 0 |
| 9 | Authenticated user cannot UPDATE or DELETE rows | FAIL | `UPDATE public.audit_logs SET event_type='upload' WHERE id = (SELECT id FROM audit_logs LIMIT 1);` — must fail with permission denied |

Smoke-test issues:
- supabase local db browser'da(http://localhost:54323/project/default/editor/18764?schema=public&sort=created_at%3Aasc) aciyorum ve 'audit_logs' icerisindeki herhangi bir satiri ve icerigi manuel olarak el ile DELETE/UPDATE edebiliyorum bu normal mi?

**Tenant Isolation Checklist (Epic 3 retro A1 / Epic 4 prep P2)**
- All `logAuditEvent` calls pass `tenantId` resolved at top of each action — confirmed ✓
- Dashboard audit-count SELECT includes `.eq("tenant_id", tenantId)` defense-in-depth — confirmed ✓
- RLS policies use `public.my_tenant_id()` SECURITY DEFINER — confirmed ✓

### File List

- `supabase/migrations/20260430000000_audit_logs.sql` (NEW)
- `packages/shared/src/types/database.ts` (MODIFIED)
- `apps/web/app/actions/invoices.ts` (MODIFIED)
- `apps/web/app/actions/invoices.test.ts` (MODIFIED)
- `apps/web/app/(app)/dashboard/page.tsx` (MODIFIED)
- `apps/web/app/(app)/dashboard/page.test.tsx` (NEW)

## Change Log

- 2026-04-30: Story 4.2 implementation complete — audit trail and action logging delivered; status → review
