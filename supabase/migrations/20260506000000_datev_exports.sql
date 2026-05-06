-- Migration: datev_exports
-- Story 5.3 — short-lived storage for prepared DATEV CSV exports.
-- The Server Action `prepareDatevExport` builds the CSV via @rechnungsai/datev,
-- inserts a row here with `expires_at = now() + interval '1 hour'`, then the
-- Route Handler `/api/export/datev/[exportId]` streams `csv` back to the user.
-- See 5-3 ACs #11 / #15 / #16 for the prepare→download split rationale.
--
-- Smoke queries to verify this migration (run after supabase db reset):
--   1. Positive insert — should succeed (run as service_role or post-auth):
--      insert into public.datev_exports
--        (tenant_id, created_by, csv, row_count, skipped_count, date_from, date_to, expires_at)
--      values (
--        '<your_tenant_id>', '<your_user_id>',
--        E'\xEF\xBB\xBF"EXTF";"700";...', 1, 0, '20260501', '20260506', now() + interval '1 hour'
--      ) returning id, expires_at;
--   2. RLS rejection (cross-tenant select) — should return 0 rows:
--      set local role authenticated;
--      select set_config('request.jwt.claims', json_build_object('sub','<other_tenant_user_id>')::text, true);
--      select id from public.datev_exports;  -- 0 rows for other tenant
--   3. Expiry sanity — past expires_at filtered out by handler:
--      select id from public.datev_exports where expires_at < now();
--
-- Forward-only — no down migration; cleanup of expired rows is a future concern
-- (Epic 8 may add a cron). Storage cost is bounded by the 1-hour TTL.

-- ========== Table ==========
create table if not exists public.datev_exports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  csv text not null,
  row_count integer not null check (row_count > 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  date_from text not null,
  date_to text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- ========== Indexes ==========
create index if not exists datev_exports_tenant_created_at_idx
  on public.datev_exports (tenant_id, created_at desc);

-- ========== RLS ==========
alter table public.datev_exports enable row level security;

drop policy if exists datev_exports_tenant_select on public.datev_exports;
create policy datev_exports_tenant_select on public.datev_exports
  for select to authenticated
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

drop policy if exists datev_exports_tenant_insert on public.datev_exports;
create policy datev_exports_tenant_insert on public.datev_exports
  for insert to authenticated
  with check (
    tenant_id = (select tenant_id from public.users where id = auth.uid())
    and created_by = auth.uid()
  );
