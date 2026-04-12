-- Story 1.3: tenants + users schema, RLS, signup trigger.
--
-- RLS smoke check (manual): after `supabase db reset`, open psql and run:
--   set role authenticated;
--   set request.jwt.claim.sub = '<uuid-of-user-A>';
--   select id, company_name from public.tenants;   -- expect only tenant A's row
--   select id, email from public.users;            -- expect only user A
-- Repeat with user B's uuid to confirm isolation.

create extension if not exists "pgcrypto";

-- ========== tenants ==========
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  skr_plan text not null default 'SKR03' check (skr_plan in ('SKR03', 'SKR04')),
  steuerberater_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ========== users ==========
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  role text not null default 'owner' check (role in ('owner', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create index users_tenant_id_idx on public.users (tenant_id);

-- ========== RLS ==========
alter table public.tenants enable row level security;
alter table public.users   enable row level security;

-- tenants: members of the tenant see/update it; inserts happen via the trigger (security definer).
create policy "tenants_select_own"
  on public.tenants
  for select
  to authenticated
  using ( id = (select tenant_id from public.users where id = auth.uid()) );

create policy "tenants_update_own"
  on public.tenants
  for update
  to authenticated
  using ( id = (select tenant_id from public.users where id = auth.uid()) )
  with check ( id = (select tenant_id from public.users where id = auth.uid()) );

-- users: members can read their tenant peers and update their own row.
create policy "users_select_tenant_members"
  on public.users
  for select
  to authenticated
  using ( tenant_id = (select tenant_id from public.users where id = auth.uid()) );

create policy "users_update_self"
  on public.users
  for update
  to authenticated
  using ( id = auth.uid() )
  with check ( id = auth.uid() );

-- No insert/delete policies for authenticated. Signup trigger uses security-definer
-- and bypasses RLS; tenant/user deletion cascades from auth.users.

-- ========== Signup trigger ==========
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  new_tenant_id uuid;
begin
  insert into public.tenants (company_name, skr_plan)
  values (split_part(NEW.email, '@', 1), 'SKR03')
  returning id into new_tenant_id;

  insert into public.users (id, tenant_id, email, role)
  values (NEW.id, new_tenant_id, NEW.email, 'owner');

  return NEW;
end;
$$;

grant execute on function public.handle_new_user() to service_role, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ========== Grants ==========
grant select on public.tenants, public.users to authenticated;
grant update (company_name, skr_plan, steuerberater_name, updated_at) on public.tenants to authenticated;
grant insert on public.tenants, public.users to service_role;
