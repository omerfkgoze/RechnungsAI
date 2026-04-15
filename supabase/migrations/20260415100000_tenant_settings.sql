-- Migration: tenant_settings
-- Extends public.tenants with columns required by FR38 (DATEV config) and FR16 (company details).
--
-- Smoke queries to verify this migration (run after supabase db reset):
--   1. Invalid tax_id → should fail with 23514:
--      update public.tenants set tax_id = 'XX123' where id = '<your_tenant_id>';
--   2. Invalid datev_berater_nr → should fail with 23514:
--      update public.tenants set datev_berater_nr = 'abc' where id = '<your_tenant_id>';
--   3. updated_at write blocked by grant exclusion (test via authenticated role):
--      grant usage on schema public to authenticated;  -- already done
--      set local role authenticated; update public.tenants set updated_at = now();
--      -- Expected: ERROR 42501 insufficient_privilege
--
-- Note: `updated_at` and `id` remain excluded from the column-level UPDATE grant.
-- The `tenants_set_updated_at` trigger owns `updated_at`; clients must never set it directly.

-- ========== New columns ==========
alter table public.tenants
  add column if not exists company_address text null,
  add column if not exists tax_id text null,
  add column if not exists datev_berater_nr text null,
  add column if not exists datev_mandanten_nr text null,
  add column if not exists datev_sachkontenlaenge smallint not null default 4,
  add column if not exists datev_fiscal_year_start smallint not null default 1;

-- ========== Check constraints ==========
alter table public.tenants
  add constraint tenants_tax_id_format
    check (tax_id is null or tax_id ~ '^DE[0-9]{9}$');

alter table public.tenants
  add constraint tenants_datev_berater_nr_format
    check (datev_berater_nr is null or datev_berater_nr ~ '^[0-9]{1,7}$');

alter table public.tenants
  add constraint tenants_datev_mandanten_nr_format
    check (datev_mandanten_nr is null or datev_mandanten_nr ~ '^[0-9]{1,5}$');

alter table public.tenants
  add constraint tenants_datev_sachkontenlaenge_range
    check (datev_sachkontenlaenge between 4 and 8);

alter table public.tenants
  add constraint tenants_datev_fiscal_year_start_range
    check (datev_fiscal_year_start between 1 and 12);

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
  datev_fiscal_year_start
) on public.tenants to authenticated;
