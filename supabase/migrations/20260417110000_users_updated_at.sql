-- Tech Debt prep-td7: add `updated_at` audit column + trigger on public.users.
--
-- Rationale: `users_update_self` RLS policy allows authenticated clients to
-- mutate their own row (role column exclusive for future invite flows). Without
-- `updated_at`, audit-trail parity with `public.tenants` is missing and the
-- row's last-modified time is not observable.
--
-- Backfill: existing rows receive created_at as their initial updated_at so
-- the column is never NULL for historic rows.

alter table public.users
  add column if not exists updated_at timestamptz not null default now();

-- Backfill for any pre-existing rows (idempotent — updated_at already defaults
-- to now() on subsequent inserts).
update public.users set updated_at = created_at where updated_at <> created_at;

-- Reuse the shared set_updated_at() function introduced for tenants.
drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- Column-level grants: `updated_at` is NOT granted to authenticated. The
-- trigger owns the column; clients must not set it directly. Existing column
-- grants on public.users (role-column writes, added in a later invite-flow
-- story) remain unchanged.
