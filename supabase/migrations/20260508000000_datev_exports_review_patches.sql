-- Story 5.3 review patches (2026-05-08)
-- Bundles atomicity (P1/P2), TTL extension (P11/P16), FK on-delete (P13), and
-- expires_at index (P14) for `datev_exports`.
--
-- Smoke after `supabase db reset`:
--   1. select pg_get_functiondef('public.commit_datev_export'::regproc); -- function exists
--   2. select indexdef from pg_indexes where indexname = 'datev_exports_expires_at_idx';
--   3. \d public.datev_exports  -- expires_at default is now() + interval '24 hours'
--   4. select conname, confdeltype from pg_constraint
--        where conrelid = 'public.datev_exports'::regclass and conname like '%created_by%';
--      -- confdeltype = 'n' (set null)

-- ========== P11 + P16: extend TTL to 24h, default at the DB level ==========
alter table public.datev_exports
  alter column expires_at set default (now() + interval '24 hours');

-- ========== P13: created_by FK becomes nullable + on delete set null ==========
alter table public.datev_exports
  drop constraint if exists datev_exports_created_by_fkey;

alter table public.datev_exports
  alter column created_by drop not null;

alter table public.datev_exports
  add constraint datev_exports_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

-- ========== P14: index expires_at for the future cleanup cron ==========
create index if not exists datev_exports_expires_at_idx
  on public.datev_exports (expires_at);

-- ========== P1 + P2: atomic export commit ==========
-- Inserts the prepared CSV row, flips invoices ready→exported, writes the
-- audit log — all in one transaction. If any included invoice fails to
-- transition (concurrent flow already exported it), the entire commit aborts
-- with errcode P0001 'concurrent_skip', so the caller can show a clear
-- "another export ran in parallel" error without leaving an orphan CSV row.
--
-- Runs as SECURITY INVOKER so RLS policies on datev_exports / invoices /
-- audit_logs continue to apply (defense in depth on top of the explicit
-- tenant filter in the function body).
create or replace function public.commit_datev_export(
  p_csv text,
  p_row_count integer,
  p_skipped_count integer,
  p_date_from text,
  p_date_to text,
  p_invoice_ids uuid[]
)
returns table (export_id uuid, transitioned_count integer)
language plpgsql
security invoker
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_tenant uuid;
  v_export_id uuid;
  v_transitioned uuid[];
  v_count integer;
begin
  if v_user is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select tenant_id into v_tenant from public.users where id = v_user;
  if v_tenant is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  insert into public.datev_exports
    (tenant_id, created_by, csv, row_count, skipped_count, date_from, date_to)
  values
    (v_tenant, v_user, p_csv, p_row_count, p_skipped_count, p_date_from, p_date_to)
  returning id into v_export_id;

  with flipped as (
    update public.invoices
       set status = 'exported'
     where tenant_id = v_tenant
       and id = any(p_invoice_ids)
       and status = 'ready'
     returning id
  )
  select coalesce(array_agg(id), array[]::uuid[]) into v_transitioned from flipped;

  v_count := coalesce(array_length(v_transitioned, 1), 0);

  -- Abort if any expected invoice didn't transition — prevents shipping a CSV
  -- that contains lines for invoices another flow already exported.
  if v_count <> p_row_count then
    raise exception 'concurrent_skip'
      using errcode = 'P0001',
            detail = format('expected %s, transitioned %s', p_row_count, v_count);
  end if;

  insert into public.audit_logs
    (tenant_id, invoice_id, actor_user_id, event_type, metadata)
  values (
    v_tenant,
    null,
    v_user,
    'export_datev',
    jsonb_build_object(
      'export_id', v_export_id,
      'row_count', v_count,
      'skipped_count', p_skipped_count,
      'date_from', p_date_from,
      'date_to', p_date_to,
      'format', 'extf-v700',
      'invoice_ids', to_jsonb(v_transitioned)
    )
  );

  return query select v_export_id, v_count;
end;
$$;

grant execute on function public.commit_datev_export(text, integer, integer, text, text, uuid[]) to authenticated;
