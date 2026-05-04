---
title: 'P0 — invoices.ts action split into sub-files'
type: 'refactor'
created: '2026-05-04'
status: 'done'
baseline_commit: '07ad4dc2b84e6927263bab980eda4001fda2e102'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `apps/web/app/actions/invoices.ts` is 1795 lines covering four distinct domains (upload, review, approval, archive) — too large to navigate safely and will grow further with Epic 5 DATEV exports.

**Approach:** Split into five sub-files under `app/actions/invoices/`, then replace `invoices.ts` with a barrel re-exporting all public symbols. All existing imports (absolute `@/app/actions/invoices` and relative `./invoices`) remain unchanged.

## Boundaries & Constraints

**Always:**
- `"use server"` directive on every sub-file that exports Server Actions (upload, review, approval, archive).
- `shared.ts` has no `"use server"` (helper module, not a server-action file).
- Barrel `invoices.ts` keeps `"use server"` to preserve existing behavior.
- Every public export that exists today must be re-exported by the barrel — zero signature changes.
- `invoices.test.ts` must not change (imports from `./invoices` barrel — already works).
- All 13 external consumer files import from `@/app/actions/invoices` — zero changes there either.
- `pnpm test` must be green before and after.

**Ask First:**
- Any logic change beyond mechanical movement of code.
- Any decision to move `logAuditEvent` out of `shared.ts` to a dedicated file.

**Never:**
- Change function signatures, return types, or behavior.
- Rename any exported symbol.
- Split `invoices.test.ts` (scope-out — separate task).
- Add new exports not present in the original file.

</frozen-after-approval>

## Code Map

- `apps/web/app/actions/invoices.ts` — current 1795-line monolith; becomes barrel
- `apps/web/app/actions/invoices/shared.ts` — NEW: `logAuditEvent`, `AuditEventType`, `InvoiceStatus`, `invoiceIdSchema`, `invoiceStatusSchema`, `actionMethodSchema`, `approvalMethodSchema`, `blockedByStatusMessage` (unexported helper)
- `apps/web/app/actions/invoices/upload.ts` — NEW: `uploadInvoice`, `extractInvoice`; private: `inferMimeFromFilename`, `extFromMime`
- `apps/web/app/actions/invoices/review.ts` — NEW: `correctInvoiceField`, `getInvoiceSignedUrl`, `categorizeInvoice`, `updateInvoiceSKR`
- `apps/web/app/actions/invoices/approval.ts` — NEW: `approveInvoice`, `flagInvoice`, `undoInvoiceAction`
- `apps/web/app/actions/invoices/archive.ts` — NEW: `verifyInvoiceArchive`, `VerifyArchiveResult`, `searchArchivedInvoices`, `ArchiveRow`
- `apps/web/app/actions/invoices.test.ts` — unchanged; imports from `./invoices` barrel — still valid

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/app/actions/invoices/shared.ts` -- CREATE -- Move `logAuditEvent`, `AuditEventType`, `InvoiceStatus`, `invoiceIdSchema`, `invoiceStatusSchema`, `actionMethodSchema`, `approvalMethodSchema`, `blockedByStatusMessage`. No `"use server"`.
- [x] `apps/web/app/actions/invoices/upload.ts` -- CREATE -- Move `uploadInvoice`, `extractInvoice`, `inferMimeFromFilename` (private), `extFromMime` (private). Add `"use server"`. Import shared items from `./shared`.
- [x] `apps/web/app/actions/invoices/review.ts` -- CREATE -- Move `correctInvoiceField`, `getInvoiceSignedUrl`, `categorizeInvoice`, `updateInvoiceSKR`. Add `"use server"`. Import shared items from `./shared`.
- [x] `apps/web/app/actions/invoices/approval.ts` -- CREATE -- Move `approveInvoice`, `flagInvoice`, `undoInvoiceAction`. Add `"use server"`. Import shared items from `./shared`.
- [x] `apps/web/app/actions/invoices/archive.ts` -- CREATE -- Move `verifyInvoiceArchive`, `VerifyArchiveResult`, `searchArchivedInvoices`, `ArchiveRow`. Add `"use server"`. Import shared items from `./shared`. Move `import { type ArchiveQuery, PAGE_SIZE } from "@/lib/archive-query"` here.
- [x] `apps/web/app/actions/invoices.ts` -- REPLACE WITH BARREL -- five `export * from "./invoices/*"` lines. No `"use server"` on barrel (Turbopack forbids non-async exports in "use server" files; sub-files carry their own directives). Original content deleted.

**Acceptance Criteria:**
- Given the refactor is complete, when `pnpm --filter web test` runs, then all 376 tests pass with zero failures.
- Given the barrel file exists, when any existing consumer imports `from "@/app/actions/invoices"`, then TypeScript resolves the same symbols as before (verified by `pnpm --filter web tsc --noEmit`).
- Given `invoices.test.ts`, when it is run unchanged, then it imports all 11 named exports from the barrel without error.
- Given the sub-files, when each is read, then `"use server"` is present in `upload.ts`, `review.ts`, `approval.ts`, `archive.ts` and absent in `shared.ts`.

## Spec Change Log

## Design Notes

**Barrel pattern:** `invoices.ts` becomes:
```ts
"use server";
export * from "./invoices/shared";
export * from "./invoices/upload";
export * from "./invoices/review";
export * from "./invoices/approval";
export * from "./invoices/archive";
```

**`blockedByStatusMessage` placement:** Used only by `approveInvoice`, `flagInvoice`, `undoInvoiceAction` (all in `approval.ts`). Could live in `approval.ts` as a private helper instead of `shared.ts`. Either is acceptable — keep in `shared.ts` to match retro spec.

**Import chain inside sub-files:** Each sub-file imports its shared dependencies from `./shared` (not from the barrel, to avoid circular imports):
```ts
import { logAuditEvent, invoiceIdSchema, InvoiceStatus } from "./shared";
```

## Verification

**Commands:**
- `pnpm --filter web test` -- expected: all 376 tests green, 0 failures
- `pnpm --filter web tsc --noEmit` -- expected: zero TypeScript errors

## Suggested Review Order

**Split contract — start here**

- Barrel replaces 1795-line monolith; no `"use server"` (Turbopack forbids non-async re-exports from `shared.ts`)
  [`invoices.ts:1`](../../apps/web/app/actions/invoices.ts#L1)

**Shared foundation**

- No `"use server"` — internal helper module; server-only enforced by import context, not directive
  [`shared.ts:1`](../../apps/web/app/actions/invoices/shared.ts#L1)
- `logAuditEvent` definition — moved from monolith; callers remain identical
  [`shared.ts:18`](../../apps/web/app/actions/invoices/shared.ts#L18)
- Schemas and types consolidated: `invoiceIdSchema`, `InvoiceStatus`, `blockedByStatusMessage`
  [`shared.ts:53`](../../apps/web/app/actions/invoices/shared.ts#L53)

**Upload domain**

- `"use server"` + imports from `./shared` — pattern all four action files follow
  [`upload.ts:1`](../../apps/web/app/actions/invoices/upload.ts#L1)
- `uploadInvoice` — SHA-256 computed post-upload per GoBD spike Watch Point 4
  [`upload.ts:47`](../../apps/web/app/actions/invoices/upload.ts#L47)
- `extractInvoice` — optimistic-lock TOCTOU guard + extraction-attempt cap
  [`upload.ts:176`](../../apps/web/app/actions/invoices/upload.ts#L176)

**Review domain**

- `correctInvoiceField` — optimistic concurrency on `updated_at`; deep-clone path traversal
  [`review.ts:24`](../../apps/web/app/actions/invoices/review.ts#L24)
- `categorizeInvoice` — idempotency skip guard prevents bootstrap loop re-fires
  [`review.ts:247`](../../apps/web/app/actions/invoices/review.ts#L247)
- `updateInvoiceSKR` — preserves AI-detected SPECIAL_BU (44 reverse-charge, 93 intra-EU)
  [`review.ts:370`](../../apps/web/app/actions/invoices/review.ts#L370)

**Approval domain**

- `approveInvoice` — ready→ready idempotent re-stamp; review→ready status flip
  [`approval.ts:20`](../../apps/web/app/actions/invoices/approval.ts#L20)
- `undoInvoiceAction` — P1/P2/P4 snapshot validation; GoBD immutability guard on exported status
  [`approval.ts:210`](../../apps/web/app/actions/invoices/approval.ts#L210)

**Archive domain**

- `verifyInvoiceArchive` — full-file download + `verifyBuffer`; `hash_verify_mismatch` audit event
  [`archive.ts:22`](../../apps/web/app/actions/invoices/archive.ts#L22)
- `searchArchivedInvoices` — fiscal year resolution; 4-dimension filter chain
  [`archive.ts:112`](../../apps/web/app/actions/invoices/archive.ts#L112)
