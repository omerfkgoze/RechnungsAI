-- Story 6.1: EN 16931 Invoice Validation Engine
--
-- Adds the four `validation_*` columns to `public.invoices` that
-- `extractInvoice` / `revalidateInvoice` write to, extends the audit_logs
-- event-type allow-list with three new validation events, and extends the
-- existing column-level UPDATE grant on `public.invoices` to include the new
-- columns.
--
-- Story context:
--   • Spike P4 §4 — validation column shape, single migration, no RPC
--   • AC #14..#19 — column + constraint + index + audit allow-list + grants
--   • D14 (P4 spike) — fold prep-p5 audit allow-list addition into this migration
--     so the rollback unit is one.
--
-- Verification queries (use in smoke test):
--   1) Positive insert:
--        INSERT INTO public.invoices (tenant_id, original_filename, file_path,
--          file_type, status) VALUES (auth.uid()::uuid, 'x.xml', 'p/x.xml',
--          'application/xml', 'captured') RETURNING validation_status, validation_errors;
--      Expected: validation_status='pending', validation_errors='[]'::jsonb.
--   2) Check-constraint rejection (invalid status):
--        UPDATE public.invoices SET validation_status='bogus' WHERE id = $1;
--      Expected: 23514 (check constraint violation).
--   3) Audit event-type rejection (negative — disallowed value):
--        INSERT INTO public.audit_logs (tenant_id, invoice_id, actor_user_id,
--          event_type) VALUES (..., 'bogus_event');
--      Expected: 23514 (audit_logs_event_type_chk).
--   4) RLS rejection (cross-tenant):
--        SET request.jwt.claim.sub = '<other-user>'; UPDATE public.invoices
--          SET validation_status='valid' WHERE id = '<row-owned-by-tenant-A>';
--      Expected: 0 rows affected (RLS rejection).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extend audit_logs_event_type_chk with validation events (folds prep-p5).
-- ─────────────────────────────────────────────────────────────────────────────
-- Mirror byte-for-byte the wrapper from 20260501000000_archive_search_and_export.sql:20-31.
-- The current allow-list (verified 2026-05-11 against the latest migration that
-- touched this constraint, 20260501000000_archive_search_and_export.sql:25-26)
-- is reproduced verbatim and appended with the three new event types.
do $$
begin
  alter table public.audit_logs drop constraint if exists audit_logs_event_type_chk;
  alter table public.audit_logs add constraint audit_logs_event_type_chk check (
    event_type in (
      'upload', 'field_edit', 'categorize', 'approve', 'flag',
      'undo_approve', 'undo_flag', 'export_datev', 'export_audit', 'hash_verify_mismatch',
      'validation_passed', 'validation_failed', 'revalidation_completed'
    )
  );
exception
  when duplicate_object then null;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add four validation columns to public.invoices.
-- ─────────────────────────────────────────────────────────────────────────────
-- Defaults are set so existing rows transition cleanly to 'pending'. AC #18
-- explicitly forbids backfilling via UPDATE in this migration — the column
-- will be set authoritatively the next time each invoice is touched by
-- extractInvoice or revalidateInvoice.
alter table public.invoices
  add column validation_status text not null default 'pending'
    check (validation_status in ('pending','valid','warning','invalid','unsupported','skipped')),
  add column validation_errors jsonb not null default '[]'::jsonb
    check (jsonb_typeof(validation_errors) = 'array'),
  add column validation_rule_set_version text null,
  add column validated_at timestamptz null;

comment on column public.invoices.validation_status is
  'EN 16931 / XRechnung validation status. pending=not yet validated; valid|warning|invalid=package result; unsupported=XML profile not recognized; skipped=non-e-invoice file type.';
comment on column public.invoices.validation_errors is
  'jsonb array of { ruleId, category, severity, citation, message, location? }. Empty for valid|pending|skipped rows.';
comment on column public.invoices.validation_rule_set_version is
  'Identifier of the rule set used to produce validation_errors, e.g. kosit-2.5.0. Lets us detect stale results when the rule set bumps.';
comment on column public.invoices.validated_at is
  'Wall-clock time the row was last validated. NULL when status=pending or skipped.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Partial index for "what needs re-validation when rule set bumps".
-- ─────────────────────────────────────────────────────────────────────────────
-- Partial because pending|unsupported|skipped rows are not candidates for
-- re-validation; excluding them keeps the index small.
create index if not exists invoices_validation_rule_set_idx
  on public.invoices (tenant_id, validation_rule_set_version)
  where validation_status in ('valid','warning','invalid');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Extend column-level UPDATE grant on public.invoices.
-- ─────────────────────────────────────────────────────────────────────────────
-- Postgres has no incremental "GRANT UPDATE ADD COLUMN"; we REVOKE and re-GRANT
-- the full column set established by 20260427000000_invoice_approval_columns.sql
-- plus the four new validation columns. The two generated SMALLINT sort columns
-- (review_priority_key, confidence_sort_key) remain excluded — generated columns
-- cannot be granted. `id`, `tenant_id`, `created_at`, `sha256`, archive search
-- generated columns, and `file_path`/`file_type` are intentionally excluded.
revoke update on public.invoices from authenticated;
grant update (
  status,
  updated_at,
  invoice_data,
  extracted_at,
  extraction_error,
  extraction_attempts,
  skr_code,
  bu_schluessel,
  categorization_confidence,
  approved_at,
  approved_by,
  approval_method,
  validation_status,
  validation_errors,
  validation_rule_set_version,
  validated_at
) on public.invoices to authenticated;
