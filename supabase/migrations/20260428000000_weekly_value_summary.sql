-- Story 3.5: Weekly Value Summary RPC
-- Adds tenant_weekly_value_summary() — a SECURITY DEFINER function following
-- the same hardening pattern as invoice_processing_stats (20260423100000).
-- Week boundary: Monday 00:00 UTC (Postgres date_trunc('week', now()) is ISO 8601 Monday).
-- NOTE: Week boundary is technically Monday 00:00 UTC, which differs from CET/CEST by 1–2h.
-- This is an accepted cosmetic edge case for MVP; revisit in Story 8.3.

create or replace function public.tenant_weekly_value_summary()
returns table(
  week_invoices bigint,
  week_time_saved_minutes integer,
  week_vat_total numeric,
  month_exported_count bigint,
  month_vat_total numeric
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  week_start  timestamptz := date_trunc('week', now());
  week_end    timestamptz := week_start + interval '7 days';
  month_start timestamptz := date_trunc('month', now());
  month_end   timestamptz := month_start + interval '1 month';
  v_week_count bigint;
  v_week_vat   numeric;
  v_month_count bigint;
  v_month_vat   numeric;
begin
  if public.my_tenant_id() is null then
    raise exception 'tenant_weekly_value_summary: tenant context missing';
  end if;

  select
    count(*) filter (where status in ('ready','review','exported')),
    coalesce(sum(
      case
        when invoice_data->'vat_total'->>'value' ~ '^[0-9]+(\.[0-9]+)?$'
          and status in ('ready','exported')
          then (invoice_data->'vat_total'->>'value')::numeric
        else 0
      end
    ), 0)
  into v_week_count, v_week_vat
  from public.invoices
  where tenant_id = public.my_tenant_id()
    and created_at >= week_start
    and created_at < week_end;

  select
    count(*) filter (where status = 'exported'),
    coalesce(sum(
      case
        when invoice_data->'vat_total'->>'value' ~ '^[0-9]+(\.[0-9]+)?$'
          and status = 'exported'
          then (invoice_data->'vat_total'->>'value')::numeric
        else 0
      end
    ), 0)
  into v_month_count, v_month_vat
  from public.invoices
  where tenant_id = public.my_tenant_id()
    and created_at >= month_start
    and created_at < month_end;

  return query select
    coalesce(v_week_count, 0)::bigint,
    (coalesce(v_week_count, 0) * 12)::integer,
    coalesce(v_week_vat, 0)::numeric,
    coalesce(v_month_count, 0)::bigint,
    coalesce(v_month_vat, 0)::numeric;
end;
$$;

revoke all on function public.tenant_weekly_value_summary() from public;
grant execute on function public.tenant_weekly_value_summary() to authenticated;
