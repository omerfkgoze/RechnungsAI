-- Story 1.4: onboarding completion — adds `ai_disclaimer_accepted_at` column and
-- TWO SECURITY DEFINER RPCs that are the single legitimate write path for
-- `users.ai_disclaimer_accepted_at`, `users.onboarded_at`, and the tenant's
-- company details.
--
-- Two-step split (Review decision 1c, 2a):
--   1. `complete_onboarding(disclaimer, company, skr, steuerberater)` writes tenant
--      details + disclaimer acceptance. Does NOT set `onboarded_at`. Single-use:
--      re-invocation raises `already_completed`.
--   2. `complete_first_invoice_step()` sets `onboarded_at = now()` after the user
--      acknowledges the first-invoice prompt (CTA or "später"). Also single-use.
--
-- Rationale: the previous single-RPC shape made `/onboarding/first-invoice`
-- unreachable (middleware redirects onboarded users out of /onboarding/*) and
-- left the disclaimer consent signal unverifiable server-side (Trust Screen
-- checkbox was client-only, violating FR51 legal-record integrity).

alter table public.users
  add column ai_disclaimer_accepted_at timestamptz null;

-- Step 1: tenant setup + disclaimer acceptance.
create or replace function public.complete_onboarding(
  p_disclaimer_accepted boolean,
  p_company_name text,
  p_skr_plan text,
  p_steuerberater_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_trimmed_company text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_disclaimer_accepted is not true then
    raise exception 'disclaimer_required' using errcode = 'P0001';
  end if;

  if p_skr_plan is null or p_skr_plan not in ('SKR03', 'SKR04') then
    raise exception 'invalid skr_plan: %', p_skr_plan using errcode = '23514';
  end if;

  v_trimmed_company := trim(coalesce(p_company_name, ''));
  if length(v_trimmed_company) < 2 or length(v_trimmed_company) > 100 then
    raise exception 'invalid company_name length' using errcode = '23514';
  end if;

  select u.tenant_id into v_tenant_id
  from public.users u
  where u.id = auth.uid();

  if v_tenant_id is null then
    raise exception 'users row missing for authenticated user' using errcode = '42501';
  end if;

  -- Single-use: writing the disclaimer timestamp is gated on it being NULL so
  -- a second call cannot overwrite tenant fields or re-stamp the legal record.
  update public.users
    set ai_disclaimer_accepted_at = now()
  where id = auth.uid()
    and ai_disclaimer_accepted_at is null;

  if not found then
    raise exception 'already_completed' using errcode = 'P0001';
  end if;

  update public.tenants
    set company_name = v_trimmed_company,
        skr_plan = p_skr_plan,
        steuerberater_name = nullif(trim(coalesce(p_steuerberater_name, '')), '')
  where id = v_tenant_id;
end;
$$;

-- Step 2: mark onboarding fully complete after first-invoice prompt ack.
create or replace function public.complete_first_invoice_step()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  update public.users
    set onboarded_at = now()
  where id = auth.uid()
    and onboarded_at is null;
end;
$$;

-- Execute grants: only `authenticated`. Supabase auto-grants EXECUTE to
-- {anon, authenticated, service_role} on new public functions; we revoke
-- from anon so only authenticated sessions can invoke these RPCs.
revoke all on function public.complete_onboarding(boolean, text, text, text) from public;
revoke execute on function public.complete_onboarding(boolean, text, text, text) from anon;
grant execute on function public.complete_onboarding(boolean, text, text, text) to authenticated;

revoke all on function public.complete_first_invoice_step() from public;
revoke execute on function public.complete_first_invoice_step() from anon;
grant execute on function public.complete_first_invoice_step() to authenticated;
