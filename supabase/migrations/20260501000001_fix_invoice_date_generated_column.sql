-- Story 4.3 review patch: fix invoice_date_value generated column.
--
-- Problem: the previous expression used regex ^\d{4}-\d{2}-\d{2}$ which accepts
-- logically-invalid dates such as 2026-13-45 (month > 12) or 2026-02-30 (day
-- impossible for February). When such a date reaches make_date(y, m, d), PostgreSQL
-- raises date_out_of_range and aborts the INSERT — a silent data-loss risk.
--
-- Fix: introduce an IMMUTABLE PL/pgSQL helper that wraps make_date in an exception
-- handler, then use it in the generated column expression. Invalid dates → NULL
-- (same posture as the gross_total_value safe-cast pattern from 20260424100000).
--
-- The column drop+recreate is necessary because ALTER TABLE ... ALTER COLUMN ...
-- SET EXPRESSION is only available in PostgreSQL 16+; Supabase local uses PG 15.

-- 1. Create the safe date parser function.
create or replace function public.parse_iso_date_safe(v text) returns date
  language plpgsql immutable
  as $$
  begin
    if v is null then return null; end if;
    -- Quick format guard: must match YYYY-MM-DD with plausible ranges before calling make_date.
    if v !~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then return null; end if;
    return make_date(
      left(v, 4)::int,
      substring(v, 6, 2)::int,
      right(v, 2)::int
    );
  exception when datetime_field_overflow or others then
    return null;
  end;
  $$;

-- 2. Drop the dependent index (recreated below).
drop index if exists public.invoices_tenant_invoice_date_idx;

-- 3. Drop and recreate the generated column with the safe-cast expression.
alter table public.invoices drop column if exists invoice_date_value;

alter table public.invoices
  add column invoice_date_value date
    generated always as (
      public.parse_iso_date_safe(invoice_data -> 'invoice_date' ->> 'value')
    ) stored;

-- 4. Recreate the composite index (same definition as in 20260501000000).
create index if not exists invoices_tenant_invoice_date_idx
  on public.invoices (tenant_id, invoice_date_value desc nulls last);
