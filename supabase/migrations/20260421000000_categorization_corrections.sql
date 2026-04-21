-- prep-TD2 / Story 3.3 prerequisite: categorization columns + corrections table.
--
-- Design decisions:
--   • skr_code as text — SKR codes are strings ("3400", "4600"). A numeric type
--     would require casting on every query and prevents future alpha codes.
--     Application-layer Zod validation in Story 3.3 enforces format.
--   • bu_schluessel as smallint — DATEV BU-Schlüssel are 0–99; smallint (2 bytes)
--     is sufficient. Null until Story 3.3 populates it.
--   • categorization_confidence as numeric(4,3) — avoids IEEE 754 rounding for
--     confidence scores. Stores values like 0.873 or 1.000. Null = not yet
--     categorized (distinct from 0.000 = zero confidence).
--   • categorization_corrections is append-only (no UPDATE/DELETE grants):
--     the correction log acts as a learning signal and must not be edited;
--     this also aligns with GoBD's audit-trail spirit.
--   • invoice_id FK uses ON DELETE RESTRICT — GoBD immutability means invoice rows
--     cannot be deleted by tenants; restrict prevents future service-role deletes
--     from silently erasing correction history.
--   • supplier_name is denormalized into corrections — avoids a ->>'path' JOIN
--     into the invoice_data JSONB blob on every learning query. Stale if the user
--     later edits the supplier via Story 3.2; acceptable because the learning
--     algorithm uses it as a fuzzy grouping hint, not an exact key.

-- ========== extend invoices table ==========

alter table public.invoices
  add column skr_code text null,
  add column bu_schluessel smallint null,
  add column categorization_confidence numeric(4,3) null;

-- Extend the column-level UPDATE grant to include the three new columns.
-- Pattern from 20260417120000_invoices_extraction_columns.sql: replace the full
-- column list (Postgres has no incremental ADD COLUMN to grant).
grant update (
  status,
  updated_at,
  invoice_data,
  extracted_at,
  extraction_error,
  extraction_attempts,
  skr_code,
  bu_schluessel,
  categorization_confidence
) on public.invoices to authenticated;

-- ========== categorization_corrections table ==========

create table public.categorization_corrections (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  original_code text not null,
  corrected_code text not null,
  supplier_name text null,
  created_at timestamptz not null default now()
);

-- Learning queries GROUP BY supplier_name and ORDER BY created_at DESC to surface
-- the most-recent correction per supplier. Pre-build the index now.
create index categorization_corrections_tenant_supplier_idx
  on public.categorization_corrections (tenant_id, supplier_name, created_at desc);

-- ========== RLS ==========

alter table public.categorization_corrections enable row level security;

create policy "categorization_corrections_select_own"
  on public.categorization_corrections
  for select
  to authenticated
  using ( tenant_id = public.my_tenant_id() );

create policy "categorization_corrections_insert_own"
  on public.categorization_corrections
  for insert
  to authenticated
  with check ( tenant_id = public.my_tenant_id() );

-- No UPDATE or DELETE policies — corrections are append-only.

-- ========== Grants ==========

grant select, insert on public.categorization_corrections to authenticated;
