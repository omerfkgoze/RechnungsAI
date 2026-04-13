-- Story 1.3: tenants + users schema, RLS, signup trigger.
--
-- RLS smoke check (manual): after `supabase db reset`, open psql and run:
--   set role authenticated;
--   set request.jwt.claim.sub = '<uuid-of-user-A>';
--   select id, company_name from public.tenants;   -- expect only tenant A's row
--   select id, email from public.users;            -- expect only user A
-- Repeat with user B's uuid to confirm isolation.

create extension if not exists "pgcrypto" with schema extensions;

-- ========== tenants ==========
create table public.tenants (
  id uuid primary key default extensions.gen_random_uuid(),
  company_name text not null,
  skr_plan text not null default 'SKR03' check (skr_plan in ('SKR03', 'SKR04')),
  steuerberater_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- BEFORE UPDATE trigger keeps `updated_at` server-managed.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

-- ========== users ==========
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null unique,
  role text not null default 'owner' check (role in ('owner', 'member', 'viewer')),
  onboarded_at timestamptz,
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

-- Explicit deny-by-default: no INSERT/DELETE policies for `authenticated`.
-- The signup trigger is security-definer and the only legitimate insert path;
-- tenant/user deletion cascades from `auth.users` via the ON DELETE CASCADE FK.
-- AC #1(d) — the policies below exist to make the deny-by-default intent explicit
-- (each returns false, so no row qualifies).
create policy "tenants_insert_none"
  on public.tenants
  for insert
  to authenticated
  with check ( false );

create policy "tenants_delete_none"
  on public.tenants
  for delete
  to authenticated
  using ( false );

-- users: members can read their tenant peers and update their own row,
-- but may NOT reassign their own `tenant_id` (enforced via with check).
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
  with check (
    id = auth.uid()
    and tenant_id = (select tenant_id from public.users where id = auth.uid())
  );

create policy "users_insert_none"
  on public.users
  for insert
  to authenticated
  with check ( false );

create policy "users_delete_none"
  on public.users
  for delete
  to authenticated
  using ( false );

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
  values ('Mein Unternehmen', 'SKR03')
  returning id into new_tenant_id;

  insert into public.users (id, tenant_id, email, role)
  values (NEW.id, new_tenant_id, coalesce(NEW.email, ''), 'owner');

  return NEW;
end;
$$;

grant execute on function public.handle_new_user() to service_role, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ========== Grants ==========
-- `updated_at` intentionally excluded from column-level update grants
-- (clients must not set it directly — `tenants_set_updated_at` owns the column).
grant select on public.tenants, public.users to authenticated;
grant update (company_name, skr_plan, steuerberater_name) on public.tenants to authenticated;
grant update (onboarded_at) on public.users to authenticated;
grant insert on public.tenants, public.users to service_role;
