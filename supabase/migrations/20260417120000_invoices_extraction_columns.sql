-- Story 2.2: Extend `public.invoices` with AI extraction result columns.
--
-- Column rationale:
--   • invoice_data jsonb null — stores the full validated extraction payload
--     (one JSONB blob per invoice, shape defined by `invoiceSchema` in
--     @rechnungsai/shared). Null until extraction succeeds. Per-field
--     `{ value, confidence, reason }` envelope lets Epic 3 render a
--     traffic-light UI without re-running the model.
--   • extracted_at timestamptz null — set when `invoice_data` is first
--     written by a successful extraction. Stays null on failure so Epic 3
--     can distinguish "never extracted" from "extracted once, later edited".
--   • extraction_error text null — German user-facing error from the latest
--     attempt (e.g. "KI-Provider nicht erreichbar."). Cleared on next
--     successful attempt. Epic 3 Story 3.2 will render this in the detail
--     view's "Fehler" section — contract is build-ready now.
--   • extraction_attempts smallint not null default 0 — increments on every
--     `extractInvoice` Server Action call. Feeds Sentry context +
--     Epic 3 observability; NOT a retry limiter (client-side retry is out
--     of scope for this story).
--
-- Grant discipline:
--   Postgres has no `grant update add column` — the column list replaces the
--   existing column-level UPDATE grant as a whole. Story 2.1 granted UPDATE
--   on (status, updated_at); this migration extends that to include the four
--   new extraction columns so Server Actions running as `authenticated` can
--   write them. `tenant_id`, `id`, `file_path`, `file_type`,
--   `original_filename`, `created_at` remain insert-once.
--
--   Existing `invoices_update_own` RLS policy (Story 2.1) still gates writes
--   to tenant members — no new policy needed.

alter table public.invoices
  add column invoice_data jsonb null,
  add column extracted_at timestamptz null,
  add column extraction_error text null,
  add column extraction_attempts smallint not null default 0;

-- Replace the Story 2.1 column-level UPDATE grant with the extended set.
grant update (
  status,
  updated_at,
  invoice_data,
  extracted_at,
  extraction_error,
  extraction_attempts
) on public.invoices to authenticated;
