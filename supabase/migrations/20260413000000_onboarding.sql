-- Story 1.4: onboarding completion — adds `ai_disclaimer_accepted_at` column and
-- the `public.complete_onboarding` SECURITY DEFINER RPC that is the single
-- legitimate write path for `users.onboarded_at` / `ai_disclaimer_accepted_at`
-- and the tenant's company details.
--
-- Smoke checks (manual, after `supabase db reset`):
--   -- 1. Function body is SECURITY DEFINER with empty search_path:
--   select pg_get_functiondef('public.complete_onboarding(text,text,text)'::regprocedure);
--   -- 2. Unauthenticated call fails with insufficient_privilege (42501):
--   set role anon;
--   select public.complete_onboarding('Test GmbH', 'SKR03', '');
--   -- 3. Invalid skr_plan fails with check_violation (23514):
--   set role authenticated;
--   set request.jwt.claim.sub = '<uuid-of-user>';
--   select public.complete_onboarding('Test GmbH', 'SKR99', '');
--   -- 4. Happy path:
--   set request.jwt.claim.sub = '<uuid-of-user>';
--   select public.complete_onboarding('Mustermann GmbH', 'SKR04', 'Erika Mustermann');
--   select onboarded_at, ai_disclaimer_accepted_at from public.users where id = auth.uid();

alter table public.users
  add column ai_disclaimer_accepted_at timestamptz null;

-- Single-transaction onboarding completion.
-- SECURITY DEFINER + `set search_path = ''` closes the search-path-hijack
-- vector the Supabase linter warns about (same discipline as handle_new_user).
-- We do NOT `grant update (onboarded_at)` to `authenticated` (see the Story 1.3
-- migration comment at lines 151-154) — this RPC is the only legitimate write path.
create or replace function public.complete_onboarding(
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
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_skr_plan is null or p_skr_plan not in ('SKR03', 'SKR04') then
    raise exception 'invalid skr_plan: %', p_skr_plan using errcode = '23514';
  end if;

  select u.tenant_id into v_tenant_id
  from public.users u
  where u.id = auth.uid();

  if v_tenant_id is null then
    raise exception 'users row missing for authenticated user' using errcode = '42501';
  end if;

  -- Idempotent timestamps: only set on first completion so replays don't
  -- overwrite the original acceptance time (legal-record stability, FR51).
  update public.users
    set onboarded_at = coalesce(onboarded_at, now()),
        ai_disclaimer_accepted_at = coalesce(ai_disclaimer_accepted_at, now())
  where id = auth.uid();

  update public.tenants
    set company_name = trim(p_company_name),
        skr_plan = p_skr_plan,
        steuerberater_name = nullif(trim(p_steuerberater_name), '')
  where id = v_tenant_id;
end;
$$;

-- Execute grant: only `authenticated` — anon must not call this; service_role
-- already has function execute by default.
--
-- Supabase's default privileges auto-grant EXECUTE on new public functions to
-- {anon, authenticated, service_role}; we explicitly revoke from anon so only
-- authenticated sessions can invoke this RPC (AC #1(c)). The function's own
-- `auth.uid() is null` check is the defense-in-depth for any edge case where
-- the grant is restored by a future migration.
revoke all on function public.complete_onboarding(text, text, text) from public;
revoke execute on function public.complete_onboarding(text, text, text) from anon;
grant execute on function public.complete_onboarding(text, text, text) to authenticated;
