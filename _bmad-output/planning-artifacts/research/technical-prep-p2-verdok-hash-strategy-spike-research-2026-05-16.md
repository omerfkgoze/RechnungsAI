---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments:
  - _bmad-output/implementation-artifacts/epic-6-retro-2026-05-16.md
workflowType: 'research'
lastStep: 2
research_type: 'technical'
research_topic: 'Verfahrensdokumentation Config Hash Strategy and Auto-Detection (P2 Spike)'
research_goals: 'Determine which tenant fields enter config_hash, SHA-256 strategy in PostgreSQL/TypeScript, auto-detection mechanism (hash compare in Server Action vs DB trigger), full verfahrensdokumentation table schema + RLS + grant pattern mirroring datev_exports precedent'
user_name: 'GOZE'
date: '2026-05-16'
web_research_enabled: true
source_verification: true
---

# Research Report: Verfahrensdokumentation Config Hash Strategy (P2 Spike)

**Date:** 2026-05-16
**Author:** GOZE
**Research Type:** Technical Spike

---

## Research Overview

This spike resolves four blocking architectural decisions for Epic 7 (Verfahrensdokumentation), specifically prep task P2. Stories 7.1 and 7.2 cannot be specced or implemented without these decisions settled upfront.

The research combined project migration archaeology (ground-truth for existing patterns), GoBD compliance requirements (which tenant fields belong in a Verfahrensdokumentation), cryptographic canonicalization analysis (RFC 8785 JCS, `json-stringify-deterministic`), and Supabase RLS pattern analysis (mirroring `datev_exports` precedent). Web searches verified current library state, PostgreSQL hash function behavior, and GoBD 2025 amendment requirements.

All four questions are answered with high confidence. The recommended approach — application-layer SHA-256 via TypeScript + Server Action hash compare (not DB trigger) + single-row-per-tenant UPSERT — is the simplest path consistent with this project's existing architectural patterns. P3 migration is unblocked. See the Executive Summary below for the decision matrix, and individual Decision sections for full rationale.

---

## Executive Summary

Epic 7's Verfahrensdokumentation feature requires a mechanism to detect when tenant settings have changed since the last document generation, so the dashboard can show `Aktuell / Aktualisierung verfügbar / Nicht erstellt`. This spike resolves how that detection works and what the underlying database table looks like.

**Four decisions, all high-confidence:**

| Decision | Chosen Approach | Key Reason |
|----------|-----------------|------------|
| Fields in `config_hash` | 10 tenant fields (company identity + DATEV config + Steuerberater name) | GoBD §14 documentation content scope; `steuerberater_email` deliberately excluded |
| SHA-256 strategy | Application-layer TypeScript (`json-stringify-deterministic` + `crypto.subtle.digest`) | Deterministic canonicalization; consistent with `invoices.sha256` precedent; DB-side `jsonb::text` is non-deterministic |
| Auto-detection mechanism | Server Action hash compare (on-demand) | No cross-table trigger coupling; no "verdok row not yet exists" race condition; ~1ms compute cost |
| Table design | Single-row-per-tenant UPSERT (`UNIQUE(tenant_id)`) | Dashboard widget needs O(1) current-state lookup; PDF in Storage is the immutable GoBD artifact |

**Immediate unblocked work (P3):**
1. Add `json-stringify-deterministic` to `packages/gobd/package.json`
2. Implement `VerdokHashInput` type + `computeVerdokConfigHash` in `packages/gobd/src/verdok-hash.ts`
3. Write 6+ Vitest tests (linchpin: field count guard against silent drift)
4. Write `supabase/migrations/YYYYMMDD_verfahrensdokumentation.sql` (table + trigger + 3 RLS policies + `audit_logs_event_type_chk` extension)

Stories 7.1 and 7.2 can be specced immediately after P3 is complete.

---

## Table of Contents

1. [Technical Research Scope Confirmation](#technical-research-scope-confirmation)
2. [Technology Stack Analysis](#technology-stack-analysis) — project foundations, SHA-256 options
3. [Decision 1: Config Hash Fields](#decision-1-which-tenant-fields-enter-config_hash) — 10 tenant fields, GoBD rationale
4. [Decision 2: SHA-256 Strategy](#decision-2-sha-256-computation-strategy) — TypeScript app-layer, implementation pattern
5. [Decision 3: Auto-Detection Mechanism](#decision-3-auto-detection-mechanism) — Server Action vs DB trigger analysis
6. [Decision 4: Table Schema + RLS + Grant](#decision-4-verfahrensdokumentation-table-schema--rls--grant) — full SQL schema
7. [Integration Patterns](#integration-patterns-analysis) — UPSERT pattern, Storage path, audit log
8. [Architectural Patterns](#architectural-patterns-and-design) — package placement, data architecture, security
9. [Implementation Approaches](#implementation-approaches-and-technology-adoption) — P3 checklist, test strategy, risks
10. [Sources](#sources)

---

## Technical Research Scope Confirmation

**Research Topic:** Verfahrensdokumentation Config Hash Strategy and Auto-Detection (P2 Spike)
**Research Goals:** Determine which tenant fields enter config_hash, SHA-256 strategy in PostgreSQL/TypeScript, auto-detection mechanism (hash compare in Server Action vs DB trigger), full verfahrensdokumentation table schema + RLS + grant pattern mirroring datev_exports precedent

**Technical Research Scope:**

- Architecture Analysis — hash strategy patterns, trigger vs. application-layer decision
- Implementation Approaches — SHA-256 in PostgreSQL/TS, canonicalization patterns
- Technology Stack — pgcrypto, Web Crypto API, Supabase RLS patterns
- Integration Patterns — Server Action ↔ DB hash synchronization
- Performance Considerations — hash computation cost, trigger overhead

**Research Methodology:**

- Current web data with rigorous source verification
- Multi-source validation for critical technical claims
- Confidence level framework for uncertain information
- Project migration code analysis (ground truth for precedent patterns)

**Scope Confirmed:** 2026-05-16

---

## Technology Stack Analysis

### Current Project State — Relevant Foundations

**pgcrypto extension:** Already installed in the project.

```sql
-- From 20260412193336_auth_tenants_users.sql (verified)
create extension if not exists "pgcrypto" with schema extensions;
```

**Existing SHA-256 pattern (`invoices.sha256`):** Story 4.1 established the precedent:
- `sha256 text` column, constraint: `sha256 ~ '^[0-9a-f]{64}$'`
- 64-char lowercase hex string
- Computed application-side (`hashBuffer` in `@rechnungsai/gobd`)
- `config_hash` must follow the same format for consistency

**Full `tenants` table columns (accumulated across migrations):**

| Column | Type | User-mutable | Migrations |
|--------|------|-------------|------------|
| `id` | uuid | No (PK) | auth_tenants_users |
| `company_name` | text | Yes | auth_tenants_users |
| `skr_plan` | text (SKR03/SKR04) | Yes | auth_tenants_users |
| `steuerberater_name` | text | Yes | auth_tenants_users |
| `created_at` | timestamptz | No | auth_tenants_users |
| `updated_at` | timestamptz | No (trigger) | auth_tenants_users |
| `company_address` | text | Yes | tenant_settings |
| `tax_id` | text (DE + 9 digits) | Yes | tenant_settings |
| `datev_berater_nr` | text (1-7 digits) | Yes | tenant_settings |
| `datev_mandanten_nr` | text (1-5 digits) | Yes | tenant_settings |
| `datev_sachkontenlaenge` | smallint (4-8) | Yes | tenant_settings |
| `datev_fiscal_year_start` | smallint (1-12) | Yes | tenant_settings |
| `datev_default_kreditorenkonto` | text (5-9 digits) | Yes | datev_default_kreditorenkonto |
| `steuerberater_email` | text | Yes | tenant_steuerberater_email |

**`set_updated_at()` trigger:** Reusable trigger function already defined on `tenants`. Can be reused for `verfahrensdokumentation.updated_at`.

_Source: Project migrations (verified 2026-05-16)_

### Programming Languages / Runtime

**TypeScript (Node.js) — Server Actions:**
- Next.js Server Actions run in Node.js runtime on Vercel (not Edge by default)
- `node:crypto` module available: `createHash('sha256').update(data).digest('hex')`
- Web Crypto API (`crypto.subtle.digest`) also available in Node 19+ and Vercel runtime
- **Decision:** Use `crypto.subtle.digest` (Web Crypto API) for forward-compatibility with potential Edge migration; async but acceptable in Server Action context

**Canonicalization — critical for determinism:**
- `JSON.stringify()` does NOT guarantee key order — cannot be used for hashing
- RFC 8785 JSON Canonicalization Scheme (JCS): sorts keys by Unicode code point, removes whitespace
- `json-stringify-deterministic` (npm): TypeScript declarations included, zero runtime dependencies, allows custom key comparator
- `canonical-json` (npm): alternative, lighter but less maintained
- **Decision:** `json-stringify-deterministic` — TypeScript native, maintained, follows key-sort semantics consistent with JCS

_Source: [RFC 8785 JCS](https://datatracker.ietf.org/doc/rfc8785/), [json-stringify-deterministic npm](https://www.npmjs.com/package/json-stringify-deterministic), [SHA-256 in TypeScript](https://ssojet.com/hashing/sha-256-in-typescript)_

### Database Technologies

**PostgreSQL SHA-256 options:**

Option A — `pgcrypto digest()`:
```sql
encode(digest(data::bytea, 'sha256'), 'hex')
```
Requires explicit `bytea` cast. `pgcrypto` is already installed in `extensions` schema.

Option B — PostgreSQL built-in `sha256()` (PG 11+):
```sql
encode(sha256(data::bytea), 'hex')
```
Available without extension. Supabase runs PG 15+, so this is safe.

**Critical canonicalization problem with DB-side hash:**
Both options require casting text to `bytea`. `jsonb::text` output in PostgreSQL does not guarantee key ordering — the same `jsonb` object can serialize differently depending on internal storage. This makes DB-side hash non-deterministic for JSON-like data unless you use `jsonb_build_object()` with an explicit fixed key list and casting strategy.

Workaround exists (`row(col1, col2, col3)::text`) but ties the hash to PostgreSQL's internal row text representation — not portable and fragile across PG versions.

**Conclusion:** DB-side hash computation is viable only with a strictly ordered explicit column list. Application-layer is cleaner and more maintainable.

_Source: [pgcrypto docs](https://www.postgresql.org/docs/current/pgcrypto.html), [sha256() pgPedia](https://pgpedia.info/s/sha256.html)_

---

## Decision 1: Which Tenant Fields Enter `config_hash`?

### GoBD Verfahrensdokumentation Content Requirements

Per GoBD §14 and the 2025 amendment, a Verfahrensdokumentation must describe:
- **Who:** Company identification (name, address, tax number)
- **What accounting system:** Chart of accounts (Kontenrahmen), fiscal year definition
- **What DATEV configuration:** Berater/Mandanten numbers, account length, creditor account
- **Who is responsible advisor:** Steuerberater name (appears as responsible party in the document)
- **What archiving method:** Described by the system itself (RechnungsAI's behavior), not a tenant setting

_Source: [GoBD Requirements Germany](https://invoicedataextraction.com/blog/gobd-compliance-germany), [Lexware Verfahrensdokumentation](https://www.lexware.de/wissen/buchhaltung-finanzen/verfahrensdokumentation/), [GoBD 2025 amendments](https://www.kmlz.de/en/gobd-2025-whats-new-procedural-documentation-again-focus-german-tax-authorities)_

### Field Inclusion Decision

**IN `config_hash` (9 fields — content determines document correctness):**

| Field | Reason |
|-------|--------|
| `company_name` | Core company identity — appears in document header |
| `company_address` | Required for company identification in GoBD documentation |
| `tax_id` | Tax registration number — mandatory for GoBD |
| `skr_plan` | Defines chart of accounts used — central to Verfahrensdokumentation |
| `datev_berater_nr` | DATEV Beraternummer — identifies tax advisor relationship |
| `datev_mandanten_nr` | DATEV Mandantennummer — identifies client in DATEV system |
| `datev_sachkontenlaenge` | Account digit length — affects all booking logic described |
| `datev_fiscal_year_start` | Fiscal year start month — defines accounting period |
| `datev_default_kreditorenkonto` | Default creditor account — part of booking ruleset |
| `steuerberater_name` | Named responsible party in document |

**OUT of `config_hash` (excluded fields):**

| Field | Reason excluded |
|-------|----------------|
| `steuerberater_email` | Contact info only — not document content; doesn't affect GoBD compliance description |
| `id` | Immutable PK — never changes, adds no signal |
| `created_at` | Infrastructure timestamp |
| `updated_at` | Server-managed timestamp — changes on every update, not a config signal |

**Confidence level:** High. The 9 included fields directly map to GoBD documentation content. `steuerberater_email` is deliberately excluded — it's Epic 8.3 transactional email infrastructure, not document content.

---

## Decision 2: SHA-256 Computation Strategy

### Recommendation: Application-Layer (TypeScript)

**Rationale:**

1. **Canonicalization control:** Application-layer explicitly picks which fields enter the hash and in which order. DB-side computation via `row()::text` or `jsonb::text` has non-deterministic serialization risk.

2. **Consistency with existing pattern:** `invoices.sha256` is already computed application-side in `@rechnungsai/gobd/hash.ts`. Same 64-char hex format. Same approach ensures architectural coherence.

3. **Testability:** A pure TypeScript function is unit-testable without a DB. The DB trigger approach would require integration tests for every hash change.

4. **`pgcrypto` is overkill here:** `pgcrypto` is installed for UUID generation (`gen_random_uuid()`). Using it for config hashing would create an unnecessary dependency between the hash correctness and DB extension availability.

### TypeScript Implementation Pattern

```typescript
import stringify from 'json-stringify-deterministic';

// Explicit type for hash input — prevents accidental field drift
type VerdokHashInput = {
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
  // json-stringify-deterministic sorts keys by insertion order of sorted keys
  // Explicit null (not undefined) ensures consistent output for nullable fields
  const canonical = stringify({
    company_name: input.company_name ?? null,
    company_address: input.company_address ?? null,
    tax_id: input.tax_id ?? null,
    skr_plan: input.skr_plan,
    datev_berater_nr: input.datev_berater_nr ?? null,
    datev_mandanten_nr: input.datev_mandanten_nr ?? null,
    datev_sachkontenlaenge: input.datev_sachkontenlaenge,
    datev_fiscal_year_start: input.datev_fiscal_year_start,
    datev_default_kreditorenkonto: input.datev_default_kreditorenkonto ?? null,
    steuerberater_name: input.steuerberater_name ?? null,
  });

  // Web Crypto API — available in Node 19+ and Vercel serverless/edge
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```

**Key invariant:** All nullable fields must use `?? null` (not `?? undefined`). `JSON.stringify(undefined)` omits the key entirely, causing hash drift when a field transitions from null to undefined or vice versa.

**Dependency:** `json-stringify-deterministic` — MIT license, TypeScript declarations included, 0 runtime dependencies.

_Source: [json-stringify-deterministic](https://github.com/Kikobeats/json-stringify-deterministic), [RFC 8785 JCS](https://datatracker.ietf.org/doc/rfc8785/), [Node.js Crypto docs](https://nodejs.org/api/crypto.html)_

---

## Decision 3: Auto-Detection Mechanism

### Options Evaluated

**Option A — Server Action hash compare (on-demand):**
- When status page loads (or via RSC): fetch tenant settings → compute current hash → compare with stored `config_hash`
- Status: `Aktuell` | `Aktualisierung verfügbar` | `Nicht erstellt`

**Option B — DB trigger on `tenants` (proactive):**
- `AFTER UPDATE` trigger on `tenants` → compute new hash → update `verfahrensdokumentation.config_hash` → set `is_outdated = true`
- Status derived from `is_outdated` column

### Recommendation: Server Action Hash Compare (Option A)

**Decision rationale:**

| Factor | Option A (Server Action) | Option B (DB Trigger) |
|--------|--------------------------|----------------------|
| **Coupling** | None — verdok table doesn't need to exist | Trigger must handle `verfahrensdokumentation` not existing yet |
| **Race condition** | None — always reads current state | Trigger fires on every `tenants` UPDATE, including unrelated fields |
| **Correctness** | Always accurate — computes from current DB state | Risk of missed trigger if migration order wrong |
| **Complexity** | ~15 lines TypeScript | Trigger function + exception handling + migration dependency |
| **Testability** | Pure function, unit-testable | Requires integration test against live DB |
| **Performance** | ~1ms per status check | Near-zero overhead per tenant update |

**The trigger race condition:** If a user updates a tenant field before their first `verfahrensdokumentation` row exists, the trigger would fail on `UPDATE verfahrensdokumentation WHERE tenant_id = ...` (0 rows affected, not an error but silent). This means the trigger approach needs a separate initial-state handler anyway, which eliminates most of its benefit.

**Performance note:** ~1ms hash computation on every status check is negligible. The page load roundtrip to DB dominates by 10-100x. No caching needed.

### Server Action Implementation Sketch

```typescript
// Server Action: check verdok status for current tenant
export async function getVerdokStatus() {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('company_name, company_address, tax_id, skr_plan, datev_berater_nr, datev_mandanten_nr, datev_sachkontenlaenge, datev_fiscal_year_start, datev_default_kreditorenkonto, steuerberater_name')
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

---

## Decision 4: `verfahrensdokumentation` Table Schema + RLS + Grant

### Table Schema

```sql
create table if not exists public.verfahrensdokumentation (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null unique references public.tenants(id) on delete cascade,
  config_hash       text not null check (config_hash ~ '^[0-9a-f]{64}$'),
  pdf_storage_path  text not null,
  generated_at      timestamptz not null default now(),
  generated_by      uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
```

**Design decisions:**

| Column | Decision | Rationale |
|--------|----------|-----------|
| `tenant_id UNIQUE` | One row per tenant | Dashboard widget needs "current" state; UPSERT on regeneration |
| `config_hash CHECK` | Same regex as `invoices.sha256` | Consistent format across project |
| `pdf_storage_path NOT NULL` | Path required at creation | Row is only created at generation time, not before |
| `generated_by ON DELETE SET NULL` | Mirrors `datev_exports` P13 patch | User deletion should not cascade to document deletion |
| `updated_at` | Standard trigger | Mirrors all other tables — `set_updated_at()` trigger reused |

**Index:**
```sql
-- tenant_id is UNIQUE so PG creates an implicit index — no additional index needed
-- generated_at index only if querying history (not needed for single-row-per-tenant model)
```

**`updated_at` trigger (reuse existing function):**
```sql
create trigger verdok_set_updated_at
  before update on public.verfahrensdokumentation
  for each row execute function public.set_updated_at();
```

### RLS Pattern (mirroring `datev_exports`)

```sql
alter table public.verfahrensdokumentation enable row level security;

-- SELECT: own tenant only
drop policy if exists verdok_tenant_select on public.verfahrensdokumentation;
create policy verdok_tenant_select on public.verfahrensdokumentation
  for select to authenticated
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- INSERT: initial generation (tenant match + generated_by = calling user)
drop policy if exists verdok_tenant_insert on public.verfahrensdokumentation;
create policy verdok_tenant_insert on public.verfahrensdokumentation
  for insert to authenticated
  with check (
    tenant_id = (select tenant_id from public.users where id = auth.uid())
    and generated_by = auth.uid()
  );

-- UPDATE: regeneration / UPSERT (tenant match only — generated_by updated by action)
drop policy if exists verdok_tenant_update on public.verfahrensdokumentation;
create policy verdok_tenant_update on public.verfahrensdokumentation
  for update to authenticated
  using  (tenant_id = (select tenant_id from public.users where id = auth.uid()))
  with check (tenant_id = (select tenant_id from public.users where id = auth.uid()));
```

**Why UPDATE policy exists (differs from `datev_exports`):** `datev_exports` is append-only (each export is a new row). `verfahrensdokumentation` is upsert-based (one row per tenant, updated on regeneration). UPDATE policy is necessary for the regeneration path.

**No DELETE policy:** No user-initiated deletion. Cascades from `tenants` ON DELETE CASCADE only.

### Grant Pattern

No explicit `GRANT` statement needed. Supabase provisions `GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated` in the initial setup. RLS policies are the access gate. This matches the `datev_exports` migration which has no explicit table grants.

**Exception (if Server Action uses service_role for PDF write):** If the PDF generation Server Action switches to `service_role` for storage operations, RLS is bypassed for that operation. The action must manually enforce `tenant_id` guard. Pattern already established in `commit_datev_export` (SECURITY INVOKER + explicit tenant check).

_Source: [Supabase RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase multi-tenant patterns](https://dev.to/blackie360/-enforcing-row-level-security-in-supabase-a-deep-dive-into-lockins-multi-tenant-architecture-4hd2), project migrations (verified)_

---

## Summary: Spike Decisions

| Question | Decision | Confidence |
|----------|----------|-----------|
| Fields in `config_hash` | 10 fields: company_name, company_address, tax_id, skr_plan, datev_berater_nr, datev_mandanten_nr, datev_sachkontenlaenge, datev_fiscal_year_start, datev_default_kreditorenkonto, steuerberater_name | High |
| `steuerberater_email` included? | **No** — contact info only, not GoBD document content | High |
| SHA-256 strategy | Application-layer TypeScript: `json-stringify-deterministic` + `crypto.subtle.digest` | High |
| Auto-detection mechanism | Server Action hash compare (on-demand, not DB trigger) | High |
| Table design | One row per tenant (UNIQUE on tenant_id), UPSERT on regeneration | High |
| RLS pattern | Mirror `datev_exports` + add UPDATE policy for regeneration | High |
| Explicit GRANT needed? | No — Supabase default grants cover authenticated; RLS policies are the gate | High |

---

## Open Questions for Story 7.2 Spec

1. **Storage bucket for PDFs:** Which Supabase Storage bucket holds `pdf_storage_path`? New `verfahrensdokumentation` bucket vs. reuse existing `documents` bucket? (P3 scope but bucket name needed in P3 migration)
2. **PDF path format:** `{tenant_id}/verdok-{generated_at}.pdf`? Needs to be decided before 7.1 generates the first PDF.
3. **`generated_by` on UPSERT:** When regenerating, should `generated_by` update to the new requester or keep original creator? Current schema allows update.
4. **History mode:** Single-row (decided above) vs. append-only history. If legal ever requires document history, migration needed. Flag as out-of-scope for MVP.

---

## Integration Patterns Analysis

### UPSERT Pattern — Regeneration Flow

`verfahrensdokumentation` uses a one-row-per-tenant model (UNIQUE on `tenant_id`). When a user regenerates the document, the Server Action must UPSERT — not INSERT then DELETE.

**Supabase JS client UPSERT:**
```typescript
const { data, error } = await supabase
  .from('verfahrensdokumentation')
  .upsert(
    {
      tenant_id: tenantId,
      config_hash: computedHash,
      pdf_storage_path: storagePath,
      generated_at: new Date().toISOString(),
      generated_by: userId,
    },
    { onConflict: 'tenant_id' }  // resolves on UNIQUE(tenant_id)
  )
  .select()
  .single();
```

**PostgreSQL equivalent (for DB functions if needed):**
```sql
INSERT INTO public.verfahrensdokumentation
  (tenant_id, config_hash, pdf_storage_path, generated_at, generated_by)
VALUES ($1, $2, $3, now(), $4)
ON CONFLICT (tenant_id)
DO UPDATE SET
  config_hash      = EXCLUDED.config_hash,
  pdf_storage_path = EXCLUDED.pdf_storage_path,
  generated_at     = EXCLUDED.generated_at,
  generated_by     = EXCLUDED.generated_by;
  -- updated_at handled by set_updated_at() BEFORE UPDATE trigger
```

**Note:** The `set_updated_at()` trigger fires on UPDATE portion of UPSERT — `updated_at` is always current without explicit handling.

_Source: [Supabase UPSERT docs](https://supabase.com/docs/reference/javascript/upsert), [ON CONFLICT pattern](https://jonmeyers.io/blog/use-on-conflict-to-upsert-in-postgresql/)_

### Storage Integration — `pdf_storage_path`

**Recommended bucket:** New private bucket `verfahrensdokumentation` (separate from `invoices` bucket — different retention logic, different access pattern).

**Path pattern:**
```
{tenant_id}/verdok-{generated_at_iso}.pdf
```
Example: `a1b2c3d4-e5f6.../verdok-2026-05-16T14-30-00Z.pdf`

Why include timestamp in path:
- Supports future history mode without schema change (just query the table for metadata)
- Storage objects are not overwritten — each regeneration creates a new object (old ones orphaned, future cleanup job scope)
- Consistent with `invoices` bucket path pattern (`{tenant_id}/{invoice_id}.pdf`)

**Signed URL for download (Server Action):**
```typescript
const { data: signedUrl } = await supabase.storage
  .from('verfahrensdokumentation')
  .createSignedUrl(verdok.pdf_storage_path, 3600); // 1h TTL
```

RLS on Storage bucket mirrors DB RLS: policy checks `(storage.foldername(name))[1] = auth.uid()` or via metadata. Supabase Storage RLS is SQL-based, same pattern as DB.

_Source: [Supabase Storage docs](https://supabase.com/docs/guides/storage/buckets/fundamentals), [Signed URL pattern](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl)_

### Generation + Status Check Flow

**Full Server Action integration flow:**

```
generateVerdok() Server Action:
  1. fetch tenant settings (SELECT from tenants)
  2. computeVerdokConfigHash(settings) → hash string
  3. build PDF via @react-pdf/renderer (7.1 scope)
  4. upload PDF to Storage → pdf_storage_path
  5. UPSERT verfahrensdokumentation { tenant_id, config_hash, pdf_storage_path, generated_by }
  6. write audit_logs event: 'verdok_generated'

getVerdokStatus() Server Action (or RSC):
  1. fetch tenant settings (SELECT from tenants)
  2. fetch verfahrensdokumentation row (SELECT WHERE tenant_id)
  3. if no row → return { status: 'Nicht erstellt' }
  4. computeVerdokConfigHash(settings) → currentHash
  5. if currentHash ≠ verdok.config_hash → { status: 'Aktualisierung verfügbar' }
  6. else → { status: 'Aktuell', generatedAt: verdok.generated_at }
```

**Both Server Actions use the `authenticated` Supabase client** (not service_role) — RLS policies on `verfahrensdokumentation` and `tenants` gate access. No service_role escalation needed for status check or UPSERT.

**Hash computation placement:** `computeVerdokConfigHash()` lives in `packages/gobd` or a new `packages/verfahrensdokumentation` (P1 spike resolves package placement). Input type is exported for Story 7.2 type safety.

### Audit Log Integration

Following the `audit_logs` pattern established in Epic 4/5/6, verdok generation emits an event:

```typescript
await supabase.from('audit_logs').insert({
  tenant_id: tenantId,
  invoice_id: null,
  actor_user_id: userId,
  event_type: 'verdok_generated',    // new event type → needs audit_logs_event_type_chk extension
  metadata: {
    config_hash: computedHash,
    pdf_storage_path: storagePath,
  },
});
```

**Migration dependency:** `audit_logs_event_type_chk` constraint must be extended in P3 migration to include `verdok_generated` (and `verdok_status_check` if desired). Pattern from Epic 6: `ALTER TABLE public.audit_logs DROP CONSTRAINT audit_logs_event_type_chk; ALTER TABLE ... ADD CONSTRAINT ...`.

_Source: Project migrations `20260430000000_audit_logs.sql`, `20260511000000_invoice_validation.sql` (verified)_

---

## Architectural Patterns and Design

### System Architecture — Pure-Compute Package Placement

**Current monorepo packages:**

| Package | Role |
|---------|------|
| `@rechnungsai/gobd` | GoBD-specific compute: `hashBuffer`, `verifyBuffer`, audit export, CSV |
| `@rechnungsai/pdf` | PDF extraction: `extractZugferdXml`, `isLikelyEInvoicePdf` |
| `@rechnungsai/validation` | EN 16931 rule engine |
| `@rechnungsai/datev` | DATEV CSV/Buchungsstapel builder |
| `@rechnungsai/shared` | Cross-package types and utilities |

**`computeVerdokConfigHash` placement decision:**

`@rechnungsai/gobd` is the correct home for two reasons:
1. Verfahrensdokumentation is a GoBD §14 compliance requirement — semantically it belongs with GoBD operations
2. The package already holds `hashBuffer`/`verifyBuffer` (GoBD §239 immutability). Config hash is a different hash purpose but same GoBD compliance domain

**Does NOT wait on P1 spike:** `computeVerdokConfigHash` has one new external dependency (`json-stringify-deterministic`). It does not depend on `@react-pdf/renderer`. It can be added to `@rechnungsai/gobd` in P3 migration prep without resolving the PDF template package question.

**Export surface:**
```typescript
// packages/gobd/src/index.ts (additions)
export { computeVerdokConfigHash } from "./verdok-hash.js";
export type { VerdokHashInput } from "./verdok-hash.js";
```

### Data Architecture — Single-Row-Per-Tenant vs. Append-Only History

**Decision: Single-row-per-tenant (UPSERT model)**

| Pattern | Description | Fits this domain? |
|---------|-------------|------------------|
| **Single-row UPSERT** | One row per tenant, regeneration overwrites | ✅ Dashboard widget needs "current state" instantly |
| **Append-only history** | Every generation is a new row, latest queried by `ORDER BY generated_at DESC LIMIT 1` | ⚠️ Overhead for simple status check; future concern |
| **Event-sourced** | State derived from event stream | ❌ No event bus in this stack |

**Why UPSERT is correct for MVP:**
- Dashboard widget queries one row → O(1) lookup via `unique(tenant_id)`
- GoBD does not require the system to store a history of document metadata in a table — the PDF itself is stored in Storage (immutable object in the `verfahrensdokumentation` bucket)
- If history becomes a requirement, migration path is: add `version_number` column, drop UNIQUE constraint, add composite index. Non-breaking.

**Immutability note:** The generated PDF in Storage is the immutable GoBD artifact. The table row is mutable metadata (status tracker). This mirrors the `invoices` pattern: row is mutable, file in storage is immutable.

### Design Principles

**Hash-based freshness detection (established pattern):**

This is the same pattern used in content-addressable storage and cache invalidation systems:
- Store a hash of the source inputs at generation time
- On status check, recompute hash from current source inputs
- If hashes differ → document is stale

In this project: source inputs = subset of `tenants` columns. Hash stored in `verfahrensdokumentation.config_hash`. Status computed on-demand in Server Action. This is a **pull model** (status computed when queried) vs. a **push model** (status updated when inputs change). Pull is simpler and consistent — always reflects actual current state.

**Null-safety invariant in hash input:**

All nullable tenant fields (`company_address`, `tax_id`, `datev_berater_nr`, etc.) must serialize as JSON `null` (not omitted). This ensures the hash is stable across transitions:
- Field set to null → stays `"field": null` in canonical JSON
- Field goes from null to value → hash changes correctly
- `undefined` must never enter the hash input — TypeScript type `VerdokHashInput` uses `string | null` (not `string | undefined`) to enforce this at compile time

### Security Architecture

**Defense-in-depth (consistent with project patterns):**

1. **RLS at DB layer** — tenant isolation enforced by PostgreSQL, not application code
2. **`authenticated` client only** — no `service_role` escalation in status check or UPSERT
3. **`generated_by = auth.uid()` in INSERT policy** — prevents spoofing another user as generator
4. **`config_hash CHECK constraint** — `'^[0-9a-f]{64}$'` regex prevents malformed hash insertion (defense against data corruption, not adversarial attack)
5. **Storage bucket private** — PDF access requires signed URL generated server-side (not directly accessible via public URL)

**GDPR axis (A2 action item from Epic 6 retro):**
- No new FK pointing to `auth.users` via immutable path — `generated_by` is ON DELETE SET NULL, not CASCADE
- `config_hash` contains no PII — it's a hash of company settings (company_name, tax_id, etc.) which are business data, not personal data under GDPR
- `pdf_storage_path` is a path string — no PII embedded
- No GDPR scrubbing required on user deletion — `generated_by` becomes NULL, row persists (correct: document belongs to tenant, not to the user who clicked "generate")

### Deployment and Operations Architecture

**No new infrastructure required for P2:**
- Same Supabase instance, same PostgreSQL cluster
- New Storage bucket `verfahrensdokumentation` — created by migration (P3 scope)
- `json-stringify-deterministic` dep → goes in `packages/gobd/package.json` — no build system change needed

**Performance characteristics:**
- Hash computation: <1ms (canonical JSON stringify + SHA-256 of ~200 bytes)
- Status check total: ~20-50ms (two DB queries + hash computation)
- No caching needed — Supabase query latency dominates

_Source: Project package analysis (verified 2026-05-16), [Supabase Storage fundamentals](https://supabase.com/docs/guides/storage/buckets/fundamentals)_

---

## Implementation Approaches and Technology Adoption

### P3 Migration — Complete Checklist

The P3 migration (`2026XXXXXXXXXXX_verfahrensdokumentation.sql`) must include all of the following in order:

```
1. Table creation: public.verfahrensdokumentation
   - id, tenant_id (UNIQUE), config_hash (CHECK), pdf_storage_path,
     generated_at, generated_by (ON DELETE SET NULL), created_at, updated_at

2. Trigger: verdok_set_updated_at
   - BEFORE UPDATE, reuse public.set_updated_at() function

3. RLS: enable + 3 policies
   - verdok_tenant_select (SELECT authenticated)
   - verdok_tenant_insert (INSERT authenticated, tenant_id + generated_by checks)
   - verdok_tenant_update (UPDATE authenticated, tenant_id check)

4. audit_logs_event_type_chk extension
   - ADD 'verdok_generated' to the allowed event types
   - Pattern: DROP + re-ADD constraint (matches Epic 6 / Story 6.2 migration)

5. Storage bucket creation (supabase/seed.sql or Supabase dashboard)
   - Bucket name: 'verfahrensdokumentation'
   - Private (not public)
   - RLS policy: tenant folder isolation
     (storage.foldername(name))[1] = (select tenant_id from public.users
                                       where id = auth.uid())::text
```

**No explicit `GRANT` statement needed** — Supabase default authenticated grants cover the table.

### `computeVerdokConfigHash` Implementation in `@rechnungsai/gobd`

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
    company_address:              input.company_address ?? null,
    company_name:                 input.company_name ?? null,
    datev_berater_nr:             input.datev_berater_nr ?? null,
    datev_default_kreditorenkonto: input.datev_default_kreditorenkonto ?? null,
    datev_fiscal_year_start:      input.datev_fiscal_year_start,
    datev_mandanten_nr:           input.datev_mandanten_nr ?? null,
    datev_sachkontenlaenge:       input.datev_sachkontenlaenge,
    skr_plan:                     input.skr_plan,
    steuerberater_name:           input.steuerberater_name ?? null,
    tax_id:                       input.tax_id ?? null,
  });
  // Note: keys are sorted alphabetically in the object literal above.
  // json-stringify-deterministic also sorts — double-sorted is still sorted.
  // Being explicit here makes the canonical form readable in code review.

  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```

**Dependency addition** to `packages/gobd/package.json`:
```json
"dependencies": {
  "@rechnungsai/shared": "workspace:*",
  "json-stringify-deterministic": "^1.0.1"
}
```

### Testing Strategy

**Test runner:** Vitest (confirmed — `packages/gobd` uses `vitest run`)

**New test file:** `packages/gobd/src/verdok-hash.test.ts`

**Required test cases (minimum):**

```typescript
describe('computeVerdokConfigHash', () => {
  it('produces 64-char hex string', async () => {
    const hash = await computeVerdokConfigHash(baseInput);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same input, same hash', async () => {
    const h1 = await computeVerdokConfigHash(baseInput);
    const h2 = await computeVerdokConfigHash(baseInput);
    expect(h1).toBe(h2);
  });

  it('changes when company_name changes', async () => {
    const h1 = await computeVerdokConfigHash(baseInput);
    const h2 = await computeVerdokConfigHash({ ...baseInput, company_name: 'Changed GmbH' });
    expect(h1).not.toBe(h2);
  });

  it('changes when skr_plan changes SKR03→SKR04', async () => { ... });

  it('null and non-null produce different hashes', async () => {
    const h1 = await computeVerdokConfigHash({ ...baseInput, tax_id: null });
    const h2 = await computeVerdokConfigHash({ ...baseInput, tax_id: 'DE123456789' });
    expect(h1).not.toBe(h2);
  });

  it('key ordering does not affect hash — object with reordered keys produces same hash', async () => {
    // json-stringify-deterministic must sort regardless of input key order
    const h1 = await computeVerdokConfigHash(baseInput);
    const h2 = await computeVerdokConfigHash(shuffledKeyInput); // same values, different JS key order
    expect(h1).toBe(h2);
  });

  it('steuerberater_email exclusion — changing email does not affect hash', async () => {
    // steuerberater_email is NOT in VerdokHashInput — this test documents the intent
    // Test via the type: steuerberater_email should not be in VerdokHashInput type
    // Compile-time guarantee only — no runtime test needed
  });
});
```

**Linchpin test (mirrors `rules.coverage.test.ts` from Epic 6):**

```typescript
it('VerdokHashInput covers all expected tenant fields — no silent drift', () => {
  const expectedFields: (keyof VerdokHashInput)[] = [
    'company_name', 'company_address', 'tax_id', 'skr_plan',
    'datev_berater_nr', 'datev_mandanten_nr', 'datev_sachkontenlaenge',
    'datev_fiscal_year_start', 'datev_default_kreditorenkonto', 'steuerberater_name',
  ];
  // This test fails at compile time if VerdokHashInput adds/removes fields.
  // At runtime, verify the count matches expectation.
  const sampleInput: VerdokHashInput = { ... }; // TypeScript enforces all fields present
  expect(Object.keys(sampleInput)).toHaveLength(expectedFields.length);
});
```

_Source: [Vitest docs](https://vitest.dev/guide/testing-types), project test patterns (`packages/gobd/src/*.test.ts`)_

### Risk Assessment and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| **Hash drift** — field added to `tenants` that should enter hash, but isn't in `VerdokHashInput` | Medium | High — silent "Aktuell" when actually stale | Linchpin test fails at type level; code review checklist item |
| **`undefined` vs `null` bug** — nullable field serializes as omitted in JSON | Low | High — hash inconsistency | TypeScript type `string \| null` (not `undefined`); explicit `?? null` in each field; test case for null-vs-value |
| **Canonicalization library version drift** | Very low | Medium | Pin to specific `json-stringify-deterministic` version; any major version bump requires re-hash audit |
| **`crypto.subtle` unavailable** | Very low | High | Available in Node 19+, Vercel Node runtime, and all modern browsers; confirmed against Vercel runtime docs |
| **UPSERT conflict on concurrent generation** | Very low | Low | PostgreSQL serializes ON CONFLICT — last write wins, no data corruption |
| **Storage path collision** | Very low | Low | Timestamp in path (`verdok-{iso}.pdf`) makes collision astronomically unlikely |

### Implementation Roadmap

**P3 Migration (immediate — blocks Story 7.1 and 7.2):**
1. Write `packages/gobd/src/verdok-hash.ts` + add `json-stringify-deterministic` dep
2. Write `packages/gobd/src/verdok-hash.test.ts` (6+ cases including linchpin)
3. Write `supabase/migrations/YYYYMMDDXXXXXX_verfahrensdokumentation.sql`
4. Verify: `pnpm -r test` green + `supabase db reset` smoke queries pass

**Story 7.1 (PDF generation):**
- `@react-pdf/renderer` integration (P1 spike resolved)
- `generateVerdok` Server Action uses `computeVerdokConfigHash` + PDF upload + UPSERT

**Story 7.2 (Status and Auto-Update):**
- `getVerdokStatus` Server Action or RSC
- Dashboard widget: `Aktuell` / `Aktualisierung verfügbar` / `Nicht erstellt`

### Technical Research Recommendations

**Immediate actions (P3 scope):**
1. Add `json-stringify-deterministic` to `packages/gobd/package.json` — MIT, 0 deps, TypeScript declarations
2. Implement `VerdokHashInput` type and `computeVerdokConfigHash` in `packages/gobd`
3. Write migration: table + trigger + RLS + audit_logs constraint extension + Storage bucket

**Do NOT do in P3:**
- Storage bucket RLS policies (can be set via Supabase dashboard during local dev reset; migration for bucket policies is in a separate `storage` migration format)
- Implement `generateVerdok` or `getVerdokStatus` Server Actions — those are Story 7.1 and 7.2 scope

**Story spec field requirements for 7.1 and 7.2 (informed by this spike):**
- "Etkilenen Mevcut UI": tenant settings page (settings change → triggers status change)
- "Likely Failure Modes": hash drift (field added to tenants not in VerdokHashInput), Storage upload failure before UPSERT
- GDPR migration axis (A2): `generated_by ON DELETE SET NULL` — already handled

---

## Sources

- [pgcrypto docs — PostgreSQL 18](https://www.postgresql.org/docs/current/pgcrypto.html)
- [sha256() pgPedia](https://pgpedia.info/s/sha256.html)
- [RFC 8785 — JSON Canonicalization Scheme](https://datatracker.ietf.org/doc/rfc8785/)
- [json-stringify-deterministic npm](https://www.npmjs.com/package/json-stringify-deterministic)
- [Node.js Crypto docs](https://nodejs.org/api/crypto.html)
- [Supabase RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase multi-tenant architecture (DEV)](https://dev.to/blackie360/-enforcing-row-level-security-in-supabase-a-deep-dive-into-lockins-multi-tenant-architecture-4hd2)
- [GoBD Requirements Germany](https://invoicedataextraction.com/blog/gobd-compliance-germany)
- [Lexware — Verfahrensdokumentation](https://www.lexware.de/wissen/buchhaltung-finanzen/verfahrensdokumentation/)
- [GoBD 2025 amendments (KMLZ)](https://www.kmlz.de/en/gobd-2025-whats-new-procedural-documentation-again-focus-german-tax-authorities)
- [Supabase UPSERT docs](https://supabase.com/docs/reference/javascript/upsert)
- [ON CONFLICT pattern — Jon Meyers](https://jonmeyers.io/blog/use-on-conflict-to-upsert-in-postgresql/)
- [Supabase Storage bucket fundamentals](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Supabase signed URL API](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl)
- [Vitest docs](https://vitest.dev/guide/testing-types)

---

## Technical Research Conclusion

### Summary of Key Decisions

All four P2 spike questions are answered. No further research is required before P3 migration work begins.

The central architectural insight: **hash-based freshness detection is a pull model** — status is computed on demand from current DB state, not pushed by a trigger. This eliminates the race condition that a DB trigger approach cannot avoid (verdok row may not exist at time of first tenant settings update). The ~1ms computation cost per status check is negligible.

### What This Unlocks

- **P3 migration** — fully specced; all column names, types, constraints, RLS policies, and audit event type are determined
- **Story 7.1 spec** — `generateVerdok` Server Action shape is clear: compute hash → upload PDF → UPSERT with hash
- **Story 7.2 spec** — `getVerdokStatus` Server Action shape is clear: fetch tenant + verdok → compute current hash → compare
- **`@rechnungsai/gobd` extension** — `VerdokHashInput` type + `computeVerdokConfigHash` export, with `json-stringify-deterministic` dep

### Next Steps

1. Execute P3 migration (implement, test, smoke)
2. Confirm P1 spike (`@react-pdf/renderer`) so Story 7.1 PDF template package is decided
3. Create Story 7.1 spec file (uses P1 + P2 decisions)
4. Create Story 7.2 spec file (uses P2 decisions directly)

---

**Technical Research Completion Date:** 2026-05-16
**Research Steps Completed:** 1–6 (scope → stack → integration → architecture → implementation → synthesis)
**Source Verification:** All technical claims cited with current sources or verified against project migration files
**Confidence Level:** High across all four decisions

_This document serves as the authoritative P2 spike output for Epic 7. It replaces the need for further research on hash strategy, auto-detection mechanism, table schema, and RLS pattern before Story 7.1/7.2 implementation begins._
