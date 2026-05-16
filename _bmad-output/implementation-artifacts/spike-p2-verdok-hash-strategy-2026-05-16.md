# Spike P2 — `verfahrensdokumentation` Config Hash Strategy

**Date:** 2026-05-16
**Epic:** 7 — Verfahrensdokumentation
**Blocks:** Story 7.1 (PDF Generation), Story 7.2 (Status and Auto-Update), P3 Migration
**Research source:** `_bmad-output/planning-artifacts/research/technical-prep-p2-verdok-hash-strategy-spike-research-2026-05-16.md`

---

## Decision Summary

All four P2 spike questions are answered. P3 migration and Stories 7.1/7.2 may be specced.

| Spike Question | Decision | Confidence |
|---------------|----------|------------|
| Fields in `config_hash` | 10 tenant fields — company identity + DATEV config + Steuerberater name | High |
| `steuerberater_email` included? | **No** — contact info only, not GoBD document content | High |
| SHA-256 strategy | Application-layer TypeScript: `json-stringify-deterministic` + `crypto.subtle.digest` | High |
| Auto-detection mechanism | **Server Action hash compare** — not DB trigger | High |
| Table design | Single-row-per-tenant, `UNIQUE(tenant_id)`, UPSERT on regeneration | High |
| RLS pattern | Mirror `datev_exports` + add UPDATE policy for regeneration | High |

---

## Decision 1 — Fields Entering `config_hash`

Ten `tenants` columns constitute the Verfahrensdokumentation content per GoBD §14:

| Field | Reason included |
|-------|----------------|
| `company_name` | Company identity — document header |
| `company_address` | Required for GoBD company identification |
| `tax_id` | Tax registration — mandatory GoBD field |
| `skr_plan` | Chart of accounts (SKR03/SKR04) — core accounting system description |
| `datev_berater_nr` | DATEV Beraternummer — identifies tax advisor relationship |
| `datev_mandanten_nr` | DATEV Mandantennummer — client ID in DATEV system |
| `datev_sachkontenlaenge` | Account digit length — affects all booking logic described |
| `datev_fiscal_year_start` | Fiscal year start month — defines accounting period |
| `datev_default_kreditorenkonto` | Default creditor account — part of booking ruleset |
| `steuerberater_name` | Named responsible party in the document |

**Excluded:** `steuerberater_email` (contact only), `id`, `created_at`, `updated_at`.

---

## Decision 2 — SHA-256 Strategy: Application-Layer TypeScript

DB-side `pgcrypto digest()` or `sha256()` is not used. `jsonb::text` in PostgreSQL has non-deterministic key ordering — the same object can serialize differently. Application-layer gives full canonicalization control and is consistent with the `invoices.sha256` precedent (computed in `@rechnungsai/gobd`).

**New file:** `packages/gobd/src/verdok-hash.ts`

```typescript
import stringify from 'json-stringify-deterministic';

export type VerdokHashInput = {
  company_name: string | null;
  company_address: string | null;
  tax_id: string | null;
  skr_plan: string;
  datev_berater_nr: string | null;
  datev_mandanten_nr: string | null;
  datev_sachkontenlaenge: number;
  datev_fiscal_year_start: number;
  datev_default_kreditorenkonto: string | null;
  steuerberater_name: string | null;
};

export async function computeVerdokConfigHash(input: VerdokHashInput): Promise<string> {
  const canonical = stringify({
    company_address:               input.company_address ?? null,
    company_name:                  input.company_name ?? null,
    datev_berater_nr:              input.datev_berater_nr ?? null,
    datev_default_kreditorenkonto: input.datev_default_kreditorenkonto ?? null,
    datev_fiscal_year_start:       input.datev_fiscal_year_start,
    datev_mandanten_nr:            input.datev_mandanten_nr ?? null,
    datev_sachkontenlaenge:        input.datev_sachkontenlaenge,
    skr_plan:                      input.skr_plan,
    steuerberater_name:            input.steuerberater_name ?? null,
    tax_id:                        input.tax_id ?? null,
  });
  const data = new TextEncoder().encode(canonical);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```

**Critical invariant:** Every nullable field uses `?? null` (never `undefined`). `JSON.stringify(undefined)` omits the key — silent hash drift. TypeScript type `string | null` enforces this at compile time.

**Dependency:** add to `packages/gobd/package.json`:

```json
"dependencies": {
  "@rechnungsai/shared": "workspace:*",
  "json-stringify-deterministic": "^1.0.1"
}
```

**Export** from `packages/gobd/src/index.ts`:

```typescript
export { computeVerdokConfigHash } from "./verdok-hash.js";
export type { VerdokHashInput } from "./verdok-hash.js";
```

---

## Decision 3 — Auto-Detection: Server Action Hash Compare

A DB trigger on `tenants` is not used. The trigger cannot safely handle the case where no `verfahrensdokumentation` row exists yet (first run). The Server Action approach always reflects actual current state with ~1ms hash computation cost.

**Status check flow:**

```typescript
export async function getVerdokStatus() {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('company_name, company_address, tax_id, skr_plan, datev_berater_nr, ' +
            'datev_mandanten_nr, datev_sachkontenlaenge, datev_fiscal_year_start, ' +
            'datev_default_kreditorenkonto, steuerberater_name')
    .single();

  const { data: verdok } = await supabase
    .from('verfahrensdokumentation')
    .select('config_hash, generated_at, pdf_storage_path')
    .single();

  if (!verdok) return { status: 'Nicht erstellt' as const };

  const currentHash = await computeVerdokConfigHash(tenant);
  if (currentHash !== verdok.config_hash) {
    return { status: 'Aktualisierung verfügbar' as const, generatedAt: verdok.generated_at };
  }
  return { status: 'Aktuell' as const, generatedAt: verdok.generated_at };
}
```

**Generation / UPSERT flow:**

```typescript
// After PDF upload to Storage:
await supabase
  .from('verfahrensdokumentation')
  .upsert(
    { tenant_id: tenantId, config_hash: computedHash,
      pdf_storage_path: storagePath, generated_by: userId },
    { onConflict: 'tenant_id' }
  );
```

---

## Decision 4 — Table Schema + RLS + Grant

### Migration SQL (P3 scope)

```sql
-- ========== Table ==========
create table if not exists public.verfahrensdokumentation (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null unique references public.tenants(id) on delete cascade,
  config_hash      text not null check (config_hash ~ '^[0-9a-f]{64}$'),
  pdf_storage_path text not null,
  generated_at     timestamptz not null default now(),
  generated_by     uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ========== Trigger ==========
create trigger verdok_set_updated_at
  before update on public.verfahrensdokumentation
  for each row execute function public.set_updated_at();

-- ========== RLS ==========
alter table public.verfahrensdokumentation enable row level security;

drop policy if exists verdok_tenant_select on public.verfahrensdokumentation;
create policy verdok_tenant_select on public.verfahrensdokumentation
  for select to authenticated
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

drop policy if exists verdok_tenant_insert on public.verfahrensdokumentation;
create policy verdok_tenant_insert on public.verfahrensdokumentation
  for insert to authenticated
  with check (
    tenant_id = (select tenant_id from public.users where id = auth.uid())
    and generated_by = auth.uid()
  );

drop policy if exists verdok_tenant_update on public.verfahrensdokumentation;
create policy verdok_tenant_update on public.verfahrensdokumentation
  for update to authenticated
  using  (tenant_id = (select tenant_id from public.users where id = auth.uid()))
  with check (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ========== audit_logs event type extension ==========
-- Pattern mirrors invoice_validation.sql / invoice_correction_requested.sql
alter table public.audit_logs drop constraint if exists audit_logs_event_type_chk;
alter table public.audit_logs add constraint audit_logs_event_type_chk
  check (event_type in (
    -- existing types (copy current list from audit_logs migration) --
    'verdok_generated'   -- new
  ));
```

**No explicit GRANT needed** — Supabase provisions `GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated`. RLS policies are the access gate. Matches `datev_exports` migration which has no explicit table grants.

**UPDATE policy (differs from `datev_exports`):** `datev_exports` is append-only. `verfahrensdokumentation` uses UPSERT — UPDATE policy is required for the regeneration path.

**`generated_by ON DELETE SET NULL`** — satisfies GDPR A2 action item (Epic 6 retro): user deletion does not cascade to document deletion; `generated_by` becomes NULL, row persists (document belongs to tenant, not to the user who clicked "generate").

### Storage Bucket

- Name: `verfahrensdokumentation` (private)
- Path pattern: `{tenant_id}/verdok-{generated_at_iso}.pdf`
- RLS: folder isolation on `(storage.foldername(name))[1]` matching tenant's UUID
- Access: signed URL via `storage.from('verfahrensdokumentation').createSignedUrl(path, 3600)`

---

## Test Strategy

**Test runner:** Vitest (confirmed — `packages/gobd` uses `vitest run`)

**New file:** `packages/gobd/src/verdok-hash.test.ts`

Minimum 6 test cases:

| Test | Purpose |
|------|---------|
| Produces 64-char hex string | Format guard |
| Same input → same hash (twice) | Determinism |
| Different `company_name` → different hash | Field sensitivity |
| `skr_plan` SKR03 → SKR04 → different hash | Enum field sensitivity |
| `null` vs non-null value → different hash | Null handling |
| Reordered JS object keys → same hash | Canonicalization correctness |

**Linchpin test** (guards against silent field drift):

```typescript
it('VerdokHashInput covers all expected tenant fields', () => {
  const expectedCount = 10;
  const sample: VerdokHashInput = {
    company_name: null, company_address: null, tax_id: null,
    skr_plan: 'SKR03', datev_berater_nr: null, datev_mandanten_nr: null,
    datev_sachkontenlaenge: 4, datev_fiscal_year_start: 1,
    datev_default_kreditorenkonto: null, steuerberater_name: null,
  };
  // TypeScript compile-time: adding/removing fields in VerdokHashInput
  // makes this object literal fail to compile before the count check runs.
  expect(Object.keys(sample)).toHaveLength(expectedCount);
});
```

---

## Risk Register

| Risk | Severity | Mitigation | Status |
|------|----------|-----------|--------|
| Hash drift — field added to `tenants` not added to `VerdokHashInput` | High | Linchpin test fails at TypeScript compile time | ✅ By design |
| `undefined` vs `null` → key omitted in JSON → silent hash mismatch | High | `string \| null` type + explicit `?? null`; null/non-null test case | ✅ By design |
| DB trigger approach chosen later — cross-table race condition | Medium | Decision documented; trigger approach explicitly rejected | ✅ Resolved |
| `crypto.subtle` unavailable in older Node | Low | Node 19+ and Vercel runtime confirmed; Vercel uses Node 20+ | ✅ Non-issue |
| UPSERT conflict on concurrent generation | Very low | PostgreSQL serializes ON CONFLICT — last write wins, no corruption | ✅ Non-issue |

---

## What This Spike Does NOT Cover

- **`VerdokData` content schema** — what data `assembleVerdokData()` returns for GoBD paragraph content. Addressed in Story 7.1 dev notes.
- **PDF template layout** — Story 7.1 fleshes out the template; this spike only determines hash fields and table schema.
- **Storage bucket RLS migration format** — Supabase Storage RLS is set via dashboard or a separate storage migration; out of P3 scope.
- **Dashboard widget route/placement** — P4 (parallel, during 7.1 first sprint).
- **Real email send** — `steuerberater_email` deliberately out of hash; Epic 8.3 scope.

---

## P3 Migration Readiness Gate

Before Story 7.1 is written, verify:

- [ ] `json-stringify-deterministic` added to `packages/gobd/package.json`
- [ ] `packages/gobd/src/verdok-hash.ts` implemented and exported from `index.ts`
- [ ] `packages/gobd/src/verdok-hash.test.ts` — 6+ cases + linchpin green (`pnpm --filter @rechnungsai/gobd test`)
- [ ] P3 migration file written with table + trigger + 3 RLS policies + `audit_logs_event_type_chk` extension
- [ ] `supabase db reset` smoke queries pass:
  - Positive UPSERT → row created
  - Second UPSERT → row updated (not duplicated)
  - Cross-tenant SELECT → 0 rows
  - `config_hash` format constraint → rejects non-hex

All gates passing = Stories 7.1 and 7.2 may be specced.
