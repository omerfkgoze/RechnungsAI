-- Migration: verfahrensdokumentation
-- Epic 7 prep task P3 — creates the single-row-per-tenant table for GoBD
-- Verfahrensdokumentation PDFs. Schema fully specified by spike P2 (Decision 4).
-- Hash computation is application-layer only (packages/gobd verdok-hash.ts);
-- this migration owns only the table, trigger, RLS, and audit event type.
--
-- Verification queries (run after supabase db reset in Supabase Studio):
--   1. Positive UPSERT — should insert, then update on second run:
--        insert into public.verfahrensdokumentation
--          (tenant_id, config_hash, pdf_storage_path, generated_by)
--        values (
--          '<your_tenant_id>',
--          'a3f1'||repeat('0', 60),  -- 64-char hex
--          'tenant-uuid/verdok-2026-05-16T00:00:00.000Z.pdf',
--          '<your_user_id>'
--        )
--        on conflict (tenant_id) do update
--          set config_hash = excluded.config_hash,
--              pdf_storage_path = excluded.pdf_storage_path,
--              generated_by = excluded.generated_by
--        returning id, config_hash;
--   2. Duplicate guard — SELECT after two UPSERTs should return 1 row:
--        select count(*) from public.verfahrensdokumentation
--          where tenant_id = '<your_tenant_id>';  -- expect 1
--   3. Cross-tenant SELECT — should return 0 rows for other tenant:
--        set local role authenticated;
--        select set_config('request.jwt.claims',
--          json_build_object('sub','<other_tenant_user_id>')::text, true);
--        select id from public.verfahrensdokumentation;  -- 0 rows
--   4. Bad config_hash — should fail with check-constraint violation:
--        insert into public.verfahrensdokumentation
--          (tenant_id, config_hash, pdf_storage_path)
--        values ('<tenant_id>', 'not-a-hash', 'path');  -- error expected

-- ========== Table ==========
create table if not exists public.verfahrensdokumentation (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null unique references public.tenants(id) on delete cascade,
  config_hash      text        not null check (config_hash ~ '^[0-9a-f]{64}$'),
  pdf_storage_path text        not null,
  generated_at     timestamptz not null default now(),
  generated_by     uuid        references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ========== Trigger ==========
-- Reuse the shared set_updated_at() function (introduced in tenant_settings migration).
drop trigger if exists verdok_set_updated_at on public.verfahrensdokumentation;
create trigger verdok_set_updated_at
  before update on public.verfahrensdokumentation
  for each row execute function public.set_updated_at();

-- ========== RLS ==========
alter table public.verfahrensdokumentation enable row level security;

drop policy if exists verdok_tenant_select on public.verfahrensdokumentation;
create policy verdok_tenant_select on public.verfahrensdokumentation
  for select to authenticated
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

drop policy if exists verdok_tenant_insert on public.verfahrensdokumentation;
create policy verdok_tenant_insert on public.verfahrensdokumentation
  for insert to authenticated
  with check (
    tenant_id = (select tenant_id from public.users where id = auth.uid())
    and generated_by = auth.uid()
  );

-- UPDATE policy required for UPSERT regeneration path (differs from datev_exports which is append-only).
-- with check also locks generated_by to auth.uid() — prevents an authenticated user from
-- reassigning generated_by to an arbitrary UUID during regeneration.
drop policy if exists verdok_tenant_update on public.verfahrensdokumentation;
create policy verdok_tenant_update on public.verfahrensdokumentation
  for update to authenticated
  using  (tenant_id = (select tenant_id from public.users where id = auth.uid()))
  with check (
    tenant_id   = (select tenant_id from public.users where id = auth.uid())
    and generated_by = auth.uid()
  );

-- ========== Audit log event type extension ==========
-- Mirror the wrapper from 20260513000000_invoice_correction_requested.sql.
-- Reproduces the full allow-list verbatim and appends 'verdok_generated'.
do $$
begin
  alter table public.audit_logs drop constraint if exists audit_logs_event_type_chk;
  alter table public.audit_logs add constraint audit_logs_event_type_chk check (
    event_type in (
      'upload', 'field_edit', 'categorize', 'approve', 'flag',
      'undo_approve', 'undo_flag', 'export_datev', 'export_audit', 'hash_verify_mismatch',
      'validation_passed', 'validation_failed', 'revalidation_completed',
      'correction_requested',
      'verdok_generated'
    )
  );
exception
  when duplicate_object then null;
end $$;
