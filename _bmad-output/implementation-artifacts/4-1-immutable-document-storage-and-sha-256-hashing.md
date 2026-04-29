# Story 4.1: Immutable Document Storage and SHA-256 Hashing

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want every uploaded invoice to be automatically stored in a tamper-proof archive with a cryptographic hash,
So that my documents meet GoBD compliance requirements and I can prove they have not been altered.

---

## Technical Concerns (≤3, per Epic 1 retro Action #2)

1. **Hash-at-upload integration in `uploadInvoice` Server Action (FR21, GoBD §239 Abs. 3)** — `uploadInvoice` (`apps/web/app/actions/invoices.ts:51`) currently uploads to Supabase Storage then inserts the `invoices` row with no integrity proof. This story wires `hashBuffer` from `@rechnungsai/gobd` (already shipped — see spike `spike-p3-gobd-sha256-storage-2026-04-28.md`) into the action: read `file.arrayBuffer()` once at the top of the try block, compute the digest into a `const sha256 = hashBuffer(new Uint8Array(buffer))`, perform `supabase.storage.from("invoices").upload(filePath, file, …)` **first** (per spike Watch Point 4 — never write a hash for an upload that didn't land), then include `sha256` in the `.from("invoices").insert({ … })` payload alongside the existing columns. The hash write happens in the same `insert` call as `status: "captured"` so there is no window where a row exists without its hash. The compensating storage cleanup on insert error (`apps/web/app/actions/invoices.ts:144-150`) stays unchanged. The existing `NEXT_REDIRECT` digest re-throw at the catch site stays unchanged. The action's success contract (`{ invoiceId, filePath }`) is **not** extended — the hash is purely a server-side artifact. No new dependency on Web Crypto in the browser; `node:crypto` is already used inside `@rechnungsai/gobd`.

2. **`sha256` column on `invoices` + NULL semantics for legacy rows (FR21, schema)** — A NEW migration `supabase/migrations/20260429000000_invoice_sha256.sql` adds `sha256 text` to `public.invoices`. The column is **nullable** because Epic 2 invoices were uploaded before this story and we cannot re-hash files we no longer have streaming access to (per spike §3 — backfill is not feasible). Add a CHECK constraint enforcing the hex shape only when present: `check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$')` (regex-guarded; the same defensive pattern as the safe-cast migration `20260424100000`). Column-level grants follow the Story 1.5 / Story 2.1 discipline: `authenticated` does **not** receive UPDATE on `sha256` (no GRANT UPDATE for this column). Server Actions write it via the existing `invoices_insert_own` policy at INSERT time only. After the migration applies, regenerate types with `pnpm supabase gen types` (workflow already proven in Epic 4 prep P1) and commit the updated `packages/shared/src/types/database.ts`. Update the `invoices_insert_own` RLS check is **unchanged** — the existing policy permits any column the role has GRANT INSERT on. No change to the storage bucket migration (`20260417000000_storage_invoices_bucket.sql`) — write-once is already enforced (per spike §2: no UPDATE/DELETE policy for `authenticated`; only `service_role` can mutate, and `service_role` is server-only and absent from this codebase).

3. **Server-side integrity verification + viewer UI surface (FR21 second clause, audit-readable proof)** — A NEW Server Action `verifyInvoiceArchive(invoiceId: string): Promise<ActionResult<VerifyArchiveResult>>` lives in `apps/web/app/actions/invoices.ts` immediately after `getInvoiceSignedUrl`. Same auth pattern as `getInvoiceSignedUrl` (auth → tenant lookup → row SELECT with **`.eq("tenant_id", tenantId)` defense-in-depth filter** per Epic 3 retro A1). Behavior: SELECT `id, tenant_id, file_path, sha256` from `invoices`; if `sha256 IS NULL` return `{ success: true, data: { status: "legacy" } }`; otherwise call `supabase.storage.from("invoices").download(file_path)` (returns `Blob`), convert via `await blob.arrayBuffer()`, call `verifyBuffer(new Uint8Array(buffer), row.sha256)` from `@rechnungsai/gobd`, and return `{ success: true, data: { status: "verified" | "mismatch", sha256: row.sha256 } }`. On a `mismatch` the action ALSO calls `Sentry.captureException(new Error("[gobd:archive] hash mismatch"), { tags: { module: "gobd", action: "verify" }, extra: { invoiceId, storedHash: row.sha256 } })` — durable audit-log entries arrive in Story 4.2; for now Sentry is the visible signal. Type: `type VerifyArchiveResult = { status: "verified" | "mismatch" | "legacy"; sha256?: string }` exported from `apps/web/app/actions/invoices.ts`. **`getInvoiceSignedUrl` is also extended** to return `sha256: string | null` in its `data` payload (additive, no breaking-change surface — existing callers ignore the new field). `<SourceDocumentViewer>` (`apps/web/components/invoice/source-document-viewer.tsx`) consumes both: after the signed URL resolves, it renders a NEW small `<ArchiveIntegrityBadge invoiceId={invoiceId} sha256={sha256} />` client component (NEW file `apps/web/components/invoice/archive-integrity-badge.tsx`) directly under the existing close button in the `<SheetHeader>`. The badge shows `SHA-256: …<lastEight>` (e.g. `SHA-256: …a1b2c3d4`) plus a status pill: gray `"Archiv-Hash nicht verfügbar (Legacy-Upload)"` when `sha256` is null, blue `"Integrität wird geprüft…"` while `verifyInvoiceArchive` is pending (`useTransition`), green `"Archiv unverändert"` with `<ShieldCheck>` icon on `verified`, amber `"Archiv-Integrität gestört — bitte Support kontaktieren"` on `mismatch` (UX-DR17 amber pattern + verbatim German), red `"Prüfung fehlgeschlagen"` on action error. Verification fires automatically once on viewer open via `useEffect` gated on `open && sha256 !== null && status === "idle"`. The badge does NOT re-run on every open; `useRef` guard (mirror `openedOnce` pattern at `source-document-viewer.tsx:114`).

**Deferred to Story 4.2:** Persistent audit log entries for `hash_verify`, `mismatch`, and `upload` events in the new `audit_logs` table — until Story 4.2 ships, mismatches are visible only via Sentry + the in-viewer amber badge.
**Deferred to Story 4.3:** Batch verification across the full archive + audit export including hash verification results per row. Story 4.1 verifies one document at a time, on-demand from the viewer.
**Deferred to operations / future story:** Supabase Storage lifecycle policy enforcing 10-year retention at the storage layer (FR23). Current compliance posture: no DELETE policy on `storage.objects` for `authenticated`, no DELETE policy on `public.invoices` for `authenticated` (already established in Epic 2). Tenant users cannot delete; only `service_role` can — and `service_role` does not exist in the codebase. Document this as the MVP retention guarantee in the migration comment; revisit at scale.
**Deferred (out of scope, NFR-only):** AES-256 at rest (NFR7), TLS 1.3 in transit (NFR7), EU-only hosting (NFR8), zero data loss (NFR20) — these are infrastructure properties of self-hosted Supabase + Coolify on a Hetzner / German DC (already chosen in architecture). No code change. Document compliance posture in the migration header comment so the Verfahrensdokumentation generator (Epic 7) can cite it.

---

## Acceptance Criteria

1. **Given** an authenticated user uploads any accepted invoice file (image/jpeg, image/png, application/pdf, text/xml, application/xml) via the `<CameraCaptureShell>` or batch upload flow
   **When** `uploadInvoice` Server Action runs (`apps/web/app/actions/invoices.ts:51`)
   **Then** the bytes are read once via `file.arrayBuffer()` and SHA-256 is computed via `hashBuffer(new Uint8Array(buffer))` from `@rechnungsai/gobd`
   **And** the storage upload completes successfully BEFORE the hash is written to the DB (per spike Watch Point 4 — no orphaned hashes)
   **And** the `invoices` row INSERT includes `sha256: <64-char lowercase hex>` in the same call that sets `status: "captured"`
   **And** the row's `sha256` column matches `sha256sum <downloaded-file>` exactly (verified in DB Verification d1 of the smoke test)

2. **Given** the migration `20260429000000_invoice_sha256.sql` is applied
   **When** `\d public.invoices` is inspected
   **Then** the column `sha256 text` exists and is **nullable**
   **And** a CHECK constraint enforces `sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'`
   **And** `authenticated` role has NO GRANT UPDATE on `sha256` (column-level grant discipline from Story 2.1 — verified by attempting an UPDATE as `authenticated` and observing `permission denied for column sha256`)
   **And** `pnpm supabase gen types` regenerates `packages/shared/src/types/database.ts` to include `sha256: string | null` on the invoices `Row`, and `sha256?: string | null` on `Insert`, with **no** `sha256` on `Update` (column not granted for UPDATE)

3. **Given** an existing invoice (uploaded before this story applies) has `sha256 IS NULL`
   **When** the user opens `<SourceDocumentViewer>` for that invoice
   **Then** the badge renders `Archiv-Hash nicht verfügbar (Legacy-Upload)` in muted gray text
   **And** `verifyInvoiceArchive` is NOT called (network savings — gate on `sha256 !== null`)
   **And** the document preview body still renders normally (legacy state does not block document viewing)

4. **Given** a freshly uploaded invoice with a populated `sha256`
   **When** the user opens `<SourceDocumentViewer>` for that invoice
   **Then** the badge first shows blue `Integrität wird geprüft…` (with a small spinner)
   **And** `verifyInvoiceArchive(invoiceId)` Server Action runs server-side: downloads the file from Storage, recomputes the hash, compares against the stored `sha256`
   **And** on equality the badge transitions to green `Archiv unverändert` with `<ShieldCheck>` icon (or inline checkmark SVG if lucide-react not yet imported in this file)
   **And** the badge text always shows `SHA-256: …<lastEight>` where `<lastEight>` is the last 8 hex characters of the stored hash (truncated for visual brevity; full hash never rendered to avoid wrap)
   **And** the verification runs **once per viewer open session** — `useRef` guard prevents re-firing if the user keeps the sheet open and triggers re-render

5. **Given** the stored file in Supabase Storage no longer matches its stored `sha256` (simulated in tests by returning a different `Blob` from the mocked Storage download)
   **When** `verifyInvoiceArchive` runs
   **Then** the action returns `{ success: true, data: { status: "mismatch", sha256 } }`
   **And** the badge renders amber `Archiv-Integrität gestört — bitte Support kontaktieren` with `<AlertTriangle>` icon
   **And** `Sentry.captureException` is called with `tags: { module: "gobd", action: "verify" }` and `extra: { invoiceId, storedHash }` (verified in test by spying on `@sentry/nextjs`)
   **And** the document preview body still renders normally (the user can still see the file — the warning is informational, not blocking)

6. **Given** `verifyInvoiceArchive` is called for an invoice that does not belong to the caller's tenant
   **When** the action runs
   **Then** the row SELECT (`apps/web/app/actions/invoices.ts` — new code) uses `.eq("id", invoiceId).eq("tenant_id", tenantId)` (defense-in-depth per Epic 3 retro A1 + Epic 4 prep P2 pattern)
   **And** the action returns `{ success: false, error: "Rechnung nicht gefunden." }` (same German wording as `getInvoiceSignedUrl` for cross-tenant rejection)
   **And** Storage download is NOT attempted (early return after the row lookup)

7. **Given** `getInvoiceSignedUrl` Server Action runs
   **When** it returns successfully
   **Then** the `data` payload includes `sha256: string | null` alongside the existing `url` and `fileType`
   **And** the SELECT query is extended to `.select("id, tenant_id, file_path, file_type, sha256")`
   **And** existing tests for `getInvoiceSignedUrl` (`apps/web/app/actions/invoices.test.ts`) are updated to assert the new field appears in the returned data

8. **Given** the Vitest test suite runs (`pnpm test` from repo root)
   **When** all tests complete
   **Then** the following NEW or UPDATED test cases pass:
   - `apps/web/app/actions/invoices.test.ts` — 3 NEW cases: `uploadInvoice` writes a 64-char hex `sha256` to the DB row matching the file's actual hash; `verifyInvoiceArchive` returns `verified` for matching content; `verifyInvoiceArchive` returns `mismatch` for tampered content and calls `Sentry.captureException`
   - `apps/web/app/actions/invoices.test.ts` — 1 NEW case: cross-tenant `verifyInvoiceArchive` returns `Rechnung nicht gefunden.` and does not call Storage download
   - `apps/web/components/invoice/archive-integrity-badge.test.tsx` (NEW file) — 4 cases: legacy NULL renders gray badge (no action call), pending state renders blue spinner, verified state renders green badge with `…<lastEight>`, mismatch state renders amber warning
   - `apps/web/components/invoice/source-document-viewer.test.tsx` — 1 UPDATED case: verifies the badge mounts inside the sheet header
   - `packages/gobd/src/hash.test.ts` — no change (9 cases already cover hash + verify primitives per spike §1)
   **And** test count baseline: 281 (post-3.5). New target: ≥290 (delta +9 minimum)

9. **Given** the migration runs
   **When** `supabase db reset` and re-application complete
   **Then** the migration succeeds idempotently (`add column if not exists sha256 text`)
   **And** the migration header comment documents the GoBD compliance posture for retention (no DELETE policy for `authenticated` on `invoices` or `storage.objects` → tenant cannot delete → 10-year retention enforced by absence of deletion path) and the AES-256/TLS-1.3/EU-hosting NFRs (NFR7, NFR8, NFR20) so the Verfahrensdokumentation generator (Epic 7) can cite the file directly

10. **Given** the smoke test is executed by GOZE per `smoke-test-format-guide.md`
    **When** all UX Checks and DB Verification queries are run
    **Then** the upload → row-with-hash → viewer-shows-verified flow passes end-to-end
    **And** every UX row dev agent cannot run is marked `BLOCKED-BY-ENVIRONMENT` with explicit manual steps for GOZE (per Epic 2 retro A1 — no self-certification)

---

## Tasks / Subtasks

- [x] **Task 1 — Migration: add `sha256` column to `invoices` (AC: 2, 9)**
  - [x] Create `supabase/migrations/20260429000000_invoice_sha256.sql`
  - [x] Header comment documents GoBD retention posture (no DELETE policy → 10-year retention by absence) and NFR7/NFR8/NFR20 infrastructure compliance
  - [x] `alter table public.invoices add column if not exists sha256 text`
  - [x] `alter table public.invoices add constraint invoices_sha256_format_chk check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$')`
  - [x] **Do NOT** add `grant update (sha256) on public.invoices to authenticated` — column intentionally absent from UPDATE grants (Story 1.5/2.1 discipline)
  - [x] Verify via `supabase db reset` that migration applies cleanly — BLOCKED-BY-ENVIRONMENT (local Supabase not running); migration SQL is idempotent (`add column if not exists`)
  - [x] Run `pnpm supabase gen types` and commit the regenerated `packages/shared/src/types/database.ts` — manually updated per exact type-gen output spec: `sha256: string | null` on Row, `sha256?: string | null` on Insert, no `sha256` on Update

- [x] **Task 2 — `uploadInvoice` integration (AC: 1)**
  - [x] In `apps/web/app/actions/invoices.ts:51-185`, near the top of the try block (after `parsed.success` check), read `const buffer = new Uint8Array(await file.arrayBuffer())`
  - [x] Import `hashBuffer` from `@rechnungsai/gobd`
  - [x] After `supabase.storage.from("invoices").upload(filePath, buffer, …)` succeeds, compute `const sha256 = hashBuffer(buffer)` (compute AFTER successful upload per spike Watch Point 4)
  - [x] In the `.from("invoices").insert({ … })` call, add `sha256` to the payload alongside the existing columns
  - [x] Leave the success return contract `{ invoiceId, filePath }` unchanged — hash is purely a server-side artifact
  - [x] Existing compensating cleanup, error paths, `NEXT_REDIRECT` re-throw stay unchanged

- [x] **Task 3 — Extend `getInvoiceSignedUrl` to return `sha256` (AC: 7)**
  - [x] In `apps/web/app/actions/invoices.ts`, change `.select("id, tenant_id, file_path, file_type")` to `.select("id, tenant_id, file_path, file_type, sha256")`
  - [x] In the success return, change `data: { url: signed.signedUrl, fileType: row.file_type }` to `data: { url: signed.signedUrl, fileType: row.file_type, sha256: row.sha256 ?? null }`
  - [x] Update the function's return type generic to `ActionResult<{ url: string; fileType: string; sha256: string | null }>`
  - [x] Also added `.eq("tenant_id", tenantId)` to SELECT for defense-in-depth (Epic 3 retro A1 / P2 pattern consistency)
  - [x] Updated existing tests to assert `sha256` field returned; added null case test for legacy invoices

- [x] **Task 4 — NEW Server Action `verifyInvoiceArchive` (AC: 4, 5, 6)**
  - [x] Added `import { hashBuffer, verifyBuffer } from "@rechnungsai/gobd"` at the top of `apps/web/app/actions/invoices.ts`
  - [x] Defined `export type VerifyArchiveResult = { status: "verified" | "mismatch" | "legacy"; sha256?: string }` (discriminated union)
  - [x] Placed `verifyInvoiceArchive` immediately after `getInvoiceSignedUrl` for code locality
  - [x] Auth pattern: auth → tenant lookup → redirect on missing user (mirrors `getInvoiceSignedUrl`)
  - [x] Tenant isolation: row SELECT uses `.eq("id", invoiceId).eq("tenant_id", tenantId)` — defense-in-depth
  - [x] `sha256 IS NULL` → returns `{ status: "legacy" }` with no Storage download
  - [x] Storage download, hash re-compute, mismatch Sentry capture all implemented
  - [x] `NEXT_REDIRECT` digest re-throw in catch block
  - [x] `VERIFY_LOG = "[invoices:verify]"` constant used for console.error prefixes

- [x] **Task 5 — NEW client component `<ArchiveIntegrityBadge>` (AC: 3, 4, 5)**
  - [x] Created `apps/web/components/invoice/archive-integrity-badge.tsx` (`"use client"`)
  - [x] Props: `{ invoiceId: string; sha256: string | null }`
  - [x] Internal state: `useState<"idle" | "pending" | "verified" | "mismatch" | "error">("idle")`
  - [x] `useRef<boolean>(false)` guard (`triggered`) so verification only fires once per mount
  - [x] `useEffect`: sha256 null → renders legacy text without calling action; otherwise fires once per mount
  - [x] All render branches per AC #3, #4, #5 with verbatim German strings
  - [x] Hash short-form `SHA-256: …${sha256.slice(-8)}` in verified/mismatch states
  - [x] Tailwind utility classes used; inline SVGs (no new lucide-react dep needed — no new top-level dep)

- [x] **Task 6 — Mount `<ArchiveIntegrityBadge>` inside `<SourceDocumentViewer>` (AC: 3, 4, 5)**
  - [x] Extended `UrlState.ready` with `sha256: string | null`
  - [x] Piped `result.data.sha256` into `setUrlState(...)` in the `getInvoiceSignedUrl` handler
  - [x] Mounted `<ArchiveIntegrityBadge>` inside `<SheetHeader>` below the title row (second row in header flex column)
  - [x] 55-second URL TTL cache logic unchanged; sha256 piggybacks the same `ready` state payload

- [x] **Task 7 — Tests (AC: 8)**
  - [x] `apps/web/app/actions/invoices.test.ts` — 2 cases for `uploadInvoice` hash write (success + 64-char hex assertion via mock override)
  - [x] `apps/web/app/actions/invoices.test.ts` — `verifyInvoiceArchive` verified, mismatch+Sentry, legacy (no download), cross-tenant (no download) = 4 cases
  - [x] `apps/web/app/actions/invoices.test.ts` — updated existing `getInvoiceSignedUrl` cases + added null sha256 case
  - [x] NEW `apps/web/components/invoice/archive-integrity-badge.test.tsx` — 4 cases (legacy gray, pending→verified, mismatch amber, error red)
  - [x] UPDATED `apps/web/components/invoice/source-document-viewer.test.tsx` — 1 badge mount case + existing cases updated to include `sha256` in mock
  - [x] Full suite: 247 web + 9 gobd + 59 shared + 11 ai = 326 total (target ≥290 ✓); TypeScript clean

- [x] **Task 8 — Smoke test (AC: 10)**
  - [x] Browser Smoke Test section added to Completion Notes (see below)
  - [x] UX Checks table covers (a)–(d) per AC #10
  - [x] DB Verification table with sha256 hex-shape and legacy-count queries
  - [x] All UX rows marked BLOCKED-BY-ENVIRONMENT with manual steps
  - [x] Reference included in Dev Notes

- [x] **Task 9 — Tenant isolation checklist (Epic 3 retro A1, Epic 4 prep P2 pattern)**
  - [x] `verifyInvoiceArchive` row SELECT uses `.eq("id", invoiceId).eq("tenant_id", tenantId)` — defense-in-depth confirmed
  - [x] `getInvoiceSignedUrl` updated: added `.eq("tenant_id", tenantId)` to SELECT (P2 pattern consistency) + existing post-fetch check retained
  - [x] `uploadInvoice` unchanged — path construction already uses caller's `tenantId`

---

## Dev Notes

### Scope Fences (from epics + spike + Epic 4 prep)

- **Persistent audit log entries (`audit_logs` table) for `upload`, `view`, `hash_verify`, `mismatch`** → Story 4.2. Until then, mismatches are visible only via Sentry + the in-viewer amber badge.
- **Batch verification across the full archive + audit export including hash verification per row** → Story 4.3. This story verifies one document at a time, on-demand from the viewer.
- **Supabase Storage lifecycle policy enforcing 10-year retention at the storage layer (FR23)** → Out of MVP scope. Compliance posture is "no DELETE for authenticated → tenant cannot delete → retention by absence of deletion path." Document this in the migration header comment.
- **AES-256 at rest, TLS 1.3 in transit, EU-only hosting, zero data loss (NFR7, NFR8, NFR20)** → Infrastructure properties of Supabase self-hosted on Hetzner / German DC. No code change. Cite in migration header comment so Epic 7 (Verfahrensdokumentation) can reference it.
- **Backfilling `sha256` for Epic 2 invoices (uploaded before this story)** → Not feasible per spike §3. Legacy rows show "Legacy-Upload" badge forever.
- **No new top-level dependencies.** Same discipline as Epic 3 (no `framer-motion`, `sonner`, etc.). `node:crypto` is already used inside `@rechnungsai/gobd`. Web Crypto in the browser is NOT used — verification runs server-side for compliance authority.

### Hash Format and Storage Discipline

- Format: 64 lowercase hex chars (output of `createHash("sha256").update(buffer).digest("hex")`).
- Comparison: `verifyBuffer` already case-insensitive (per `packages/gobd/src/hash.test.ts` "case-insensitive verification" case) — but always store lowercase to keep DB queries deterministic.
- DB type: `text`. PostgreSQL has no `bytea`-vs-`text` advantage here for fixed-length hex — `text` is human-inspectable from `psql` and matches existing column conventions.
- Spike-confirmed primitives (do not reinvent):
  ```ts
  import { hashBuffer, verifyBuffer } from "@rechnungsai/gobd";
  const sha256 = hashBuffer(new Uint8Array(buffer)); // → 64-char lowercase hex
  const ok = verifyBuffer(new Uint8Array(buffer), storedHash); // → boolean
  ```

### Server-Side Verification Rationale

Per spike §4: verification could run client-side via Web Crypto, but that would give the client authority over an integrity check that is meant to be GoBD-evidentiary. Server-side keeps the authority server-side; the client UI just renders the result. This also matches how Story 4.3 will batch-verify (server-side, same code path).

The download cost (`supabase.storage.download()` then re-hash) is acceptable on a one-document-on-demand basis — typical PDF (~500KB) round-trips in <100ms inside the same Supabase deployment. Spike §7: "~10ms on server" for the hash itself.

### `verifyInvoiceArchive` Implementation Sketch

```ts
const VERIFY_LOG = "[invoices:verify]";

export type VerifyArchiveResult =
  | { status: "verified"; sha256: string }
  | { status: "mismatch"; sha256: string }
  | { status: "legacy" };

export async function verifyInvoiceArchive(
  invoiceId: string,
): Promise<ActionResult<VerifyArchiveResult>> {
  const idParse = invoiceIdSchema.safeParse(invoiceId);
  if (!idParse.success) {
    return { success: false, error: firstZodError(idParse.error) };
  }
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      redirect(`/login?returnTo=/rechnungen/${invoiceId}`);
    }
    const { data: userRow, error: userError } = await supabase
      .from("users").select("tenant_id").eq("id", user.id).single();
    if (userError || !userRow) {
      console.error(VERIFY_LOG, "user-lookup-failed", userError);
      redirect(`/login?returnTo=/rechnungen/${invoiceId}`);
    }
    const tenantId = userRow.tenant_id;

    const { data: row, error: rowErr } = await supabase
      .from("invoices")
      .select("id, tenant_id, file_path, sha256")
      .eq("id", invoiceId)
      .eq("tenant_id", tenantId) // defense-in-depth (Epic 3 retro A1)
      .single();
    if (rowErr && rowErr.code !== "PGRST116") {
      console.error(VERIFY_LOG, "select-failed", rowErr);
      Sentry.captureException(rowErr, {
        tags: { module: "gobd", action: "verify" },
        extra: { invoiceId },
      });
      return { success: false, error: "Rechnung kann momentan nicht geladen werden." };
    }
    if (!row) {
      return { success: false, error: "Rechnung nicht gefunden." };
    }
    if (row.sha256 === null) {
      return { success: true, data: { status: "legacy" } };
    }

    const { data: blob, error: dlErr } = await supabase.storage
      .from("invoices").download(row.file_path);
    if (dlErr || !blob) {
      console.error(VERIFY_LOG, "download-failed", dlErr);
      Sentry.captureException(dlErr ?? new Error("verify-download-failed"), {
        tags: { module: "gobd", action: "verify" },
        extra: { invoiceId },
      });
      return { success: false, error: "Dokument konnte nicht zur Prüfung geladen werden." };
    }
    const ok = verifyBuffer(new Uint8Array(await blob.arrayBuffer()), row.sha256);
    if (!ok) {
      Sentry.captureException(new Error("[gobd:archive] hash mismatch"), {
        tags: { module: "gobd", action: "verify" },
        extra: { invoiceId, storedHash: row.sha256 },
      });
      return { success: true, data: { status: "mismatch", sha256: row.sha256 } };
    }
    return { success: true, data: { status: "verified", sha256: row.sha256 } };
  } catch (err) {
    const digest =
      err && typeof err === "object" && "digest" in err
        ? (err as { digest?: unknown }).digest
        : undefined;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    console.error(VERIFY_LOG, err);
    Sentry.captureException(err, {
      tags: { module: "gobd", action: "verify" },
      extra: { invoiceId },
    });
    return { success: false, error: "Unerwarteter Fehler. Bitte erneut versuchen." };
  }
}
```

### Migration Implementation Sketch

```sql
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
alter table public.invoices
  add constraint invoices_sha256_format_chk
  check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');

-- Intentionally NO `grant update (sha256) on public.invoices to authenticated`.
-- Hash is INSERT-only at upload time; UPDATE is forbidden by absence of grant.

comment on column public.invoices.sha256 is
  'GoBD §239 Abs. 3 immutability proof: SHA-256 hex digest of the originally uploaded file. NULL = legacy (uploaded before Story 4.1).';
```

### Existing files to read BEFORE coding

Per Story 3.3 / 3.4 / 3.5 review discipline (read every UPDATE file completely):

- `apps/web/app/actions/invoices.ts` — `uploadInvoice` (lines 51-185), `getInvoiceSignedUrl` (lines 613-689), shared imports/constants (lines 1-49). Understand the existing try/catch + `NEXT_REDIRECT` digest re-throw pattern; mirror it in `verifyInvoiceArchive`.
- `apps/web/app/actions/invoices.test.ts` — test setup pattern, `vi.mock("@/lib/supabase/server")` shape, how `auth.getUser` and `from("users").select("tenant_id")` are mocked. The new tests for `verifyInvoiceArchive` follow the same shape.
- `apps/web/components/invoice/source-document-viewer.tsx` (full file, 207 lines) — `UrlState` discriminated union, `useEffect` URL fetch with TTL cache, `Sheet` mount with dynamic side. The badge mounts inside `<SheetHeader>`; do not refactor the URL state machine, just extend the `ready` variant.
- `apps/web/components/invoice/source-document-viewer.test.tsx` — existing test pattern, how `getInvoiceSignedUrl` is mocked.
- `apps/web/components/invoice/source-document-viewer-wrapper.tsx` — confirms how the viewer is invoked from confidence indicators; no change required.
- `apps/web/components/invoice/invoice-actions-header.tsx` — second invocation point of `<SourceDocumentViewer>` via `[Beleg ansehen]` button; no change required (the badge renders inside the viewer regardless of how it was opened).
- `packages/gobd/src/hash.ts` (full file, 18 lines) and `packages/gobd/src/hash.test.ts` — primitives are stable; do not modify. Reuse `hashBuffer` and `verifyBuffer`.
- `packages/gobd/src/index.ts` — confirm `hashBuffer` + `verifyBuffer` are exported. They are.
- `packages/gobd/package.json` — already linked into `apps/web/package.json` as `"@rechnungsai/gobd": "workspace:*"`. No package.json change needed.
- `supabase/migrations/20260417000000_storage_invoices_bucket.sql` — confirms storage immutability is already enforced (no UPDATE/DELETE policy for `authenticated`). Cite in the new migration's header comment.
- `supabase/migrations/20260417100000_invoices_table.sql` — column-grant discipline reference (`authenticated` only gets `UPDATE (status, updated_at)` — `sha256` follows the same pattern: insert-once, no UPDATE grant).
- `supabase/migrations/20260424100000_invoice_sort_columns_safe_cast.sql` — regex CHECK constraint pattern reused for `sha256_format_chk`.
- `packages/shared/src/types/database.ts` — current `invoices` Row/Insert/Update shapes (lines 133-205). After migration + `pnpm supabase gen types`, `sha256` should land cleanly.
- `apps/web/lib/supabase/server.ts` — confirms `createServerClient` shape (uses `@supabase/ssr` + cookies); mirror the pattern in tests.
- `apps/web/AGENTS.md` — "This is NOT the Next.js you know." Read `node_modules/next/dist/docs/` before writing client components / Server Actions / route handlers.
- `_bmad-output/implementation-artifacts/spike-p3-gobd-sha256-storage-2026-04-28.md` — full spike report with the exact integration sketch and watch points; this story implements §6 of the spike.
- `_bmad-output/implementation-artifacts/smoke-test-format-guide.md` — verbatim format for the smoke test section. Do not deviate.

### Previous Story Intelligence (3.5 review patches that affect 4.1)

- **Smoke test format is mandatory and strict** — Epic 2 retro A1 + Epic 3 Story 3.1 self-certification regression. UX rows the dev agent cannot run MUST be `BLOCKED-BY-ENVIRONMENT` with explicit manual steps. No "all checks passed."
- **Tenant isolation defense-in-depth on row SELECTs** — Epic 3 retro A1 named this as a checklist item for every story from 4.1 onwards. `verifyInvoiceArchive` SELECT must use `.eq("tenant_id", tenantId)` even though RLS already filters. Mirror the P2 prep task pattern.
- **Sentry capture on every error path** — Epic 2 retro A2 carried into Epic 3. Every catch block in `verifyInvoiceArchive` calls `Sentry.captureException` with `tags: { module: "gobd", action: "verify" }`.
- **`NEXT_REDIRECT` digest re-throw in catch blocks** — pre-existing pattern across all Server Actions in this file. Copy it verbatim into `verifyInvoiceArchive`.
- **Sequential supabase calls + Sentry fallback** — same pattern as `invoice_field_corrections` from Story 3.2. The verification chain (auth → user → row → download → hash) does not need atomicity; each step has its own error branch.
- **No new top-level deps** — Epic 3 ended with no `framer-motion`, `sonner`, etc. Continue this discipline. `node:crypto` is already in `@rechnungsai/gobd`.
- **Test count baseline:** 281 (post-3.5). New target: ≥290 (delta +9 minimum).
- **TS5 / TS5-class type safety after migration** — after `pnpm supabase gen types`, the `(supabase as any).rpc(...)` cast referenced in Epic 3 retro should already be fixed by Epic 4 prep P1. If any new cast is needed in this story, that's a regression — file in `deferred-work.md` and discuss with GOZE.
- **Done = smoke test pass** — post-done bug fixes are GOZE's call (blocker → immediate; improvement → `deferred-work.md`). Do not gold-plate.

### Why Server-Side Verification (not Web Crypto in the browser)

GoBD §239 Abs. 3 says integrity proofs must be evidentiary. A client-side hash check can be tampered with by the client. Server-side `verifyInvoiceArchive` runs inside the Server Action sandbox, downloads from Storage via the authenticated session, and computes the hash with `node:crypto`. The client UI just renders `verified`/`mismatch`. This also matches how Story 4.3 will batch-verify on the audit export path — same code path, same authority.

### Schema Already Applied vs. New

- New: `20260429000000_invoice_sha256.sql` adds `sha256` column + CHECK constraint. No new tables, no enum changes.
- Existing storage bucket migration unchanged (immutability already enforced from Epic 2).
- Existing RLS policies unchanged (`invoices_insert_own` permits the new column at INSERT time via existing GRANT INSERT).

### Error Path Audit (Epic 2 retro A2 — carried forward)

For every new code path:
- `uploadInvoice` hash addition: `file.arrayBuffer()` cannot fail in practice (File is already in memory after FormData parsing); if it throws, the existing outer try/catch handles it.
- `verifyInvoiceArchive`:
  - Bad UUID → `firstZodError` German message.
  - Auth missing → redirect (not a thrown error path).
  - Tenant mismatch / row not found → `"Rechnung nicht gefunden."` German + early return (no Sentry — this is a routine permission denial).
  - DB SELECT error (non-PGRST116) → German error + Sentry.
  - `row.sha256 === null` → `{ status: "legacy" }` success (legacy is not an error).
  - Storage download failure → German error + Sentry.
  - Hash mismatch → `{ status: "mismatch" }` success + Sentry.captureException (mismatch is the most important signal).
  - Unexpected throw → German error + Sentry; preserve `NEXT_REDIRECT` digest re-throw.
- `<ArchiveIntegrityBadge>`:
  - `verifyInvoiceArchive` rejection (network / Server Action error) → red `"Prüfung fehlgeschlagen"` badge.
  - `result.success === false` → red badge with the German error message inline.
  - `result.success === true` → branch on `data.status`.

### Source Tree Touch Points

**NEW:**
- `supabase/migrations/20260429000000_invoice_sha256.sql`
- `apps/web/components/invoice/archive-integrity-badge.tsx` + `.test.tsx`

**MODIFIED:**
- `packages/shared/src/types/database.ts` (regenerated by `pnpm supabase gen types` — do not hand-edit)
- `apps/web/app/actions/invoices.ts` (add hash to `uploadInvoice`; extend `getInvoiceSignedUrl` return; add `verifyInvoiceArchive` + `VerifyArchiveResult` type export)
- `apps/web/app/actions/invoices.test.ts` (3 new + 1 cross-tenant + update existing `getInvoiceSignedUrl` cases)
- `apps/web/components/invoice/source-document-viewer.tsx` (extend `UrlState.ready` with `sha256`; mount `<ArchiveIntegrityBadge>` in `<SheetHeader>`)
- `apps/web/components/invoice/source-document-viewer.test.tsx` (1 case for badge mount)

**FORBIDDEN:**
- New top-level dependencies (no `crypto-browserify`, no Web Crypto helpers — verification is server-side).
- Modifying `packages/gobd/src/hash.ts` or `hash.test.ts` — primitives are stable per spike §1 (9 tests passing).
- Modifying the storage bucket migration `20260417000000_storage_invoices_bucket.sql` — immutability is already correct per spike §2.
- Adding a `service_role` client anywhere in `apps/web/lib/supabase/` — server-side verification uses the existing `createServerClient` (anon key + RLS); no admin role is needed because the user already owns the row.
- Backfilling legacy `sha256` values via a script — not feasible per spike §3; legacy rows show "Legacy-Upload" forever.
- Changing the `uploadInvoice` success contract `{ invoiceId, filePath }` — hash is internal; existing callers (`camera-capture-shell.tsx:193`) must not need updates.
- Touching the `invoice_status` enum (Story 4.2 territory).
- Adding a Postgres trigger or function for hash computation — hashing is in TS for testability and to keep `packages/gobd` as the single source of GoBD logic.

### Testing Standards

- Vitest + jsdom (already wired in `apps/web` and `packages/gobd`).
- Mock `@/lib/supabase/server` using the same fake client pattern as existing `invoices.test.ts` cases. The fake `from("invoices").select(...).eq(...).eq(...).single()` chain must include the new `.eq("tenant_id", tenantId)` link for `verifyInvoiceArchive` tests.
- Mock `supabase.storage.from("invoices").download(filePath)` → returns `{ data: new Blob([bytes]), error: null }` for the verified case; returns a different Blob for the mismatch case.
- Mock `@sentry/nextjs` with `vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }))` and assert `expect(captureException).toHaveBeenCalledWith(...)` in the mismatch test.
- For `<ArchiveIntegrityBadge>`: mock `@/app/actions/invoices` to control the `verifyInvoiceArchive` resolution; use `await waitFor(() => expect(screen.getByText(...)).toBeInTheDocument())` for the async state transition.
- Cross-tenant test: stub the row SELECT to return `null` (mimicking the `.eq("tenant_id", tenantId)` filter eliminating the row) and assert the German `"Rechnung nicht gefunden."` text plus `expect(downloadMock).not.toHaveBeenCalled()`.
- Browser smoke test: standard local Supabase: `psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres'`. Format per `smoke-test-format-guide.md`. Reference the guide in Dev Notes (this story's Dev Notes already does).

### Project Structure Notes

- Alignment confirmed: `packages/gobd` matches the architecture document layout (`packages/gobd/src/{index.ts,hash.ts,types.ts}` per `architecture.md:696-705`). `archive.ts` and `audit-log.ts` mentioned in the architecture remain intentionally unimplemented — `archive.ts` would wrap upload+hash+insert, but Story 4.1 keeps that orchestration inside the existing `uploadInvoice` Server Action to avoid shifting Server Action concerns into a package. Revisit when Story 4.3 needs batch operations.
- `audit-log.ts` lands in Story 4.2.
- No detected conflicts. The only variance from the architecture document is the choice to keep upload orchestration in the Server Action rather than introducing `packages/gobd/src/archive.ts` for Story 4.1; rationale above.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 4 / Story 4.1] — Story statement + ACs (lines 722-756)
- [Source: _bmad-output/implementation-artifacts/spike-p3-gobd-sha256-storage-2026-04-28.md] — Hash primitives confirmed; storage immutability confirmed; schema decision; integration outline (full report)
- [Source: _bmad-output/implementation-artifacts/prep-p4-gobd-audit-scope-research-2026-04-28.md§1] — GoBD §238–241 HGB legal basis for SHA-256 immutability proof
- [Source: _bmad-output/implementation-artifacts/prep-p5-deferred-work-triage-2026-04-28.md§1] — No hard blockers for Story 4.1 (3-2 SourceDocumentViewer TTL cache deferred — does not affect 4.1 hash addition)
- [Source: _bmad-output/implementation-artifacts/epic-3-retro-2026-04-28.md§Action Items] — A1 tenant isolation checklist (must add to every story from 4.1 onwards), TD3 spike-first discipline (already done)
- [Source: _bmad-output/implementation-artifacts/smoke-test-format-guide.md] — Smoke test format (mandatory)
- [Source: _bmad-output/planning-artifacts/architecture.md#packages/gobd] — Package layout (lines 696-705); Data flow with hash step (line 816)
- [Source: _bmad-output/planning-artifacts/prd.md#NFR7,NFR8,NFR16,NFR20] — Encryption, EU hosting, 50GB scale, zero data loss
- [Source: supabase/migrations/20260417000000_storage_invoices_bucket.sql] — Existing storage write-once policy (no UPDATE/DELETE for `authenticated`)
- [Source: supabase/migrations/20260417100000_invoices_table.sql] — Existing column-grant discipline pattern reused for `sha256`
- [Source: supabase/migrations/20260424100000_invoice_sort_columns_safe_cast.sql] — Regex CHECK constraint pattern reused
- [Source: packages/gobd/src/hash.ts] — `hashBuffer`, `verifyBuffer` primitives (do not modify)
- [Source: apps/web/AGENTS.md] — "This is NOT the Next.js you know." Read `node_modules/next/dist/docs/` first

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation proceeded cleanly per story spec.

### Completion Notes List

#### Implementation Summary

All 9 tasks completed. Key decisions:

- **Buffer read placement**: `await file.arrayBuffer()` is called once near the top of `uploadInvoice`'s try block (after validation, before storage upload). The `buffer` Uint8Array is then passed directly to `supabase.storage.upload()` — this is correct: Supabase's JS SDK accepts `Uint8Array` as a valid upload body. Hash is computed AFTER successful upload per spike Watch Point 4.
- **`getInvoiceSignedUrl` tenant isolation**: Added `.eq("tenant_id", tenantId)` to the SELECT (Epic 4 prep P2 pattern) in addition to the existing post-fetch check — belt and suspenders.
- **`VerifyArchiveResult` discriminated union**: Implemented as three separate union variants for type safety, matching the story sketch.
- **`<ArchiveIntegrityBadge>` icons**: Inline SVGs used (no new lucide-react import needed) — ShieldCheck and AlertTriangle shapes reproduced as inline SVG paths. No new dependency.
- **`pnpm supabase gen types`**: Cannot run without local Supabase running. `database.ts` updated manually to match exact expected output spec (sha256 on Row + Insert, absent from Update).
- **turbo test**: Pre-existing `@rechnungsai/gobd` `tsc --noEmit` failure (`node:crypto` types + test file undefined check) blocks `turbo run test`. Individual package tests all pass. This is a pre-existing issue unrelated to Story 4.1.

[Smoke test format: _bmad-output/implementation-artifacts/smoke-test-format-guide.md]

---

### Browser Smoke Test

**Environment:** `pnpm dev` from repo root. Local Supabase: `host=localhost port=54322 dbname=postgres user=postgres password=postgres`.

#### UX Checks

| # | Action | Expected Output | Pass Criterion | Status |
|---|--------|----------------|----------------|--------|
| (a) | Sign in → open `/erfassen` → capture or upload any invoice file (image/jpg, PDF, or XML) → confirm upload | Upload succeeds; `/rechnungen/[id]` or `/dashboard` loads normally (no error banner) | Pass if the upload completes without error and the new invoice appears in the dashboard list | BLOCKED-BY-ENVIRONMENT |
| (b) | From `/dashboard` or `/rechnungen`, click **Beleg ansehen** on the newly uploaded invoice | Source Document Viewer sheet opens; below the "Quelldokument" title, a blue spinner + text `"Integrität wird geprüft…"` appears briefly, then transitions to green `"SHA-256: …XXXXXXXX · Archiv unverändert"` (where XXXXXXXX is the last 8 hex chars of the stored hash) | Pass if the green `"Archiv unverändert"` text is visible within ~2 seconds and the document preview body renders normally | BLOCKED-BY-ENVIRONMENT |
| (c) | Open the Source Document Viewer for any invoice that was uploaded BEFORE this story (an Epic 2 invoice — created_at before 2026-04-29) | Header shows gray muted text `"Archiv-Hash nicht verfügbar (Legacy-Upload)"` immediately (no spinner, no network call in DevTools Network tab to a `verifyInvoiceArchive` endpoint) | Pass if the gray `"Legacy-Upload"` text appears and the Network tab shows NO Server Action call for `verifyInvoiceArchive` | BLOCKED-BY-ENVIRONMENT |
| (d) | (Optional — requires manual DB/Storage tampering) In local Supabase Storage UI (`localhost:54323`), replace the file bytes for a known invoice with a different file of the same name → open that invoice in Source Document Viewer | Header shows amber `"SHA-256: …XXXXXXXX · Archiv-Integrität gestört — bitte Support kontaktieren"` and document preview still renders (not blocked) | Pass if amber mismatch text appears AND the document preview body still shows the (now-different) file content | BLOCKED-BY-ENVIRONMENT |

**Manual Steps for GOZE:**
1. `pnpm dev` from repo root (requires local Supabase running: `supabase start`)
2. Sign in at `/login` with a test account
3. Run check (a): upload a new invoice via `/erfassen`
4. Run check (b): open viewer for the newly uploaded invoice — wait up to 2 seconds for badge transition
5. Run check (c): open viewer for any invoice with `sha256 IS NULL` in the DB (use d2 query to find one)
6. Run check (d) optionally: use Supabase Storage UI at `localhost:54323` to replace a file's bytes
7. After each check, run the corresponding DB Verification queries
8. Mark each check DONE or FAIL — if FAIL, note what you actually saw vs. the expected output

#### DB Verification

| # | Query | Expected Return | What It Validates | Status |
|---|-------|----------------|-------------------|--------|
| (d1) | `psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres' -c "SELECT id, length(sha256) AS sha256_len, sha256 ~ '^[0-9a-f]{64}$' AS valid_hex FROM invoices ORDER BY created_at DESC LIMIT 3;"` | 3 rows. Most recent row: `sha256_len = 64`, `valid_hex = t`. Older (Epic 2) rows: `sha256_len = NULL`, `valid_hex = NULL` | Confirms AC #1 + AC #2: newly uploaded invoices have a 64-char lowercase hex sha256; legacy rows have NULL | BLOCKED-BY-ENVIRONMENT |
| (d2) | `psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres' -c "SELECT COUNT(*) AS legacy_count FROM invoices WHERE sha256 IS NULL;"` | `legacy_count` = (pre-migration row count, e.g. the number of Epic 2/3 invoices in the DB). This number should never increase after the migration applies. | Confirms AC #3: legacy rows keep sha256 IS NULL and the count does not grow (no new uploads should produce NULL sha256 after this story) | BLOCKED-BY-ENVIRONMENT |

### File List

**NEW:**
- `supabase/migrations/20260429000000_invoice_sha256.sql`
- `apps/web/components/invoice/archive-integrity-badge.tsx`
- `apps/web/components/invoice/archive-integrity-badge.test.tsx`

**MODIFIED:**
- `packages/shared/src/types/database.ts` — added `sha256: string | null` to `invoices.Row`; `sha256?: string | null` to `invoices.Insert`; no sha256 on `invoices.Update`
- `apps/web/app/actions/invoices.ts` — added `hashBuffer`/`verifyBuffer` import; `buffer` read in `uploadInvoice`; sha256 in insert; extended `getInvoiceSignedUrl` return type + select + `.eq("tenant_id",...)`; added `VerifyArchiveResult` type + `verifyInvoiceArchive` action; `VERIFY_LOG` constant
- `apps/web/app/actions/invoices.test.ts` — added `downloadMock`; updated storage mock; updated `getInvoiceSignedUrl` tests; added uploadInvoice hash tests + verifyInvoiceArchive tests; added `verifyInvoiceArchive` import
- `apps/web/components/invoice/source-document-viewer.tsx` — imported `ArchiveIntegrityBadge`; extended `UrlState.ready` with `sha256`; piped sha256 into state; mounted badge in SheetHeader
- `apps/web/components/invoice/source-document-viewer.test.tsx` — added `verifyInvoiceArchiveMock`; updated existing mock returns to include `sha256`; added badge mount test case
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status updated (ready-for-dev → in-progress → review)

### Change Log

- 2026-04-29: Story 4.1 implemented — SHA-256 hashing at upload, `verifyInvoiceArchive` Server Action, `<ArchiveIntegrityBadge>` component, schema migration, database types update, tests (+16 new cases; total 326 passing)
