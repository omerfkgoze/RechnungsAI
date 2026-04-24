-- Story 3.1 post-review hardening (2026-04-23):
--   • invoice_stage_counts / invoice_processing_stats — raise when
--     my_tenant_id() is NULL (defense-in-depth: prevents SECURITY DEFINER
--     from silently zero-filling an unauthenticated / mis-authed session).
--   • invoice_processing_stats — coalesce each of the 7 confidence reads to 0
--     so a single row with a missing key doesn't NULL-poison avg_accuracy.
--   • invoice_processing_stats — move the ::numeric(4,3) cast inside the
--     aggregate so the precision is applied to the averaged value directly
--     (previously bound to the filter-clause result).

-- ========== invoice_stage_counts ==========
create or replace function public.invoice_stage_counts()
returns table(status public.invoice_status, count bigint)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if public.my_tenant_id() is null then
    raise exception 'invoice_stage_counts: tenant context missing';
  end if;
  return query
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
end;
$$;

revoke all on function public.invoice_stage_counts() from public;
grant execute on function public.invoice_stage_counts() to authenticated;

-- ========== invoice_processing_stats ==========
create or replace function public.invoice_processing_stats()
returns table(
  total_invoices bigint,
  avg_accuracy numeric,
  export_history_count bigint
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if public.my_tenant_id() is null then
    raise exception 'invoice_processing_stats: tenant context missing';
  end if;
  return query
    select
      count(*)::bigint as total_invoices,
      avg(
        (
          coalesce((invoice_data->'invoice_number'->>'confidence')::numeric, 0)
        + coalesce((invoice_data->'invoice_date'->>'confidence')::numeric, 0)
        + coalesce((invoice_data->'supplier_name'->>'confidence')::numeric, 0)
        + coalesce((invoice_data->'gross_total'->>'confidence')::numeric, 0)
        + coalesce((invoice_data->'vat_total'->>'confidence')::numeric, 0)
        + coalesce((invoice_data->'net_total'->>'confidence')::numeric, 0)
        + coalesce((invoice_data->'currency'->>'confidence')::numeric, 0)
        ) / 7.0
      )::numeric(4,3) filter (where invoice_data is not null) as avg_accuracy,
      count(*) filter (where status = 'exported')::bigint as export_history_count
    from public.invoices
    where tenant_id = public.my_tenant_id();
end;
$$;

revoke all on function public.invoice_processing_stats() from public;
grant execute on function public.invoice_processing_stats() to authenticated;
