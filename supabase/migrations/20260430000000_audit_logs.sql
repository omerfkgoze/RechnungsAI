-- Story 4.2: audit_logs — append-only GoBD audit trail.
--
-- Legal basis (cited so the Verfahrensdokumentation generator (Epic 7) can reference):
--   • §§238-241 HGB — Buchführungspflicht, Vollständigkeit, Unveränderbarkeit
--   • GoBD Tz. 14 — Nachvollziehbarkeit (every step traceable)
--   • GoBD Tz. 64-67 — Unveränderbarkeit: every change logs old + new value, user, timestamp
--   • GoBD Tz. 100-107 — Maschinelle Auswertbarkeit (machine-readable for §147 AO Z1/Z2/Z3)
--
-- Immutability posture (RLS-level, not just app-level):
--   • RLS enabled with INSERT + SELECT policies only.
--   • NO UPDATE policy → any UPDATE attempt by `authenticated` is denied by RLS.
--   • NO DELETE policy → any DELETE attempt is denied by RLS.
--   • GRANTs are `select, insert` only (column-grant discipline from Story 1.5/2.1/4.1).
--   • Only `service_role` could mutate, and `service_role` does NOT exist in this codebase.
--
-- Retention: 10-year retention enforced by absence of any DELETE path (mirrors invoices
-- and storage.objects pattern from Story 4.1).
--
-- Scale (NFR15): supports 5M document records via three composite indexes covering the
-- three common query patterns (dashboard day-window, per-invoice history, event-filter).
--
-- Backfill: NOT performed — events prior to Story 4.2 are captured in
-- invoice_field_corrections (Story 3.2) and categorization_corrections (Story 3.3).
-- Mixing those tables into audit_logs would corrupt the temporal record.

create table public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete restrict,
  invoice_id      uuid references public.invoices(id) on delete restrict,
  actor_user_id   uuid not null references auth.users(id) on delete restrict,
  event_type      text not null,
  field_name      text,
  old_value       text,
  new_value       text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

do $$
begin
  alter table public.audit_logs
    add constraint audit_logs_event_type_chk
    check (event_type in (
      'upload','field_edit','categorize','approve','flag',
      'undo_approve','undo_flag','export_datev','hash_verify_mismatch'
    ));
exception
  when duplicate_object then null;
end $$;

alter table public.audit_logs enable row level security;

create policy "audit_logs_insert_own"
  on public.audit_logs for insert to authenticated
  with check (tenant_id = public.my_tenant_id());

create policy "audit_logs_select_own"
  on public.audit_logs for select to authenticated
  using (tenant_id = public.my_tenant_id());

-- Intentionally NO UPDATE policy and NO DELETE policy.
-- Absence of policy = denial under RLS for authenticated role.

grant select, insert on public.audit_logs to authenticated;
-- Intentionally NO `grant update` and NO `grant delete`.

create index audit_logs_tenant_created_idx
  on public.audit_logs (tenant_id, created_at desc);

create index audit_logs_tenant_invoice_created_idx
  on public.audit_logs (tenant_id, invoice_id, created_at desc);

create index audit_logs_tenant_event_created_idx
  on public.audit_logs (tenant_id, event_type, created_at desc);

comment on table public.audit_logs is
  'GoBD §239 Abs. 3 HGB immutable audit trail. Append-only via RLS posture (no UPDATE/DELETE policies). 10-year retention by absence of deletion path.';
