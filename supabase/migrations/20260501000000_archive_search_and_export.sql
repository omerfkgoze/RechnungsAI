-- Story 4.3: Archive Search and Audit Export
--
-- Legal basis (cited so the Verfahrensdokumentation generator (Epic 7) can reference):
--   • §§238–241 HGB — Buchführungspflicht, Vollständigkeit, Unveränderbarkeit
--   • GoBD Tz. 100–107 — Maschinelle Auswertbarkeit (machine-readable for §147 AO Z2/Z3)
--   • NFR5 — <1 s archive search response budget (covered by indexes below)
--
-- Source: prep-p4-gobd-audit-scope-research-2026-04-28.md§3 (event taxonomy)
-- Event taxonomy addition: 'export_audit' satisfies §147 AO Z2/Z3 (structured machine-readable export).
-- 'export_datev' is already permitted by the extended constraint; Story 5.x wires the callsite.
--
-- Retention posture:
--   No DELETE path is added. Generated columns auto-populate on INSERT/UPDATE from invoice_data.
--   No manual backfill needed — legacy rows that have NULL invoice_data produce NULL generated values.
--   Same no-mutation posture as Stories 4.1/4.2.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extend audit_logs_event_type_chk to permit 'export_audit'
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  alter table public.audit_logs drop constraint if exists audit_logs_event_type_chk;
  alter table public.audit_logs add constraint audit_logs_event_type_chk check (
    event_type in (
      'upload', 'field_edit', 'categorize', 'approve', 'flag',
      'undo_approve', 'undo_flag', 'export_datev', 'export_audit', 'hash_verify_mismatch'
    )
  );
exception
  when duplicate_object then null;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add generated columns to invoices for archive search (FR24, NFR5)
-- ─────────────────────────────────────────────────────────────────────────────

-- invoice_number_value: extracted directly from invoice_data JSONB, no cast guard needed
-- (invoice_number.value is always text — no type coercion risk).
alter table public.invoices
  add column if not exists invoice_number_value text
    generated always as (invoice_data -> 'invoice_number' ->> 'value') stored;

-- invoice_date_value: extracted with a regex guard (mirrors gross_total_value safe-cast
-- from migration 20260424100000). AI extractor occasionally emits non-ISO dates;
-- NULL on malformed input is safer than failing the migration on one bad row.
--
-- make_date() is used instead of ::date because text::date depends on the DateStyle
-- GUC parameter and is therefore not IMMUTABLE. make_date(y, m, d) is IMMUTABLE.
alter table public.invoices
  add column if not exists invoice_date_value date
    generated always as (
      case
        when invoice_data -> 'invoice_date' ->> 'value' ~ '^\d{4}-\d{2}-\d{2}$'
        then make_date(
          left(invoice_data -> 'invoice_date' ->> 'value', 4)::int,
          substring(invoice_data -> 'invoice_date' ->> 'value', 6, 2)::int,
          right(invoice_data -> 'invoice_date' ->> 'value', 2)::int
        )
        else null
      end
    ) stored;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Add supporting composite indexes (NFR5 <1s budget)
-- ─────────────────────────────────────────────────────────────────────────────

-- Covers: date range + fiscal year filter + default chronological sort
create index if not exists invoices_tenant_invoice_date_idx
  on public.invoices (tenant_id, invoice_date_value desc nulls last);

-- Covers: exact / prefix invoice_number search
-- Note: ILIKE with a leading wildcard cannot use btree, but prefix match and exact match can.
create index if not exists invoices_tenant_invoice_number_idx
  on public.invoices (tenant_id, invoice_number_value);

-- Partial index: covers export-time batch sha256 verification (Story 4.1 deferred).
-- WHERE sha256 IS NOT NULL keeps the index small — legacy rows without a hash are
-- not verified during export (they get verification_status = 'legacy').
create index if not exists invoices_tenant_sha256_idx
  on public.invoices (tenant_id, sha256) where sha256 is not null;
