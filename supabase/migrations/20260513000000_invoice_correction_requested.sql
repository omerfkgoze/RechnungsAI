-- Story 6.2: Validation Results Display and Correction Email
--
-- Adds the `correction_requested_at` column to `public.invoices` (set by the
-- new `requestCorrection` Server Action) and extends the audit_logs
-- event-type allow-list with the new `'correction_requested'` event. Single
-- migration / single rollback unit per Story 6.1 D14 precedent.
--
-- Verification queries (use in smoke test):
--   1) Positive update:
--        UPDATE public.invoices SET correction_requested_at = now()
--          WHERE id = $1; RETURNING correction_requested_at;
--      Expected: timestamptz value.
--   2) Audit event-type acceptance:
--        INSERT INTO public.audit_logs (tenant_id, invoice_id, actor_user_id,
--          event_type) VALUES (..., 'correction_requested');
--      Expected: 1 row inserted.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extend audit_logs_event_type_chk with 'correction_requested'.
-- ─────────────────────────────────────────────────────────────────────────────
-- Mirror the wrapper from 20260511000000_invoice_validation.sql:40-52 byte for
-- byte. Reproduces the full allow-list verbatim and appends 'correction_requested'.
do $$
begin
  alter table public.audit_logs drop constraint if exists audit_logs_event_type_chk;
  alter table public.audit_logs add constraint audit_logs_event_type_chk check (
    event_type in (
      'upload', 'field_edit', 'categorize', 'approve', 'flag',
      'undo_approve', 'undo_flag', 'export_datev', 'export_audit', 'hash_verify_mismatch',
      'validation_passed', 'validation_failed', 'revalidation_completed',
      'correction_requested'
    )
  );
exception
  when duplicate_object then null;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add correction_requested_at column.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.invoices
  add column correction_requested_at timestamptz null;

comment on column public.invoices.correction_requested_at is
  'Wall-clock time the user most recently tapped the correction-email button. Idempotent on re-send; overwritten on each request.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Extend column-level UPDATE grant on public.invoices.
-- ─────────────────────────────────────────────────────────────────────────────
-- Mirrors the REVOKE + GRANT pattern from 20260511000000_invoice_validation.sql:96-114.
-- Generated SMALLINT sort columns (review_priority_key, confidence_sort_key) and
-- archive search generated columns remain excluded.
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
  validated_at,
  correction_requested_at
) on public.invoices to authenticated;
