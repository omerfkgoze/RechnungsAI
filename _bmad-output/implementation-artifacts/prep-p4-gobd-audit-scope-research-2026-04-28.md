# GoBD §238–241 HGB Audit Scope Research — Story 4.2 Content Mapping

**Date:** 2026-04-28
**For:** Story 4.2 — Audit Trail and Action Logging
**Status:** ✅ Research complete. Story 4.2 is writable.

---

## 1. Legal Basis — §§238–241 HGB + GoBD BMF-Schreiben 2019

| Source | Section | Core Requirement |
|--------|---------|-----------------|
| §238 Abs. 1 HGB | Buchführungspflicht | All business transactions must be documented in a way that allows reconstruction of the business situation |
| §239 Abs. 2 HGB | Vollständigkeit, Richtigkeit, Zeitgerechtheit | Entries must be complete, correct, and timely |
| §239 Abs. 3 HGB | Unveränderbarkeit | No entry may be altered in a way that conceals its original content — changes must be traceable |
| §240 HGB | Inventar | Document inventory must be reconcilable (audit log enables COUNT verification) |
| GoBD Tz. 14 | Nachvollziehbarkeit | Every process step must be traceable from the source document to the final booking entry |
| GoBD Tz. 64–67 | Unveränderbarkeit | Once stored, records cannot be deleted or silently overwritten; changes must log old value, new value, user, and timestamp |
| GoBD Tz. 100–107 | Maschinelle Auswertbarkeit | Data must be machine-readable for tax authority (Betriebsprüfer) access — supports Z1/Z2/Z3 access methods under §147 Abs. 6 AO |
| GoBD Tz. 150–155 | Aufbewahrungspflicht | Accounting-relevant documents: 10-year retention; business letters: 6 years. No deletion during retention period |

**Key principle for Story 4.2:** GoBD Tz. 67 (§239 Abs. 3 HGB) — every field change on an invoice must record the original value. The `invoice_field_corrections` table from Story 3.2 partially fulfills this; Story 4.2 extends it to a unified `audit_logs` table covering all event types.

---

## 2. `audit_logs` Table — Derived Schema

All requirements below flow from GoBD Tz. 14, Tz. 64–67, Tz. 100, and §239 Abs. 3 HGB.

```sql
create table public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete restrict,
  invoice_id      uuid references public.invoices(id) on delete restrict,
  actor_user_id   uuid not null references auth.users(id) on delete restrict,
  event_type      text not null,
  field_name      text,
  old_value       text,
  new_value       text,
  metadata        jsonb default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
```

**RLS policy requirements (GoBD immutability):**
- `INSERT`: authenticated users, own tenant only (`my_tenant_id()`)
- `SELECT`: authenticated users, own tenant only
- `UPDATE`: **forbidden** — no UPDATE RLS policy
- `DELETE`: **forbidden** — no DELETE RLS policy
- `service_role`: full access for admin operations

**Why `on delete restrict` on invoice_id:** GoBD prohibits deletion of Buchungsbelege during the retention period. Restricting the FK reinforces the no-DELETE policy on `invoices` established in Epic 3.

---

## 3. Event Type Taxonomy

| `event_type` | Trigger | `field_name` | `old_value` / `new_value` | Mandatory for GoBD |
|---|---|---|---|---|
| `upload` | `uploadInvoice` Server Action | — | — | ✅ Belegprinzip (Tz. 55–63) |
| `field_edit` | `correctInvoiceField` Server Action | e.g. `gross_total.value` | serialized original → corrected | ✅ §239 Abs. 3 HGB |
| `categorize` | `updateInvoiceSKR` / `categorizeInvoice` | `skr_code` | old code → new code | ✅ Buchungsbelegänderung |
| `approve` | `approveInvoice` Server Action | — | status: `review → ready` | ✅ Freigabeworkflow |
| `flag` | `flagInvoice` Server Action | — | status: `ready → review` | ✅ Korrekturworkflow |
| `undo_approve` / `undo_flag` | `undoInvoiceAction` Server Action | — | status reversal | ✅ Rücknahmeprotokoll |
| `export_datev` | DATEV export Route Handler (Story 5) | — | export filename + row count in metadata | ✅ §147 AO export record |

**Note on `view` events:** GoBD does not strictly require logging document views for tax audit purposes (only mutations). Implementing view logging would be write-heavy with limited compliance value. Deferred to a future security/observability pass. NFR11 ("all document operations logged") can be satisfied by logging upload + all mutations.

---

## 4. Integration with Existing Server Actions

The 6 Server Actions hardened in P2 (`approveInvoice`, `flagInvoice`, `undoInvoiceAction`, `correctInvoiceField`, `updateInvoiceSKR`, `categorizeInvoice`) must each insert an `audit_logs` row atomically. Pattern:

```ts
// After the main UPDATE succeeds:
await supabase.from("audit_logs").insert({
  tenant_id: tenantId,
  invoice_id: invoiceId,
  actor_user_id: userId,
  event_type: "approve",
  metadata: { approval_method: "manual" },
});
```

**Atomicity note:** Supabase JS client does not support multi-statement transactions natively. Options:
1. Sequential insert (current Server Action pattern) — if audit insert fails, log to Sentry and continue (audit miss, not a user-facing failure). Same pattern as `invoice_field_corrections` from Story 3.2.
2. Postgres function (`log_and_approve`) — wraps both UPDATE + INSERT in a single transaction. Preferred for Story 4.2 given GoBD compliance requirement.

**Recommendation:** Use a `SECURITY DEFINER` Postgres function for `approve` and `field_edit` events where atomicity is required by §239 Abs. 3 HGB. Other events (categorize, upload) can use sequential inserts with Sentry fallback.

---

## 5. Design Decision: `approveInvoice` Re-Stamp Behavior

**Current state (post-P2):** `approveInvoice` always updates `approved_at` and `approved_by` on the `invoices` row, even on `ready → ready` (re-approval). The first approver's identity is overwritten.

**GoBD §239 Abs. 3 HGB implication:** The first approval is a Buchungsvorgang (booking event). Overwriting it without a trace violates the Unveränderbarkeit principle.

**Story 4.2 resolution:** The `audit_logs` table becomes the authoritative immutable record of all approvals. The `invoices.approved_by` / `invoices.approved_at` columns serve as "last known state" for quick UI display only — they are not the compliance record.

**Story 4.2 task:** When writing the story, add a task: "Update `approveInvoice` to check `audit_logs WHERE event_type = 'approve' AND invoice_id = ?` before inserting — if first approval, also write `approved_at`/`approved_by` on the invoice row; if re-approval, only insert audit log entry."

---

## 6. `SessionSummary.errorCount` Wire-Up

`apps/web/app/(app)/dashboard/page.tsx` has `<SessionSummary errorCount={0} />` hardcoded.

**Story 4.2 fix:** Query `audit_logs WHERE event_type = 'field_edit' AND created_at >= session_start AND tenant_id = my_tenant_id()` and pass the count. Session start = current day 00:00 UTC (or a sessionStorage timestamp from the session model).

This directly fulfills the deferred item from Story 3.4 review.

---

## 7. GoBD §147 AO / Maschinelle Auswertbarkeit — Story 4.3 Scope

The Betriebsprüfer (tax auditor) access requirement (GoBD Tz. 100–107) requires:
- **Z1:** Direct read access to the system (unlikely in SaaS context)
- **Z2:** Machine-readable export in auditor-provided format (Story 4.3 `audit_export`)
- **Z3:** Data carrier (file download) — Story 4.3 CSV/JSON export

Story 4.3 must produce an audit export that includes:
1. All `audit_logs` rows for the tenant within a date range
2. Invoice metadata (supplier, date, gross amount, SKR code, sha256 hash)
3. Machine-readable format: XLSX or CSV with German headers
4. Sorted chronologically
5. Integrity proof: sha256 from Story 4.1 included per invoice row

---

## 8. Story 4.2 Task Outline (pre-written for story creation)

1. Migration: create `public.audit_logs` table + RLS (INSERT/SELECT for tenant; no UPDATE/DELETE)
2. Migration: create `log_and_approve()` + `log_and_field_edit()` SECURITY DEFINER Postgres functions (atomic audit + operation)
3. Update `uploadInvoice` Server Action: insert `audit_logs` row with `event_type = 'upload'`
4. Update `approveInvoice`, `flagInvoice`, `undoInvoiceAction`: use `log_and_approve()` function (or sequential insert + Sentry fallback)
5. Update `correctInvoiceField`, `updateInvoiceSKR`, `categorizeInvoice`: insert `audit_logs` with `old_value`/`new_value`
6. Wire `SessionSummary errorCount` from `audit_logs WHERE event_type = 'field_edit' AND created_at >= today_start`
7. Smoke tests: approve invoice → verify audit_logs row exists with correct actor + event_type; edit field → verify old_value captured
8. Tests: `log_and_approve` atomicity (DB function), `correctInvoiceField` audit insert, `SessionSummary` error count query

---

## 9. Acceptance Criteria Implications for Story 4.2

| # | AC | GoBD Basis |
|---|----|-----------|
| AC-1 | `audit_logs` row inserted for every invoice mutation within the same Server Action call | §239 Abs. 3 HGB, GoBD Tz. 67 |
| AC-2 | `old_value` captured for all `field_edit` events | §239 Abs. 3 HGB |
| AC-3 | No UPDATE or DELETE possible on `audit_logs` for authenticated role | GoBD Tz. 64 |
| AC-4 | `tenant_id` filter on all `audit_logs` queries | NFR9, RLS enforcement |
| AC-5 | `SessionSummary errorCount` sourced from `audit_logs` (not hardcoded) | Product completeness |
| AC-6 | Re-approval does not overwrite first approver in audit chain | GoBD Tz. 64 |
| AC-7 | Audit log insert failure: Sentry.captureException → continue (non-blocking for user) | Operational resilience |

---

*Research completed 2026-04-28. P4 resolved. Story 4.2 is writable.*
