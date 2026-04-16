-- Epic 2 prep: create the `invoices` storage bucket for invoice file uploads.
--
-- Design decisions:
--   - Private bucket (public = false): invoice files are tenant-sensitive (DSGVO).
--   - Path convention: {tenant_id}/{invoice_id}.{ext}
--     This makes tenant isolation enforceable via storage.foldername() in RLS.
--   - File size limit: 10MB per file (covers PDF/XML; JPEG compressed to 2MB in-app).
--   - Allowed MIME types: JPEG, PNG, PDF, XML (Story 2.1 requirements).
--   - No DELETE / UPDATE: GoBD write-once immutability (FR21).
--     Deletion is only permitted via service_role (admin operations only).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'invoices',
  'invoices',
  false,
  10485760, -- 10MB
  array[
    'image/jpeg',
    'image/png',
    'application/pdf',
    'text/xml',
    'application/xml'
  ]
)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────
-- RLS policies on storage.objects for the `invoices` bucket
-- ─────────────────────────────────────────────────────────────────

-- INSERT: authenticated users may upload to their own tenant folder only.
-- Path must start with the caller's tenant_id UUID.
create policy "invoices_insert_own_tenant"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = public.my_tenant_id()::text
  );

-- SELECT: authenticated users may read files in their own tenant folder only.
create policy "invoices_select_own_tenant"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = public.my_tenant_id()::text
  );

-- No UPDATE policy: GoBD immutability — stored files must not be modified (FR21).
-- No DELETE policy: retention enforced at application layer; only service_role may delete.
