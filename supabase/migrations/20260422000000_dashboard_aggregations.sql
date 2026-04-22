-- Story 3.1: Pipeline Dashboard aggregation RPCs + TD4 guardrail.
--
-- (a) invoice_stage_counts()     — per-status tenant-scoped counts with zero-fill
-- (b) invoice_processing_stats() — total / avg accuracy / export history count
-- (c) TD4 (Epic 2 retro) — CHECK constraint: extraction_attempts <= 5
--
-- Both functions are SECURITY DEFINER with pinned search_path (Supabase RLS
-- hardening lint rule; pattern matches 20260415000000_fix_rls_recursion.sql
-- `public.my_tenant_id()`).
--
-- OVERALL_KEYS is duplicated here from packages/shared/src/schemas/invoice.ts
-- (arithmetic mean of 7 fields). Keep the two in sync — Dev Notes of story 3.1
-- list the keys explicitly.

-- ========== (a) invoice_stage_counts ==========
create or replace function public.invoice_stage_counts()
returns table(status public.invoice_status, count bigint)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    s.status,
    coalesce(c.count, 0)::bigint as count
  from unnest(enum_range(null::public.invoice_status)) as s(status)
  left join (
    select i.status, count(*) as count
    from public.invoices i
    where i.tenant_id = public.my_tenant_id()
    group by i.status
  ) c on c.status = s.status
  order by array_position(enum_range(null::public.invoice_status), s.status);
$$;

revoke all on function public.invoice_stage_counts() from public;
grant execute on function public.invoice_stage_counts() to authenticated;

-- ========== (b) invoice_processing_stats ==========
create or replace function public.invoice_processing_stats()
returns table(
  total_invoices bigint,
  avg_accuracy numeric,
  export_history_count bigint
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    count(*)::bigint as total_invoices,
    avg(
      (
        (invoice_data->'invoice_number'->>'confidence')::numeric
      + (invoice_data->'invoice_date'->>'confidence')::numeric
      + (invoice_data->'supplier_name'->>'confidence')::numeric
      + (invoice_data->'gross_total'->>'confidence')::numeric
      + (invoice_data->'vat_total'->>'confidence')::numeric
      + (invoice_data->'net_total'->>'confidence')::numeric
      + (invoice_data->'currency'->>'confidence')::numeric
      ) / 7.0
    ) filter (where invoice_data is not null)::numeric(4,3) as avg_accuracy,
    count(*) filter (where status = 'exported')::bigint as export_history_count
  from public.invoices
  where tenant_id = public.my_tenant_id();
$$;

revoke all on function public.invoice_processing_stats() from public;
grant execute on function public.invoice_processing_stats() to authenticated;

-- ========== (c) TD4 — extraction_attempts upper bound ==========
-- Epic 2 retro TD4: cap runaway extraction retries at 5. Application-level
-- early-return in apps/web/app/actions/invoices.ts::extractInvoice surfaces
-- the German message before hitting this backstop. Raising the cap requires
-- a follow-up migration (drop + re-add the constraint).
alter table public.invoices
  add constraint invoices_extraction_attempts_upper_bound
  check (extraction_attempts <= 5);
