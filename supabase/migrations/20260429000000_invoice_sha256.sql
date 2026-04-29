-- Story 4.1: SHA-256 hash column for GoBD §239 Abs. 3 immutability proof.
--
-- GoBD compliance posture documented for the Verfahrensdokumentation generator (Epic 7):
--   • Immutability: no UPDATE/DELETE policy on `invoices.sha256` for `authenticated`.
--     Only `service_role` can mutate, and `service_role` does NOT exist in the
--     application codebase — no client-shipped key, no Server Action references.
--   • Retention: 10-year retention (FR23) is enforced by the absence of any DELETE
--     path for `authenticated` on `public.invoices` AND on `storage.objects` for the
--     `invoices` bucket (see 20260417000000_storage_invoices_bucket.sql). Tenant
--     users cannot delete; only `service_role` could, and does not exist in code.
--   • Encryption (NFR7): AES-256 at rest, TLS 1.3 in transit — properties of
--     self-hosted Supabase on Hetzner / German DC.
--   • EU hosting (NFR8): Hetzner Falkenstein/Nuremberg DC — no data leaves the EU.
--   • Zero data loss (NFR20): Postgres physical backups + Storage replication.
--
-- Backfill: NOT feasible — Epic 2 invoices were uploaded before this column existed
-- and we cannot stream them through `hashBuffer` without re-uploading. Legacy rows
-- keep `sha256 IS NULL` and surface as "Legacy-Upload" in the viewer integrity badge.

alter table public.invoices
  add column if not exists sha256 text;

-- Hex shape guard (defensive — same regex pattern as 20260424100000 safe-cast).
-- DO block makes this idempotent: re-running the migration is safe (e.g. supabase db reset).
do $$
begin
  alter table public.invoices
    add constraint invoices_sha256_format_chk
    check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');
exception when duplicate_object then null;
end $$;

-- Intentionally NO `grant update (sha256) on public.invoices to authenticated`.
-- Hash is INSERT-only at upload time; UPDATE is forbidden by absence of grant.

comment on column public.invoices.sha256 is
  'GoBD §239 Abs. 3 immutability proof: SHA-256 hex digest of the originally uploaded file. NULL = legacy (uploaded before Story 4.1).';
