# Story 2.3: Batch Invoice Upload

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to upload multiple invoices at once,
so that I can quickly capture a stack of invoices without interrupting my workflow.

## Acceptance Criteria

1. **Given** Story 2.2 set `useCaptureStore.redirectAfterUpload` default to `true` (single-capture navigate-on-success UX) **When** Story 2.3 ships **Then** the default flips to `false` in `apps/web/lib/stores/capture-store.ts` so multi-capture is the canonical flow: the camera stays open between captures, counter increments, the user exits only via "Fertig" / swipe-down / browser back. This is an intentional supersede of Story 2.2 AC #8a — document under "Single-capture Supersede" in Dev Notes. The `redirectAfterUpload` flag remains in the store (it is still toggled by the offline drain path) but its **public default** is now `false`. The Story 2.2 drain code at `apps/web/components/capture/camera-capture-shell.tsx` currently does `setRedirectAfterUpload(false)` in `drainQueue` and restores to `true` in `finally` — update the `finally` branch to restore to `false` (the new default), NOT `true` (the old default). DO NOT remove the flag: a future deep-link capture flow (Epic 3+ "share-to-app") may re-enable it; the flag is the clean extension point.

2. **Given** the native file picker supports multi-select **When** the user taps the "Galerie / Datei" button in `<CameraCaptureShell />` **Then** the hidden `<input type="file">` gains the `multiple` attribute (currently single per Story 2.1 AC #6). On `onChange`, iterate `Array.from(e.target.files ?? [])` and call `submitBlob(file, file.name, inferMime(file.name, file.type))` sequentially for each (await each enqueue before the next to keep the Zustand store's `addToQueue` ordering stable; uploads themselves run in parallel per AC #4). Enforce a soft cap of **20 files per selection** (NFR2 is written for batches "up to 20"): on `files.length > 20`, set `inlineError` to `"Bitte wähle höchstens 20 Dateien pro Aufnahme-Runde."` and process only the first 20. Each file independently runs through `invoiceUploadInputSchema.safeParse` (Story 2.1 AC #2 contract) — a single bad file (too big, wrong MIME) surfaces as a **per-file inline error list** (new UI: a `<ul>` rendered under the viewfinder chrome, at most 3 rows visible, with "und {n} weitere" when truncated), NOT as a blocking modal. The cap and per-file validation ensure the "one failure does not block others" guarantee (epics.md line 538) for the file-picker path. Update AC #6 comment on `apps/web/components/capture/camera-capture-shell.tsx:458–475` (`onGalleryChange`) from single-file to multi-file semantics — preserve the MIME-fallback discipline for empty `file.type` (iOS Safari XML case).

3. **Given** the auto-capture + manual-shutter paths produce exactly one blob per frame **When** the user fires either trigger in sequence **Then** no structural change is required — Story 2.1's capture loop already keeps the viewfinder open and increments the counter (`camera-capture-shell.tsx` lines 542–689). This story verifies the invariant survives the redirect-default flip (AC #1) and the multi-file picker (AC #2) by running the AC #12(a)–(c) smoke path: capture 3 photos in a row → counter reads `"3 erfasst"` → no navigation happens mid-session → AI extraction fires for each in the background (AC #4). No code change to the capture loop itself — this AC is a **regression guardrail** for Stories 2.1+2.2, covered entirely by tests and smoke checks.

4. **Given** each uploaded invoice must be processed by AI "in the background while the user can continue capturing or navigating the app" (epics.md line 541) **When** `uploadInvoice(fd)` returns `{ success: true, data: { invoiceId } }` inside `uploadOne` (`camera-capture-shell.tsx:137–144`) **Then** the shell fires `void extractInvoice(invoiceId)` (imported from `@/app/actions/invoices`) WITHOUT awaiting. This is the fire-and-forget trigger that replaces Story 2.2's "extraction fires when user lands on `/rechnungen/[id]`" UX — for batch, the user never lands on the detail page during capture; extraction must self-initiate. Implementation details, in order:
   - (a) Import: `import { extractInvoice } from "@/app/actions/invoices";` at the top of `camera-capture-shell.tsx`. The Server Action already exists from Story 2.2 with all idempotency/concurrency guards in place (Story 2.2 AC #5d idempotency, AC #5e optimistic-lock).
   - (b) Call site: immediately after `markUploaded(entry.id, res.data.invoiceId)` and before the `if (redirect) router.push(...)` block, add `void kickoffExtraction(res.data.invoiceId, entry.id);` where `kickoffExtraction` is a new local helper (see (d)).
   - (c) Status tracking: extend the Zustand capture store's `CaptureStatus` union from `"queued" | "uploading" | "uploaded" | "failed"` to include **two new states**: `"extracting"` and `"extracted"`. Add actions `markExtracting(id: string)` and `markExtracted(id: string, status: "ready" | "review")` (`status` carries the AI confidence verdict for counter UX per AC #5). Also add `markExtractionFailed(id: string, error: string)` which keeps capture `status='uploaded'` but sets a new optional `extractionError?: string` field on `QueuedCapture`. Rationale: "uploaded" is the terminal state for the **capture** journey; extraction failure does NOT roll back capture (the invoice row persists at `status='captured'` — Story 2.2's revert logic handles the DB side). The UI distinguishes "erfasst" (captured+stored) from "verarbeitet" (AI-extracted) at AC #5.
   - (d) `kickoffExtraction` helper (inside `CameraCaptureShell`, memoized via `useCallback`): calls `markExtracting(entryId)`; invokes `extractInvoice(invoiceId)`; on `result.success === true` calls `markExtracted(entryId, result.data.status)`; on `result.success === false` calls `markExtractionFailed(entryId, result.error)` AND `Sentry.captureException(new Error('[invoices:capture] ' + result.error), { tags: { module: 'invoices', action: 'capture' }, extra: { invoiceId } })` — import `* as Sentry from "@sentry/nextjs"` at file top if not already imported. **Errors are silent in the counter UI** (the extraction-error banner is deferred to Epic 3 Story 3.1 dashboard); the capture flow continues uninterrupted. Log prefix: `[invoices:capture]` for the client-side wiring (keeps the Story 2.1 convention: `upload | queue | sw | capture`).
   - (e) Concurrency cap: limit **concurrent in-flight extractions to 5** via a module-scoped `p-limit`-style semaphore implemented inline (DO NOT add a dependency — ~20 LOC, consistent with Story 2.1 "no idb-keyval" discipline). Rationale: OpenAI Chat Completions default tier caps at ~500 RPM / ~200K TPM for gpt-4o-mini; at 20 parallel calls × 3–5s each × typical invoice token count, unbounded fan-out risks 429s. 5 concurrent × ~4s mean = 4 batches × 4s = ~16s for 20 docs — fits NFR2's 60s p95 budget with ~3× safety margin. Implement as:
     ```ts
     const MAX_CONCURRENT_EXTRACTIONS = 5;
     let activeExtractions = 0;
     const extractionQueue: Array<() => Promise<void>> = [];
     async function runExtractionGated(task: () => Promise<void>) {
       if (activeExtractions >= MAX_CONCURRENT_EXTRACTIONS) {
         await new Promise<void>((r) => extractionQueue.push(async () => { r(); }));
       }
       activeExtractions++;
       try { await task(); } finally {
         activeExtractions--;
         const next = extractionQueue.shift();
         if (next) void next();
       }
     }
     ```
     This lives at module scope OUTSIDE `CameraCaptureShell` so concurrent shell instances (multi-tab) share the cap. Test the gate explicitly (AC #10 — 7 concurrent tasks with cap=3 → 4 must queue).
   - (f) DO NOT await the kickoff in `uploadOne` — `void` discards the Promise, the capture flow returns immediately, the user can keep shooting. `runExtractionGated` handles sequencing internally.

5. **Given** the user needs visible feedback on parallel background work (UX spec line 1316 "Capture Momentum", line 1953 "subtle status in PipelineHeader") **When** the counter badge renders **Then** it shows a **compound label**: `"{uploaded} erfasst · {extractingOrFailed} verarbeiten"` during active capture (where `uploaded` = `queue.filter(status === 'uploaded' | 'extracting' | 'extracted').length`, `extractingOrFailed` = `queue.filter(status === 'extracting').length`), collapsing to `"{uploaded} erfasst"` once all extractions complete or fail. Offline path keeps its existing `" · {pendingCount} in Warteschlange"` suffix from Story 2.1. Tapping "Fertig" navigates to `/dashboard` (existing behavior — no change) where Epic 3 Story 3.1 will render the pipeline dashboard; until then, the user sees the existing dashboard shell. Selectors go in `capture-store.ts`: `selectExtractingCount`, `selectExtractedCount` (compact alongside the existing `selectUploadedCount`, etc.). DO NOT add a new component; extend the existing counter span in `camera-capture-shell.tsx` (around lines 617–629). No Framer Motion (retro Action #2 discipline — continue Story 2.1 & 2.2 precedent: `animate-in zoom-in-75 duration-200`).

6. **Given** the UX spec (line 1101) names the exit gesture as "Swipe down or tap 'Fertig' button" **When** the user performs a downward swipe ≥ 100 px on the viewfinder chrome **Then** the same `onDone` handler fires (stop tracks → `router.push('/dashboard')`). Implementation: attach `onTouchStart`, `onTouchMove`, `onTouchEnd` to the outer `<div className="fixed inset-0 ...">` (line 544). Track `touchStartY` in a `useRef<number | null>(null)`; on `touchstart` record `e.touches[0]?.clientY`; on `touchend` compute `deltaY = (e.changedTouches[0]?.clientY ?? 0) - (touchStartY.current ?? 0)`; if `deltaY > 100` AND the touch is not inside a button/input (check via `e.target.closest('button, input, [data-no-swipe]')` — return early if match), fire the exit handler. Desktop/mouse: skipped (swipe is a mobile-only affordance — the desktop user has "Fertig" in the top chrome and an `Escape`-key shortcut which we also add: `useEffect` listening to `window.keydown`, `if (e.key === 'Escape') exit()`). Escape handler is SSR-guarded (`if (typeof window === 'undefined') return`). Add `aria-label="Rechnungsaufnahme beenden (Wisch nach unten)"` on the outer `<div>` — screen-reader surfaces the gesture equivalent. DO NOT use `touch-action: none` globally; the viewfinder already scrolls nothing. Touch-gesture implementation must not break the existing button taps — that is why the early-return on `closest('button, input')` is mandatory.

7. **Given** per-file upload failures must not block the batch (epics.md line 538: "one failure does not block others") **When** any `uploadOne` call in a multi-file batch throws or returns `success:false` after exhausting retries (Story 2.1 AC #8b retry ladder) **Then**: (a) the single failing capture is marked `status='failed'` with the German `extraction_error`-style message (Story 2.1 AC #8 already wires this — no change needed); (b) the iteration loop in `onGalleryChange` MUST continue to process subsequent files — wrap each `submitBlob(file, ...)` call in its own try/catch so one throw does not escape the loop; (c) the existing "Erneut versuchen" banner (Story 2.1 AC #8 lines 646–663 in camera-capture-shell.tsx) already handles retry — no change; (d) for the extraction phase (AC #4), a single `extractInvoice` failure marks only that capture entry's `extractionError` — other entries' extractions are unaffected because each runs in its own `runExtractionGated` slot. **The invariant**: after 20-file batch with 2 random failures, the user sees `"18 erfasst"` in the counter + a red inline banner `"2 Aufnahmen konnten nicht hochgeladen werden."` with a retry link (existing). No partial rollback. Document in Dev Notes under "Failure Isolation Contract".

8. **Given** the Story 2.2 detail-page navigation (`router.push(\`/rechnungen/${id}\`)` on upload success) was the 2.2 design **When** Story 2.3 ships **Then** the navigation block at `camera-capture-shell.tsx:141–143` (`if (redirect) { router.push(...); }`) stays intact (because `redirectAfterUpload` is still read from the store — and the store now defaults to `false`). Do NOT delete the block. A caller that wants the 2.2 behavior (e.g. a future share-target handler that wraps the shell in a single-capture container) can still call `setRedirectAfterUpload(true)` before mounting. The flag is the clean opt-in; 2.3 just flips the default. `apps/web/components/capture/camera-capture-shell.tsx` change is one line: `redirectAfterUpload: true` → `false` in `apps/web/lib/stores/capture-store.ts`. Plus the `finally` correction in `drainQueue` (AC #1) to restore to `false`, not `true`.

9. **Given** the user encounters any failure in this flow (NFR21 — graceful degradation) **When** the error surfaces **Then** (a) all messages are conversational German per NFR24, surfaced inline (`text-destructive text-sm`) — NEVER toasts/modals (UX-DR12); (b) the capture journey NEVER orphans — every queue entry ends `'uploaded' | 'failed' | 'extracted'`; (c) extraction failures surface as `extractionError` on the `QueuedCapture` entry (silent in counter — Epic 3 dashboard will render them); (d) NFR21 is honored because this story only ADDS to existing Server Actions + camera shell — it never touches dashboard, settings, auth, archive, export surfaces; (e) log prefixes: `[invoices:capture]` for client-side kickoff, `[invoices:extract]` for Server Action internals (already in place from 2.2); (f) Sentry tags: `{ module: 'invoices', action: 'capture' }` for the client kickoff error path, `{ module: 'invoices', action: 'extract' }` for Server Action errors (already in place); (g) `extractionQueue`'s unresolved Promises are cleaned up on unmount: add a `useEffect` cleanup in the shell that calls `extractionQueue.length = 0` to drop pending kickoffs when the user leaves `/erfassen` (the in-flight calls continue to completion and will write their DB rows — server-side work is not cancelled, which is correct; the client just stops tracking).

10. **Given** the story is complete **When** `pnpm lint`, `pnpm check-types`, `pnpm build`, `pnpm test` run from the repo root **Then** all four succeed with zero new errors; `supabase db reset` applies cleanly (this story adds **no** migration — invoice schema is stable since Story 2.2). Tests added in this story (use Vitest per `prep-p4` harness + Testing-Library per Story 2.2's `@vitejs/plugin-react` setup):
   - `apps/web/lib/stores/capture-store.test.ts` — **NEW** (this store has had no dedicated tests yet; Story 2.3 introduces two new statuses + three new actions, so coverage becomes non-negotiable). Cases: `addToQueue` ordering preserved for rapid successive calls; `markExtracting` flips status on matching id only; `markExtracted` preserves `invoiceId` and writes `status`; `markExtractionFailed` keeps `status='uploaded'` and sets `extractionError`; new default `redirectAfterUpload === false`; selectors return correct counts for mixed queues. ≥6 cases.
   - `apps/web/components/capture/camera-capture-shell.test.tsx` — **NEW**. Mock `uploadInvoice` and `extractInvoice` via `vi.mock("@/app/actions/invoices", () => ({ uploadInvoice: vi.fn(), extractInvoice: vi.fn() }))`; mock `@/lib/offline/invoice-queue` and `@/lib/offline/register-sw` likewise. Mock `navigator.mediaDevices.getUserMedia` to reject so the shell renders the fallback card (simpler DOM than the viewfinder; covers the gallery multi-file path end-to-end). Cases: selecting 3 files triggers 3 `uploadInvoice` calls + 3 `extractInvoice` calls (fire-and-forget); selecting 25 files processes only first 20 + shows inline cap error; a rejected upload on file 2 of 5 does NOT block files 3–5 (failure isolation); after all extractions resolve, counter renders `"5 erfasst"` without the "verarbeiten" suffix; `extractionError` from one extraction leaves the other four at `status='extracted'`. ≥5 cases. NOTE: the viewfinder path (`videoRef` / rAF loop) is excluded from tests — per Story 2.1 Testing Standards, Camera API is not automatable; the fallback card exercises the multi-file picker path which is the only new surface in 2.3.
   - `apps/web/components/capture/extraction-gate.test.ts` — **NEW**. Extract the `runExtractionGated` helper + `MAX_CONCURRENT_EXTRACTIONS` + `extractionQueue` + `activeExtractions` into a sibling module `apps/web/components/capture/extraction-gate.ts` so it is testable without mounting the shell. Cases: 7 tasks with cap=3 → exactly 3 run concurrently → 4 queue → FIFO order preserved; a throwing task releases the slot (next task runs); `activeExtractions` returns to 0 after all complete. ≥4 cases. Export `resetExtractionGate()` for test cleanup.
   - Target: **+3 test files, +15 new test cases minimum**; `pnpm test` total goes from 67 (post-2.2) → **≥82**. No Playwright; no live OpenAI (NFR13).

11. **Given** the happy path + regressions must be verified end-to-end **When** a manual smoke script runs on mobile Safari + Chrome (document results in Completion Notes under "Browser Smoke Test") **Then**:
   - (a) Sign in → `/erfassen` → capture 3 photos in a row with auto-capture → counter reads `"3 erfasst"` → NO navigation away from `/erfassen` between captures (regression guard for AC #8 + Story 2.2 flip). Tap "Fertig" → `/dashboard` loads, 3 invoice rows visible (Epic 1 shell).
   - (b) Tap "Galerie / Datei" → multi-select 5 mixed files (2 JPG, 2 PDF, 1 XML) → all 5 counter tick-up → `psql -c "select status, file_type, original_filename from invoices order by created_at desc limit 5;"` shows 5 rows; `file_type` distribution matches.
   - (c) Multi-select 25 files → inline German error `"Bitte wähle höchstens 20 Dateien pro Aufnahme-Runde."` → only first 20 enter the queue. Verify DB row count delta is 20.
   - (d) Multi-select 5 files where file #3 exceeds 10 MB → inline error surfaces for file #3 only (German `"Die Datei ist zu groß (max. 10 MB)."`) → files #1, #2, #4, #5 upload successfully (4 new DB rows). Regression: Story 2.1 AC #11(f).
   - (e) **NFR2 check** — capture 20 PDFs in a batch → from the last `uploadInvoice` server-log timestamp to the last `[invoices:extract] success` server-log timestamp must be ≤ 60 s (p95 target). Record wall-clock. If ≥ 60 s, investigate the concurrency cap (may need bump from 5 to 8 — note in Completion Notes). Check the pipeline-header invoice count on `/dashboard` reflects 20 rows with mix of `status='ready' | 'review' | 'captured'` (captured only if extraction failed; expected 0 in the happy case).
   - (f) **Failure isolation** — force one extraction failure via temporarily `OPENAI_API_KEY=invalid` mid-batch (set → capture 10 → restore → capture 10 more). First 10 invoices stay `status='captured'` with `extraction_error` set; last 10 reach `ready | review`. The counter in `/erfassen` shows `"20 erfasst"` throughout — no interruption.
   - (g) **Swipe-down gesture** — at the viewfinder, swipe from top of screen down 150 px on an area outside the buttons → navigate to `/dashboard`. Start the same swipe on the shutter button → NO navigation (closest-selector early-return). Press `Escape` on desktop → navigates to `/dashboard`.
   - (h) **Offline drain regression** (Story 2.1 AC #11i) — toggle offline → capture 3 → toggle online → queue drains → 3 rows inserted → NO navigation to `/rechnungen/[id]` during drain (proving the `redirectAfterUpload=false` finally-restore from AC #1). Extraction kickoff fires for each drained capture → rows reach `ready | review`.
   - (i) **Dashboard + auth regression** — `/einstellungen`, `/dashboard`, `/login` all load unchanged. `/rechnungen/[id]` cold-mount for any of the batch-extracted invoices (e.g. by deep-linking from psql) triggers ZERO new extraction (Story 2.2 idempotency gate — `status='ready'` short-circuits).
   - (j) **Keyboard overlay** — `?` shortcut still works on `/erfassen` and `/dashboard`.

12. **Given** the Epic 1 retro committed to a formal browser smoke checklist (Action Item #1) **When** Completion Notes are written **Then** include a dedicated "Browser Smoke Test" section with status `DONE | PENDING | BLOCKED-BY-ENVIRONMENT` per sub-check of AC #11. If the dev agent cannot launch a real browser with a live OpenAI key, mark the AC #11(b)(e)(f) items `BLOCKED-BY-ENVIRONMENT` and list the exact manual steps GOZE must run — mirror the Story 2.1/2.2 format. Do NOT claim completion from unit-test logs alone.

## Tasks / Subtasks

- [x] Task 1: Flip `redirectAfterUpload` default + drain-restore (AC: #1, #8, #10)
  - [x] 1.1 `apps/web/lib/stores/capture-store.ts`: change initial `redirectAfterUpload: true` → `false`
  - [x] 1.2 `apps/web/components/capture/camera-capture-shell.tsx` `drainQueue` `finally`: `setRedirectAfterUpload(false)` (was `true`)
  - [x] 1.3 Add `capture-store.test.ts` (NEW) — verify new default; include legacy action-coverage per AC #10

- [x] Task 2: Extract the concurrency gate to its own module (AC: #4e, #10)
  - [x] 2.1 Create `apps/web/components/capture/extraction-gate.ts` — export `runExtractionGated`, `MAX_CONCURRENT_EXTRACTIONS`, `resetExtractionGate`, `getActiveExtractions`, `getQueuedExtractionCount`
  - [x] 2.2 Create `apps/web/components/capture/extraction-gate.test.ts` — 4 cases per AC #10

- [x] Task 3: Extend capture store with extraction statuses (AC: #4c, #5, #10)
  - [x] 3.1 Extend `CaptureStatus` union; add `extractionError?: string` + `extractionVerdict?: "ready" | "review"` to `QueuedCapture`
  - [x] 3.2 Add actions `markExtracting`, `markExtracted`, `markExtractionFailed`
  - [x] 3.3 Add selectors `selectExtractingCount`, `selectExtractedCount`; `selectUploadedCount` widened to include extracting/extracted entries per AC #5
  - [x] 3.4 Add 7 store tests covering the new actions + selectors + default flip

- [x] Task 4: Wire background extraction kickoff in the shell (AC: #4, #5, #7, #9)
  - [x] 4.1 `camera-capture-shell.tsx`: import `extractInvoice`, `* as Sentry`, `runExtractionGated`; add `kickoffExtraction` `useCallback`
  - [x] 4.2 `uploadOne`: after `markUploaded` call `void runExtractionGated(() => kickoffExtraction(invoiceId, entry.id))`
  - [x] 4.3 Cleanup effect: `useEffect(() => () => resetExtractionGate(), [])`
  - [x] 4.4 Update counter badge span: show `"X erfasst · Y verarbeiten"` during active extractions; collapse when 0; preserve offline `"· Z in Warteschlange"` suffix
  - [x] 4.5 Smoke-check: 5 tests in `camera-capture-shell.test.tsx` cover success / cap / validation failure / extraction failure / upload failure

- [x] Task 5: Multi-file picker (AC: #2, #7)
  - [x] 5.1 Add `multiple` to both `<input type="file">` elements (viewfinder chrome + fallback card)
  - [x] 5.2 `onGalleryChange`: iterate `Array.from(e.target.files ?? [])`; cap at 20 with inline German error (surfaced AFTER the loop so submitBlob's `setInlineError(null)` on success doesn't clear it); try/catch per file
  - [x] 5.3 Per-file validation error list rendering (≤3 visible + "und N weitere")
  - [x] 5.4 Tests cover 3-file happy path, 25-file cap, mid-batch validation failure isolation

- [x] Task 6: Swipe-down + Escape exit gestures (AC: #6)
  - [x] 6.1 `useRef<number | null>(null)` for `touchStartY`; `onTouchStart` / `onTouchEnd` handlers on the outer viewfinder div
  - [x] 6.2 `onTouchEnd`: if `deltaY > 100` AND `!e.target.closest('button, input, [data-no-swipe]')` → call `exitViewfinder`
  - [x] 6.3 `useEffect` adding `window.keydown` listener for `Escape` → `exitViewfinder`
  - [x] 6.4 `aria-label` on outer viewfinder div per AC #6

- [x] Task 7: Smoke tests + documentation (AC: #10, #11, #12)
  - [x] 7.1 `pnpm lint && pnpm check-types && pnpm build && pnpm test` — all green; 83 tests total (target ≥82)
  - [x] 7.2 Manual browser smoke per AC #11 (a)–(j) — see Completion Notes "Browser Smoke Test"
  - [x] 7.3 Environment-blocked items explicitly marked `BLOCKED-BY-ENVIRONMENT` with manual steps
  - [x] 7.4 Document "Single-capture Supersede", "Failure Isolation Contract", "Concurrency Cap Rationale" in Dev Notes (already in story)

### Review Findings

- [x] [Review][Patch] HIGH: `resetExtractionGate()` on unmount corrupts gate — drives `activeExtractions` negative and orphans queued waiters (rows stuck in `extracting`) [apps/web/components/capture/extraction-gate.ts:30-33, camera-capture-shell.tsx unmount effect] — AC #9(g) says clear only the queue (`extractionQueue.length = 0`), NOT reset counters. In-flight Server Actions still hit `finally` and decrement below zero; module-scoped gate is shared across tabs so one unmount poisons the other. Fix: replace reset-on-unmount with queue-only clear (resolve pending waiters with a cancellation sentinel, leave `activeExtractions` tracking real in-flight work), or clamp decrement with `Math.max(0, …)` and drop reset entirely.
- [x] [Review][Patch] HIGH: Extraction-gate admission bypasses FIFO when queue has waiters [apps/web/components/capture/extraction-gate.ts:11-22] — when a task finishes and calls `next()`, the resolved awaiter runs `activeExtractions++` on a later microtask. A newly arriving caller between `finally` decrement and the awaiter resuming sees `activeExtractions < MAX`, skips the queue and jumps ahead. Fix: if `extractionQueue.length > 0`, always enqueue even when under cap.
- [x] [Review][Patch] MED: `markExtracted` / `markExtractionFailed` lack status guards [apps/web/lib/stores/capture-store.ts] — out-of-order callbacks (retry race, Sentry rejection race) can demote an `extracted` row back to `uploaded` with a spurious error, or flip a `failed`/`queued` row to `extracted`. Fix: guard both actions with `c.status === "extracting"` (mirrors `markExtracting`'s guard).
- [x] [Review][Patch] MED: Swipe-down gesture too loose [apps/web/components/capture/camera-capture-shell.tsx onViewfinderTouchEnd ~617] — only checks `deltaY > 100`; no time/velocity bound, no X-axis rejection, no `onTouchCancel`, no multi-touch bail, `closest()` guard keyed off touchend target (should be touchstart target). Slow drags, pinch-zoom release, or OS-interrupted gestures can exit the viewfinder and kill the camera stream. Fix: record touchstart target for the guard, add `onTouchCancel` that clears `touchStartYRef`, bail when `e.touches.length > 1`, add a short time-window bound.
- [x] [Review][Patch] MED: `uploadOne` may kick off extraction after component unmount [apps/web/components/capture/camera-capture-shell.tsx uploadOne ~186-200] — closure refs survive unmount; in-flight `uploadInvoice` resolves after `resetExtractionGate()` ran, then calls `void runExtractionGated(...)` into a gate nobody is tracking. Compounds with finding #1. Fix: add `mountedRef` and skip `runExtractionGated` when unmounted.
- [x] [Review][Patch] MED: `triggerFilePicker` leaks focus listeners and can strand auto-capture [apps/web/components/capture/camera-capture-shell.tsx ~562-575] — each click registers a `{ once: true }` focus listener; if focus never fires (Android Chrome quirk, backgrounded tab), listeners accumulate and `galleryOpenRef` / `armedRef` never reset. Fix: use `AbortController` to cancel the prior listener on each open, and add a `visibilitychange` fallback to resume auto-capture.
- [x] [Review][Patch] LOW: Escape keydown listener navigates unconditionally [apps/web/components/capture/camera-capture-shell.tsx exitViewfinder keydown ~496] — no check for focus in an input/textarea/contenteditable, no `e.defaultPrevented`. Fix: bail early when active element is an input, or when `e.defaultPrevented`.
- [x] [Review][Patch] LOW: Extraction-gate test does not cover spec-mandated cap=3 / 7-task scenario [apps/web/components/capture/extraction-gate.test.ts] — AC #4e and AC #10 explicitly require "7 concurrent tasks with cap=3 → 4 must queue"; current test uses production cap=5 and `MAX_CONCURRENT_EXTRACTIONS` is not injectable. Fix: expose cap via option/env or factory so the test can drive cap=3.
- [x] [Review][Patch] LOW: Sentry captures expected `{ success: false }` errors [apps/web/components/capture/camera-capture-shell.tsx kickoffExtraction ~151-155] — structured action failures (e.g. validation, "KI-Dienst nicht erreichbar") are not exceptional and spam Sentry at error severity. Fix: `captureException` only in the `catch` block for real throws; use `captureMessage` at `warning` or skip entirely for structured failures.
- [x] [Review][Patch] LOW: `fileErrors` not cleared when user re-opens the picker [apps/web/components/capture/camera-capture-shell.tsx onGalleryChange ~515] — stale per-file error list from the previous batch persists after a cancel. Fix: clear `fileErrors` on picker open (or at the top of `onGalleryChange` before early-return).
### Post-Review UX Fixes (2026-04-21)

Three issues surfaced during GOZE's manual smoke test, triaged and patched after the initial review sign-off:

- **Fix 1 — Counter badge did not reflect in-flight uploads (online path).** `pendingCount` ("queued" + "uploading") was rendered ONLY when offline. A user selecting 10 files from the gallery saw "3 erfasst" bump to "10 erfasst" at upload-completion time, not at selection time — and tapped "Fertig" before the tail of the batch finished uploading. Stragglers never kicked off extraction and the DB rows stayed at `status=captured`. Fix: the badge now assembles its label from all non-terminal buckets — `"{uploadedCount} erfasst · {pendingCount} wird hochgeladen · {extractingCount} verarbeiten"` when online (offline path keeps the existing "in Warteschlange" label). Empty segments are dropped. Supersedes AC #5's exact label formula; spec intent (show progress so the user doesn't exit prematurely) is honored.

- **Fix 2 — "Fertig" / swipe-down / Escape now block exit while uploads are still in-flight.** Previously the exit path stopped the camera and `router.push('/dashboard')` unconditionally. If any entry had `status ∈ {queued, uploading}`, the upload still resolved server-side but the (now-removed) `mountedRef` guard dropped the extraction kickoff → DB row stuck at `captured`. `exitViewfinder` now surfaces an inline German warning — `"Bitte warten — N Aufnahmen wird noch hochgeladen."` — instead of navigating. The "Fertig" button is also visually disabled (`disabled={online && pendingCount > 0}`) and its `aria-label` / `title` carry the same message. Extraction ("verarbeiten") is NOT blocking per AC #9(g) — extractions continue server-side after exit.

- **Fix 3 — Stale counter persisted across /erfassen re-entries.** The Zustand store is module-scoped, so returning to /erfassen (e.g. via the dashboard) showed the previous session's "3 erfasst" badge until the browser reloaded. Fix: a dedicated single-fire `useEffect` calls `resetStore()` on initial mount (deps `[]`, deliberately ignoring exhaustive-deps so transient ref churn in the SW effect cannot wipe mid-session state). The offline drain now also calls `addToQueue(entry)` for each rehydrated IDB row, so the badge correctly reflects in-flight drain work.

- **Related — removed the `mountedRef` extraction-kickoff guard.** The review-phase patch added `if (mountedRef.current) void runExtractionGated(...)` to avoid leaking an untracked task on a "dead" gate. With the gate redesign (cancellable waiters + clamped decrement), the gate is safe across unmounts — uploads that resolve after the user exits MUST still fire extraction or the row sticks at `captured`. The guard was also buggy under React 19 StrictMode dev double-mount (`useRef(true)` initializer fires once, cleanup sets `false`, remount body never re-asserts `true` → every subsequent extraction silently skipped). Net: guard removed, straggler-extraction bug fixed.

- **Fix 4 (supersedes Fix 2) — Uploads are now fully fire-and-forget; exit is never blocked.** The previous "block Fertig while `pendingCount > 0`" patch was an overcorrection — it forced the user to stare at the camera for 30–90 s on a 10-file batch (`onGalleryChange` awaited `submitBlob` → `submitBlob` awaited `uploadOne` → `uploadOne` ran the retry ladder 1 s / 3 s / 5 s per attempt per file, sequentially). This violated UX spec line 1316 "Capture Momentum" and Epic AC #4 ("the user can continue capturing or navigating the app while AI runs"). The same fire-and-forget contract the spec mandates for extraction (AC #4f: "DO NOT await the kickoff … the user can keep shooting") applies equally to upload — the durability layer is the IDB enqueue, not the awaiting shell. Changes: (a) `submitBlob` now calls `void uploadOne(entry, blob).catch(() => {})` instead of `await uploadOne`, so the selection-loop returns to the UI in milliseconds (just the IDB write); (b) `exitViewfinder` no longer inspects `pendingCount` — exit is always allowed; (c) the Fertig button has no `disabled` state; (d) the counter badge still shows `wird hochgeladen` / `verarbeiten` for users who stay on /erfassen, but users who tap Fertig immediately hand the batch off to the durability layer and land on `/dashboard` where Epic 3 will surface pipeline state.
  - **Durability contract when the user exits mid-upload.** `enqueueCapture(blob, …)` persists to IDB BEFORE upload, so the blob survives tab close. In-flight `uploadInvoice` Server Action fetches continue on navigation (Next.js does not abort them). If the tab closes, the IDB row stays `'uploading'`; on the next /erfassen visit, the existing `requeueUploading()` call in `drainQueue` reclaims it and re-queues. Extraction kickoff is gated by the module-scoped `extraction-gate.ts` whose waiters survive unmount (cancellable, in-flight tasks finish server-side per AC #9(g)).
  - **Known tradeoff.** If all retries exhaust while the shell is unmounted, `markFailed` mutates the shared store but the "Erneut versuchen" banner never renders (no UI). Failed rows sit in IDB at `'failed'`; Epic 3 Story 3.1's dashboard is the canonical surface for retry after exit. Accepted for Story 2.3 scope.

- **Answer to "should single-upload redirect to /rechnungen/{id}?"** No — this is intentional per AC #1 / AC #8. Story 2.3 flipped `redirectAfterUpload` default to `false`; batch capture is the canonical flow. Single and multi capture share one UX; the user exits via Fertig / swipe-down / Escape. The flag survives as an opt-in extension point for future share-target / deep-link flows (Epic 3+).

- [x] [Review][Defer] Per-file `submitBlob` serializes uploads [apps/web/components/capture/camera-capture-shell.tsx onGalleryChange ~526-548] — `for..of + await` serializes 20 uploads plus their retry ladders, potentially blowing NFR2 budget; spec wording ("await each enqueue before the next … uploads themselves run in parallel") is ambiguous vs current implementation. Deferred — design tradeoff needs separate discussion.

## Dev Notes

### Single-capture Supersede
Story 2.2 introduced `redirectAfterUpload: true` so a single capture auto-navigated to `/rechnungen/[id]` — optimal UX when the user is inspecting one invoice. Story 2.3's epics AC explicitly demands the camera **stay open** for batch capture ("zero-wait capture flow", epics.md line 528). The canonical default flips to `false`. The flag itself survives as an opt-in: future share-target / deep-link capture flows can call `setRedirectAfterUpload(true)` before mount to restore 2.2 behavior. DO NOT delete the flag or the `if (redirect) router.push(...)` block — they are the extension point.

### Failure Isolation Contract
Two separate failure surfaces exist in the batch flow: **upload** and **extraction**. They must never cascade.

- **Upload failure** (network, storage, server-side insert) — marked on the queue entry as `status='failed'` with German error; retry banner already in place (Story 2.1 AC #8). The surrounding iteration loop MUST continue to process subsequent files — wrap each `submitBlob` call in try/catch.
- **Extraction failure** (AI provider 429/401/5xx, schema parse) — marked as `extractionError` on the queue entry; `status` stays `'uploaded'` because the invoice row is already persisted. The Server Action (`extractInvoice`) reverts the DB row to `status='captured'` with `extraction_error` set (Story 2.2 discipline). Epic 3 Story 3.1's dashboard will surface these for later retry; Story 2.3's counter UI is silent (continuing "Capture Momentum" per UX line 1316).

Invariant: after 20-file batch with 2 failures, user sees `"18 erfasst"` counter + inline "2 Aufnahmen..." retry banner. No partial rollback. No toast.

### Concurrency Cap Rationale
NFR2 requires 20 docs within 60 s (p95). Unbounded client-side fan-out of 20 parallel `extractInvoice` Server Action calls risks:
1. OpenAI rate limits (500 RPM / 200K TPM on gpt-4o-mini default tier) — spike → 429s.
2. Next.js 16 Server Action execution is concurrent but not unbounded; cold starts amplify.

Cap = 5 strikes the balance: at typical 3–5 s per extraction, 4 waves × 4 s = ~16 s for 20 docs. Leaves ~3× headroom under NFR2. The cap lives in a module-scoped semaphore (`extraction-gate.ts`) shared across shell instances (handles multi-tab). If AC #11(e) smoke measures > 60 s, bump to 8 — document the bump in Completion Notes.

DO NOT add `p-limit` or `async-sema` as a dependency — 20-LOC inline is simpler and matches Story 2.1's "no idb-keyval" discipline.

### Source Tree Touch Points
- `apps/web/lib/stores/capture-store.ts` — extend union, add actions + selectors, flip default (MODIFY)
- `apps/web/lib/stores/capture-store.test.ts` — NEW
- `apps/web/components/capture/camera-capture-shell.tsx` — wire kickoff, multi-file, swipe/escape, counter label (MODIFY)
- `apps/web/components/capture/camera-capture-shell.test.tsx` — NEW (first shell test; mocks `getUserMedia` rejection for fallback-card path)
- `apps/web/components/capture/extraction-gate.ts` — NEW module-scoped semaphore
- `apps/web/components/capture/extraction-gate.test.ts` — NEW
- NO migration, NO new route, NO new Server Action, NO new shared schema, NO new component folder. This story is pure UX + client-wiring on top of 2.1+2.2.

### Testing Standards Summary
- Vitest + `@vitejs/plugin-react` (Story 2.2 harness). `environment: 'jsdom'` is already active for component tests.
- Mock `@/app/actions/invoices` at module top: `vi.mock("@/app/actions/invoices", () => ({ uploadInvoice: vi.fn(), extractInvoice: vi.fn() }))`.
- Mock `@/lib/offline/invoice-queue` and `@/lib/offline/register-sw` to no-ops.
- Mock `navigator.mediaDevices.getUserMedia` via `Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) } })` — drives the shell into the fallback card (avoids the viewfinder + rAF loop which are untestable per Story 2.1).
- Mock `next/navigation` `useRouter` returning `{ push: vi.fn() }`.
- Target ≥82 total tests (67 → 82).

### Previous Story Intelligence (from 2.1 + 2.2 + Epic 1 retro)
- **Story 2.2 AC #8a `redirectAfterUpload`** — the canonical knob for post-upload navigation; 2.3 flips its default. Reread `camera-capture-shell.tsx:115, 125, 141–143, 172, 188` before editing.
- **Story 2.2 `extractInvoice` Server Action** at `apps/web/app/actions/invoices.ts` handles all idempotency + concurrency (optimistic-lock via `UPDATE … WHERE status='captured' RETURNING id`); Story 2.3 is strictly a CLIENT kickoff consumer — DO NOT duplicate server-side concurrency logic.
- **Story 2.2 CSS cascade `@keyframes extraction-reveal`** is scoped to `/rechnungen/[id]` — NOT reused here. Batch capture stays on `/erfassen` where the counter suffices as progress UI.
- **No Framer Motion** (retro Action #2 scope discipline — inherited from 2.1 & 2.2). Continue.
- **`[invoices:capture]`** log prefix was reserved in Story 2.1 AC #9b but unused until now — this story claims it for the client-side extraction kickoff.
- **`AGENTS.md` Next.js 16 warning** — `apps/web/AGENTS.md` demands reading `node_modules/next/dist/docs/` before writing any App Router / Server Action glue. This story does not add a new Server Action, but if the swipe-down handler evolves into a `router.back()` decision, verify the Next.js 16 `useRouter` API first.
- **`@supabase/ssr` cookie drift** — not touched in 2.3 (no Server Action added), trivially satisfied.
- **Sentry** is wired; use `captureException` with tags `{ module, action }`.
- **`transpilePackages` + shared-package build step** (prep-p7) — Vitest resolves `@rechnungsai/shared` correctly; no fresh concerns.
- **`@testing-library/react` jsdom** — Story 2.2 introduced `@vitejs/plugin-react`; component tests now Just Work in `apps/web/`.

### Git Intelligence
Recent relevant commits:
- `8b57eef` — implement gemini api key for development. The AI provider abstraction at `packages/ai/src/provider.ts` supports `gemini` via `EXTRACTION_MODEL`. Story 2.3 does not touch `packages/ai`; the extraction path inherits whichever provider is configured.
- `457c73f` / `236f320` / `cac4d44` — Story 2.2 review + fixes. Read `apps/web/app/actions/invoices.ts` (especially the `extractInvoice` function's optimistic-lock + catch-all revert logic) before wiring kickoff — 2.3 relies on every call path returning `ActionResult<T>` without throws.
- `3d12574` — pnpm dev deprecation fixes (`middleware.ts` → `proxy.ts`, Sentry config moves). `apps/web/proxy.ts` is the current edge-auth gate; it already protects `/erfassen` via `onboarded_at` check from Story 1.4 — no changes in 2.3.
- `7f54055` (2.1) — camera shell was born here; the rAF capture loop and offline queue are stable. 2.3 layers on top without touching the loop.

### Latest Tech Information
- **Vercel AI SDK v6 + OpenAI/Gemini providers** — already wired in Story 2.2 / recent commits. Batch parallelism works via concurrent client-side Server Action invocations; the SDK itself doesn't need a new config.
- **Next.js 16 Server Actions concurrency** — each invocation is an independent request handled in parallel by the Node.js runtime. No special `runtime: 'nodejs'` export needed. Retry/timeout is controlled by `generateObject({ maxRetries: 1 })` inside `packages/ai` (Story 2.2 AC #4d) — already tuned.
- **React 19 / Next.js 16 `startTransition`** — NOT needed in this story. The kickoff is `void`-fired outside React render; no concurrent-mode priority hint is required. Avoid the temptation to wrap in `useTransition` — it adds no benefit for fire-and-forget side effects.
- **`pointerdown` vs `touchstart`** — per MDN, `touchstart` is still the most-supported mobile gesture entry on iOS Safari 17+; `pointerdown` works but mixes with mouse and causes desktop false-positives. Story 2.3 uses `touchstart/end` explicitly.
- **`{ passive: true }` on touch listeners** — attach via the `on*` React props (React 18+ sets passive by default for touch events in scrollable containers). No manual `addEventListener` dance needed.

### Project Structure Notes
- `apps/web/components/capture/` folder already exists (`camera-capture-shell.tsx`). This story adds two siblings (`extraction-gate.ts`, `extraction-gate.test.ts`, `camera-capture-shell.test.tsx`) — no new folder.
- `apps/web/lib/stores/` folder already exists (`capture-store.ts`). This story adds its first test file.
- No conflicts with unified structure. No new Zustand store — single-store discipline kept.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.3] — AC source of truth (lines 517–542)
- [Source: _bmad-output/planning-artifacts/prd.md] — NFR2 batch-20-in-60s (line 603), NFR21 graceful degradation (line 631), NFR24 conversational German errors
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#CameraCapture] — multi-capture mode + counter (lines 559, 1511–1573), swipe-down exit (line 1101), Capture Momentum principle (line 1316)
- [Source: _bmad-output/implementation-artifacts/2-1-single-invoice-upload-photo-pdf-image-xml.md] — queue + retry + offline discipline to mirror
- [Source: _bmad-output/implementation-artifacts/2-2-ai-data-extraction-pipeline.md] — `extractInvoice` Server Action contract + `redirectAfterUpload` flag origin
- [Source: apps/web/components/capture/camera-capture-shell.tsx] — primary file to extend; lines 80–689 end-to-end
- [Source: apps/web/lib/stores/capture-store.ts] — Zustand store to extend; lines 1–63
- [Source: apps/web/app/actions/invoices.ts] — existing `uploadInvoice` + `extractInvoice` Server Actions — reuse as black boxes, do NOT modify
- [Source: apps/web/AGENTS.md] — "This is NOT the Next.js you know" — read installed docs before any App Router / Server Action code
- [Source: _bmad-output/implementation-artifacts/epic-1-retro-2026-04-16.md] — Action Item #1 (browser smoke checklist), Action Item #2 (≤3 technical concerns per story / no premature deps)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Claude Opus 4.7)

### Debug Log References

- None — implementation proceeded without HALT conditions.
- `pnpm lint` — 0 errors, 7 pre-existing `turbo/no-undeclared-env-vars` warnings (unrelated to this story).
- `pnpm check-types` — green across all packages.
- `pnpm build` — green (Next.js 16 build, all routes prerendered as before).
- `pnpm test` — 83/83 tests passing (shared 29 + ai 5 + web 49). Target ≥82 satisfied.

### Completion Notes List

- **Store (`capture-store.ts`):** Default `redirectAfterUpload` flipped to `false`. Added `extracting`/`extracted` statuses; added `extractionError`/`extractionVerdict` fields. Added `markExtracting` / `markExtracted` / `markExtractionFailed` actions; the failure action reverts `status` to `'uploaded'` so the capture journey is never orphaned (Failure Isolation Contract). Added `selectExtractingCount` / `selectExtractedCount`; widened `selectUploadedCount` to count capture-terminal entries (`uploaded | extracting | extracted`) per AC #5.
- **Concurrency gate (`extraction-gate.ts`):** Module-scoped semaphore (`MAX_CONCURRENT_EXTRACTIONS = 5`). Shared across shell instances (multi-tab). Test helpers `resetExtractionGate`, `getActiveExtractions`, `getQueuedExtractionCount` are exported.
- **Shell (`camera-capture-shell.tsx`):**
  - `kickoffExtraction` helper (memoized `useCallback`) calls `extractInvoice`, updates the store, Sentry-reports failures with tags `{ module: 'invoices', action: 'capture' }` + `[invoices:capture]` log prefix.
  - `uploadOne` fires `void runExtractionGated(() => kickoffExtraction(invoiceId, entry.id))` immediately after `markUploaded`, before the `if (redirect)` navigate block (preserved as an opt-in extension point).
  - `drainQueue` `finally` now restores `redirectAfterUpload` to `false` (the new default).
  - Multi-file picker: `multiple` on both `<input type="file">`, 20-file cap with inline German error surfaced AFTER the loop (so `submitBlob`'s `setInlineError(null)` on success doesn't clear it). Per-file validation errors render in a compact list (≤3 visible + "und N weitere").
  - Swipe-down (≥ 100 px) + Escape exit gestures wired to a single `exitViewfinder` callback. Swipe early-returns if the touch target is inside a `button, input, [data-no-swipe]`.
  - Cleanup effect calls `resetExtractionGate()` on unmount. In-flight Server Actions are not cancelled (correct: DB rows must persist).
  - Counter badge now reads `"{uploaded} erfasst · {extractingCount} verarbeiten"` during active extractions, collapsing to `"{uploaded} erfasst"` once all finish. Offline `" · {pendingCount} in Warteschlange"` suffix preserved.
  - `aria-label` added on outer viewfinder div per AC #6.
- **Tests added:** `capture-store.test.ts` (7 cases), `extraction-gate.test.ts` (4 cases), `camera-capture-shell.test.tsx` (5 cases). +16 new cases total (target ≥15). Overall repo test count 67 → 83.

**Browser Smoke Test (AC #11 / AC #12):**

| Sub-check | Status | Note |
|---|---|---|
| (a) Capture 3 photos in a row → counter `"3 erfasst"` → no mid-session navigation → Fertig → /dashboard | BLOCKED-BY-ENVIRONMENT | Dev agent cannot launch a real browser with a camera. GOZE: on mobile Safari/Chrome, sign in → `/erfassen` → allow camera → capture 3 photos (auto or shutter) → verify counter reads `"3 erfasst"` and no route change fires → tap Fertig → verify `/dashboard` loads with 3 new rows. |
| (b) Multi-select 5 mixed files (2 JPG, 2 PDF, 1 XML) | BLOCKED-BY-ENVIRONMENT | GOZE: on `/erfassen` tap "Galerie / Datei" → select 5 mixed files → verify counter ticks to `"5 erfasst"`, then `"5 erfasst · 5 verarbeiten"` briefly → run `psql -c "select status, file_type, original_filename from invoices order by created_at desc limit 5;"` and confirm the file-type distribution. |
| (c) Multi-select 25 files → cap error → only first 20 enter queue | BLOCKED-BY-ENVIRONMENT | GOZE: select 25 files → verify inline German error `"Bitte wähle höchstens 20 Dateien pro Aufnahme-Runde."` → confirm exactly 20 new rows in DB. Unit test `camera-capture-shell.test.tsx > "selecting 25 files processes only first 20"` covers the client path. |
| (d) 5 files where file #3 exceeds 10 MB → per-file inline error for #3 → others upload | BLOCKED-BY-ENVIRONMENT | GOZE: select a 5-file batch with one > 10 MB file → verify the per-file list shows exactly one German error for that filename → 4 new DB rows. Unit test `"one invalid file does not block the others"` covers this. |
| (e) NFR2 — 20 PDFs in batch: last upload → last extract ≤ 60 s (p95) | BLOCKED-BY-ENVIRONMENT | GOZE: capture 20 PDFs, measure wall-clock from last `[invoices:upload]` success to last `[invoices:extract] done` in the Vercel / server logs. If > 60 s, bump `MAX_CONCURRENT_EXTRACTIONS` from 5 to 8 in `extraction-gate.ts` and re-measure. |
| (f) Failure isolation with `OPENAI_API_KEY=invalid` mid-batch | BLOCKED-BY-ENVIRONMENT | GOZE: set invalid key → capture 10 → restore key → capture 10 more → verify first 10 invoices are `status='captured'` with `extraction_error` set, last 10 reach `ready|review`. Counter shows `"20 erfasst"` throughout. |
| (g) Swipe-down exits; swipe on shutter button does NOT; Escape exits on desktop | BLOCKED-BY-ENVIRONMENT | GOZE: on mobile viewfinder, swipe down ≥ 150 px outside the buttons → navigates to `/dashboard`. Start the same swipe on the shutter button → stays in viewfinder. On desktop, press `Escape` → navigates to `/dashboard`. |
| (h) Offline drain: toggle offline → capture 3 → toggle online → queue drains with NO navigation → extractions kick off | BLOCKED-BY-ENVIRONMENT | GOZE: DevTools offline → capture 3 → online → verify 3 rows inserted, no `/rechnungen/[id]` redirect (proves drain `finally` restores `false`, not `true`) → rows reach `ready|review`. |
| (i) Dashboard + auth regression; `/rechnungen/[id]` cold-mount does NOT re-extract | BLOCKED-BY-ENVIRONMENT | GOZE: load `/einstellungen`, `/dashboard`, `/login` → all render unchanged. Deep-link to `/rechnungen/<id>` for a batch-extracted invoice (status='ready') → verify zero new `[invoices:extract]` log lines (Story 2.2 idempotency). |
| (j) `?` keyboard-shortcut overlay still works on `/erfassen` and `/dashboard` | BLOCKED-BY-ENVIRONMENT | GOZE: press `?` on both routes → overlay opens as before. |

Automated coverage (unit + integration): 5 shell tests exercise the multi-file path, 4 gate tests exercise concurrency semantics, 7 store tests exercise state transitions. The viewfinder rAF loop + camera API remain untested per Story 2.1 Testing Standards (non-automatable).

### File List

- `apps/web/lib/stores/capture-store.ts` — MODIFIED
- `apps/web/lib/stores/capture-store.test.ts` — NEW
- `apps/web/components/capture/camera-capture-shell.tsx` — MODIFIED
- `apps/web/components/capture/camera-capture-shell.test.tsx` — NEW
- `apps/web/components/capture/extraction-gate.ts` — NEW
- `apps/web/components/capture/extraction-gate.test.ts` — NEW
- `_bmad-output/implementation-artifacts/2-3-batch-invoice-upload.md` — MODIFIED (status, task checkboxes, Dev Agent Record)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MODIFIED (development_status, last_updated)

### Change Log

- 2026-04-20: Story 2.3 implementation complete. Multi-file batch upload, background AI extraction kickoff with concurrency cap (5), swipe-down + Escape exit gestures, counter badge extended with `verarbeiten` suffix. 16 new test cases; total test count 67 → 83. Status: `review`.
- 2026-04-21: Code review patches applied (10 items: gate cancellability + FIFO fix, store status guards, swipe hardening, picker listener AbortController, Escape input-focus guard, Sentry noise reduction, cap=3 gate test, fileErrors clear). +3 gate tests; web suite 49 → 52. Status: `done`.
- 2026-04-21: Post-review UX fixes — badge now shows `wird hochgeladen` during online upload in-flight; Fertig / swipe / Escape block exit while uploads pending; store resets once on fresh /erfassen mount; drain addToQueue rehydrates UI; removed buggy `mountedRef` extraction-kickoff guard (was silently skipping every kickoff under StrictMode dev double-mount). Tests green.
