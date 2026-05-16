---
title: 'P3 — verfahrensdokumentation Table Migration'
type: 'chore'
created: '2026-05-16'
status: 'done'
baseline_commit: '7c1c7804440a4c718d3fd0f363fcff40126d8e3e'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 7 stories 7.1 and 7.2 need the `verfahrensdokumentation` table and its TypeScript types. Neither story can be specced until this migration lands and `supabase db reset` passes the P2 spike readiness gate.

**Approach:** Write one migration file (table + `set_updated_at` trigger + 3 RLS policies + `audit_logs_event_type_chk` extension with `verdok_generated`) and patch `database.ts` with the corresponding Row/Insert/Update/Relationships types. Full schema defined by P2 spike — no design decisions required here.

## Boundaries & Constraints

**Always:**
- Follow `datev_exports` precedent: no explicit `GRANT` on the table; RLS policies are the access gate.
- `generated_by` must be `ON DELETE SET NULL` — satisfies Epic 6 A2 (GDPR: user deletion does not cascade to document deletion; row persists under tenant).
- `audit_logs_event_type_chk` constraint must reproduce the **full** current allow-list verbatim (verified from `20260513000000_invoice_correction_requested.sql`) and append only `verdok_generated`. Use the `do $$ begin … exception when duplicate_object then null; end $$;` wrapper pattern.
- `set_updated_at()` trigger function already exists; no need to re-create it.
- `UNIQUE(tenant_id)` on the table — one row per tenant; UPSERT on `tenant_id` conflict is the update path.

**Ask First:** None — P2 spike fully specifies all schema decisions.

**Never:**
- No `pgcrypto`/DB-side hash — hash is computed in application layer (`packages/gobd`).
- No Storage bucket RLS migration — bucket RLS is set via Supabase dashboard or a separate storage migration; out of P3 scope.
- Do not backfill existing data or touch any other table beyond `audit_logs` constraint extension.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First UPSERT | Valid `tenant_id`, 64-char hex `config_hash` | Row inserted; `generated_at = now()` | — |
| Second UPSERT (same tenant) | Same `tenant_id`, new `config_hash` | Existing row updated; no duplicate | ON CONFLICT `tenant_id` replaces |
| Cross-tenant SELECT | User from Tenant B reads table | 0 rows (RLS blocks) | — |
| Bad `config_hash` (non-hex) | `config_hash = 'not-a-hash'` | PG rejects with check violation | — |
| `generated_by` user deleted | Auth user deleted | `generated_by` → NULL; row persists | ON DELETE SET NULL |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20260516000000_verfahrensdokumentation.sql` — new migration: table + trigger + RLS + audit constraint extension
- `packages/shared/src/types/database.ts` — add `verfahrensdokumentation` type block (Row / Insert / Update / Relationships) between `datev_exports` (line 136) and `invoice_field_corrections` (line 183)

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20260516000000_verfahrensdokumentation.sql` -- create with full table DDL, `verdok_set_updated_at` trigger, 3 RLS policies (SELECT / INSERT / UPDATE), and `audit_logs_event_type_chk` extension -- P2 spike Decision 4 is the authoritative source; reproduce its SQL verbatim, correcting only the placeholder `-- existing types --` comment with the actual full list from `20260513000000_invoice_correction_requested.sql`
- [x] `packages/shared/src/types/database.ts` -- insert `verfahrensdokumentation` block between `datev_exports` and `invoice_field_corrections` -- 8 columns: `id`, `tenant_id`, `config_hash`, `pdf_storage_path`, `generated_at`, `generated_by` (`string | null`), `created_at`, `updated_at`; Relationships: `tenant_id` → `tenants` (`isOneToOne: true`), `generated_by` → `users` (`isOneToOne: false`)

**Acceptance Criteria:**
- Given `supabase db reset`, when migration runs, then no SQL errors and `verfahrensdokumentation` table exists with 8 columns
- Given a 64-char hex `config_hash`, when an UPSERT is executed on an existing `tenant_id`, then the row is updated and no duplicate row is created
- Given a non-hex string as `config_hash`, when an INSERT is attempted, then PostgreSQL rejects it with a check-constraint violation
- Given two tenants, when Tenant A's authenticated user reads `verfahrensdokumentation`, then Tenant B's row is not returned (RLS enforced)
- Given an auth user row is deleted, when the corresponding `generated_by` references that user, then the `verfahrensdokumentation` row persists with `generated_by = NULL`
- Given the `audit_logs_event_type_chk` constraint, when `event_type = 'verdok_generated'` is inserted into `audit_logs`, then the insert succeeds; all pre-existing event types (`upload`, `field_edit`, `categorize`, `approve`, `flag`, `undo_approve`, `undo_flag`, `export_datev`, `export_audit`, `hash_verify_mismatch`, `validation_passed`, `validation_failed`, `revalidation_completed`, `correction_requested`) must also still succeed

## Spec Change Log

## Design Notes

**UPDATE policy (differs from `datev_exports`):** `datev_exports` is append-only, so it has no UPDATE policy. `verfahrensdokumentation` uses UPSERT on regeneration — the UPDATE policy is required. Both `using` and `with check` clauses must restrict to the calling user's `tenant_id`.

**Relationship `isOneToOne` flag:** `tenant_id` has `UNIQUE` constraint → `isOneToOne: true` in database.ts Relationships. This differs from `datev_exports` (no unique on `tenant_id` → `isOneToOne: false`).

## Verification

**Commands:**
- `supabase db reset` -- expected: all migrations apply without error; final line confirms reset complete
- Smoke queries from P2 spike readiness gate (run in Supabase Studio SQL editor after reset):
  1. Positive UPSERT → row created
  2. Second UPSERT on same `tenant_id` → row updated (SELECT returns 1 row, not 2)
  3. Cross-tenant SELECT → 0 rows
  4. `config_hash = 'xyz'` INSERT → check-constraint violation error

## Suggested Review Order

**Schema & Check Constraints**

- Single-row-per-tenant UNIQUE + 64-char hex regex guard; no pgcrypto used.
  [`20260516000000_verfahrensdokumentation.sql:36`](../../supabase/migrations/20260516000000_verfahrensdokumentation.sql#L36)

- `audit_logs_event_type_chk` extended with `verdok_generated`; full prior list reproduced verbatim.
  [`20260516000000_verfahrensdokumentation.sql:88`](../../supabase/migrations/20260516000000_verfahrensdokumentation.sql#L88)

**RLS & Security**

- Trigger uses `drop … if exists` guard for idempotency; reuses existing `set_updated_at()`.
  [`20260516000000_verfahrensdokumentation.sql:49`](../../supabase/migrations/20260516000000_verfahrensdokumentation.sql#L49)

- INSERT policy: `generated_by = auth.uid()` prevents NULL-bypass from authenticated role.
  [`20260516000000_verfahrensdokumentation.sql:63`](../../supabase/migrations/20260516000000_verfahrensdokumentation.sql#L63)

- UPDATE policy: `with check` locks both `tenant_id` and `generated_by` to current user; enables UPSERT regeneration path.
  [`20260516000000_verfahrensdokumentation.sql:74`](../../supabase/migrations/20260516000000_verfahrensdokumentation.sql#L74)

- SELECT policy: tenant isolation mirrors `datev_exports` pattern.
  [`20260516000000_verfahrensdokumentation.sql:58`](../../supabase/migrations/20260516000000_verfahrensdokumentation.sql#L58)

**TypeScript Types**

- `verfahrensdokumentation` Row/Insert/Update/Relationships block; `tenant_id` `isOneToOne: true` (UNIQUE).
  [`database.ts:183`](../../packages/shared/src/types/database.ts#L183)
