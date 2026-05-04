-- Migration: datev_default_kreditorenkonto
-- Adds the offsetting account column required by Story 5.2 Buchungsstapel rows (AC #1).
--
-- Smoke queries to verify this migration (run after supabase db reset):
--   1. Positive insert — should succeed:
--      update public.tenants set datev_default_kreditorenkonto = '70000' where id = '<your_tenant_id>';
--   2. Check constraint rejection — should fail with 23514:
--      update public.tenants set datev_default_kreditorenkonto = 'abc' where id = '<your_tenant_id>';
--   3. Grant exclusion test — updated_at write still blocked (authenticated role):
--      set local role authenticated; update public.tenants set updated_at = now();
--      -- Expected: ERROR 42501 insufficient_privilege
--
-- Note: `updated_at` and `id` remain excluded from the column-level UPDATE grant.
-- The `tenants_set_updated_at` trigger owns `updated_at`; clients must never set it directly.

-- ========== New column ==========
alter table public.tenants
  add column if not exists datev_default_kreditorenkonto text null;

-- ========== Check constraint ==========
alter table public.tenants
  add constraint tenants_datev_default_kreditorenkonto_format
    check (datev_default_kreditorenkonto is null or datev_default_kreditorenkonto ~ '^[0-9]{5,9}$');

-- ========== Column-level UPDATE grant ==========
-- DROP and re-CREATE because Postgres has no "GRANT UPDATE ADD COLUMN" syntax.
-- `updated_at` and `id` intentionally excluded — server-managed by the
-- `tenants_set_updated_at` trigger and immutable PK respectively.
revoke update on public.tenants from authenticated;
grant update (
  company_name,
  skr_plan,
  steuerberater_name,
  company_address,
  tax_id,
  datev_berater_nr,
  datev_mandanten_nr,
  datev_sachkontenlaenge,
  datev_fiscal_year_start,
  datev_default_kreditorenkonto
) on public.tenants to authenticated;
