-- Migration: tenant_steuerberater_email
-- Adds the Steuerberater contact email column required by Epic 6 prep P3.1.
-- Used for:
--   - Story 6.2 mailto: pre-fill (correction email recipient suggestion / DATEV handoff).
--   - Story 5.3 deferred "direct send to Steuerberater" — same column when Epic 8.3 lands.
--
-- Smoke queries to verify this migration (run after supabase db reset):
--   1. Positive insert — should succeed:
--      update public.tenants set steuerberater_email = 'kanzlei@example.de' where id = '<your_tenant_id>';
--   2. Check constraint rejection — should fail with 23514:
--      update public.tenants set steuerberater_email = 'not-an-email' where id = '<your_tenant_id>';
--   3. Grant exclusion test — updated_at write still blocked (authenticated role):
--      set local role authenticated; update public.tenants set updated_at = now();
--      -- Expected: ERROR 42501 insufficient_privilege
--
-- Note: `updated_at` and `id` remain excluded from the column-level UPDATE grant.
-- The `tenants_set_updated_at` trigger owns `updated_at`; clients must never set it directly.
-- Strict email validation lives in the Zod schema; the DB regex is a permissive guard rail.

-- ========== New column ==========
alter table public.tenants
  add column if not exists steuerberater_email text null;

-- ========== Check constraint ==========
alter table public.tenants
  add constraint tenants_steuerberater_email_format
    check (steuerberater_email is null or steuerberater_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- ========== Column-level UPDATE grant ==========
-- DROP and re-CREATE because Postgres has no "GRANT UPDATE ADD COLUMN" syntax.
-- `updated_at` and `id` intentionally excluded — server-managed by the
-- `tenants_set_updated_at` trigger and immutable PK respectively.
revoke update on public.tenants from authenticated;
grant update (
  company_name,
  skr_plan,
  steuerberater_name,
  steuerberater_email,
  company_address,
  tax_id,
  datev_berater_nr,
  datev_mandanten_nr,
  datev_sachkontenlaenge,
  datev_fiscal_year_start,
  datev_default_kreditorenkonto
) on public.tenants to authenticated;
