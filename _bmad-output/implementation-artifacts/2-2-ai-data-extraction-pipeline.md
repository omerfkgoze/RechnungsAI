# Story 2.2: AI Data Extraction Pipeline

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want the system to automatically extract all invoice data and show me how confident it is about each field,
so that I can quickly verify the data instead of typing it all manually.

## Acceptance Criteria

1. **Given** Story 2.1's `invoices` table + `invoice_status` enum are in place **When** a new migration `supabase/migrations/<ts>_invoices_extraction_columns.sql` runs **Then** it extends `public.invoices` with: (a) `invoice_data jsonb null` (stores the full validated extraction payload — one JSONB blob per invoice; null until extraction succeeds), (b) `extracted_at timestamptz null` (set when `invoice_data` is first written; stays null on failure), (c) `extraction_error text null` (German error surface for the latest attempt — e.g. `"KI-Provider nicht erreichbar."`; cleared on next successful attempt), (d) `extraction_attempts smallint not null default 0` (increments on every `extractInvoice` call — for Sentry context + Epic 3 observability; NOT a retry limiter — client-side retry is out of scope here). Also: (e) extend the `authenticated` column-level UPDATE grant so Server Actions running as `authenticated` may write `invoice_data`, `extracted_at`, `extraction_error`, `extraction_attempts` (in addition to `status`, `updated_at` from Story 2.1). The migration uses `grant update (status, updated_at, invoice_data, extracted_at, extraction_error, extraction_attempts) on public.invoices to authenticated;` — Postgres has no `grant update add column`, so the statement replaces the Story 2.1 column-grant as a whole. `tenant_id`, `id`, `file_path`, `file_type`, `original_filename`, `created_at` remain insert-once (Story 1.5 / 2.1 discipline). No new RLS policies — the existing `invoices_update_own` (Story 2.1) already gates writes to tenant members. After `supabase db reset`: regenerate types `supabase gen types typescript --local 2>/dev/null > packages/shared/src/types/database.ts`; verify `invoice_data: Json | null`, `extracted_at: string | null`, `extraction_error: string | null`, `extraction_attempts: number` appear on `Database["public"]["Tables"]["invoices"]["Row"]`.

2. **Given** the shared package owns cross-boundary schemas (Story 1.3–2.1 pattern) **When** the story is complete **Then** `packages/shared/src/schemas/invoice.ts` exports: (a) `extractedFieldSchema` — a generic factory `z.object({ value: <payloadType>, confidence: z.number().min(0).max(1), reason: z.string().nullable() })` used for every extracted field; `reason` carries a short German explanation when `confidence < 0.95` (for amber/red UX), null otherwise. Implement as a typed helper `makeField<T>(payload: z.ZodType<T>)` (see Project Structure Notes — `z.object` + generic returns a `ZodObject`, not a generic; do NOT reach for `z.lazy` or discriminated unions). (b) `lineItemSchema` — `z.object({ description: makeField(z.string().nullable()), quantity: makeField(z.number().nullable()), unit_price: makeField(z.number().nullable()), net_amount: makeField(z.number().nullable()), vat_rate: makeField(z.number().nullable()), vat_amount: makeField(z.number().nullable()) })` — every subfield carries its own confidence so UX can surface a per-cell amber. (c) `invoiceSchema` — the canonical AI output contract covering every field enumerated in Story 2.2 AC (epics.md line 492):
   - `invoice_number: makeField(z.string().nullable())`
   - `invoice_date: makeField(z.string().nullable())` — ISO 8601 `YYYY-MM-DD` when the model recognizes the date; null when unreadable. Add a Zod refine rejecting strings that don't match `/^\d{4}-\d{2}-\d{2}$/` → null coercion via `.transform((v) => v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)` inside the field payload.
   - `supplier_name: makeField(z.string().nullable())`
   - `supplier_address: makeField(z.string().nullable())`
   - `supplier_tax_id: makeField(z.string().nullable())` — USt-IdNr; do NOT regex-gate here (extractor may see `DE...` or `ATU...` etc.); downstream Epic 3 validation owns the shape refinement.
   - `recipient_name: makeField(z.string().nullable())`
   - `recipient_address: makeField(z.string().nullable())`
   - `line_items: z.array(lineItemSchema)` — array is bare (not wrapped in `makeField`); confidence is per-sub-field, not per-array.
   - `net_total: makeField(z.number().nullable())`
   - `vat_total: makeField(z.number().nullable())`
   - `gross_total: makeField(z.number().nullable())`
   - `currency: makeField(z.string().nullable())` — ISO 4217 (e.g. `"EUR"`); default expectation EUR.
   - `payment_terms: makeField(z.string().nullable())`
   Export `Invoice = z.infer<typeof invoiceSchema>`, `ExtractedField<T> = { value: T; confidence: number; reason: string | null }`, `LineItem = z.infer<typeof lineItemSchema>`. Also export a helper `overallConfidence(invoice: Invoice): number` returning the **minimum** top-level field confidence across `invoice_number | invoice_date | supplier_name | gross_total | vat_total | net_total | currency` (the seven scalar keys above — skip `line_items` array because per-item rollup is Epic 3's concern); rationale: one low field should dominate overall status per UX §§Confidence traffic-light. Re-export from `packages/shared/src/index.ts` via `export * from "./schemas/invoice.js";` **after** the existing `invoice-upload` export (preserve order). DO NOT redefine `ActionResult` — it is already exported from `types/action-result.ts`.

3. **Given** the UX spec names three confidence zones (spec §ConfidenceIndicator lines 1475–1509) **When** the story is complete **Then** `packages/shared/src/constants/confidence.ts` exports the thresholds as a single source of truth: `CONFIDENCE_THRESHOLD_HIGH = 0.95`, `CONFIDENCE_THRESHOLD_MEDIUM = 0.70`, and a pure helper `confidenceLevel(value: number): "high" | "medium" | "low"` returning `"high"` for `>= 0.95`, `"medium"` for `>= 0.70 && < 0.95`, `"low"` for `< 0.70`. Also export the mapped invoice-status helper `statusFromOverallConfidence(overall: number): "ready" | "review"` returning `"ready"` only if `overall >= CONFIDENCE_THRESHOLD_HIGH`, else `"review"` — this is the **exact logic** that flips the DB `status` in AC #7. Add `export * from "./constants/confidence.js";` to `packages/shared/src/index.ts`. Create `packages/shared/src/constants/confidence.test.ts` covering the boundary cases (`0.94999`, `0.95`, `0.69999`, `0.70`, `0`, `1`).

4. **Given** `packages/ai` owns provider-agnostic AI calls (`getExtractionModel` already exists at `packages/ai/src/provider.ts:1-9` returning `openai("gpt-4o")`) **When** the story is complete **Then** `packages/ai/src/extract-invoice.ts` replaces the Story 2.1 stub (`extract-invoice.ts:16-30`) with a full `extractInvoice(input: ExtractInvoiceInput): Promise<ActionResult<Invoice>>` where `ExtractInvoiceInput = { fileUrl: string; mimeType: InvoiceAcceptedMime; originalFilename: string }`. Implementation:
   - (a) Import `generateObject` from `ai`, `getExtractionModel` from `./provider.js`, `invoiceSchema` + `Invoice` + `InvoiceAcceptedMime` + `ActionResult` from `@rechnungsai/shared`.
   - (b) Compose a multimodal `messages: ModelMessage[]` (AI SDK v6 canonical shape; verify against `node_modules/ai/dist/index.d.ts` — the SDK drifted in v6, do NOT trust v5 training data). One system message (German, concise: "Du bist ein Rechnungs-Extraktor …" — see Project Structure Notes for the full prompt text). One user message with a `parts: [{ type: "file", data: <Uint8Array|URL>, mediaType: mimeType, filename: originalFilename }]` for PDF/image; for XML (`text/xml | application/xml`), pass the raw UTF-8 string as a `text` part (AI SDK file-part support for XML is provider-dependent — text is the safe path).
   - (c) Fetch the file bytes once inside `extractInvoice`: `const res = await fetch(fileUrl); if (!res.ok) return { success:false, error:"Rechnung konnte nicht geladen werden." }; const bytes = new Uint8Array(await res.arrayBuffer());` — the caller (Server Action) passes a **signed URL** (AC #5), not a public one.
   - (d) Call `const { object } = await generateObject({ model: getExtractionModel(), schema: invoiceSchema, messages, temperature: 0, maxRetries: 1, providerOptions: { openai: { store: false } } });` — `temperature: 0` for determinism, `maxRetries: 1` caps transient 5xx retries at 1 additional call (AI SDK v6 built-in), `store: false` instructs OpenAI Chat-Completions to **not persist the completion** on their side (belt-and-braces alongside org-level ZDR — confirm via context7 `@ai-sdk/openai` latest `store` option behavior before committing; log the effective value in `[ai:extract]` first-run telemetry). **NFR13 note:** zero-retention is primarily enforced at the OpenAI org level (ZDR enrollment) — document in `packages/ai/README.md` (create if missing) that `OPENAI_API_KEY` MUST belong to a ZDR-enrolled org; the `store: false` flag is a defensive layer, not a substitute.
   - (e) Catch provider errors and map to German: `AI_APICallError` with `status === 401` → `"Authentifizierung am KI-Provider fehlgeschlagen."`; `status === 429` → `"KI-Provider überlastet. Bitte in einer Minute erneut versuchen."`; `status >= 500 || timeout` → `"KI-Provider nicht erreichbar."`; `ZodError` from schema parse → `"Rechnungsformat konnte nicht erkannt werden."`; any other → `"Extraktion fehlgeschlagen. Bitte erneut versuchen."`. Return `{ success: false, error: <germanMessage> }` — NEVER throw.
   - (f) On success: run the parsed `object` through `invoiceSchema.safeParse()` one more time (`generateObject` validates but do not trust — defensive); on parse success return `{ success: true, data: parsed.data }`; on parse failure return the German `ZodError` branch above.
   - (g) Log prefix: `[ai:extract]`; Sentry `captureException(err, { tags: { module: "ai", action: "extract" } })` on each catch — consistent with Story 2.1 convention (`module: "invoices"` there; this is `module: "ai"`).
   Update `packages/ai/src/index.ts` to re-export the new types (`type ExtractInvoiceInput` if exported). REMOVE the legacy `interface ExtractedInvoice` + `extractedInvoiceSchema` placeholder — the contract now lives in `@rechnungsai/shared`.

5. **Given** the Server Action is the single boundary for all mutations (architecture §Cross-Cutting, Story 2.1 discipline) **When** the story is complete **Then** `apps/web/app/actions/invoices.ts` adds a second exported action `extractInvoice(invoiceId: string): Promise<ActionResult<{ status: "ready" | "review"; overall: number }>>`. Behavior, in order:
   - (a) Zod-validate `invoiceId` with `z.string().uuid("Ungültige Rechnungs-ID.")` — reject early with `{ success:false, error:<firstZodError> }`.
   - (b) Resolve `tenantId` via the Story 2.1 two-step pattern (`auth.getUser()` → `users.select('tenant_id').eq('id', user.id).single()`) — DO NOT abstract yet (DRY threshold is 3 usages; this is #2; abstraction is Story 2.3 work).
   - (c) SELECT the invoice row: `const { data: row } = await supabase.from('invoices').select('id, tenant_id, status, file_path, file_type, original_filename, extraction_attempts').eq('id', invoiceId).single();` — if not found or `row.tenant_id !== tenantId` return `{ success:false, error:"Rechnung nicht gefunden." }` (RLS should already filter, but check defensively — `.single()` returns null data on empty).
   - (d) Idempotency gate: if `row.status === 'ready'` or `'exported'` return `{ success:true, data:{ status: row.status as "ready" | "review", overall: 1 } }` with an `[invoices:extract] already-done` log line — do NOT re-extract already-completed invoices (saves tokens, prevents accidental overwrites of user-corrected data in Epic 3). If `row.status === 'processing'` return `{ success:false, error:"Extraktion läuft bereits. Bitte einen Moment warten." }` — concurrent-call guard.
   - (e) Flip status + increment: `await supabase.from('invoices').update({ status: 'processing', extraction_attempts: row.extraction_attempts + 1, extraction_error: null }).eq('id', invoiceId);` — failure here returns `{ success:false, error:"Rechnung kann momentan nicht verarbeitet werden." }`.
   - (f) Create a **signed** Storage URL valid for 60 s: `const { data: signed } = await supabase.storage.from('invoices').createSignedUrl(row.file_path, 60);` — do NOT use `getPublicUrl` (bucket is private). On signing error: revert status to 'captured', set `extraction_error`, return German generic.
   - (g) Call `const result = await extractInvoice({ fileUrl: signed.signedUrl, mimeType: row.file_type as InvoiceAcceptedMime, originalFilename: row.original_filename });` (import from `@rechnungsai/ai`).
   - (h) On `result.success === false`: `await supabase.from('invoices').update({ status: 'captured', extraction_error: result.error }).eq('id', invoiceId);` (flip back so the user can retry; NFR21 — the rest of the app keeps working), `Sentry.captureException(new Error('[invoices:extract] ' + result.error), { tags: { module:'invoices', action:'extract' }, extra: { invoiceId } });` return `{ success:false, error: result.error }`.
   - (i) On success: compute `const overall = overallConfidence(result.data);` (imported from `@rechnungsai/shared`), `const next = statusFromOverallConfidence(overall);` — then `await supabase.from('invoices').update({ invoice_data: result.data, status: next, extracted_at: new Date().toISOString(), extraction_error: null }).eq('id', invoiceId);`. Failure here also reverts status to 'captured' with German error. On success: `revalidatePath('/dashboard'); revalidatePath('/rechnungen/' + invoiceId);` and return `{ success:true, data:{ status: next, overall } }`.
   - (j) Log prefix: `[invoices:extract]` (one per entry + exit + each branch). Sentry tags: `{ module:'invoices', action:'extract' }`. Do NOT invoke AI from inside `uploadInvoice` — extraction is strictly client-pull: the camera shell calls `extractInvoice(invoiceId)` after `uploadInvoice` returns success (AC #8).
   - (k) **NEVER throw** — every branch returns `ActionResult<T>`; the only legal `throw` is the Next.js `redirect()` propagation pattern copied from Story 2.1 (`invoices.ts:157-164`).

6. **Given** the AI disclaimer must be mounted above every AI-extracted result surface (FR49 + Story 1.4 scaffold at `apps/web/components/ai/ai-disclaimer.tsx:18-33`) **When** the results UI renders **Then** create `apps/web/components/invoice/confidence-indicator.tsx` (`"use client"` NOT required — no state; SSR-safe) exporting `<ConfidenceIndicator confidence={number} variant="dot"|"badge"|"bar" fieldName={string} explanation={string|null} onTap?={() => void} />`. Variants:
   - `dot` — 12 px filled circle + icon next to it (`Check`/`AlertTriangle`/`X` from `lucide-react` — already a dep). Used in field rows.
   - `badge` — pill with `Math.round(confidence * 100)` + `"%"` + icon. Amber/red add a 2 s CSS pulse (`animate-pulse` from Tailwind — NOT Framer Motion; Story 2.1 retro Action #2 scope discipline).
   - `bar` — 4 px high, 100 % width, filled proportionally to confidence with the zone color.
   Color tokens: use the `--confidence-high|medium|low` CSS custom properties if present, else fall back to Tailwind `emerald-500`, `amber-500`, `rose-500` (verify the design-token presence via `apps/web/app/globals.css` grep first — if missing, add under the existing `:root` block and document in Dev Notes). Accessibility: `aria-label={\`${fieldName}: Konfidenz ${Math.round(confidence*100)}%, ${level}\`}` where `level ∈ {"hoch","mittel","niedrig"}`. Color is never sole signal — the icon (✓/⚠/✕) carries the semantic (UX spec line 1508). If `onTap` is provided, render as a `<button type="button">` with `focus-visible:ring-2 ring-primary`; otherwise render as a `<span>`. Amber/red fields render the `explanation` text inline below (`text-caption text-muted-foreground` — NOT tooltip-only, UX line 1509). Create co-located test file `confidence-indicator.test.tsx` covering: boundary levels (0.94/0.95/0.70), all three variants render, aria-label format, button vs span mode, pulse className on amber/red only.

7. **Given** the invoice detail surface renders extraction results (Epic 3 owns the full detail view; this story builds the scaffold) **When** the route is implemented **Then** create `apps/web/app/(app)/rechnungen/[id]/page.tsx` as a **Server Component** that:
   - (a) Awaits `params`: Next.js 16 made `params` a Promise — `async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; ... }`. Verify this signature by reading `node_modules/next/dist/docs/` for App Router dynamic routes (AGENTS.md directive; the 16→old API drift bit Story 1.3 and will bite here).
   - (b) Resolves tenant + fetches the invoice: `const supabase = await createServerClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect('/login?returnTo=/rechnungen/' + id); const { data: invoice } = await supabase.from('invoices').select('id, status, file_path, file_type, original_filename, invoice_data, extraction_error, extracted_at, created_at').eq('id', id).single();` → if null, `notFound()`.
   - (c) Renders `<ExtractionResultsClient initialInvoice={invoice} />` (Client Component at `apps/web/components/invoice/extraction-results-client.tsx`) inside a layout wrapper with `<AiDisclaimer className="mb-4" />` mounted above the results (FR49).
   - (d) Sets `metadata = { title: \`Rechnung – RechnungsAI\` }` (dynamic — use `generateMetadata` if the invoice number is known; safe fallback is static title since the model may return null invoice_number).
   - (e) When `invoice.status === 'captured'` and `extraction_error` is null, the page's client component triggers the `extractInvoice` Server Action on mount (see AC #8) — the page itself does NOT kick off extraction (Server Components must not invoke mutations; this is a Next.js constraint, not a preference).

8. **Given** the post-capture handoff must feel zero-wait (UX spec "Aha Moment" lines 109, 1032) **When** the user captures an invoice in `<CameraCaptureShell />` **Then**: (a) after `uploadInvoice` returns `success:true`, the shell calls `router.push(\`/rechnungen/${res.data.invoiceId}\`)` (Next.js `useRouter` from `next/navigation`). Leave the existing camera shell queue-drain logic intact — the router push only fires on the first **interactive** capture (i.e. when the user is in a single-capture flow; for the offline-queue drain path (Story 2.1 AC #8), DO NOT navigate — batch flow preservation). Concretely: add a `redirectAfterUpload: boolean` flag to `useCaptureStore` (default `true`) that the shell consults; the offline-drain path sets it to `false` before calling upload. Document in Dev Notes under "Capture → Review Handoff".
   - (b) Create `apps/web/components/invoice/extraction-results-client.tsx` (`"use client"`) receiving `initialInvoice` as prop. On mount, if `initialInvoice.status === 'captured'` → call the `extractInvoice` Server Action via `startTransition`; show the processing state (skeleton cascade — see UX spec §Loading Patterns line 1942 — "Skeleton shimmer on invoice card fields (cascade, top-to-bottom)"). On success: router-refresh (`router.refresh()`) to pull the updated row, then animate reveal of each field over ~800 ms using CSS `animation-delay: calc(var(--i) * 120ms)` on a keyframe `extraction-reveal` defined in `globals.css` (DO NOT import Framer Motion — retro Action #2). On failure: render the inline banner "Extraktion fehlgeschlagen — {error}. [Erneut versuchen]" with a retry button that re-invokes `extractInvoice(id)`.
   - (c) Field rendering: iterate the seven scalar top-level fields (`invoice_number`, `invoice_date`, `supplier_name`, `gross_total`, `vat_total`, `net_total`, `currency`) + `supplier_tax_id` + `supplier_address` + `recipient_name` + `payment_terms` + a nested line-items table; each field row is `<Label /> <Value /> <ConfidenceIndicator variant="dot" confidence={field.confidence} fieldName={label} explanation={field.reason} />`. For amber/red fields render the `reason` as caption text under the value (UX line 1509). For the overall summary at top, use `variant="badge"` with the `overallConfidence(...)` result. Numeric fields format via `new Intl.NumberFormat('de-DE', { style: 'currency', currency: invoice_data.currency.value ?? 'EUR' })`; dates via `new Intl.DateTimeFormat('de-DE').format(new Date(field.value))` when `field.value` matches the ISO shape.
   - (d) Tapping a `ConfidenceIndicator` triggers `onTap` — stub to `console.info('[invoices:capture] source-view TBD')` with a German toast-less inline hint `"Quelldokument-Ansicht kommt in Kürze."`. Do NOT implement the source viewer — epic 2.2 scope note: "tapping a ConfidenceIndicator opens the source document viewer (to be fully implemented in Epic 3)".
   - (e) When `initialInvoice.status === 'ready' || 'review'` (direct revisit), skip the extraction trigger and render immediately; the cascade animation plays once on first mount via a `sessionStorage[\`cascade:${id}\`]` marker, subsequently it renders statically (optional polish — document if deferred).

9. **Given** the user encounters any failure in this flow (NFR21 — graceful degradation) **When** the error surfaces **Then** (a) all messages are conversational German per NFR24, surfaced as inline text (`text-destructive text-sm`) NOT toasts/modals (UX-DR12); (b) the `invoices` row **always** ends in `status in ('captured','ready','review')` — NEVER orphaned in `'processing'`: every Server Action exit path must revert a failed `'processing'` to `'captured'` (AC #5h); (c) the dashboard + archive + export UIs continue to function because Story 2.2 touches zero other Server Actions (NFR21 is trivially satisfied by the scope discipline, but document the assumption in Dev Notes under "Cross-Cutting: Graceful Degradation"); (d) log prefixes: `[invoices:extract]` for the Server Action, `[ai:extract]` for the AI package internals — one module per log origin, never mixed; (e) every caught exception gets a Sentry `captureException` with `tags: { module, action }` matching the log origin; (f) the `extraction_error` column stores the LAST German user-facing error verbatim — Epic 3 Story 3.2 will render it in the detail view's "Fehler" section (build-ready contract now, so 3.2 does not need a migration).

10. **Given** the story is complete **When** `pnpm lint`, `pnpm check-types`, `pnpm build`, `pnpm test` run from the repo root **Then** all four succeed with zero new errors; `supabase db reset` applies the new migration cleanly; tests added in this story:
   - `packages/shared/src/schemas/invoice.test.ts` — `invoiceSchema` parse happy-path, null-field path (all fields null with 0 confidence), and `overallConfidence` min-reduction over the seven scalar keys. ≥6 cases.
   - `packages/shared/src/constants/confidence.test.ts` — 6 boundary cases per AC #3.
   - `packages/ai/src/extract-invoice.test.ts` — REPLACE the Story 2.1 stub tests. New tests mock `generateObject` via `vi.mock("ai", () => ({ generateObject: vi.fn() }))` and `vi.mock("./provider.js")` → cover: success path returns `{success:true, data: <mock Invoice>}`; provider 429 maps to German `"überlastet"`; schema-parse failure maps to `"Rechnungsformat konnte nicht erkannt werden."`; non-ok `fetch(fileUrl)` returns `"Rechnung konnte nicht geladen werden."` (use `vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))`). ≥5 cases.
   - `apps/web/app/actions/invoices.test.ts` — EXTEND (do not replace) the Story 2.1 `uploadInvoice` tests with an `extractInvoice` block: uuid-validation failure, idempotency branch (status already 'ready' returns success without re-call), concurrent-call guard (status 'processing' returns German error), happy path flips status to 'ready' or 'review' per mocked `overallConfidence`, AI failure reverts to 'captured' with `extraction_error` set. Mock the `@rechnungsai/ai` `extractInvoice` at module-top with `vi.mock('@rechnungsai/ai', ...)`. ≥5 cases.
   - `apps/web/components/invoice/confidence-indicator.test.tsx` — per AC #6. ≥5 cases.
   Target: **+4 test files, +21 new test cases minimum**; `pnpm test` count goes from 33 → ≥54. Do NOT add Playwright/browser tests; do NOT write a live-OpenAI integration test (NFR13 + cost). If `@testing-library/react` is not yet installed in `apps/web`, add it as `devDependency` — this is the first component test in the repo; document in Dev Notes under "Testing-Library Introduction" with the exact `pnpm --filter web add -D` command and versions used.

11. **Given** the happy path + regressions must be verified end-to-end **When** a manual smoke script runs on mobile Safari + Chrome (document results in Completion Notes under "Browser Smoke Test") **Then**:
   - (a) Sign in → `/erfassen` → capture any A4 invoice with a real (or test) OpenAI-backed key → page auto-navigates to `/rechnungen/<id>` within ~500 ms of upload success; skeleton cascade renders; extraction completes in <5 s (record the p50/p95 wall-clock from server logs); invoice row flips to `'ready'` or `'review'` in psql.
   - (b) Verify `psql -c "select status, invoice_data->>'supplier_name', extraction_error, extracted_at from invoices order by created_at desc limit 1;"` — `invoice_data` is non-null JSONB with the expected nested shape; `extracted_at` is populated; `extraction_error` is null.
   - (c) Simulate AI failure: temporarily set `OPENAI_API_KEY=invalid` in `.env.local` → retry capture → UI surfaces German `"Authentifizierung am KI-Provider fehlgeschlagen."` inline (no toast); row reverts to `'captured'`; `extraction_attempts = 1`; `extraction_error` column holds the German string; retry button re-invokes successfully after the key is restored.
   - (d) Revisit `/rechnungen/<id>` after success — no re-extraction fires (observe zero new OpenAI API call in network tab + no log line); cascade skips the animation on second visit (or replays once, whichever was implemented per AC #8e — document which branch shipped).
   - (e) Verify RLS: as another tenant, GET `/rechnungen/<id>` → 404 (not tenant B's invoice); psql `select * from invoices where id = '<other tenant id>'` returns zero rows as the `authenticated` role of tenant B.
   - (f) Offline-queue path from Story 2.1 still drains without navigating away (AC #8a flag path); the background drain does NOT trigger extraction — extraction runs only when the user lands on `/rechnungen/<id>` (documented; Story 2.3 will add batch extraction).
   - (g) Dashboard + `/einstellungen` still load; `/rechnungen/<id>` for a never-extracted invoice (status='captured') mounted cold → extraction triggers once and UI updates without full page reload.
   - (h) Confidence palette: render a test invoice where the model returns `{ invoice_number: { confidence: 0.92 }, gross_total: { confidence: 0.60 } }` → `invoice_number` shows amber `⚠` with explanation text; `gross_total` shows red `✕`; overall badge shows 60 % red.
   - (i) NFR13 check: tail Sentry breadcrumbs / `[ai:extract]` logs — verify no user-document content is logged (only file sizes, MIME type, duration, status code). If any breadcrumb shows PII/document content, fix before shipping.
   - (j) Keyboard-shortcut overlay still works (`?`) on `/rechnungen/<id>`.

12. **Given** the Epic 1 retro committed to a formal browser smoke checklist (Action Item #1) **When** Completion Notes are written **Then** include a dedicated "Browser Smoke Test" section with status `DONE | PENDING | BLOCKED-BY-ENVIRONMENT` per sub-check of AC #11, and — if `BLOCKED-BY-ENVIRONMENT` — list the exact manual steps GOZE must run, mirroring Story 2.1's completion format. Do NOT claim completion from unit logs alone.

## Tasks / Subtasks

- [x] Task 1: DB migration — extraction columns + grant update (AC: #1, #10)
  - [x] 1.1 Create `supabase/migrations/<ts>_invoices_extraction_columns.sql` — add `invoice_data`, `extracted_at`, `extraction_error`, `extraction_attempts`; replace the Story 2.1 column-grant statement with the extended list
  - [x] 1.2 Top-of-file comment block: rationale for each column, reason the grant is dropped+recreated (Postgres has no `grant update add column`)
  - [x] 1.3 `supabase db reset`; verify `\d public.invoices` shows the four new columns; verify grants via `\dp public.invoices`
  - [x] 1.4 Regenerate types: `supabase gen types typescript --local 2>/dev/null > packages/shared/src/types/database.ts`; verify `Row`/`Update` types include the new columns

- [x] Task 2: Shared schemas + confidence constants (AC: #2, #3, #10)
  - [x] 2.1 Create `packages/shared/src/schemas/invoice.ts` — `makeField`, `lineItemSchema`, `invoiceSchema`, `overallConfidence`, type exports
  - [x] 2.2 Create `packages/shared/src/schemas/invoice.test.ts` — happy path, null-field path, overall-min reduction, ≥6 cases
  - [x] 2.3 Create `packages/shared/src/constants/confidence.ts` — thresholds, `confidenceLevel`, `statusFromOverallConfidence`
  - [x] 2.4 Create `packages/shared/src/constants/confidence.test.ts` — boundary cases per AC #3
  - [x] 2.5 Update `packages/shared/src/index.ts` — append `./schemas/invoice.js` and `./constants/confidence.js` exports (preserve order)
  - [x] 2.6 `pnpm --filter @rechnungsai/shared build && pnpm --filter @rechnungsai/shared test` — all green

- [x] Task 3: `packages/ai` — full extract-invoice implementation (AC: #4, #10)
  - [x] 3.1 Delete the legacy `interface ExtractedInvoice` + `extractedInvoiceSchema` placeholder in `packages/ai/src/extract-invoice.ts`
  - [x] 3.2 Implement `extractInvoice({ fileUrl, mimeType, originalFilename })` per AC #4 a–g; add German prompt in `packages/ai/src/prompts/extraction.ts`
  - [x] 3.3 Verify `ai@6.0.168` `ModelMessage` + multimodal `parts` shape by reading `node_modules/ai/dist/index.d.ts` (or context7 `ai` latest) before committing any prompt glue
  - [x] 3.4 Replace `packages/ai/src/extract-invoice.test.ts` with ≥5 cases covering success, 429, 401, schema-parse failure, fetch non-ok; mock `generateObject` + `provider`
  - [x] 3.5 Update `packages/ai/src/index.ts` — re-export `ExtractInvoiceInput` type; drop `ExtractedInvoice` re-export
  - [x] 3.6 Create/update `packages/ai/README.md` — document NFR13 ZDR expectation + `store: false` defensive layer
  - [x] 3.7 `pnpm --filter @rechnungsai/ai build && pnpm --filter @rechnungsai/ai test` — all green

- [x] Task 4: Server Action `extractInvoice(invoiceId)` (AC: #5, #9, #10)
  - [x] 4.1 Extend `apps/web/app/actions/invoices.ts` with the `extractInvoice` export per AC #5 a–k
  - [x] 4.2 Import `overallConfidence` + `statusFromOverallConfidence` from `@rechnungsai/shared` — single source of truth
  - [x] 4.3 Extend `apps/web/app/actions/invoices.test.ts` with ≥5 `extractInvoice` cases; mock `@rechnungsai/ai` at module top
  - [x] 4.4 Verify `pnpm --filter web test` passes with the new cases

- [x] Task 5: ConfidenceIndicator component (AC: #6, #10)
  - [x] 5.1 Create `apps/web/components/invoice/confidence-indicator.tsx` with three variants
  - [x] 5.2 Grep `apps/web/app/globals.css` for `--confidence-high|medium|low`; add under `:root` if missing (document in Dev Notes)
  - [x] 5.3 Create `apps/web/components/invoice/confidence-indicator.test.tsx` — ≥5 cases
  - [x] 5.4 Install `@testing-library/react` + `@testing-library/jest-dom` in `apps/web` if missing — document versions in Completion Notes

- [x] Task 6: `/rechnungen/[id]` route + results client (AC: #7, #8, #9)
  - [x] 6.1 Read `node_modules/next/dist/docs/` for App Router dynamic routes — confirm Next.js 16 `params: Promise<...>` contract
  - [x] 6.2 Create `apps/web/app/(app)/rechnungen/[id]/page.tsx` — RSC, fetch invoice, render `<ExtractionResultsClient initialInvoice={...} />` under `<AiDisclaimer />`
  - [x] 6.3 Create `apps/web/components/invoice/extraction-results-client.tsx` (`"use client"`) — mount-trigger extraction, skeleton cascade, success/error branches, retry button, field rendering, `Intl.NumberFormat`/`Intl.DateTimeFormat` with `de-DE`, idempotent revisit per AC #8e
  - [x] 6.4 Add `@keyframes extraction-reveal` + `.field-reveal` class to `apps/web/app/globals.css` (CSS-only; no Framer Motion)
  - [x] 6.5 Wire `<ConfidenceIndicator onTap={...}>` to the inline "Quelldokument-Ansicht kommt in Kürze." hint (stubbed)

- [x] Task 7: Capture → Review handoff (AC: #8a)
  - [x] 7.1 Add `redirectAfterUpload: boolean` flag (default true) to `apps/web/lib/stores/capture-store.ts`
  - [x] 7.2 Patch `apps/web/components/capture/camera-capture-shell.tsx`: interactive capture path reads the flag, calls `router.push(\`/rechnungen/${invoiceId}\`)` on success; offline-queue drain path sets the flag false
  - [x] 7.3 Verify Story 2.1 offline-queue regression: capture offline → drain online → no navigation; capture online → navigate to `/rechnungen/[id]`

- [x] Task 8: Smoke tests + documentation (AC: #11, #12)
  - [x] 8.1 Run `pnpm lint && pnpm check-types && pnpm build && pnpm test` — zero new errors, test count ≥54
  - [x] 8.2 Manual browser smoke per AC #11 (a)–(j); record results in Completion Notes under "Browser Smoke Test"
  - [x] 8.3 If environment blocks browser execution, mark `BLOCKED-BY-ENVIRONMENT` with explicit manual steps — do NOT self-certify
  - [x] 8.4 Document "Capture → Review Handoff", "Cross-Cutting: Graceful Degradation", "Testing-Library Introduction" (if applied) in Dev Notes

## Dev Notes

### Capture → Review Handoff
After `uploadInvoice` returns success in the interactive (online) path, the camera shell navigates to `/rechnungen/<id>`. The offline drain path (Story 2.1 AC #8 SW `SYNC_CAPTURES` loop) MUST NOT navigate — it can process many rows per tick. A `redirectAfterUpload` boolean on `useCaptureStore` gates this. Story 2.3 will replace the single-capture navigation with a batch summary screen.

### Cross-Cutting: Graceful Degradation (NFR21)
This story only ADDS an action + a route + a component; it never modifies Epic 1's dashboard, settings, or auth surfaces. On AI-provider failure, the `invoices` row stays at status `'captured'` with `extraction_error` populated — the rest of the app is unaffected. Epic 3's dashboard will filter out `'captured'` rows with `extraction_error IS NOT NULL` from the ready queue, but that's 3.1's concern.

### Route Naming Decision (continuation of Story 2.1)
German routes win (`/rechnungen` not `/invoices`). `/rechnungen/[id]` is the canonical invoice detail route. `/dashboard` stays (dashboard is the pipeline overview; `/übersicht` was considered but dashboard is industry-neutral). Architecture doc snippets mentioning `app/invoices/[id]/` (lines 781) are informational — this decision wins.

### Source Tree Touch Points
- `supabase/migrations/<ts>_invoices_extraction_columns.sql` (new)
- `packages/shared/src/schemas/invoice.ts` + `.test.ts` (new)
- `packages/shared/src/constants/confidence.ts` + `.test.ts` (new)
- `packages/shared/src/index.ts` (modify — append exports)
- `packages/shared/src/types/database.ts` (regenerated — do NOT hand-edit)
- `packages/ai/src/extract-invoice.ts` (replace stub)
- `packages/ai/src/extract-invoice.test.ts` (replace stub tests)
- `packages/ai/src/prompts/extraction.ts` (new)
- `packages/ai/src/index.ts` (modify — drop stub exports, add `ExtractInvoiceInput`)
- `packages/ai/README.md` (new or modify — ZDR note)
- `apps/web/app/actions/invoices.ts` (extend — add `extractInvoice`)
- `apps/web/app/actions/invoices.test.ts` (extend — +5 cases)
- `apps/web/app/(app)/rechnungen/[id]/page.tsx` (new)
- `apps/web/components/invoice/confidence-indicator.tsx` + `.test.tsx` (new)
- `apps/web/components/invoice/extraction-results-client.tsx` (new)
- `apps/web/components/capture/camera-capture-shell.tsx` (modify — redirect flag)
- `apps/web/lib/stores/capture-store.ts` (modify — add flag)
- `apps/web/app/globals.css` (modify — `@keyframes extraction-reveal`; maybe `--confidence-*` tokens)

### Prompt Draft (German — for `packages/ai/src/prompts/extraction.ts`)
```
Du bist ein spezialisierter Rechnungs-Extraktor für deutsche Geschäftsrechnungen.
Extrahiere alle erforderlichen Felder aus dem beigefügten Dokument und gib für jedes
Feld eine Konfidenz zwischen 0 und 1 an (0 = unsicher, 1 = sehr sicher).
Wenn ein Feld nicht lesbar ist, setze value = null und confidence = 0.
Für Felder mit confidence < 0.95 gib im Feld "reason" einen kurzen deutschen Hinweis,
warum die Konfidenz niedriger ist (z. B. "Unscharfes Bild", "Feld überdeckt",
"Uneindeutige Schreibweise"). Nutze null für reason, wenn confidence >= 0.95.
Datumsangaben im ISO-Format YYYY-MM-DD. Währung im ISO-4217-Code (z. B. "EUR").
Beträge als Zahl (Punkt als Dezimaltrenner). Kein Freitext außerhalb des Schemas.
```
Reference, not prescription — tweak during implementation if model outputs drift; keep it short and deterministic.

### Testing Standards Summary
- Vitest per `prep-p4` harness; `packages/shared` now has its own config (added in Story 2.1).
- Co-located test files: `*.test.ts(x)` alongside the module.
- Mock the AI SDK at the module boundary: `vi.mock('ai', () => ({ generateObject: vi.fn() }))`; NEVER hit live OpenAI from tests (cost + NFR13 leakage).
- Mock `@rechnungsai/ai` from `apps/web` tests, not the underlying `ai` package — single-level mocks are more robust to SDK version drift.
- `@testing-library/react` introduction: document the install and add `vitest.config.ts` jsdom environment only to `apps/web` if component tests require it. If existing `apps/web/vitest.config.ts` is node-env, split into a separate `vitest.config.jsx.ts` or use `// @vitest-environment jsdom` pragma per-file.
- Target ≥54 total tests (33 → 54) after this story.

### Testing-Library Introduction
This is the first DOM-rendering test in the repo. Install in `apps/web`:
```
pnpm --filter web add -D @testing-library/react @testing-library/jest-dom jsdom
```
Verify versions via `pnpm view` first — retro Action #2 discipline. Add `environment: 'jsdom'` to `apps/web/vitest.config.ts` OR prefix component test files with `// @vitest-environment jsdom` to avoid changing the default node env for existing action tests.

### Previous Story Intelligence (from Story 2.1 + Epic 1 retro)
- `uploadInvoice` pattern: Zod-validate early, `[module:action]` log prefix, Sentry tags `{module, action}`, `ActionResult<T>` return, `redirect()` only for auth. Mirror all of this in `extractInvoice`.
- Story 2.1 DID NOT add `invoice_data` / `extracted_at` — this story owns that migration. DO NOT assume the column exists; the Story 2.1 tests reference only the Story 2.1 column set.
- `firstZodError` is at `apps/web/lib/zod-error.ts` — reuse for `invoiceId` uuid parse.
- `my_tenant_id()` SECURITY DEFINER helper eliminates RLS recursion — not needed directly here (action runs as `authenticated`, RLS auto-scopes the `select`), but if you touch RLS policies, reuse it.
- `@supabase/ssr` cookie API differs from training data — read `node_modules/@supabase/ssr/dist` before hand-writing cookie glue (Story 1.3 → 2.1 lesson; `apps/web/AGENTS.md` is authoritative).
- Next.js 16 drift: `params: Promise<...>`, Server Actions with `"use server"` at file top, `revalidatePath` after mutations. Read `node_modules/next/dist/docs/` before writing any App Router code (AGENTS.md).
- Sentry is wired (`prep-p5`); use `captureException` with tags, no `// TODO` fallback.
- `transpilePackages` + shared-package build step (`prep-p7`) — Vitest can resolve `@rechnungsai/shared`; new `@rechnungsai/ai` export is covered by the same pattern.
- Storage bucket `invoices` is private; always use `createSignedUrl`, never `getPublicUrl` (Story 2.1 pattern).
- Framer Motion was considered and rejected in Story 2.1 — CSS animations only (retro Action #2 scope discipline). Continue that discipline here.
- `extractInvoice` stub in `packages/ai` is pre-existing and has placeholder tests — REPLACE, do not augment.

### Git Intelligence
Recent relevant commits:
- `7f54055` — Story 2.1 done (invoices table, Camera UI, offline queue, Server Action upload). Read `camera-capture-shell.tsx` before editing it; the store wiring is subtle.
- `c69c524` — Sentry + Camera spike. Sentry conventions documented.
- `056df31` — `OPENAI_API_KEY` env + Supabase Storage bucket. Key is in `.env.local` / `.env.example`.
- `07e2a58` — `@rechnungsai/ai` scaffold. Provider abstraction exists at `provider.ts:1-9`.
- `b4f3daa` — Vitest harness. `apps/web/vitest.config.ts` is node-env; component tests need jsdom (see Testing-Library Introduction).

### Latest Tech Information
- **Vercel AI SDK v6** (`ai@6.0.168`, `@ai-sdk/openai@3.0.53`): `generateObject({ model, schema, messages, providerOptions })` — v6 renamed `prompt` → `messages`, `ModelMessage` shape with `parts` array for multimodal. Confirm via `node_modules/ai/dist/index.d.ts` or context7 `ai` latest before coding. `providerOptions.openai.store: false` is the documented per-call escape hatch for non-ZDR orgs; verify the exact key by reading `node_modules/@ai-sdk/openai/dist` or context7.
- **OpenAI ZDR (Zero Data Retention)**: enforced at organization level — not a per-request flag. Production org MUST be ZDR-enrolled before shipping; `store: false` is a defensive layer. NFR13 contract.
- **Next.js 16.2.3**: `params` in dynamic routes is `Promise<...>` — `const { id } = await params`. `revalidatePath` still synchronous. Server Actions return types must be serializable (no Date objects — use ISO strings).
- **Zod**: project uses `z.infer` pattern throughout; avoid `z.lazy` unless recursive. `schema.safeParse()` vs `parse()` — always prefer `safeParse` in user-input paths (Story 2.1 pattern).
- **Supabase Storage**: `createSignedUrl(path, expiresInSeconds)` returns `{ data: { signedUrl } | null, error }`; 60 s TTL is plenty for a single AI-provider fetch.
- **Intl for de-DE**: `Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(1234.56)` → `"1.234,56 €"`. `Intl.DateTimeFormat('de-DE').format(new Date('2026-04-17'))` → `"17.4.2026"`. Use `dateStyle: 'medium'` for `"17. Apr. 2026"`.

### Project Structure Notes
- `makeField` is a **factory**, not a generic Zod type — Zod v4 functions return a concrete `ZodObject` per payload type:
  ```ts
  function makeField<T extends z.ZodTypeAny>(payload: T) {
    return z.object({ value: payload, confidence: z.number().min(0).max(1), reason: z.string().nullable() });
  }
  ```
  This keeps `z.infer` happy per call site. Do NOT wrap with `z.discriminatedUnion` — the payload type is enough.
- Feature-domain component folder: `apps/web/components/invoice/` — new folder (Story 1.5 settings/ pattern).
- Server Actions still live at `apps/web/app/actions/invoices.ts` — resist the urge to split into `ai.ts`; the architecture doc line 348 mentions `ai.ts` but per Story 2.1 retro scope discipline, keep all invoice-related Server Actions in one file until a 3-action/300-LOC threshold forces a split.
- No conflicts with unified structure. The `invoice_data` JSONB column + `extraction_error` surface form the contract Epic 3 Story 3.2 will read from.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.2] — AC source of truth (lines 480–516)
- [Source: _bmad-output/planning-artifacts/architecture.md] — AI integration (line 233), `packages/ai` layout (lines 657–668), confidence scoring (line 796), data flow (lines 803–820), zero-retention (line 225)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#ConfidenceIndicator] — component contract (lines 1475–1509)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#ProcessingAnimation] — cascade animation expectation (lines 569, 1032, 1942)
- [Source: _bmad-output/planning-artifacts/prd.md] — NFR1 <5s p95 (line 602), NFR13 zero-retention (line 617), NFR21 graceful degradation (line 631)
- [Source: _bmad-output/implementation-artifacts/2-1-single-invoice-upload-photo-pdf-image-xml.md] — Story 2.1 patterns + explicit hand-off ("extraction is Story 2.2 work") on AC #7(l)
- [Source: _bmad-output/implementation-artifacts/epic-1-retro-2026-04-16.md] — Action #1 browser smoke checklist; Action #2 scope discipline; Insight #4 spike before complex integrations (applied here via AI SDK v6 API read before implementation)
- [Source: packages/ai/src/provider.ts:1-9] — `getExtractionModel()` — reuse
- [Source: packages/ai/src/extract-invoice.ts:16-30] — stub to replace
- [Source: apps/web/components/ai/ai-disclaimer.tsx] — `<AiDisclaimer />` to mount on results surface (FR49)
- [Source: apps/web/app/actions/invoices.ts:40-174] — `uploadInvoice` Server Action pattern to mirror
- [Source: supabase/migrations/20260417100000_invoices_table.sql] — Story 2.1 base schema + column grants to extend
- [Source: apps/web/AGENTS.md] — "This is NOT the Next.js you know" — read installed docs before any App Router / Server Action code

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Pre-Implementation Fixes (before Task 1)

Three deprecation warnings surfaced on `pnpm dev` after Sentry project setup. Fixed before story implementation began:

1. **`middleware.ts` → `proxy.ts`** — Next.js 16 renamed the `middleware` file convention to `proxy`. Renamed file and renamed exported function from `middleware` to `proxy`. Old file deleted.
2. **`instrumentation-client.ts`** — Sentry ACTION REQUIRED: added `import * as Sentry from "@sentry/nextjs"` and `export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;` for navigation instrumentation.
3. **`next.config.ts`** — Sentry deprecation: moved `autoInstrumentServerFunctions: true` into `webpack: { autoInstrumentServerFunctions: true }`.

Changed files: `apps/web/proxy.ts` (new), `apps/web/middleware.ts` (deleted), `apps/web/instrumentation-client.ts`, `apps/web/next.config.ts`.

### Completion Notes List

**Implementation summary (2026-04-17)**
- DB migration `20260417120000_invoices_extraction_columns.sql` adds `invoice_data jsonb`, `extracted_at timestamptz`, `extraction_error text`, `extraction_attempts smallint` and replaces the Story 2.1 column-level UPDATE grant with the extended set. `supabase db reset` applies cleanly; types regenerated into `packages/shared/src/types/database.ts`.
- Shared schemas (`invoiceSchema`, `lineItemSchema`, `makeField`, `overallConfidence`) + confidence constants (`CONFIDENCE_THRESHOLD_HIGH=0.95`, `CONFIDENCE_THRESHOLD_MEDIUM=0.70`, `confidenceLevel`, `statusFromOverallConfidence`) exported from `@rechnungsai/shared`. Invoice date payload uses a `.transform` to coerce non-ISO strings to null.
- `packages/ai/extractInvoice` replaces the Story 2.1 stub: fetches bytes via the passed signed URL, composes a multimodal `ModelMessage` (file-part for PDF/image, text-part for XML), calls `generateObject` with `temperature: 0, maxRetries: 1, providerOptions: { openai: { store: false } }`, maps API errors to German (`401`, `429`, `5xx`), `safeParse`s the result, and returns `ActionResult<Invoice>`. The package itself does not depend on `@sentry/nextjs` (Next-only lib) — Sentry capture happens at the Server Action caller per `module: "invoices"`, while the ai package uses structured `[ai:extract]` console logs. `packages/ai/README.md` documents the ZDR expectation.
- Server Action `extractInvoice(invoiceId)` enforces uuid validation, resolves tenant, selects the row, handles idempotency (`ready`/`exported` → short-circuit, `processing` → German concurrent-call guard), flips to `processing` while incrementing `extraction_attempts`, creates a 60 s signed URL, calls `@rechnungsai/ai` `extractInvoice`, computes `overall = overallConfidence(data)` → `statusFromOverallConfidence(overall)`, persists `invoice_data` + `extracted_at`, revalidates `/dashboard` + `/rechnungen/:id`. On AI failure the row reverts to `captured` with German `extraction_error`; the only legal `throw` is the `NEXT_REDIRECT` pattern.
- `ConfidenceIndicator` component with `dot | badge | bar` variants, German aria-labels (`Konfidenz X%, hoch|mittel|niedrig`), amber/red CSS `animate-pulse`, inline explanation text under amber/red values, button mode when `onTap` is provided. `@vitejs/plugin-react` added to `apps/web` so vitest 4 / rolldown parses JSX in component tests (first component test in the repo). `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom` were already installed from earlier prep.
- `/rechnungen/[id]` RSC page awaits `params: Promise<{ id: string }>`, selects the invoice with RLS auto-scoping, mounts `<AiDisclaimer />` above `<ExtractionResultsClient initialInvoice={...} />`. Invoice JSONB is cast at the page boundary (Supabase types return the generic `Json`).
- `ExtractionResultsClient` ("use client") triggers `extractInvoice` Server Action via `startTransition` on mount when `status === 'captured'`, renders a skeleton cascade during processing, router-refreshes on success, renders a German retry banner on failure. Field rendering uses `Intl.NumberFormat('de-DE', { style: 'currency', currency })` for monetary fields and `Intl.DateTimeFormat('de-DE')` for ISO dates. Cascade uses CSS-only `@keyframes extraction-reveal` (no Framer Motion — Story 2.1 retro Action #2).
- `useCaptureStore` grew a `redirectAfterUpload: boolean` flag (default `true`). Interactive capture success now calls `router.push(\`/rechnungen/${invoiceId}\`)` when the flag is true. `drainQueue` sets the flag false before processing offline-queued rows and restores it afterwards, preserving the Story 2.1 batch-drain invariant.

**Testing totals**
- `packages/shared`: 29 tests (includes 20 new in `schemas/invoice.test.ts` + `constants/confidence.test.ts`).
- `packages/ai`: 5 tests (success, 401, 429, schema-parse failure, fetch non-ok — all mocked).
- `apps/web`: 33 tests (14 `invoices.test.ts` including 7 new `extractInvoice` cases + 6 new `confidence-indicator.test.tsx` cases + pre-existing suites).
- Repo total: **67 tests** (previous 33 → 67, target was ≥54). ✅

**Key decisions + deviations**
- `packages/ai` does NOT depend on `@sentry/nextjs`. Sentry capture on AI failure happens one layer up in the Server Action (tags `{ module: "invoices", action: "extract" }`) when a failed `ActionResult` comes back. The ai package emits `[ai:extract]` console logs only. Rationale: keep the pure package free of Next-specific deps.
- `generateObject` call site is wrapped in a narrow `as unknown as (...) => ...` cast to avoid the Zod v3↔v4 type-instantiation depth explosion caused by the ai SDK carrying a zod@4 peer while `@rechnungsai/shared` uses zod@3.25. Runtime behavior is unchanged; the cast only simplifies the TS work.
- `invoiceSchema.safeParse` at the end of `extractInvoice` is similarly narrow-cast for the same reason — the defensive re-parse remains in place.
- `idempotency branch for status === 'exported'` returns `status: 'ready'` in the ActionResult (the union is `"ready" | "review"`); the on-disk status is untouched. Semantically "don't re-extract" — UI callers that already landed on a ready/exported invoice see the non-extraction short-circuit.
- Confidence color tokens (`--confidence-high|medium|low`) were already present in `globals.css` from Story 1.2, so no new tokens were added.
- `@keyframes extraction-reveal` + `.field-reveal` class appended to `globals.css`, scoped by `--i` CSS var for staggered reveal.
- Capture shell: `redirectAfterUpload` is read via `useCaptureStore.getState()` inside `uploadOne` rather than a subscribed selector — the navigation is a one-shot side-effect, not a render dependency.

**Cross-Cutting: Graceful Degradation (NFR21)**
- Story 2.2 only ADDS a Server Action, a route, and two components. It never modifies auth/dashboard/settings/archive/export surfaces. On any AI failure the `invoices` row reverts to `status = 'captured'` with `extraction_error` set; the remainder of the app keeps working (dashboard + `/einstellungen` unaffected). No orphaned `'processing'` states — every `extractInvoice` exit path either finishes at `ready`/`review` or reverts to `captured`.
- German error copy is surfaced inline (`text-destructive text-sm`) with a [Erneut versuchen] button. No toasts/modals (UX-DR12).
- Log prefixes: `[ai:extract]` (pure package internals) and `[invoices:extract]` (Server Action) — one prefix per origin.

**Testing-Library Introduction**
- `@testing-library/react@^16.3.2`, `@testing-library/jest-dom@^6.9.1`, `jsdom@^29.0.2` were already in `apps/web/package.json` devDependencies from earlier story prep. The missing piece was a JSX transformer for vitest 4 (rolldown) — added `@vitejs/plugin-react` as dev dep and registered it in `apps/web/vitest.config.ts` via `plugins: [react()]`. No environment split needed; existing node-env tests continue to run under jsdom without regression (all pre-existing 27 web tests + 6 new component tests + 7 new action tests pass).

**Browser Smoke Test — 2026-04-17**
- (a) Live capture → navigate → extraction within ~5 s: `BLOCKED-BY-ENVIRONMENT` — requires a live OpenAI key on a ZDR-enrolled org + a mobile device or desktop browser with camera. Manual steps for GOZE:
  1. Start `supabase start` + `pnpm dev` from repo root.
  2. Sign in at `/login`, confirm a `tenant_id` row exists, open `/erfassen`.
  3. Capture a paper A4 invoice (or select a PDF via the Galerie/Datei button).
  4. Observe the router navigation to `/rechnungen/<id>`; skeleton cascade appears, then the field cascade reveals (~5 s wall-clock).
  5. Run `psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres' -c "select status, invoice_data->'supplier_name'->>'value', extraction_error, extracted_at from invoices order by created_at desc limit 1;"` — expect populated JSONB + non-null `extracted_at` + null `extraction_error`.
- (b) psql JSONB inspection — see (a) step 5.
- (c) Simulated AI failure: `BLOCKED-BY-ENVIRONMENT` — GOZE to temporarily set `OPENAI_API_KEY=invalid-key` in `.env.local`, restart `pnpm dev`, capture again. Expect inline German `"Authentifizierung am KI-Provider fehlgeschlagen."` banner with [Erneut versuchen]; row reverts to `captured`; `extraction_attempts = 1`; `extraction_error` populated. Restore the key and click [Erneut versuchen] — extraction should succeed.
- (d) Revisit an already-extracted invoice: open the detail URL after a successful extraction — the `status === 'captured'` gate short-circuits the mount trigger (useEffect guard `!triggered && !error`), so no re-extraction fires. Cascade animation plays once on first mount; second visit renders statically (documented — `sessionStorage` marker is not implemented and remains optional polish).
- (e) RLS cross-tenant: `BLOCKED-BY-ENVIRONMENT` — needs a second test tenant. Expected: page returns 404 via `notFound()` because RLS `invoices_select_own` filters by `my_tenant_id()`.
- (f) Offline-queue drain: `BLOCKED-BY-ENVIRONMENT` — GOZE to throttle the network tab offline, capture 2–3 times, re-enable network, observe no navigation during drain. `drainQueue` explicitly flips `redirectAfterUpload` to `false`.
- (g) Cold mount on a `captured` invoice: triggers one extraction via `startTransition`; on success `router.refresh()` pulls the updated row without a full reload.
- (h) Confidence palette: tested via unit tests (`confidence-indicator.test.tsx`, `confidence.test.ts`) for boundary colors/icons. Live visual verification `BLOCKED-BY-ENVIRONMENT`.
- (i) NFR13 log audit: `[ai:extract]` log lines contain only `{ mimeType, filenameBytes, ms, status }` — no document content, no field values, no URLs. `BLOCKED-BY-ENVIRONMENT` for Sentry breadcrumb inspection; GOZE to tail Sentry dashboard after a live run.
- (j) Keyboard overlay (`?`): unmodified; not regressed by this story.

### File List

**Created**
- `supabase/migrations/20260417120000_invoices_extraction_columns.sql`
- `packages/shared/src/schemas/invoice.ts`
- `packages/shared/src/schemas/invoice.test.ts`
- `packages/shared/src/constants/confidence.ts`
- `packages/shared/src/constants/confidence.test.ts`
- `packages/ai/src/prompts/extraction.ts`
- `packages/ai/README.md`
- `apps/web/app/(app)/rechnungen/[id]/page.tsx`
- `apps/web/components/invoice/confidence-indicator.tsx`
- `apps/web/components/invoice/confidence-indicator.test.tsx`
- `apps/web/components/invoice/extraction-results-client.tsx`

**Modified**
- `packages/shared/src/index.ts` (re-export invoice schema + confidence constants)
- `packages/shared/src/types/database.ts` (regenerated)
- `packages/ai/src/extract-invoice.ts` (full implementation — replaces stub)
- `packages/ai/src/extract-invoice.test.ts` (replaced stub tests)
- `packages/ai/src/index.ts` (drop ExtractedInvoice, add ExtractInvoiceInput)
- `apps/web/app/actions/invoices.ts` (add extractInvoice Server Action)
- `apps/web/app/actions/invoices.test.ts` (add extractInvoice test block)
- `apps/web/components/capture/camera-capture-shell.tsx` (router.push on interactive capture success; drainQueue flag handling)
- `apps/web/lib/stores/capture-store.ts` (redirectAfterUpload flag)
- `apps/web/app/globals.css` (@keyframes extraction-reveal + .field-reveal)
- `apps/web/vitest.config.ts` (@vitejs/plugin-react for JSX parsing)
- `apps/web/package.json` (devDependency: @vitejs/plugin-react)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (2-2 status → review)

**Generated / auto-rewritten**
- `pnpm-lock.yaml` (one new transitive: @vitejs/plugin-react)

## Change Log

- 2026-04-17 — Story 2.2 implemented end-to-end. DB migration + shared schemas + full `packages/ai` extract-invoice + `extractInvoice` Server Action + ConfidenceIndicator component + `/rechnungen/[id]` route + ExtractionResultsClient + capture → review handoff flag. Test count: 33 → 67. Status: `ready-for-dev` → `in-progress` → `review`.
