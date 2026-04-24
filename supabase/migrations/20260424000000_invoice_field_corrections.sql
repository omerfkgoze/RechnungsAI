-- Story 3.2: invoice_field_corrections — audit trail for per-field user corrections.
-- Append-only (no UPDATE/DELETE grants): mirrors categorization_corrections pattern.

create table public.invoice_field_corrections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  supplier_name text,
  field_path text not null,
  previous_value jsonb,
  corrected_value jsonb not null,
  corrected_to_ai boolean not null default false,
  created_at timestamptz not null default now()
);

create index invoice_field_corrections_tenant_supplier_idx
  on public.invoice_field_corrections (tenant_id, supplier_name, created_at desc);

create index invoice_field_corrections_invoice_idx
  on public.invoice_field_corrections (invoice_id, created_at desc);

alter table public.invoice_field_corrections enable row level security;

create policy "invoice_field_corrections_select_own"
  on public.invoice_field_corrections for select to authenticated
  using (tenant_id = public.my_tenant_id());

create policy "invoice_field_corrections_insert_own"
  on public.invoice_field_corrections for insert to authenticated
  with check (tenant_id = public.my_tenant_id());

grant select, insert on public.invoice_field_corrections to authenticated;

-- Ensure the invoices table is part of the realtime publication (P12).
-- DO block prevents error if it's already a member.
do $$
begin
  alter publication supabase_realtime add table public.invoices;
exception
  when duplicate_object then null;
end;
$$;
