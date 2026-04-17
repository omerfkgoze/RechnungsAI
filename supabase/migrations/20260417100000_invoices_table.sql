-- Story 2.1: `invoices` table — single-row-per-invoice metadata for uploads.
--
-- Design decisions (documented per Story 2.1 AC #1):
--   • invoice_status enum order is load-bearing. Epic 3 Story 3.1 relies on
--     a deterministic order for pipeline board columns:
--     'captured' → 'processing' → 'ready' → 'review' → 'exported'.
--     Reordering is a breaking change for downstream UI.
--   • GoBD immutability (FR21): no DELETE policy on the `invoices` table.
--     Once captured, rows may transition status but cannot be removed by a
--     tenant user. Deletion is reserved for retention workflows using
--     service_role exclusively.
--   • Column-grant discipline (Story 1.5 pattern): `authenticated` receives
--     UPDATE only on (`status`, `updated_at`). Insert-once columns
--     (`id`, `tenant_id`, `file_path`, `file_type`, `original_filename`,
--     `created_at`) are server-written via Server Actions and must not be
--     mutated by clients, even when the row is owned by the same tenant.
--   • `my_tenant_id()` SECURITY DEFINER helper is reused to keep RLS
--     non-recursive (see 20260415000000_fix_rls_recursion.sql).

-- ========== status enum ==========
create type public.invoice_status as enum (
  'captured',
  'processing',
  'ready',
  'review',
  'exported'
);

-- ========== table ==========
create table public.invoices (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  status public.invoice_status not null default 'captured',
  file_path text not null,
  file_type text not null check (
    file_type in (
      'image/jpeg',
      'image/png',
      'application/pdf',
      'text/xml',
      'application/xml'
    )
  ),
  original_filename text not null check (
    char_length(original_filename) between 1 and 255
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Dashboard list queries (Epic 3 Story 3.1) filter by tenant and order by
-- created_at DESC. Pre-build the composite index now to avoid migration churn.
create index invoices_tenant_id_created_at_idx
  on public.invoices (tenant_id, created_at desc);

-- BEFORE UPDATE trigger reuses the shared set_updated_at() function.
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- ========== RLS ==========
alter table public.invoices enable row level security;

create policy "invoices_select_own"
  on public.invoices
  for select
  to authenticated
  using ( tenant_id = public.my_tenant_id() );

create policy "invoices_insert_own"
  on public.invoices
  for insert
  to authenticated
  with check ( tenant_id = public.my_tenant_id() );

-- UPDATE policy exists so Story 2.2's extraction pipeline (running as the
-- authenticated user via a Server Action) can flip status through the enum.
-- Column-level grants below restrict WHICH columns can be updated.
create policy "invoices_update_own"
  on public.invoices
  for update
  to authenticated
  using ( tenant_id = public.my_tenant_id() )
  with check ( tenant_id = public.my_tenant_id() );

-- No DELETE policy — GoBD immutability (FR21).

-- ========== Grants ==========
grant select, insert on public.invoices to authenticated;
-- UPDATE is narrowly scoped: clients may advance status and touch updated_at
-- only (trigger rewrites updated_at, but include it in the grant so the SET
-- list check during UPDATE does not fail for valid status-only writes).
grant update (status, updated_at) on public.invoices to authenticated;
