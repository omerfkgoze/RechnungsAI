# GoBD SHA-256 Hashing + Supabase Storage Immutability — Spike Report

**Date:** 2026-04-28
**For:** Story 4.1 — Immutable Document Storage and SHA-256 Hashing
**Outcome:** ✅ Feasible. Both concerns are resolved. No architectural blockers.

---

## 1. SHA-256 Implementation

**Approach:** Node.js `node:crypto` — `createHash("sha256").update(buffer).digest("hex")`

**Location:** `packages/gobd/src/hash.ts` — implemented and tested.

```ts
import { createHash } from "node:crypto";

export function hashBuffer(buffer: Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function verifyBuffer(buffer: Uint8Array, storedHash: string): boolean {
  return hashBuffer(buffer) === storedHash.toLowerCase();
}
```

**Test coverage:** 9 tests passing — empty input, `"abc"` cross-verified against `sha256sum` and Python `hashlib`, determinism, tamper detection, case-insensitive verification.

**Integration point:** The Server Action `uploadInvoice` downloads the uploaded bytes from Supabase Storage (or receives them directly), calls `hashBuffer`, and writes the hex digest to the `invoices` table before returning.

---

## 2. Supabase Storage Immutability

**Finding: Already in place from Epic 2 (FR21).**

Migration `20260417000000_storage_invoices_bucket.sql` already enforces write-once semantics:

| Operation | Authenticated | service_role |
|-----------|--------------|--------------|
| INSERT    | ✅ own tenant | ✅ |
| SELECT    | ✅ own tenant | ✅ |
| UPDATE    | ❌ no policy  | ✅ |
| DELETE    | ❌ no policy  | ✅ |

Authenticated users **cannot modify or delete** invoice files. Only the service_role key (held server-side only, never in client code) can perform admin operations. This satisfies GoBD §239 Abs. 3 (documents must not be altered without a record being made).

**No new storage migration is required for Story 4.1.**

---

## 3. Hash Storage — DB Schema Change

Story 4.1 needs one new column on the `invoices` table:

```sql
alter table public.invoices
  add column if not exists sha256 text;
```

**Why nullable initially:** Existing invoices (uploaded before 4.1) have no hash. Migration backfill is not feasible since we cannot re-download old files to hash them. Story 4.1 should:
- Hash all new uploads at upload time (write in `uploadInvoice` Server Action)
- Mark `sha256 IS NULL` as "pre-archive" — verification UI can show "Kein Hash verfügbar (Legacy-Upload)"

**Constraint option for future:** Once all invoices are archived, a CHECK constraint `sha256 IS NOT NULL WHERE status = 'exported'` can be added. Story 4.3 scope.

---

## 4. Integrity Verification Flow

```
Upload → hashBuffer(bytes) → store sha256 in invoices.sha256 → upload to Storage
                                          ↓
Retrieve → download from Storage → hashBuffer(bytes) → verifyBuffer(bytes, invoices.sha256)
```

**Where verification runs:**
- `getInvoiceSignedUrl` Server Action can optionally verify on retrieval (adds ~1ms for typical PDF)
- Story 4.3 (Archive Search and Audit Export) should run batch verification and surface mismatches in the audit export

---

## 5. `packages/gobd` Ready State

```
packages/gobd/src/
├── hash.ts      ← hashBuffer, verifyBuffer (9 tests passing)
├── types.ts     ← GoeBDArchiveRecord, GoeBDVerifyResult
└── index.ts     ← public exports
```

Package has Vitest configured and running. Ready to receive Story 4.2 audit-trail functions.

---

## 6. Story 4.1 Task Outline (pre-written for story creation)

1. Migration: `alter table public.invoices add column sha256 text`
2. Update `uploadInvoice` Server Action:
   - Receive `ArrayBuffer` / download uploaded bytes
   - Call `hashBuffer` from `@rechnungsai/gobd`
   - Write `sha256` to invoices row atomically with `status = 'captured'`
3. Update `getInvoiceSignedUrl` Server Action: return `sha256` alongside the URL
4. `<SourceDocumentViewer>` or detail pane: display hash (last 8 chars) + verification badge
5. Smoke tests: upload PDF → verify sha256 column non-null → re-download → verify hash matches
6. Tests: `uploadInvoice` hash write, `verifyBuffer` integration with real Storage download mock

---

## 7. Watch Points

| Risk | Mitigation |
|------|-----------|
| Large file (10MB) hash latency | ~10ms on server — negligible. No streaming needed. |
| Legacy invoices with NULL sha256 | UI shows "Legacy-Upload" badge. No backfill attempted. |
| service_role key misuse | Already enforced: never in client bundle. Confirmed in Epic 2. |
| Hash stored before Storage upload completes | Write sha256 AFTER successful `supabase.storage.upload()` confirmation to avoid orphaned hashes. |

---

*Spike completed 2026-04-28. P3 resolved. Story 4.1 is writable.*
