-- Fix: infinite recursion in `users_select_tenant_members` RLS policy.
--
-- Root cause: the policy's USING clause
--   `tenant_id = (select tenant_id from public.users where id = auth.uid())`
-- re-triggers RLS on `public.users`, which evaluates the same policy again
-- → 42P17 infinite recursion.
--
-- Fix: introduce a SECURITY DEFINER helper that reads `tenant_id` for the
-- current user WITHOUT going through RLS (the function owner has definer
-- privileges, so the inner SELECT bypasses the policy). Replace the
-- recursive subquery in the policy with this function call.

create or replace function public.my_tenant_id()
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select tenant_id from public.users where id = auth.uid();
$$;

-- Only authenticated sessions should call this (service_role already bypasses
-- RLS entirely, anon has no rows).
revoke all on function public.my_tenant_id() from public;
grant execute on function public.my_tenant_id() to authenticated;

-- Drop and recreate the recursive policy with the non-recursive version.
drop policy if exists "users_select_tenant_members" on public.users;

create policy "users_select_tenant_members"
  on public.users
  for select
  to authenticated
  using ( tenant_id = public.my_tenant_id() );
