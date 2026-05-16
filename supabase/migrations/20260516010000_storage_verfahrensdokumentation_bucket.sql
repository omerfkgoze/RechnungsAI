-- Epic 7 prep (D-2): create the `verfahrensdokumentation` storage bucket for
-- generated Verfahrensdokumentation PDFs.
--
-- Codebase precedent: 20260417000000_storage_invoices_bucket.sql.
-- A migration (not the Supabase Dashboard) owns the bucket so it survives
-- `supabase db reset` and is reproducible on Cloud.
--
-- Design decisions:
--   - Private bucket (public = false): GoBD document, tenant-sensitive (DSGVO).
--   - Path convention: {tenant_id}/verdok-{generated_at_iso}.pdf
--     Each generation is a NEW object (versioned) → version history is the
--     retained set of objects (serves Story 7.2). No overwrite → no UPDATE policy.
--   - File size limit: 5MB (a text-only A4 PDF is well under 1MB; headroom only).
--   - Allowed MIME type: application/pdf only.
--   - No UPDATE / DELETE policy: regeneration writes a new object; old versions
--     are retained. Only service_role may delete (admin / retention ops).
--
-- Smoke (after supabase db reset):
--   1. As tenant A user: upload to '<tenantA>/verdok-x.pdf' → succeeds.
--   2. As tenant B user: SELECT object under '<tenantA>/...' → 0 rows / denied.
--   3. createSignedUrl on own tenant path → valid URL; cross-tenant → denied.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verfahrensdokumentation',
  'verfahrensdokumentation',
  false,
  5242880, -- 5MB
  array['application/pdf']
)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────
-- RLS policies on storage.objects for the `verfahrensdokumentation` bucket
-- ─────────────────────────────────────────────────────────────────

-- INSERT: authenticated users may upload to their own tenant folder only.
-- Path must start with the caller's tenant_id UUID.
create policy "verdok_insert_own_tenant"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'verfahrensdokumentation'
    and (storage.foldername(name))[1] = public.my_tenant_id()::text
  );

-- SELECT: authenticated users may read files in their own tenant folder only.
create policy "verdok_select_own_tenant"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'verfahrensdokumentation'
    and (storage.foldername(name))[1] = public.my_tenant_id()::text
  );

-- No UPDATE policy: regeneration writes a NEW versioned object (verdok-{iso}.pdf),
--   never overwrites — consistent with the invoices bucket immutability stance.
-- No DELETE policy: version history retained; only service_role may delete.
