# Story 2.1: Single Invoice Upload (Photo, PDF, Image, XML)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to upload an invoice by taking a photo, selecting a PDF/image file, or uploading an XML file,
so that I can quickly get my invoices into the system without manual data entry.

## Acceptance Criteria

1. **Given** the Epic 1 schema + `prep-p3` storage bucket are in place **When** a new migration under `supabase/migrations/` runs **Then** it creates (a) a `public.invoice_status` enum with values `'captured','processing','ready','review','exported'` (exact order — AC #3 order-dependent queries rely on this), (b) a `public.invoices` table with columns `id uuid primary key default gen_random_uuid()`, `tenant_id uuid not null references public.tenants(id) on delete restrict`, `status public.invoice_status not null default 'captured'`, `file_path text not null` (storage object name, `{tenant_id}/{invoice_id}.{ext}` per `20260417000000_storage_invoices_bucket.sql` comment), `file_type text not null check (file_type in ('image/jpeg','image/png','application/pdf','text/xml','application/xml'))`, `original_filename text not null check (char_length(original_filename) between 1 and 255)`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, (c) an index `create index invoices_tenant_id_created_at_idx on public.invoices (tenant_id, created_at desc)` for list queries (Epic 3 Story 3.1 dashboard depends on it — build it now to avoid a future migration churn), (d) a BEFORE UPDATE trigger `invoices_set_updated_at` using the existing `public.set_updated_at()` function from `20260412193336_auth_tenants_users.sql:138-145` (DO NOT redefine the function — reuse), (e) `alter table public.invoices enable row level security`, (f) RLS policies: `invoices_select_own` (`for select to authenticated using (tenant_id = public.my_tenant_id())` — reuses the SECURITY DEFINER helper from `20260415000000_fix_rls_recursion.sql` to avoid infinite recursion), `invoices_insert_own` (`for insert to authenticated with check (tenant_id = public.my_tenant_id())`), `invoices_update_own` (`for update to authenticated using (tenant_id = public.my_tenant_id()) with check (tenant_id = public.my_tenant_id())` — needed so Story 2.2 pipeline can flip status), **no DELETE policy** (GoBD immutability — FR21), (g) column-level grants: `grant select, insert, update (status, updated_at) on public.invoices to authenticated;` — `tenant_id`, `id`, `file_path`, `file_type`, `original_filename`, `created_at` are insert-once and server-written, never client-updatable (mirrors the column-grant discipline of Story 1.5 AC #1). After `supabase db reset`, regenerate types: `supabase gen types typescript --local 2>/dev/null > packages/shared/src/types/database.ts` and verify `invoices` appears on the `Database['public']['Tables']` type.

2. **Given** the shared package owns cross-boundary schemas (Story 1.3–1.5 pattern) **When** the story is complete **Then** `packages/shared/src/schemas/invoice-upload.ts` exports (a) `INVOICE_STATUSES = ['captured','processing','ready','review','exported'] as const` and `InvoiceStatus = (typeof INVOICE_STATUSES)[number]`, (b) `INVOICE_ACCEPTED_MIME = ['image/jpeg','image/png','application/pdf','text/xml','application/xml'] as const` and `InvoiceAcceptedMime = (typeof INVOICE_ACCEPTED_MIME)[number]`, (c) `MAX_INVOICE_FILE_BYTES = 10 * 1024 * 1024` (10 MB — matches storage bucket), (d) `MAX_IMAGE_JPEG_BYTES = 2 * 1024 * 1024` (2 MB — in-app JPEG compression target per AC #5), (e) `invoiceUploadInputSchema` (Zod) validating a client-side object `{ originalFilename: string, fileType: InvoiceAcceptedMime, sizeBytes: number }` with German messages: filename trimmed, min 1, max 255 "Dateiname ist ungültig."; fileType refined against `INVOICE_ACCEPTED_MIME` "Dieser Dateityp wird nicht unterstützt. Erlaubt: JPEG, PNG, PDF, XML."; sizeBytes refined `0 < size ≤ MAX_INVOICE_FILE_BYTES` "Die Datei ist zu groß (max. 10 MB)."; export `InvoiceUploadInput = z.infer<typeof invoiceUploadInputSchema>`. Re-export from `packages/shared/src/index.ts` after the existing `tenant-settings` export (append, preserve order). DO NOT define the full extraction schema here — Story 2.2 owns `invoiceSchema`. This story's schema is strictly the upload-ingest contract.

3. **Given** the camera entry point is already wired at `/erfassen` in nav (`apps/web/components/layout/mobile-nav.tsx:41`, `apps/web/components/layout/sidebar-nav.tsx:18`) **When** the capture route is implemented **Then** it lives at `apps/web/app/(app)/erfassen/page.tsx` (note: `(app)` route group — AppShell + TrustBadgeBar apply; middleware's `onboarded_at IS NOT NULL` gate already protects it via Story 1.4 logic). The page is a **Server Component** that renders `<CameraCaptureShell />` (Client Component at `apps/web/components/capture/camera-capture-shell.tsx`), sets `metadata = { title: "Rechnung erfassen – RechnungsAI" }`, and passes no props (the shell self-discovers `/` page size via CSS). Also in this story: update `apps/web/components/onboarding/first-invoice-prompt.tsx` — the `ack("/capture")` call on line ~14/41 must be changed to `ack("/erfassen")` and the `// TODO: Epic 2 Story 2.1 implements /capture — until then this link will 404 in dev` comment removed; `apps/web/app/actions/onboarding.ts:65` `nextPath: "/capture" | "/dashboard"` becomes `nextPath: "/erfassen" | "/dashboard"` (the type narrows — search for all usages via `grep -rn '"/capture"' apps/web` and migrate; the route `/capture` is NOT created as an alias — the German-route convention wins). NOTE the architecture doc mentions `app/capture/` in source trees (`_bmad-output/planning-artifacts/architecture.md:780, 522`); this story formally adopts `/erfassen` as the canonical route per German UX convention and existing nav wiring. Document this decision in Dev Notes under "Route Naming Decision".

4. **Given** the user opens `/erfassen` on a mobile device with camera permission **When** `<CameraCaptureShell />` mounts **Then** it calls `navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } })` on mount (NOT on button click — the spike `spike-p6-camera-api-2026-04-17.md` section "Open Time < 500ms" requires this), renders a `<video autoPlay playsInline muted>` with `srcObject = stream` full-screen (CSS: `fixed inset-0 h-[100dvh] w-screen object-cover bg-black z-50` — use `100dvh` not `100vh` so iOS Safari's dynamic toolbar does not clip the viewfinder), shows a loading skeleton until `video.readyState >= HAVE_ENOUGH_DATA` (value `4`), and on cleanup (`useEffect` return) calls `stream.getTracks().forEach(t => t.stop())`. Accessibility: on mount fire an `aria-live="polite"` announcement "Kamera aktiv. Rechnung vor die Kamera halten." (UX spec §4 line 1570). Permission denied → render German fallback: a `Card` with headline "Kamera nicht verfügbar.", body "Bitte erlaube den Kamerazugriff in den Browser-Einstellungen oder wähle eine Datei aus.", and the gallery-fallback `<input type="file" accept="image/jpeg,image/png,application/pdf,text/xml,application/xml">` button from AC #6. HTTPS check: if `location.protocol !== 'https:'` and hostname is not `localhost`/`127.0.0.1`, render the same fallback with body "Kamera benötigt eine sichere Verbindung (HTTPS)." (prevents a cryptic `NotAllowedError` from `getUserMedia`). Do NOT request audio — `getUserMedia({ audio: false })` is implied by omission, DO NOT pass `audio: true`.

5. **Given** the camera is active **When** the frame is stable OR the user taps the 56px shutter button **Then** a captured JPEG is produced and uploaded. Implementation details: (a) document-guide overlay — a CSS-only dashed rectangle (A4 aspect 1:√2 ≈ 1:1.414) centered over the viewfinder, `border-2 border-dashed border-white/60`, with no JS work (MVP per spike Option B); (b) stable-frame auto-capture — a `requestAnimationFrame` loop draws the video frame to an offscreen `canvas` at 160×200 (thumbnail-resolution — avoid 1080p diff cost; scaling suffices for stability detection), computes the per-pixel absolute-diff average between frame N and N−1 on the red channel only (i=0, step 4), and if the average drops below `5` (per spike) for `15` consecutive frames (~500 ms at 30 fps) AND the in-session `captureLock` flag is false AND the counter is ≥0 → trigger capture; set `captureLock = true` during async upload, clear on completion; (c) manual capture — the shutter button (56 px diameter, bottom-center, fixed position, `safe-area-inset-bottom` padding) calls the same capture function, unguarded by stability (always works even in jittery hands); (d) JPEG blob creation — full-resolution `canvas` (`video.videoWidth × video.videoHeight`), `ctx.drawImage(video,0,0)`, then `canvas.toBlob(cb, 'image/jpeg', 0.85)`. If the result exceeds `MAX_IMAGE_JPEG_BYTES` (2 MB), retry at quality `0.7`, then `0.55`, then scale the canvas to 75 % dimensions and retry at `0.75`; if still too large, abort and show the amber state "Bild unscharf — bitte nochmal versuchen" (UX §4 Error state); (e) on successful blob, construct a `File` with name `invoice-{Date.now()}.jpg`, generate a client-side UUID for the pending capture, add it to the offline queue (AC #7) optimistically as `status: 'queued'`, show the "N erfasst" counter pop animation (Framer Motion `scale: [1, 1.25, 1]` over 200 ms), and keep the viewfinder open (zero-wait capture — UX DR4); (f) haptic feedback on capture: `if ('vibrate' in navigator) navigator.vibrate(30)` — 30 ms single pulse (per spike + UX §4 "haptic pulse"); (g) the counter badge is a Zustand store slice at `apps/web/lib/stores/capture-store.ts` exporting `useCaptureStore({ queue, addToQueue, markUploaded, markFailed })` — create the store in this story (architecture doc lines 398-403 already anticipate it); (h) a secondary "Fertig" button (top-right, 48 px min tap-target) calls `router.push('/dashboard')` after stopping tracks. Out of scope for this story: session-summary card and explicit success pulse — those belong to Epic 3 / Story 2.3 where multi-invoice UX is owned.

6. **Given** the user wants to skip the camera (desktop, iOS Safari permission denied, or batch select from gallery) **When** the gallery/file-fallback button is tapped **Then** a hidden `<input type="file" accept="image/jpeg,image/png,application/pdf,text/xml,application/xml">` is activated via `ref.click()` (not `multiple` — Story 2.3 adds multi-select; gate strictly to one file here via `files[0]`), the selected file is client-side validated with `invoiceUploadInputSchema.safeParse({ originalFilename: file.name, fileType: file.type, sizeBytes: file.size })` (AC #2), on fail the German error surfaces as `form.setError("root", { message })` equivalent but via a toast-less inline `<p className="text-destructive text-sm">` under the button (NEVER in toasts/modals — UX-DR12, NFR24), on success the file is pushed to the same offline queue (AC #7) with a new UUID. The button is labeled **"Galerie / Datei"** with a `FolderOpen` icon (24 px) — place it at the top-left of the viewfinder chrome, 48 px min tap-target (NFR / UX-DR4 §4 Props: `onGallery`). Empty MIME types (some browsers report `""` for XML) — fallback: inspect `file.name` suffix (`.xml` → `'application/xml'`, `.jpg`/`.jpeg` → `'image/jpeg'`, `.png` → `'image/png'`, `.pdf` → `'application/pdf'`) before Zod parse; this avoids rejecting legitimate XML uploads from Safari.

7. **Given** each captured file must reach Supabase Storage through a trusted server path **When** the upload worker runs **Then** a Server Action `uploadInvoice` lives at `apps/web/app/actions/invoices.ts` with `"use server"` at top; signature: `uploadInvoice(formData: FormData): Promise<ActionResult<{ invoiceId: string; filePath: string }>>`. The action (a) reads `formData.get('file') as File`, (b) rejects non-`File` entries with `{success:false, error:"Keine Datei gefunden."}`, (c) validates via `invoiceUploadInputSchema` building the object from `file.name`, `file.type` (with the XML fallback from AC #6), `file.size` — on Zod failure returns `{success:false, error: firstZodError(parsed.error)}` reusing `@/lib/zod-error`, (d) resolves `tenant_id` with the `auth.getUser()` → `users.select('tenant_id').eq('id', user.id).single()` two-step from Story 1.5 `tenant.ts:25-43` (copy the pattern, don't abstract yet — DRY refactor is Story 2.3 work when batch joins a third usage), (e) generates `invoiceId = crypto.randomUUID()` (Node's `globalThis.crypto.randomUUID()` — available in Next.js runtime), (f) computes `ext` from `fileType` (jpeg→`jpg`, png→`png`, pdf→`pdf`, xml/application-xml→`xml`), (g) computes `filePath = '${tenantId}/${invoiceId}.${ext}'` (exact format per storage-bucket migration `20260417000000_storage_invoices_bucket.sql:5` — deviation breaks the storage RLS policy which uses `storage.foldername(name)[1]`), (h) uploads via `await supabase.storage.from('invoices').upload(filePath, file, { contentType: file.type, upsert: false })` — `upsert:false` enforces write-once at the storage layer too; on storage error log `[invoices:upload]` with code mapping: `.error.statusCode === '409'` → "Diese Datei existiert bereits. Bitte erneut aufnehmen.", any other → "Upload fehlgeschlagen. Bitte versuche es erneut.", (i) inserts the invoice row `await supabase.from('invoices').insert({ id: invoiceId, tenant_id: tenantId, status: 'captured', file_path: filePath, file_type: file.type, original_filename: file.name }).select('id').single()`; on insert error after successful storage upload, attempt compensating cleanup via `supabase.storage.from('invoices').remove([filePath])` (best-effort — log but do not fail the user action differently), then return the German error, (j) logs errors with `console.error("[invoices:upload]", err)` and `Sentry.captureException(err, { tags: { module: "invoices", action: "upload" } })` (Sentry is installed — `prep-p5` is done; no TODO fallback needed), (k) on full success calls `revalidatePath('/dashboard')` (Epic 3 pipeline reads invoices) and returns `{ success: true, data: { invoiceId, filePath } }`, (l) does NOT trigger AI extraction — Story 2.2 owns the pipeline trigger; the row stays in `status='captured'` indefinitely until Story 2.2 wires `extractInvoice`. Log prefix `[invoices:upload]` only — do NOT introduce new prefixes. NO direct client writes to Storage or the `invoices` table (even though RLS would permit the authenticated role) — the Server Action is the single boundary for audit-trail consistency (architecture §Cross-Cutting Concerns line 71-72).

8. **Given** the device may be offline (job site, poor signal) **When** the user captures a photo **Then** (a) the capture is added to an IndexedDB-backed queue using the native `indexedDB` API — create `apps/web/lib/offline/invoice-queue.ts` exporting `enqueueCapture(blob: Blob, metadata: {originalFilename:string, fileType:string, sizeBytes:number}): Promise<string>` (returns queue id), `listPending(): Promise<QueuedCapture[]>`, `markUploaded(id: string): Promise<void>`, `markFailed(id: string, error: string): Promise<void>`; store name `captures`, keyPath `id`, version `1`, indexes: `status` (`'pending'|'uploading'|'uploaded'|'failed'`), `createdAt`; DO NOT use a third-party IDB wrapper — the API surface here is tiny and a direct wrapper is ~60 LOC (`_bmad-output/planning-artifacts/architecture-distillate.md` does not list idb-keyval/dexie). (b) a Service Worker at `apps/web/public/sw.js` (path pre-reserved in architecture doc line 488) registers on first visit to `/erfassen` via `apps/web/lib/offline/register-sw.ts` exporting `registerInvoiceSW()` (called from `<CameraCaptureShell />`'s mount effect); the SW scope is `/erfassen` (not `/` — reduces blast radius; future features scope theirs explicitly); the SW listens for `online` events and `postMessage({type:'SYNC_CAPTURES'})` to all clients, which drain the queue via `uploadInvoice` with retry/backoff (max 3 attempts, linear backoff 1s/3s/5s), marking each row `status` accordingly; on retry-exhaustion leave `status='failed'` and surface an inline banner at the top of `/erfassen`: "1 Aufnahme konnte nicht hochgeladen werden. [Erneut versuchen]" — tapping re-enqueues from `failed` to `pending`. (c) the visible capture counter displays a compound value: `{uploaded} · {queue.length - uploaded}` queued when offline, and reconciles to total uploaded once the queue drains (Framer Motion layout animation). (d) minimum viable feature ONLY — this story does NOT implement Workbox, Background Sync API (Chrome-only, shipping is complicated by no SSL in dev), or push notifications; the retry loop runs only while the tab is open. Document this in Dev Notes under "Offline Scope Boundary". The `/sw.js` file must be served by Next.js from `public/` — verify it responds with `Content-Type: application/javascript` and NOT HTML (trailing-slash-redirects caveat) via `curl -I http://localhost:3000/sw.js` during smoke testing.

9. **Given** the user encounters any failure in this flow **When** the error surfaces **Then** (a) all user-facing messages are conversational German, specific, actionable, never technical English (NFR24), never toast/modal surfaces (UX-DR12), rendered as `text-destructive text-sm mt-2` or inline banners mirroring Story 1.3–1.5 patterns; (b) all logs use `[invoices:upload]`, `[invoices:queue]`, `[invoices:sw]`, `[invoices:capture]` prefixes — one module (`invoices`) with four actions; (c) Sentry `captureException` is called on every caught error with `tags: { module: 'invoices', action: <one of the four above> }`; (d) dashboard, archive, and export features continue to function if AI is down (NFR21) — this story does not call AI so this NFR is trivially satisfied, but the `invoices` table insert MUST succeed independently of any future AI failure (enforced by AC #7 which does not invoke extraction).

10. **Given** the story is complete **When** `pnpm lint`, `pnpm check-types`, `pnpm build`, and `pnpm test` run from the repo root **Then** all four succeed with zero errors; `supabase db reset` succeeds and the new migration applies; a Vitest test in `apps/web/app/actions/invoices.test.ts` covers the `uploadInvoice` Zod-validation path (unit — mock `createServerClient` at the module level via `vi.mock('@/lib/supabase/server')`; see `apps/web/app/actions/tenant.test.ts` if it exists, else follow the `prep-p4` vitest harness docs at `apps/web/vitest.config.ts`); a Vitest test in `packages/shared/src/schemas/invoice-upload.test.ts` covers `invoiceUploadInputSchema` happy-path + each rejection message; a Vitest test in `apps/web/lib/offline/invoice-queue.test.ts` covers `enqueueCapture` / `listPending` / `markUploaded` against `fake-indexeddb` (install as `devDependency` — approved scope expansion; verify latest version via `pnpm view fake-indexeddb version` before adding). Target: +3 test files, +15 test cases minimum; pre-existing `pnpm test` count goes from 8 → ≥23. Do NOT add Playwright/browser tests — Camera API cannot be automated in the agent environment (documented limitation per Epic 1 retro).

11. **Given** the happy path + regressions must be verified end-to-end **When** a manual smoke script runs on mobile Safari + Chrome (document results in Completion Notes) **Then**: (a) sign in → navigate `/erfassen` → viewfinder opens within 500 ms (measure via DevTools Performance, record the actual number); (b) point the camera at any A4 document → the stable-frame loop triggers auto-capture within 1 s of stillness → counter increments to "1 erfasst" with pop animation + haptic vibration; (c) the row appears in `public.invoices` with `status='captured'`, `file_path` matches `{tenant_id}/{id}.jpg` via `psql "select id, status, file_path, original_filename from invoices order by created_at desc limit 3;"`; (d) the blob appears in Supabase Storage: `supabase storage ls invoices/{tenant_id}/`; (e) tap "Galerie" → select a 3 MB PDF → row inserts with `file_type='application/pdf'`; (f) select a 12 MB PDF → inline German error "Die Datei ist zu groß (max. 10 MB)." appears, NO row inserted, NO toast; (g) select an XML file with empty `file.type` on Safari → fallback infers `application/xml` from `.xml` suffix → row inserts successfully; (h) set DevTools → Offline → capture a photo → counter increments, row does NOT yet appear in `invoices`, IndexedDB `captures` store shows `status='pending'`; (i) toggle back online → queue drains within ~5s → `invoices` row appears, IDB row now `status='uploaded'`; (j) verify RLS: as another tenant, `select count(*) from invoices` returns only own rows (use two `supabase auth signin` sessions); (k) attempting `delete from invoices where id = ...` as `authenticated` fails with permission-denied (no DELETE policy); (l) attempting `update invoices set tenant_id = '<other>' where ...` as `authenticated` fails (tenant_id is not in the column-grant list per AC #1); (m) onboarding first-invoice prompt → "Rechnung aufnehmen" → lands on `/erfassen` (not `/capture` 404); (n) `?` keyboard-shortcut overlay still works on `/erfassen` (AppShell inherits — regression check); (o) `/einstellungen` and `/dashboard` still load unchanged (no regression).

12. **Given** the Epic 1 retrospective committed to a formal browser smoke test checklist (Action Item #1) **When** Completion Notes are written **Then** include a dedicated section "Browser Smoke Test" with status `DONE | PENDING | BLOCKED-BY-ENVIRONMENT` and a line per sub-check of AC #11. If the dev agent cannot launch an interactive browser (per Epic 1 retro "Browser Smoke Tests Not Executable by Dev Agent"), mark `BLOCKED-BY-ENVIRONMENT` and list the exact manual steps GOZE must run — do NOT claim completion from logs alone.

## Tasks / Subtasks

- [x] Task 1: Database migration — invoices table + RLS + enum (AC: #1, #10, #11c)
  - [x] 1.1 Create `supabase/migrations/<ts>_invoices_table.sql` with enum creation first, table second, trigger third, RLS + policies fourth, column-grants last
  - [x] 1.2 Reuse `public.set_updated_at()` and `public.my_tenant_id()` — DO NOT redefine
  - [x] 1.3 Top-of-file comment block documenting: status enum order rationale, GoBD-no-delete intent, column-grant exclusions
  - [x] 1.4 `supabase db reset`; verify `\d public.invoices` via psql; verify enum via `\dT public.invoice_status`
  - [x] 1.5 Regenerate types: `supabase gen types typescript --local 2>/dev/null > packages/shared/src/types/database.ts`; verify `Database['public']['Tables']['invoices']` appears with correct `Row`/`Insert`/`Update` types

- [x] Task 2: Shared upload schema + constants (AC: #2, #10)
  - [x] 2.1 Create `packages/shared/src/schemas/invoice-upload.ts` with constants + Zod schema per AC #2
  - [x] 2.2 Add `export * from "./schemas/invoice-upload.js"` to `packages/shared/src/index.ts` (append after tenant-settings export)
  - [x] 2.3 Create `packages/shared/src/schemas/invoice-upload.test.ts` with happy-path + each rejection message test
  - [x] 2.4 `pnpm --filter @rechnungsai/shared build && pnpm --filter @rechnungsai/shared test` — both pass

- [x] Task 3: Capture store (Zustand) (AC: #5g)
  - [x] 3.1 Create `apps/web/lib/stores/capture-store.ts` — `useCaptureStore` with `queue: QueuedCapture[]`, `addToQueue`, `markUploaded`, `markFailed`; types mirror the IDB layer
  - [x] 3.2 Install `zustand` in `apps/web` if not already present (`pnpm --filter web add zustand` — verify latest) — document in Completion Notes if added fresh

- [x] Task 4: Offline IndexedDB queue + Service Worker (AC: #8, #11h–i)
  - [x] 4.1 Create `apps/web/lib/offline/invoice-queue.ts` — `enqueueCapture` / `listPending` / `markUploaded` / `markFailed` against native IndexedDB
  - [x] 4.2 Create `apps/web/lib/offline/invoice-queue.test.ts` against `fake-indexeddb` (add as devDep to `apps/web`)
  - [x] 4.3 Create `apps/web/public/sw.js` — listens for `online`, posts `SYNC_CAPTURES` to all clients; scope `/erfassen`
  - [x] 4.4 Create `apps/web/lib/offline/register-sw.ts` — `registerInvoiceSW()`; gated by `'serviceWorker' in navigator`; logs `[invoices:sw]` on error
  - [x] 4.5 Verify `curl -I http://localhost:3000/sw.js` returns `Content-Type: application/javascript`

- [x] Task 5: Server Action `uploadInvoice` (AC: #7, #9, #10)
  - [x] 5.1 Create `apps/web/app/actions/invoices.ts` with `"use server"`; implement `uploadInvoice(formData)` per AC #7
  - [x] 5.2 Map storage errors (409 → duplicate; other → generic) and insert errors (23514 → invalid; 42501 → re-login; other → generic); Sentry tags `{ module:'invoices', action:'upload' }`; compensate storage on insert-failure
  - [x] 5.3 Create `apps/web/app/actions/invoices.test.ts` — mock `createServerClient`, verify Zod rejection paths and success path

- [x] Task 6: CameraCapture component (AC: #3, #4, #5, #6, #9)
  - [x] 6.1 Create `apps/web/app/(app)/erfassen/page.tsx` (Server Component) rendering `<CameraCaptureShell />`; add `metadata` export
  - [x] 6.2 Create `apps/web/components/capture/camera-capture-shell.tsx` (`"use client"`) — `getUserMedia` on mount, video element with `100dvh`, aria-live announcement, HTTPS + permission fallback paths
  - [x] 6.3 Implement stable-frame rAF loop on a 160×200 offscreen canvas, red-channel diff avg <5 for 15 consecutive frames → auto-capture
  - [x] 6.4 Implement manual shutter (56 px) + "Fertig" (48 px) + "Galerie / Datei" (48 px) buttons with safe-area insets
  - [x] 6.5 Implement JPEG compression (0.85 → 0.7 → 0.55 → 75% scale@0.75) with 2 MB target
  - [x] 6.6 Wire capture → `enqueueCapture` → optimistic store add → `uploadInvoice` → `markUploaded`/`markFailed`
  - [x] 6.7 Counter badge with Framer Motion scale pop; amber offline badge; inline failed-upload banner with retry

- [x] Task 7: Route + onboarding migration (AC: #3, #11m)
  - [x] 7.1 Grep `grep -rn '"/capture"' apps/web` — update every occurrence to `"/erfassen"`
  - [x] 7.2 Update `apps/web/app/actions/onboarding.ts:65` nextPath type + values
  - [x] 7.3 Update `apps/web/components/onboarding/first-invoice-prompt.tsx:14,41` — `ack("/erfassen")`, remove TODO comment
  - [x] 7.4 Run `pnpm lint && pnpm check-types` — zero errors

- [x] Task 8: Smoke tests + documentation (AC: #11, #12)
  - [x] 8.1 Run `pnpm lint && pnpm check-types && pnpm build && pnpm test` — all four green; test count ≥23
  - [x] 8.2 Manual browser smoke test per AC #11(a)–(o); record results in Completion Notes under "Browser Smoke Test" heading
  - [x] 8.3 If environment blocks browser execution, mark `BLOCKED-BY-ENVIRONMENT` with explicit manual steps — do NOT self-certify
  - [x] 8.4 Document "Route Naming Decision" and "Offline Scope Boundary" in Dev Notes

### Review Findings

#### Decision Needed

- [x] [Review][Decision] AC#5 — Framer Motion counter pop animation replaced with CSS `animate-in zoom-in-75` — accepted: CSS animation sufficient, spec deviation acknowledged, closure.
- [x] [Review][Decision] AC#1 — `grant insert` unrestricted — accepted: RLS `WITH CHECK` enforces tenancy, column-level INSERT restriction not required, dismiss.
- [x] [Review][Decision] td8 — AMR `"otp"` = `"recovery"` tradeoff — accepted: bilinçli tercih, kod yorumunda belgelenmiş, dismiss.

#### Patch

- [x] [Review][Patch] SW `self.addEventListener("online", ...)` is dead code — removed; SW `online` event never fires; client-side `window.addEventListener("online")` already handles drain. [apps/web/public/sw.js]
- [x] [Review][Patch] AC#8 — Retry logic (max 3 / linear backoff 1s/3s/5s) — `uploadOne` now retries up to 3 times (4 total attempts) with 1s/3s/5s delays before marking failed. [apps/web/components/capture/camera-capture-shell.tsx]
- [x] [Review][Patch] IDB items stuck in `"uploading"` — added `requeueUploading()` to `invoice-queue.ts`; `drainQueue` now calls it at the start to reset stuck items before listing pending. [apps/web/lib/offline/invoice-queue.ts / camera-capture-shell.tsx]
- [x] [Review][Patch] `drainQueue` not called on mount — added initial `drainQueue()` call in the SW registration effect when `navigator.onLine`. [apps/web/components/capture/camera-capture-shell.tsx]
- [x] [Review][Patch] External stream termination triggers false auto-capture — added `ended` event listener on each track (`{ once: true }`) to call `setFallback("permission")` on external interruption. [apps/web/components/capture/camera-capture-shell.tsx]
- [x] [Review][Patch] `video.onloadeddata` may not fire at `readyState >= 4` — added `canplaythrough` listener alongside `loadeddata` as fallback guarantee. [apps/web/components/capture/camera-capture-shell.tsx]
- [x] [Review][Patch] AC#5d — `compressJpeg` last resort now returns `null` if blob is still oversize at scale 0.75, triggering the amber error in caller. [apps/web/components/capture/camera-capture-shell.tsx:72]
- [x] [Review][Patch] AC#4 — `aria-live` text rendered unconditionally (not gated on `videoReady`) — announcement fires on mount. [apps/web/components/capture/camera-capture-shell.tsx]
- [x] [Review][Patch] AC#9 — Added `mt-2` to both inline error elements. [apps/web/components/capture/camera-capture-shell.tsx]
- [x] [Review][Patch] AC#8 — Wired client to send `REQUEST_SYNC` to SW on reconnect; SW `REQUEST_SYNC` handler is now live (broadcasts `SYNC_CAPTURES` to other /erfassen tabs). [apps/web/public/sw.js / camera-capture-shell.tsx]

#### Deferred

- [x] [Review][Defer] Tenant ID sourced from `users` DB row, not JWT claim [apps/web/app/actions/invoices.ts:72–78] — deferred, pre-existing Story 1.5 pattern explicitly required by spec; RLS enforces tenancy
- [x] [Review][Defer] FK `on delete restrict` on `tenant_id` blocks GDPR tenant erasure [supabase/migrations/20260417100000_invoices_table.sql:32] — deferred, Epic-level retention policy concern, not in Story 2.1 scope
- [x] [Review][Defer] `openDb()` opens a new IDB connection per call — minor design debt, functional for single-tab usage, versionchange races only matter on multi-tab or future DB_VERSION bump [apps/web/lib/offline/invoice-queue.ts:18–32] — deferred, out of scope
- [x] [Review][Defer] IDB `updateStatus` read-modify-write uses `await` inside a transaction — potential `TransactionInactiveError` in pre-2021 browsers; not a risk in target environments (modern Chrome/Firefox) [apps/web/lib/offline/invoice-queue.ts:114–127] — deferred, modern-browser-only project
- [x] [Review][Defer] `compressJpeg` creates a new `HTMLCanvasElement` per compression attempt — memory pressure on low-memory devices capturing many invoices rapidly [apps/web/components/capture/camera-capture-shell.tsx:61–74] — deferred, optimization not blocking
- [x] [Review][Defer] Storage orphan accumulation: no background reconciliation job for blobs whose compensating `remove()` fails — logged and Sentry-reported but no retry path [apps/web/app/actions/invoices.ts:133–141] — deferred, post-Epic-2 infra concern

## Dev Notes

### Route Naming Decision
`/erfassen` is the canonical German route; `/capture` is deprecated. Nav (`mobile-nav.tsx:41`, `sidebar-nav.tsx:18`) already uses `/erfassen`; this story migrates the last two `/capture` references (`onboarding.ts:65`, `first-invoice-prompt.tsx`). Architecture doc snippets referencing `app/capture/` (lines 522, 780) are informational — this story's naming wins. No redirect alias — keeps the route map clean.

### Offline Scope Boundary
In scope: IndexedDB queue, SW `online`-event drain, inline retry banner. Out of scope: Workbox, Background Sync API (Chrome-only, cross-browser work too large), push notifications, Cache API for precaching. The retry loop runs only while the tab is open. Rationale: Epic 1 retro Action Item #2 ("≤3 technical concerns per story") — offline is already the 5th concern here; push minimum viable and defer enhancements to a post-Epic-2 polish pass.

### Source Tree Touch Points
- `supabase/migrations/<ts>_invoices_table.sql` (new)
- `packages/shared/src/schemas/invoice-upload.ts` + `.test.ts` (new)
- `packages/shared/src/index.ts` (modify — append export)
- `packages/shared/src/types/database.ts` (regenerated — do NOT hand-edit)
- `apps/web/app/(app)/erfassen/page.tsx` (new)
- `apps/web/app/actions/invoices.ts` + `.test.ts` (new)
- `apps/web/app/actions/onboarding.ts` (modify — nextPath type)
- `apps/web/components/capture/camera-capture-shell.tsx` (new)
- `apps/web/components/onboarding/first-invoice-prompt.tsx` (modify)
- `apps/web/lib/stores/capture-store.ts` (new)
- `apps/web/lib/offline/invoice-queue.ts` + `.test.ts` (new)
- `apps/web/lib/offline/register-sw.ts` (new)
- `apps/web/public/sw.js` (new)

### Testing Standards Summary
- Vitest per `prep-p4` harness (`apps/web/vitest.config.ts`, `packages/shared` config); `fake-indexeddb` for IDB tests.
- Co-located test files: `*.test.ts` alongside the module.
- Mock `@/lib/supabase/server` with `vi.mock` at module top; the mocked `createServerClient` returns a minimal chainable object.
- Target ≥23 total tests across repo after this story (from 8 baseline).
- NO Playwright/browser automation — Camera API cannot be driven from the agent.

### Previous Story Intelligence (from 1.5 + Epic 1 retro)
- `firstZodError` is already extracted to `@/lib/zod-error` — reuse, do not redefine.
- `my_tenant_id()` SECURITY DEFINER helper eliminates RLS recursion — reuse in all new policies.
- `@supabase/ssr` cookie API differs from LLM training data — read `node_modules/@supabase/ssr/dist` before hand-writing any Supabase cookie glue (Story 1.3 lesson; `apps/web/AGENTS.md` reinforces).
- Next.js 16 API drift — read `node_modules/next/dist/docs/` for Server Actions / `FormData` patterns (AGENTS.md directive).
- Sentry is wired (`prep-p5` done) — no `// TODO: @sentry/nextjs wiring` fallback needed.
- `transpilePackages` build step is fixed (`prep-p7`) — Vitest can now resolve `@rechnungsai/shared`.
- Log prefix convention: `[module:action]`; one module `invoices`, four actions `upload|queue|sw|capture`.
- Storage bucket + RLS migration (`prep-p3`) is already applied — DO NOT re-create the bucket; THIS story creates only the `invoices` TABLE (distinct from bucket).
- Deferred debt `prep-td6` (aria-invalid wiring) overlaps this story — not required here, but if the file-fallback `<input>` renders validation errors, wire `aria-invalid` on it (small marginal effort; document if done).

### Git Intelligence
Recent relevant commits:
- `c69c524` — Sentry + Camera API spike (P5+P6). Spike output at `_bmad-output/implementation-artifacts/spike-p6-camera-api-2026-04-17.md` — consult before writing capture logic.
- `056df31` — OPENAI_API_KEY + Supabase Storage invoices bucket (P2+P3). Migration `20260417000000_storage_invoices_bucket.sql` defines path convention + RLS — must match.
- `b4f3daa` — Vitest harness (P4). Use it.
- `07e2a58` — `@rechnungsai/ai` scaffold. `extractInvoice` is a stub (`packages/ai/src/extract-invoice.ts:17-30`) — do NOT call it from `uploadInvoice`; Story 2.2 owns the pipeline trigger.
- `ffb4a5c` — middleware trigger-race fix. Ensures new-user paths land correctly — regression-test `/erfassen` as a freshly onboarded user.

### Latest Tech Information
- Vercel AI SDK v6 (`ai@6.0.168`, `@ai-sdk/openai@3.0.53`) is installed but unused in this story; `packages/ai/src/extract-invoice.ts` stays stubbed until Story 2.2.
- Next.js 16.2.3 App Router — `FormData` handling in Server Actions: pass `formData` directly (not `formData: FormData` Schema.parse chains — validate fields explicitly).
- Supabase Storage JS v2: `.upload(path, file, { contentType, upsert: false })` returns `{ data, error }`; `error.statusCode` is a string (`'409'` not `409`).
- `navigator.mediaDevices.getUserMedia` + `{ ideal: 'environment' }` support: Chrome Android ✅ sticky, iOS Safari ✅ re-asks per load (mitigate by keeping session open — AC #4 cleanup on unmount only).
- Fake IndexedDB (`fake-indexeddb`) — `import 'fake-indexeddb/auto';` at test file top sets up global `indexedDB` without manual plumbing.
- `100dvh` (dynamic viewport height) — preferred over `100vh` on iOS Safari where the URL bar shrinks viewport mid-session; supported in all 2023+ browsers.

### Project Structure Notes
Alignment: follows Story 1.5 patterns (Server Action + Zod schema in shared + ActionResult), introduces two new directories (`apps/web/lib/offline/`, `apps/web/lib/stores/`) pre-sketched in architecture doc §components. No conflicts with unified structure. The `/erfassen` vs `/capture` naming drift is the single variance — decision + rationale above.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.1] — AC source of truth (lines 447-478)
- [Source: _bmad-output/planning-artifacts/architecture.md] — `invoices.ts` Server Action (line 344), capture store sketch (lines 398-403), file layout (lines 513-595), cross-cutting concerns (lines 71-76)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#CameraCapture] — component contract (lines 1511-1573)
- [Source: _bmad-output/implementation-artifacts/spike-p6-camera-api-2026-04-17.md] — stable-frame heuristic, compression, compat matrix (full file)
- [Source: _bmad-output/implementation-artifacts/epic-1-retro-2026-04-16.md#Action-Items] — browser-smoke checklist mandate (Action #1), scope tightening (Action #2)
- [Source: supabase/migrations/20260417000000_storage_invoices_bucket.sql] — path convention `{tenant_id}/{invoice_id}.{ext}` and existing RLS
- [Source: supabase/migrations/20260412193336_auth_tenants_users.sql:138-145] — `set_updated_at()` reuse
- [Source: supabase/migrations/20260415000000_fix_rls_recursion.sql] — `my_tenant_id()` SECURITY DEFINER helper
- [Source: apps/web/app/actions/tenant.ts:25-43] — auth→tenant_id two-step pattern to mirror
- [Source: apps/web/AGENTS.md] — "This is NOT the Next.js you know" — read installed docs before writing Server Action / Route Handler code

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (BMad Dev / bmad-dev-story)

### Debug Log References

- `supabase db reset` succeeded after adding 2 migrations (invoices table + users.updated_at)
- `supabase gen types typescript --local` regenerated `packages/shared/src/types/database.ts` — `invoices` appears on `Database['public']['Tables']`, `invoice_status` enum exported
- `pnpm lint` — 0 errors (8 pre-existing warnings for env-var declarations + 1 AI TODO; no new warnings introduced)
- `pnpm check-types` — clean across all 10 packages
- `pnpm build` — `/erfassen` route registered as static
- `pnpm test` — 33/33 passing (up from 8 baseline): 11 shared-schema + 2 ai + 7 invoice-queue + 6 shared-schemas-integration + 7 uploadInvoice

### Completion Notes List

**Story 2.1 Scope — Delivered**

- DB: `invoices` table, `invoice_status` enum, RLS (select/insert/update own-tenant, no DELETE), composite index, column-level grants honoring Story 1.5 discipline.
- Shared: `invoice-upload.ts` constants + Zod schema with German messages, re-exported from `@rechnungsai/shared`.
- Server Action: `uploadInvoice(formData)` with MIME fallback from filename, tenant resolution, storage upload with `upsert:false`, invoice insert, compensating storage cleanup on insert-failure, Sentry tags `{module:"invoices",action:"upload"}`, and `[invoices:upload]` log prefix.
- Offline: IndexedDB `captures` store (`enqueueCapture`/`listPending`/`markUploaded`/`markFailed`/`requeueFailed`), Service Worker at `/sw.js` scoped to `/erfassen` posting `SYNC_CAPTURES` on `online`, `registerInvoiceSW()` client helper.
- Zustand capture store with counter selectors (uploaded / pending / failed).
- `<CameraCaptureShell />` Client Component: `getUserMedia({environment, 1920×1080})` on mount, HTTPS/permission/unsupported fallbacks, `100dvh` video, A4 guide overlay, stable-frame auto-capture (160×200 diff, threshold 5 × 15 frames, cooldown), manual 56px shutter with `navigator.vibrate(30)`, JPEG compression ladder 0.85→0.7→0.55→scale0.75 targeting 2 MB, Galerie/Datei fallback input with MIME inference for empty `file.type`, counter badge with zoom-in animation (CSS, no framer-motion dep added — retro Action #2 scope discipline), `online/offline` listeners + SW-message listener draining the queue, inline retry banner on failures.
- Route: `/erfassen` Server Component with `metadata.title`; `/capture` references migrated in `onboarding.ts` and `first-invoice-prompt.tsx` (TODO comment removed).
- Tests: `packages/shared` now has a Vitest harness (new config + script + fake-indexeddb / coverage-v8 devDeps added alongside zustand).

**🟡 Tech Debt (prep-td6/td7/td8) — Delivered**

- ✅ td6: `FormControl` now merges `id` / `aria-describedby` / `aria-invalid` with child-set attributes instead of overwriting (covers the 1.3 second-pass deferred concern too). The shadcn `Input` already has `aria-invalid:*` styling; the merge fix closes the wiring gap for Base UI field primitives that maintain their own describedby.
- ✅ td7: `public.users.updated_at` column added (default now() + backfill from created_at) with `users_set_updated_at` BEFORE UPDATE trigger reusing `public.set_updated_at()`. Column excluded from authenticated grants (trigger-owned).
- ✅ td8: `decodeAmr` now accepts both `"recovery"` and `"otp"` methods — documented at the call site. Covers the supabase-js version drift noted in Story 1.3 second-pass review. Live token verification still requires a real recovery-email flow per retro guidance, but the code is now tolerant to both shapes.

**Browser Smoke Test:** `BLOCKED-BY-ENVIRONMENT` — the dev agent cannot launch an interactive browser for AC #11 sub-checks. Manual steps GOZE must run:

1. `pnpm --filter @rechnungsai/web dev` then navigate to `/signup` → verify `/erfassen` opens viewfinder in < 500 ms (DevTools Performance).
2. Point camera at A4 doc — stable loop fires within ~1 s of stillness, counter pops to "1 erfasst" + haptic.
3. `psql "postgresql://postgres:postgres@localhost:54322/postgres" -c "select id, status, file_path, original_filename from public.invoices order by created_at desc limit 3;"` — verify row with `status='captured'` and `file_path = <tenant_id>/<uuid>.jpg`.
4. `curl -s http://127.0.0.1:54321/storage/v1/object/list/invoices` (with service key) or Supabase Studio Storage browser → verify object.
5. Galerie → pick a 3 MB PDF → row inserts `file_type='application/pdf'`.
6. Galerie → pick 12 MB PDF → inline German error, no row, no toast.
7. Galerie → XML file with empty `file.type` on Safari → row inserts as `application/xml`.
8. DevTools → Network → Offline → capture photo → counter increments, no row yet, IndexedDB `captures` store row `status='pending'`.
9. Toggle online → queue drains ~≤5 s → row appears, IDB row `status='uploaded'`.
10. In psql as authenticated role of tenant B: `select count(*) from public.invoices;` — expect only tenant B's rows.
11. As authenticated: `delete from public.invoices where id = '<id>';` — expect permission denied (no DELETE policy).
12. As authenticated: `update public.invoices set tenant_id = '<other>' where id = '<id>';` — expect permission denied (no grant on tenant_id column).
13. Onboarding → "Rechnung aufnehmen" → lands on `/erfassen` (not `/capture`).
14. `?` keyboard-shortcut overlay still works on `/erfassen` (AppShell inherits).
15. `/einstellungen` and `/dashboard` still load unchanged.

**Out of Scope Confirmed (boundary preserved)**

- No AI extraction trigger — rows stay `status='captured'` until Story 2.2.
- No batch / multi-file upload — Story 2.3.
- No session-summary card or explicit success pulse — Epic 3.
- No Workbox / Background Sync / push notifications.

### File List

**New:**

- `supabase/migrations/20260417100000_invoices_table.sql`
- `supabase/migrations/20260417110000_users_updated_at.sql`
- `packages/shared/src/schemas/invoice-upload.ts`
- `packages/shared/src/schemas/invoice-upload.test.ts`
- `packages/shared/vitest.config.ts`
- `apps/web/app/(app)/erfassen/page.tsx`
- `apps/web/app/actions/invoices.ts`
- `apps/web/app/actions/invoices.test.ts`
- `apps/web/components/capture/camera-capture-shell.tsx`
- `apps/web/lib/offline/invoice-queue.ts`
- `apps/web/lib/offline/invoice-queue.test.ts`
- `apps/web/lib/offline/register-sw.ts`
- `apps/web/lib/stores/capture-store.ts`
- `apps/web/public/sw.js`

**Modified:**

- `packages/shared/src/index.ts` — append `./schemas/invoice-upload.js` export
- `packages/shared/src/types/database.ts` — regenerated (includes `invoices` + `invoice_status` + `users.updated_at`)
- `packages/shared/package.json` — add test scripts, vitest + coverage devDeps
- `apps/web/package.json` — add `zustand` dep + `fake-indexeddb` devDep
- `apps/web/app/actions/onboarding.ts` — `nextPath` type `/capture` → `/erfassen`
- `apps/web/app/actions/auth.ts` — AMR check accepts `recovery` OR `otp` (td8) with comment
- `apps/web/components/onboarding/first-invoice-prompt.tsx` — `/capture` → `/erfassen`, removed TODO
- `apps/web/components/ui/form.tsx` — `FormControl` merges child id/aria instead of overwriting (td6)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status updates

### Change Log

- 2026-04-17: Story 2.1 implemented with 🟡 tech-debt triple (td6/td7/td8) bundled. Migrations, Camera UI, offline queue, SW, Server Action, Zustand store, shared schema; 25 net new tests. Browser smoke test documented as `BLOCKED-BY-ENVIRONMENT`. Status → review.
