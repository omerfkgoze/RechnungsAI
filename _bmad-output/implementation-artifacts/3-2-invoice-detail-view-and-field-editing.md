# Story 3.2: Invoice Detail View and Field Editing

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to view all extracted data for an invoice in a rich detail pane, correct any fields the AI got wrong with a clear "accept / revert-to-AI" affordance, and see the source document next to the extracted value,
so that I can trust what I am approving and train the AI on my suppliers without leaving the dashboard.

---

## Technical Concerns (≤3, per Epic 1 retro Action #2)

1. **Detail pane + desktop split-view layout (UX-DR10)** — Convert the current simple `/rechnungen/[id]` page into an `AccordionInvoiceCard`-style expanded card. On `lg+` viewports, embed the detail pane on the `/dashboard` route next to the list (380px fixed list + detail pane); on mobile/tablet keep full-page navigation to `/rechnungen/[id]`.
2. **Inline field editing with AI-learning persistence (FR6, FR7, UX-DR17)** — Per-field edit affordance: tap amber/red field → input pre-filled with AI value → `[Übernehmen]` (primary) + `[AI-Wert wiederherstellen]` (tertiary) buttons. Corrections persist via a new `correctInvoiceField` Server Action into a new `invoice_field_corrections` audit table and in-place on `invoices.invoice_data`. Success feedback: inline green checkmark 1s. Supplier-specific AI-learning message shown on success.
3. **Source Document Viewer (UX-DR15)** — Dialog/Sheet that renders the original image/PDF (signed URL, 60s TTL, reusing the `invoices` storage bucket pattern from Story 2.1) with the extracted value shown alongside. Pinch-to-zoom on touch; keyboard `+/-` on desktop. Bounding-box highlight for the tapped field is **out of scope for MVP** — only the full-document view is shipped (AI does not yet emit coordinate metadata; documented in Dev Notes).

**Deferred to Story 3.3:** SKR categorization select, BU-Schlüssel display, categorization learning feedback.
**Deferred to Story 3.4:** Swipe gestures, `[Freigeben]` / `[Flaggen]` approve buttons.
**Deferred to Story 3.5:** Compliance warnings, weekly value summary, validation badges on the detail pane.

---

## Acceptance Criteria

1. **Given** a user is on `/dashboard` with viewport `<lg` (`<1024px`) **When** they tap/click an `<InvoiceListCard />` **Then** the browser navigates to `/rechnungen/[id]` (existing Story 2.2 route) and renders the new `<InvoiceDetailPane />` server component, which replaces the current `<ExtractionResultsClient />` expanded-card body. The page-level layout (container, `<AiDisclaimer />`) stays intact; the Client wrapper for triggering extraction (Story 2.2 auto-trigger) is preserved by moving the auto-`extractInvoice` `useEffect` into a new `<DetailPaneExtractionBootstrap />` client child. **Do not** delete `extraction-results-client.tsx` — delete only after `<InvoiceDetailPane />` is wired (single-commit cutover is acceptable; see Dev Notes "Cutover Strategy").

2. **Given** the user is on `/dashboard` with viewport `lg+` (`≥1024px`) **When** they click an `<InvoiceListCard />` **Then** the page does **not** navigate; instead the URL updates to `/dashboard?selected={id}` via `router.replace(..., { scroll: false })`, the right pane slots in `<InvoiceDetailPane invoiceId={selected} />`, and the list column is constrained to `w-[380px] shrink-0` per UX-DR10. The left column retains scroll; the right pane scrolls independently (`overflow-y-auto h-[calc(100vh-<offset>)]`). On mobile/tablet (`<lg`) the `selected` param is ignored and clicks fall through to full-page navigation (AC #1). **Implementation:** `apps/web/app/(app)/dashboard/page.tsx` reads `selected` from `searchParams`, and if present AND `lg+` is effective (CSS-only — no user-agent sniffing; the right column is hidden below `lg` via Tailwind `hidden lg:block` and the full-page route handles `<lg`). The list card's `<Link>` becomes a client `<InvoiceListCardLink />` that intercepts on `lg+` via `useMediaQuery` (or a lightweight `matchMedia('(min-width: 1024px)')` check inside a `useEffect`) and calls `router.replace('?selected=...')` in that case, else falls back to default navigation. Provide an ESC keyboard handler on the dashboard page that clears `?selected`.

3. **Given** `<InvoiceDetailPane />` renders **When** the invoice has `invoice_data !== null` **Then** it shows ALL extracted fields per FR32, in the same `FIELD_ORDER` used today in `extraction-results-client.tsx:42-55`: `invoice_number, invoice_date, supplier_name, supplier_address, supplier_tax_id, recipient_name, recipient_address, net_total, vat_total, gross_total, currency, payment_terms`. Line items render below in a responsive table (columns: Beschreibung, Menge, Einzel, Netto, USt-Satz, USt-Betrag — extend today's 5-column table to 6 by adding `vat_rate`). Each field row has three cells: label (`<dt>`), value (`<dd>`), confidence indicator (`<ConfidenceIndicator variant="dot" />` on mobile, `variant="bar"` on `md+` when field is amber/red). The card has a **4px left border** colored by `confidenceLevel(overallConfidence(invoice_data))` using the same tokens as `InvoiceListCard` (`border-l-confidence-high | -medium | -low`).

4. **Given** the user taps/clicks an **editable field** **When** the tap is received **Then** the field row switches from read-only `<dd>` to an inline edit form controlled by a new `<EditableField />` client component. Edit state is **per-field** (only one open at a time on mobile; `md+` allows multiple via independent state). Input types per UX-DR18:
   - **Amount fields** (`net_total`, `vat_total`, `gross_total`, `line_items[i].unit_price`, `net_amount`, `vat_amount`) → `<input type="text" inputMode="decimal">` with a prefix showing the currency symbol (`€` when `currency.value ∈ { "EUR", null }`, else the ISO code). Parsing: accept both German (`1.234,56`) and machine (`1234.56`) formats; always store as number. Live format-validation: show inline red text `"Ungültiger Betrag"` when parse fails; do **not** block typing.
   - **Date field** (`invoice_date`) → `<input type="date">` (native per UX-DR18). Pre-filled value must be ISO `YYYY-MM-DD`. Submit writes ISO back — matches `isoDateField` schema in `packages/shared/src/schemas/invoice.ts:20`.
   - **Text fields** (names, addresses, `supplier_tax_id`, `invoice_number`, `currency`, `payment_terms`) → `<input type="text">`. For `supplier_tax_id` show placeholder `"DE123456789"`; validate with `/^[A-Z]{2}\d{6,12}$/` on blur — warn but allow submit if the supplier has a non-standard ID.
   - **Quantity** → `<input type="number" step="any">`.
   The label on the edit control is set via the same `LABELS` map currently in `extraction-results-client.tsx:27-40`; extract that map plus `FIELD_ORDER` into a **new shared module** `apps/web/lib/invoice-fields.ts` so both `<ExtractionResultsClient />` (until deleted) and the new components consume a single source of truth.

5. **Given** a field is in edit mode **When** the user sees the action row beneath the input **Then** two buttons render inline (no modal): `[Übernehmen]` (shadcn `<Button variant="default" size="sm">`, green-tinted via existing `confidence-high` token — override `bg-confidence-high hover:bg-confidence-high/90 text-white`), and `[AI-Wert wiederherstellen]` (shadcn `<Button variant="ghost" size="sm">`). A third control — `Esc` cancels without saving (reverts to last-saved value, not AI value). The AI-wert button restores the **original AI value** from a captured `initialAiValue` that the component receives as a prop from server data (never mutated). Both buttons are keyboard-accessible and included in the tab order. Mobile: sticky action row at the bottom of the field via `sticky bottom-0` inside the card scroll container — so the user never loses the buttons behind the keyboard (fallback: regular inline placement is acceptable if sticky breaks on iOS keyboard overlays — Dev Notes must state which was shipped).

6. **Given** the user taps `[Übernehmen]` **When** the corrected value differs from the current `invoice_data[field].value` **Then** a new Server Action `correctInvoiceField` in `apps/web/app/actions/invoices.ts` is invoked via `useTransition`. Signature:
   ```ts
   export async function correctInvoiceField(input: {
     invoiceId: string;
     fieldPath: string; // e.g. "supplier_name" | "line_items.2.quantity"
     newValue: string | number | null;
   }): Promise<ActionResult<{ newConfidence: number }>>;
   ```
   The action:
   - Validates `invoiceId` via the existing `invoiceIdSchema` (`apps/web/app/actions/invoices.ts:22`).
   - Validates `fieldPath` against an allow-list exported from `packages/shared/src/schemas/invoice.ts` (NEW export `CORRECTABLE_FIELD_PATHS: readonly string[]`) — rejects anything not listed.
   - Authenticates via `supabase.auth.getUser()`, reads `tenant_id` from `users` table, checks the row belongs to that tenant (same pattern as `extractInvoice` at `invoices.ts:202-231`).
   - Rejects if `invoice.status ∈ {'exported'}` with German error `"Exportierte Rechnungen können nicht mehr bearbeitet werden."`. (Status `ready` and `review` ARE editable — per FR6 "review, edit, and confirm".)
   - Applies the correction by fetching the current `invoice_data` jsonb, deep-cloning, writing `{ value: newValue, confidence: 1.0, reason: "Vom Nutzer korrigiert" }` at the given path, and `.update({ invoice_data: ..., updated_at: now() })`. **Must** use an optimistic-concurrency guard: `.eq("id", invoiceId).eq("updated_at", priorUpdatedAt)` — if `updated_at` moved, return `{ success: false, error: "Rechnung wurde zwischenzeitlich geändert. Bitte Seite neu laden." }`.
   - Inserts one row into `invoice_field_corrections` (AC #11) capturing the before/after for AI learning (FR7).
   - Wraps everything in the same try/catch pattern as `extractInvoice`, Sentry tag `{ module: "invoices", action: "correct_field" }`, log prefix `"[invoices:correct_field]"`.
   - Calls `revalidatePath("/dashboard")` and `revalidatePath(`/rechnungen/${invoiceId}`)` on success.

7. **Given** `correctInvoiceField` returns `{ success: true }` **When** the client receives the result **Then**:
   - The edit form collapses back to display mode.
   - An **inline green checkmark** (`<CheckCircle2 />` from lucide-react — already a repo dep if not, use inline SVG; verify before adding a dep) renders to the right of the value for exactly `1000ms`, then fades out (UX-DR17). Use CSS animation (`animate-in fade-in-0 fade-out-0 duration-1000`) — **no** Framer Motion (Epic 1 retro discipline).
   - A `<Toast>` (shadcn `sonner`/`<Toaster>` — check if wired; if not, use a simple transient inline message below the field, **do not** add a new dep) shows one of two AI-learning messages per UX-DR15:
     - If `fieldPath === "supplier_name"` OR this supplier already has ≥1 prior invoice (the client cannot cheaply know; ship the supplier-agnostic message and let Story 3.3 introduce supplier-aware messages when the corrections-by-supplier counter lands): `"Verstanden — ich merke mir das für ähnliche Rechnungen."`
     - Generic fallback when the toast infrastructure is not wired: inline muted text `"Gespeichert."` below the field for 2s.
   Document in Dev Notes which of these two was shipped (toast infra present vs. inline message fallback).

8. **Given** the user taps a `<ConfidenceIndicator>` **When** the indicator is interactive (amber or red by UX-DR2 Error Type Matrix) **Then** the **Source Document Viewer** opens as a `<Sheet>` (bottom sheet on `<md`, right sheet on `md+`) from shadcn. Content:
   - Header: `"Quelldokument"` + close button (`<button aria-label="Schließen">`).
   - Body: for `file_type` starting with `"image/"`, render `<img src={signedUrl} alt={originalFilename} className="max-w-full">` inside a pinch-zoom container (use CSS `touch-action: manipulation` + browser default pinch; **no** new dep); for `application/pdf`, render `<object data={signedUrl} type="application/pdf" className="h-[80vh] w-full">` with a fallback `<a>` link. For `application/xml` / `text/xml`, render a `<pre>` with the raw XML (fetch server-side in the page, pass as prop — budget: ≤50KB; if larger, show `"Vorschau zu groß — Datei herunterladen"` with the signed URL as download link).
   - Below the document: a summary row showing the field name, the AI value, and the user's current corrected value (if editing) side-by-side: `<dl className="grid grid-cols-[auto_1fr] gap-2">`.
   - **Signed URL acquisition:** add a new Server Action `getInvoiceSignedUrl(invoiceId: string): Promise<ActionResult<{ url: string; fileType: string }>>` that reuses the same `createSignedUrl(file_path, 60)` pattern already present at `invoices.ts:315-317`. Do **not** expose `file_path` to the client. The Sheet invokes this action on first open and caches the URL client-side for its 55-second window (client re-requests if user reopens after expiry).
   - **Bounding-box highlight:** explicitly **out of scope** for MVP. The viewer shows the whole document; the field-level highlight is deferred until the AI extractor emits coordinates (tracked as a new TD item in `deferred-work.md` — see AC #16).

9. **Given** the user taps `[AI-Wert wiederherstellen]` **When** an AI value exists (prop `initialAiValue` is not `undefined`) **Then** the input value is set back to the AI value locally (no server round-trip), focus stays on the input, and the `[Übernehmen]` button now becomes a no-op if the input equals the current saved value (button disabled with `aria-disabled="true"`). If the user then taps `[Übernehmen]` with the AI value re-selected AND the current saved value differs from the AI value, the Server Action runs with the AI value as the correction, which writes `{ value: aiValue, confidence: aiConfidence, reason: "Nutzer hat AI-Wert wiederhergestellt" }` — preserving the original AI confidence rather than forcing 1.0. This row still lands in `invoice_field_corrections` with `corrected_to_ai = true` so supplier-learning can discount it.

10. **Given** validation fails or the Server Action returns `{ success: false }` **When** the error surfaces **Then** the input stays in edit mode, the error message renders below the input (`<p className="text-caption text-destructive">`), focus stays on the input, `[Übernehmen]` is re-enabled. Messages:
    - Empty required field (only `invoice_number` and `gross_total` are required client-side — document the decision; other fields can be null): `"Dieses Feld darf nicht leer sein."`
    - Numeric parse failure: `"Ungültiger Betrag — bitte im Format 1.234,56 oder 1234.56."`
    - Date parse failure: browser handles via `type="date"`; manual guard if user disables the picker: `"Ungültiges Datum — bitte YYYY-MM-DD."`
    - Server-returned error string: render as-is (server is already localized).
    - Concurrency error (see AC #6): render with a button `"Seite neu laden"` that `router.refresh()`.

11. **Given** corrections need to feed AI learning (FR7) **When** `correctInvoiceField` succeeds **Then** a new table `invoice_field_corrections` persists the audit trail. Add migration `supabase/migrations/20260424000000_invoice_field_corrections.sql`:
    ```sql
    create table public.invoice_field_corrections (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references public.tenants(id) on delete cascade,
      invoice_id uuid not null references public.invoices(id) on delete cascade,
      supplier_name text, -- denormalized at write time for supplier-lookup learning
      field_path text not null,
      previous_value jsonb,  -- full {value, confidence, reason} snapshot
      corrected_value jsonb not null,
      corrected_to_ai boolean not null default false,
      created_at timestamptz not null default now()
    );
    -- Append-only: no UPDATE, no DELETE to authenticated (mirror categorization_corrections)
    create index invoice_field_corrections_tenant_supplier_idx
      on public.invoice_field_corrections (tenant_id, supplier_name, created_at desc);
    create index invoice_field_corrections_invoice_idx
      on public.invoice_field_corrections (invoice_id, created_at desc);
    alter table public.invoice_field_corrections enable row level security;
    create policy "invoice_field_corrections_select_own"
      on public.invoice_field_corrections for select to authenticated
      using (tenant_id = public.my_tenant_id());
    create policy "invoice_field_corrections_insert_own"
      on public.invoice_field_corrections for insert to authenticated
      with check (tenant_id = public.my_tenant_id());
    grant select, insert on public.invoice_field_corrections to authenticated;
    -- Explicitly no update/delete grants (append-only GoBD-style)
    ```
    Pattern mirrors `supabase/migrations/20260421000000_categorization_corrections.sql`. Update `packages/shared/src/types/database.ts` to include the new table by hand (no generator in repo, per Story 3.1 precedent).

12. **Given** `prefers-reduced-motion: reduce` is set **When** the detail pane animates (field-reveal cascade, checkmark fade, sheet slide-in) **Then** all animations disable via the existing `motion-reduce:animate-none` / `@media (prefers-reduced-motion: no-preference)` guards. The field-reveal cascade (`field-reveal` class already in use in `extraction-results-client.tsx:148-149`) must be preserved and reduction-safe.

13. **Given** the detail pane must meet NFR5 (<1 s user interaction) **When** the user taps/clicks a field to edit **Then** the edit-mode transition happens synchronously on the client (no network round-trip on open). Submit (`[Übernehmen]`) completes within 1 second on the local happy path (single `UPDATE` + single `INSERT`). Signed-URL acquisition for the Source Viewer must complete within 1 second (Supabase local: typically <200ms; budget allows for network).

14. **Given** unit tests exercise the new surface **When** `pnpm test` runs **Then** the suite gains:
    - `apps/web/lib/invoice-fields.test.ts` — NEW. Re-export tests for `LABELS`, `FIELD_ORDER`, `CORRECTABLE_FIELD_PATHS`; snapshot assertion on the path list so additions require deliberate commit. ≥3 cases.
    - `apps/web/components/invoice/editable-field.test.tsx` — NEW. Cases: (a) renders read-only then enters edit on click; (b) German-locale amount parsing (`"1.234,56"` → `1234.56`); (c) Enter submits, Escape cancels; (d) `[AI-Wert wiederherstellen]` restores initial prop; (e) `[Übernehmen]` disabled when value unchanged after revert; (f) inline validation message on bad amount. ≥6 cases.
    - `apps/web/components/invoice/source-document-viewer.test.tsx` — NEW. Cases: (a) image branch renders `<img src>`; (b) pdf branch renders `<object data>`; (c) xml branch renders `<pre>` with truncation banner when >50KB; (d) close button fires `onOpenChange(false)`. ≥4 cases. Mock the signed-URL Server Action.
    - `apps/web/components/invoice/invoice-detail-pane.test.tsx` — NEW. Cases: (a) renders all 12 fields in order + line-items table; (b) 4px left-border class matches confidence tier; (c) NULL fields render `"—"`; (d) processing/captured status shows skeleton reveal (reuse existing `field-reveal` cascade); (e) aria-labels. ≥5 cases.
    - `apps/web/app/actions/invoices.test.ts` — MODIFY. Add `correctInvoiceField` block: (a) rejects invalid `fieldPath`; (b) rejects `status=exported`; (c) writes expected jsonb shape; (d) inserts `invoice_field_corrections` row with `corrected_to_ai=false`; (e) restored-AI path writes `corrected_to_ai=true` and preserves original AI confidence; (f) concurrency guard — stale `updated_at` returns error without writing; (g) `getInvoiceSignedUrl` returns signed URL for valid tenant, 404 for non-tenant row. ≥7 new cases.
    - **Target:** +4 new test files, +≥25 new cases. Total test count: 128 → **≥153**.
    - NO new test for the `/dashboard?selected=` split-view interaction at the RSC level (Next.js 16 RSC test infra not wired — covered by the smoke test).

15. **Given** CI-equivalent commands run from the repo root **When** they execute **Then** all four succeed with zero new errors: `pnpm lint`, `pnpm check-types`, `pnpm build`, `pnpm test`. `supabase db reset` applies migration `20260424000000_invoice_field_corrections.sql` cleanly.

16. **Given** two known tech-debt items from Story 3.1 retro are explicitly owned by this story **When** the implementation lands **Then**:
    - **P12 resolution (realtime dashboard)** — Introduce a lightweight Supabase realtime subscription on `/dashboard` (client child component `<DashboardRealtimeRefresher />`) that listens on the `invoices` table for `INSERT/UPDATE` with `tenant_id = <current>` and calls `router.refresh()` on event, debounced 500ms. Channel name: `invoices-tenant-<tenantId>`. Cleanup on unmount. Document the RLS caveat: realtime respects publication-level RLS; verify the `invoices` table is part of `supabase_realtime` publication (add it in the new migration if missing: `alter publication supabase_realtime add table public.invoices;`). If realtime proves flaky in local dev, fall back to the existing `revalidatePath` discipline — **no** interval-polling.
    - **P14 resolution (generated-column safe cast)** — New migration statement in `20260424000000_invoice_field_corrections.sql` OR a sibling migration (dev's choice) that drops and recreates `gross_total_value` and `supplier_name_value` generated columns from Story 3.1's `20260423000000_invoice_sort_columns.sql` with safe casts: wrap the numeric cast in `CASE WHEN invoice_data->'gross_total'->>'value' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (...)::numeric ELSE NULL END`. This must be a separate, idempotent migration — name it `20260424100000_invoice_sort_columns_safe_cast.sql`. Dropping and recreating a stored generated column requires `ALTER TABLE ... DROP COLUMN ... CASCADE` then `ADD COLUMN ... GENERATED ALWAYS AS (...) STORED`; the dashboard indexes from 3.1 must be recreated in the same migration. Confirm `pnpm test` and `pnpm build` pass end-to-end with a fresh `supabase db reset`.
    - Document both resolutions in Dev Notes under "Tech Debt Resolved".
    - If scope pressure emerges, **P12 is the cut line** — P14 must land (it's a latent INSERT-time crash). Communicate a cut via a `correct-course` note before shipping.

17. **Given** Story 3.1's `extraction-results-client.tsx` is no longer used **When** the new detail pane ships **Then** the file is deleted in the same PR, `LABELS` + `FIELD_ORDER` + `formatCurrency` + `safeCurrency` + `formatValue` are migrated to the shared locations (`apps/web/lib/invoice-fields.ts` for labels/order; `apps/web/lib/format.ts` gains `formatValue` + `safeCurrency` — the existing `formatEur` from 3.1 is the public entry, `formatCurrency` is an internal alias). Any import of `extraction-results-client` is updated or removed. **Do not** keep dead code.

18. **Given** the smoke-test format (per `_bmad-output/implementation-artifacts/smoke-test-format-guide.md`) is mandatory from Story 3.1 onwards **When** the story completes **Then** Completion Notes include a `### Browser Smoke Test` section with UX Checks and DB Verification tables. Cover at minimum:
    - **UX (a)** `/dashboard` on mobile viewport, tap a card → `/rechnungen/{id}` loads with new detail pane.
    - **UX (b)** `/dashboard` on `lg+` viewport, click a card → URL becomes `/dashboard?selected=<id>`, right pane renders, list remains on the left at 380px.
    - **UX (c)** Tap an amber field → edit form opens with AI value pre-filled and appropriate keyboard type.
    - **UX (d)** Type new value → `[Übernehmen]` → inline green checkmark for 1s → field shows new value with 100% confidence dot.
    - **UX (e)** Tap `[AI-Wert wiederherstellen]` → input reverts to AI value locally (no server call).
    - **UX (f)** Tap a `<ConfidenceIndicator>` (amber/red) → Source Document Viewer opens with image/PDF visible and extracted value shown alongside.
    - **UX (g)** On `lg+`, press Escape in detail pane → `?selected` cleared.
    - **UX (h)** Concurrency: open the same invoice in two tabs, edit a field in Tab 1 → `[Übernehmen]`; edit same field in Tab 2 → `[Übernehmen]` → Tab 2 shows German concurrency error with `[Seite neu laden]` button.
    - **UX (i)** Status=`exported` → field edit mode does **not** open (inline info banner `"Exportierte Rechnungen können nicht mehr bearbeitet werden."`).
    - **UX (j)** Upload a new invoice from a second tab → `/dashboard` in tab 1 auto-refreshes list within ~1s (P12 realtime).
    - **UX (k)** Regression: `/einstellungen`, `/erfassen` render unchanged.
    - **DB (d1)** `select count(*) from public.invoice_field_corrections;` increments by 1 per `[Übernehmen]`.
    - **DB (d2)** `select corrected_to_ai from public.invoice_field_corrections order by created_at desc limit 1;` returns `true` after a restore-to-AI correction, `false` otherwise.
    - **DB (d3)** `select (invoice_data->'supplier_name'->>'value'), (invoice_data->'supplier_name'->>'confidence') from public.invoices where id='<edited>';` reflects the correction (confidence = `1.000` for user-corrected, AI confidence for restore).
    - **DB (d4)** `supabase db reset` succeeds — generated columns recreate with the safe cast (`select column_name, generation_expression from information_schema.columns where table_name='invoices' and is_generated='ALWAYS';` shows the `CASE WHEN ... ~ '^-?...'` cast).
    - **DB (d5)** Insert a row with `invoice_data->'gross_total'->>'value' = '1.234,56'` (German-locale string) directly — the INSERT succeeds (safe cast yields NULL for `gross_total_value`); pre-P14 this would error. Restore row afterwards.
    Mark non-runnable rows `BLOCKED-BY-ENVIRONMENT` per Epic 1 retro A1 — **do not** self-certify browser rows.

19. **Given** the Server Action error-path checklist (Epic 2 retro A2) applies to the two NEW actions **When** `correctInvoiceField` and `getInvoiceSignedUrl` are written **Then** each is audited:
    - Every exit path returns a structured `ActionResult<T>`.
    - DB SELECT errors are distinguished from "not found" (PostgREST code `"PGRST116"`).
    - The optimistic-concurrency guard's failure case returns the specific German message, not a generic error.
    - No `throw` escapes beyond the outer try/catch.
    - Sentry captures with `tags: { module: "invoices", action: "correct_field" | "sign_url" }`.
    - Log prefix `[invoices:correct_field]` / `[invoices:sign_url]`.
    Document findings in Dev Notes under "Error Path Audit".

---

## Tasks / Subtasks

- [x] **Task 1: Shared helpers + migration (AC: #4, #11, #16, #17)**
  - [x] 1.1 `apps/web/lib/invoice-fields.ts` NEW — export `LABELS`, `FIELD_ORDER`, `CORRECTABLE_FIELD_PATHS` (derived).
  - [x] 1.2 `packages/shared/src/schemas/invoice.ts` — export `CORRECTABLE_FIELD_PATHS: readonly string[]` covering the 12 top-level fields + `line_items.${number}.{description,quantity,unit_price,net_amount,vat_rate,vat_amount}` pattern.
  - [x] 1.3 `apps/web/lib/format.ts` — add `formatValue(key, value, currency)` + `safeCurrency` migrated from `extraction-results-client.tsx`; extend `formatEur` if needed; tests updated.
  - [x] 1.4 `supabase/migrations/20260424000000_invoice_field_corrections.sql` NEW — table + RLS + indexes + append-only grants; `alter publication supabase_realtime add table public.invoices;` if not yet included.
  - [x] 1.5 `supabase/migrations/20260424100000_invoice_sort_columns_safe_cast.sql` NEW — drop + recreate `gross_total_value` / `supplier_name_value` with safe `CASE WHEN ~ '^-?[0-9]+(\.[0-9]+)?$'` cast; recreate 3.1 indexes.
  - [x] 1.6 `packages/shared/src/types/database.ts` — add `invoice_field_corrections` entry by hand.
  - [x] 1.7 `supabase db reset` green locally.

- [x] **Task 2: Server Actions (AC: #6, #8, #11, #19)**
  - [x] 2.1 `correctInvoiceField` in `apps/web/app/actions/invoices.ts` — auth + tenant + row fetch + `fieldPath` allow-list + optimistic concurrency on `updated_at` + jsonb deep-set + `invoice_field_corrections` insert + `revalidatePath`.
  - [x] 2.2 `getInvoiceSignedUrl` in same file — auth + tenant check + `createSignedUrl(file_path, 60)` + return `{ url, fileType }`.
  - [x] 2.3 Tests in `apps/web/app/actions/invoices.test.ts` — ≥7 cases covering allow-list, exported rejection, jsonb shape, concurrency, restore-to-AI, signed-URL tenant isolation, error branches.

- [x] **Task 3: `<EditableField />` client component (AC: #4, #5, #9, #10)**
  - [x] 3.1 `apps/web/components/invoice/editable-field.tsx` NEW — props `{ invoiceId, fieldPath, label, value, initialAiValue, aiConfidence, currency, inputKind, isExported }`. Enter/Escape handlers. Uses `useTransition` for submit.
  - [x] 3.2 German-locale decimal parser extracted to `apps/web/lib/format.ts::parseGermanDecimal(input: string): number | null`.
  - [x] 3.3 Tests in `editable-field.test.tsx` — ≥6 cases.

- [x] **Task 4: `<SourceDocumentViewer />` (AC: #8)**
  - [x] 4.1 `apps/web/components/invoice/source-document-viewer.tsx` NEW — Sheet-based; fetches signed URL on first open; renders image / pdf / xml branches; shows extracted-value panel.
  - [x] 4.2 Sheet installation: confirmed shadcn `<Sheet>` was present (`apps/web/components/ui/sheet.tsx`). No install needed.
  - [x] 4.3 Tests in `source-document-viewer.test.tsx` — ≥4 cases.

- [x] **Task 5: `<InvoiceDetailPane />` + page wiring (AC: #1, #3, #12)**
  - [x] 5.1 `apps/web/components/invoice/invoice-detail-pane.tsx` NEW (RSC) — renders confidence-bordered card, field rows (delegates to `<EditableField />`), line-items table (6 cols with VAT rate), `<ConfidenceIndicator variant="badge">` header.
  - [x] 5.2 `apps/web/components/invoice/detail-pane-extraction-bootstrap.tsx` NEW — `"use client"`, replicates the auto-`extractInvoice` `useEffect` from today's `ExtractionResultsClient` (StrictMode-safe ref guard).
  - [x] 5.3 Rewrite `apps/web/app/(app)/rechnungen/[id]/page.tsx` — uses `<InvoiceDetailPane />` + bootstrap child.
  - [x] 5.4 Tests in `invoice-detail-pane.test.tsx` — ≥5 cases.
  - [x] 5.5 DELETE `apps/web/components/invoice/extraction-results-client.tsx` once no importers remain.

- [x] **Task 6: Split-view on `/dashboard` (AC: #2, #16)**
  - [x] 6.1 `apps/web/components/dashboard/invoice-list-card-link.tsx` NEW — client wrapper using `matchMedia('(min-width: 1024px)')` inside `useEffect` to intercept on desktop.
  - [x] 6.2 `apps/web/app/(app)/dashboard/page.tsx` — read `selected` param, render right column `<aside className="hidden lg:block">` with `<InvoiceDetailPane />` when set; adjust grid to `lg:grid-cols-[380px_1fr]`.
  - [x] 6.3 ESC keyboard handler on dashboard client wrapper clears `?selected`.
  - [x] 6.4 `<DashboardRealtimeRefresher />` NEW — client child; Supabase `.channel("invoices-tenant-{id}").on("postgres_changes", {...}, ...)`; 500ms-debounced `router.refresh()`; cleanup on unmount.

- [x] **Task 7: AI-learning message + toast infra probe (AC: #7)**
  - [x] 7.1 `<Toaster>` is NOT wired in `apps/web/app/layout.tsx`. Inline muted text `"Gespeichert."` is used for 2s. Documented in Dev Notes under "AI-Learning Toast Decision".

- [x] **Task 8: Validate + Smoke Test (AC: #14, #15, #18)**
  - [x] 8.1 `pnpm lint`, `pnpm check-types`, `pnpm build`, `pnpm test` all green — test total 176 (≥153).
  - [x] 8.2 `### Browser Smoke Test` section per `smoke-test-format-guide.md` — UX rows BLOCKED-BY-ENVIRONMENT with manual steps for GOZE; DB rows executable.

- [x] **Task 9: Tech debt + error-path audit (AC: #16, #19)**
  - [x] 9.1 P12 realtime shipped via `<DashboardRealtimeRefresher />` (Task 6.4).
  - [x] 9.2 P14 safe cast migration shipped (`20260424100000_invoice_sort_columns_safe_cast.sql`) and verified via `supabase db reset`.
  - [x] 9.3 Error Path Audit for `correctInvoiceField` + `getInvoiceSignedUrl` documented in Dev Notes.

---

## Dev Notes

### Scope Fences (from Story 3.1 retro + Epic 3 plan)
- **SKR categorization + BU-Schlüssel** → Story 3.3. Do not add category select, BU-Schlüssel row, or categorization_corrections writes here.
- **Approve / Flag buttons + swipe gestures + Framer Motion** → Story 3.4. The detail pane ends at the line items; no action buttons below.
- **Compliance warnings, weekly value summary, validation badges** → Story 3.5.
- **Bounding-box field highlight in Source Viewer** → deferred indefinitely (AI does not emit coords). Document in `deferred-work.md` as TD7.

### Cutover Strategy
`extraction-results-client.tsx` is the current detail body. Two options:
1. **Single-commit cutover (preferred):** build `<InvoiceDetailPane />` + `<DetailPaneExtractionBootstrap />`, rewire the page, delete the old file in the same commit. Less churn, simpler review.
2. Stage with a feature flag — NOT needed; the old file has no other consumers beyond the `[id]` page.

Pick option 1 unless the PR becomes unreviewably large (>1200 LOC diff).

### AI-Learning Toast Decision
Ship whichever is cheapest. If `<Toaster>` is not already in `layout.tsx`, use inline muted text — do NOT add `sonner` as a new dep. The supplier-aware message variant (`"Bei der nächsten Rechnung von [Supplier] weiß ich Bescheid."`) lands in Story 3.3 together with the supplier-count query.

### Source Viewer — What Ships vs. What Doesn't
- **Ships:** full-document view for image/PDF/XML, signed URL via Server Action, side-by-side AI-value comparison, close button, `touch-action: manipulation` for pinch.
- **Does not ship:** bounding-box highlight per field, keyboard zoom (`+/-` shortcuts), annotation tools, document rotation controls. These are Phase-2 scope; track as TD7.

### Tech Debt Resolved
- **P12 (Story 3.1 retro)** — Realtime dashboard via Supabase postgres_changes channel on `invoices` table; 500ms-debounced `router.refresh()`. See Task 6.4.
- **P14 (Story 3.1 retro)** — Generated columns `gross_total_value` + `supplier_name_value` recreated with safe `CASE WHEN ~ '^-?[0-9]+(\.[0-9]+)?$'` cast. Migration `20260424100000_invoice_sort_columns_safe_cast.sql`. Pre-existing rows must continue to validate after the recreate; `supabase db reset` is the verification gate.

### Concurrency Model
`correctInvoiceField` uses `updated_at` as an optimistic lock. The alternative (row-level `FOR UPDATE`) would require a stored procedure; lightweight `.eq("updated_at", priorUpdatedAt)` is good enough for the MVP edit cadence (a user rarely has two tabs open editing the same invoice). If smoke test (h) reveals false negatives under network jitter, switch to a version column in a follow-up.

### Performance Budget
- **NFR5 (<1s filter/search)** unaffected — this story does not touch the list query. Inherit Story 3.1's composite-index-backed performance.
- Edit open: pure client transition, <16ms.
- Edit submit: 1 SELECT + 1 UPDATE + 1 INSERT in one RPC round-trip ≈ <200ms on local Supabase.
- Signed URL acquisition: <200ms local; budget allows 1s over slow network.
- Realtime refresh: 500ms debounce is the lower bound; `router.refresh()` itself is tree-diff on the server, typically <400ms.

### Previous Story Intelligence
- **Story 2.2** wired `extractInvoice` Server Action + auto-extract `useEffect` with StrictMode-safe ref guard in `extraction-results-client.tsx:99,122`. Preserve this pattern in `<DetailPaneExtractionBootstrap />`.
- **Story 2.3** established the ≤3 concerns discipline + CSS-only animation rule (no Framer Motion).
- **Story 3.1** shipped `<InvoiceListCard>` (collapsed) + `InvoiceListFilters` (URL-driven). The detail pane slotting next to the list is the natural completion of UX-DR10.
- **Story 3.1 retro** — P12 (realtime) + P14 (safe cast) explicitly owned by 3.2.
- **`apps/web/AGENTS.md`** — "This is NOT the Next.js you know." Read `node_modules/next/dist/docs/` on Server Actions, Server Components, and `searchParams`/`useSearchParams` before writing.
- **Zod v4** — repo-wide (prep-td1). No `as unknown as` casts.
- **`overallConfidence` = arithmetic mean** — after a correction with `confidence = 1.0`, the overall will rise accordingly. Source Viewer + card border-color must reflect this on next render (covered by `revalidatePath`).
- **Smoke test format** — mandatory since Story 3.1; follow `smoke-test-format-guide.md`.

### Error Path Audit (Epic 2 retro A2) — Checklist for `correctInvoiceField`
- [ ] Every exit path returns `ActionResult<T>`.
- [ ] DB SELECT error (real failure) distinguished from "not found" (PGRST116).
- [ ] fieldPath allow-list rejects unknown paths with German message `"Ungültiges Feld."`.
- [ ] Optimistic-concurrency miss returns concrete German message, NOT a generic `"unerwarteter Fehler"`.
- [ ] Exported-status rejection fires BEFORE any UPDATE.
- [ ] `invoice_field_corrections` INSERT is NOT wrapped in the same try — if it fails after the UPDATE succeeds, we log + Sentry but still return `{success: true}` (the user's correction landed; audit-trail loss is a recoverable anomaly — document it).
- [ ] TD4-style cap is N/A here (no retry semantics).

### Source Tree Touch Points
- `supabase/migrations/20260424000000_invoice_field_corrections.sql` — NEW
- `supabase/migrations/20260424100000_invoice_sort_columns_safe_cast.sql` — NEW
- `apps/web/lib/invoice-fields.ts` + `.test.ts` — NEW
- `apps/web/lib/format.ts` — MODIFY (add `formatValue`, `safeCurrency`, `parseGermanDecimal`)
- `apps/web/lib/format.test.ts` — MODIFY (add parse/format cases)
- `apps/web/components/invoice/editable-field.tsx` + `.test.tsx` — NEW
- `apps/web/components/invoice/source-document-viewer.tsx` + `.test.tsx` — NEW
- `apps/web/components/invoice/invoice-detail-pane.tsx` + `.test.tsx` — NEW
- `apps/web/components/invoice/detail-pane-extraction-bootstrap.tsx` — NEW
- `apps/web/components/invoice/extraction-results-client.tsx` — DELETE
- `apps/web/components/dashboard/invoice-list-card-link.tsx` — NEW (client media-query wrapper)
- `apps/web/components/dashboard/dashboard-realtime-refresher.tsx` — NEW
- `apps/web/app/(app)/rechnungen/[id]/page.tsx` — MODIFY (swap body)
- `apps/web/app/(app)/dashboard/page.tsx` — MODIFY (grid `lg:grid-cols-[380px_1fr]`, `selected` searchParam, right pane)
- `apps/web/app/actions/invoices.ts` — MODIFY (`correctInvoiceField`, `getInvoiceSignedUrl`)
- `apps/web/app/actions/invoices.test.ts` — MODIFY (new cases)
- `packages/shared/src/schemas/invoice.ts` — MODIFY (export `CORRECTABLE_FIELD_PATHS`)
- `packages/shared/src/types/database.ts` — MODIFY (add `invoice_field_corrections`)
- **NO** new top-level dependency. **NO** Framer Motion. **NO** new Route Handler. **NO** new Edge Function.

### Testing Standards Summary
- Vitest + `@vitejs/plugin-react` + jsdom (already wired).
- Mock `next/navigation`: same pattern as Story 3.1.
- Mock `@/lib/supabase/server` and the Server Action boundary for component tests; unit-test the action against a fake Supabase client.
- For fake-timer animation tests (checkmark fade, debounce), use `vi.useFakeTimers()`.
- Target ≥153 total tests (128 → 153).

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story-3.2] — AC source (lines 581–619)
- [Source: _bmad-output/planning-artifacts/prd.md] — FR6 (521), FR7 (522), FR32 (565), NFR5 (606), UX-DR2, UX-DR10, UX-DR15, UX-DR17, UX-DR18
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#AccordionInvoiceCard] — expanded anatomy (lines 1393–1473)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Form-Patterns] — inline correction pattern (lines 1866–1882)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Source-Document-Viewer] — viewer behaviour (lines 1242–1250)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Responsive-Strategy] — split-view desktop (lines 2000–2010)
- [Source: _bmad-output/planning-artifacts/architecture.md] — Server Action return format (lines 340–361), source tree (lines 557–724), Server Action pattern (lines 411–438)
- [Source: _bmad-output/implementation-artifacts/3-1-pipeline-dashboard-and-invoice-list.md] — P12/P14 deferred items, `<InvoiceListCard>` contract, `InvoiceListFilters` URL pattern
- [Source: _bmad-output/implementation-artifacts/epic-2-retro-2026-04-21.md] — A2 (error path checklist)
- [Source: _bmad-output/implementation-artifacts/smoke-test-format-guide.md] — mandatory format
- [Source: apps/web/app/actions/invoices.ts] — `extractInvoice` auth+tenant+row pattern (lines 183–260), `createSignedUrl` (lines 315–317)
- [Source: apps/web/components/invoice/extraction-results-client.tsx] — LABELS + FIELD_ORDER + auto-extract `useEffect` pattern (to be migrated)
- [Source: apps/web/components/invoice/confidence-indicator.tsx] — `<ConfidenceIndicator>` variants (`dot`, `bar`, `badge`)
- [Source: packages/shared/src/schemas/invoice.ts] — `Invoice` shape, `makeField`, `isoDateField`, `OVERALL_KEYS`
- [Source: supabase/migrations/20260421000000_categorization_corrections.sql] — append-only RLS pattern to mirror
- [Source: supabase/migrations/20260423000000_invoice_sort_columns.sql] — generated columns to recreate safely (P14)
- [Source: apps/web/AGENTS.md] — read `node_modules/next/dist/docs/` before writing Server Actions / RSC / `searchParams`

[Smoke test format: _bmad-output/implementation-artifacts/smoke-test-format-guide.md]

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

**Story 3.2 implemented on 2026-04-24.**

#### AI-Learning Toast Decision
`<Toaster>` (sonner) is **NOT** wired in `apps/web/app/layout.tsx`. Fell back to inline muted text `"Gespeichert."` that fades after 2s. No new dep added.

#### Cutover Strategy
Single-commit cutover used (Option 1). `extraction-results-client.tsx` deleted in the same changeset as the new `<InvoiceDetailPane />` wire-up.

#### Tech Debt Resolved
- **P12 (realtime dashboard)** — `<DashboardRealtimeRefresher />` added as client child of `/dashboard`. Subscribes to `invoices` table `postgres_changes` on the tenant channel, calls `router.refresh()` debounced 500ms. Added `alter publication supabase_realtime add table public.invoices;` in the `invoice_field_corrections` migration.
- **P14 (safe cast)** — Migration `20260424100000_invoice_sort_columns_safe_cast.sql` drops and recreates `gross_total_value`/`supplier_name_value` with `CASE WHEN ~ '^-?[0-9]+(\.[0-9]+)?$'` guard. `supabase db reset` confirmed clean.

##### Review Findings Resolution (2026-04-25)

- ✅ Resolved review finding [Patch]: State mutation during render → moved `setEditing(false)` to `useEffect`
- ✅ Resolved review finding [Patch]: Invalid PostgREST select expression → removed `invoice_data->supplier_name->>value` from select string
- ✅ Resolved review finding [Patch]: `initialAiValue` freeze → added `const [frozenAiValue] = useState(initialAiValue)` to capture AI value on mount
- ✅ Resolved review finding [Patch]: `isRestoreToAi` always false → added `restoredAi` state, computed `isRestore` internally in `handleSubmit`
- ✅ Resolved review finding [Patch]: Checkmark timer 2000ms → 1000ms
- ✅ Resolved review finding [Patch]: Duplicate close button → passed `showCloseButton={false}` to SheetContent
- ✅ Resolved review finding [Patch]: isExported banner scope → moved outside `invoice !== null` branch
- ✅ Resolved review finding [Patch]: Line-item cells not editable → wrapped each cell with `<EditableField>` (description/text, quantity/vat_rate/quantity-kind, monetary/decimal-kind)
- ✅ Resolved review finding [Patch]: cursor null in path traversal → added null/undefined check with targeted log
- ✅ Resolved review finding [Patch]: DashboardEscHandler no target check → added `e.defaultPrevented` + input/textarea/select guard
- ✅ Resolved review finding [Patch]: Sheet side always bottom → added `useState`+`useEffect` matchMedia to dynamically set right/bottom
- ✅ Resolved review finding [Patch]: selectedId without UUID validation → added UUID regex guard before Supabase query
- ✅ Resolved review finding [Patch]: `isUnchangedFromAi` dead variable → removed; `restoredAi` state cleanly tracks restore intent
- ✅ Resolved review finding [Patch]: Date validation accepts invalid dates → added `new Date()` bounds check after regex
- ✅ Resolved review finding [Patch]: CORRECTABLE_FIELD_PATHS snapshot `≥132` → changed to exact `.toBe(132)`
- ✅ Resolved review finding [Patch]: InvoiceListCardLink stale ref → removed ref/useEffect, reads `matchMedia` directly in click handler
- ✅ Resolved review finding [Patch]: InvoiceListFilters overflow in 380px → removed `lg:grid-cols-3`, kept `sm:grid-cols-2` max
- ✅ Resolved review finding [Patch]: Confidence badge alignment → wrapped in `shrink-0 self-center` div, added `leading-none` to h1
- ✅ Resolved review finding [Patch/Nice-to-have]: Selected card highlight → `isSelected` prop on `InvoiceListCard`, passed from `GroupedInvoiceList`

### Error Path Audit — `correctInvoiceField`
- ✅ Every exit path returns `ActionResult<T>`
- ✅ DB SELECT error distinguished from "not found" (PGRST116 check)
- ✅ `fieldPath` allow-list rejects unknown paths with German `"Ungültiges Feld."`
- ✅ Optimistic-concurrency miss returns `"Rechnung wurde zwischenzeitlich geändert. Bitte Seite neu laden."`
- ✅ `exported` rejection fires BEFORE any UPDATE
- ✅ `invoice_field_corrections` INSERT failure is non-fatal — logged + Sentry, still returns `{success: true}`
- ✅ Outer try/catch blocks `NEXT_REDIRECT` re-throw

#### Error Path Audit — `getInvoiceSignedUrl`
- ✅ Every exit path returns `ActionResult<T>`
- ✅ DB SELECT error distinguished from "not found" (PGRST116 check)
- ✅ Tenant isolation enforced (`row.tenant_id !== tenantId` guard)
- ✅ Sentry tags: `{ module: "invoices", action: "sign_url" }`
- ✅ Log prefix `[invoices:sign_url]`

#### Test Results
- Total tests: **176** (128 → 176, target was ≥153) ✅
- New test files: 4 (`invoice-fields.test.ts`, `editable-field.test.tsx`, `source-document-viewer.test.tsx`, `invoice-detail-pane.test.tsx`)
- New test cases in `invoices.test.ts`: 10 (7 `correctInvoiceField` + 3 `getInvoiceSignedUrl`)

### Browser Smoke Test

**Environment:** `pnpm dev` from repo root. Supabase local: `host=localhost port=54322 dbname=postgres user=postgres password=postgres`.

#### UX Checks

| # | Action | Expected Output | Pass Criterion | Status |
|---|--------|----------------|----------------|--------|
| (a) | Sign in → open `/dashboard` on mobile viewport (< 1024px) → tap an invoice card | Browser navigates to `/rechnungen/{id}`, renders `<InvoiceDetailPane />` with confidence-bordered card and all field labels visible. `<AiDisclaimer />` banner at top. | Pass if the URL changes to `/rechnungen/{id}` and the page shows at least 12 field label rows (Rechnungsnummer, Lieferant, Brutto…) | DONE |
| (b) | Sign in → open `/dashboard` on `lg+` viewport (≥ 1024px) → click an invoice card | URL updates to `/dashboard?selected={id}`, right pane renders `<InvoiceDetailPane />`, left list column is constrained to ~380px. No page navigation. | Pass if the URL contains `?selected=` AND the detail pane appears to the right of the list AND the list remains visible on the left. | DONE (1. lg+ ekrandayken sorunsuz calisiyor, sadece right panel acildiginda "InvoiceListFilters" icerisindeki placeholders degreler tam olarak gorunmuyor ve UI'i cirkin gosteriyor. 2. lg+ ekrandayken right paneldeki aoverall confidence degeri kirmizi, yesil, amber noktalar ile ayni hizada gorunmuyor. bu overall score'i bu noktalar ile ayni hizaya getir. 3. lg+ ekrandayken sol taraftaki secili current invoice user'a belirtilmiyor. UI/UX icin nice-to-have) |
| (c) | From the `lg+` detail pane, tap an amber or red confidence field | Field row switches from read-only text to an inline input. Input is pre-filled with the AI value. Appropriate keyboard type opens (e.g. decimal keypad for Brutto). | Pass if the input is visible, pre-filled, and focused without a page navigation. | DONE |
| (d) | In the edit form from (c), type a new value → tap `[Übernehmen]` | Edit form collapses. A green checkmark `✓` appears next to the field value for ~1s, then fades. Field now shows the new value. `"Gespeichert."` text appears briefly. | Pass if the new value is visible, the checkmark appears and fades, and no error message is shown. | DONE |
| (e) | In edit mode, tap `[AI-Wert wiederherstellen]` | Input value reverts to the original AI value. No server call is made. `[Übernehmen]` button reflects the restored state. | Pass if the input shows the AI value immediately (no loading indicator) and `[Übernehmen]` remains clickable. | DONE |
| (f) | Tap an amber/red `<ConfidenceIndicator>` dot | A bottom sheet (mobile) or right sheet (md+) opens titled `"Quelldokument"`. The source image/PDF/XML is rendered. The close button `✕` is visible. | Pass if the sheet opens with a document preview and the field label + AI value are shown in the summary below the document. | DONE (x symbol seems in UI duplicate but functionality is ok) |
| (g) | On `lg+` with `?selected={id}` in URL, press **Escape** | URL changes back to `/dashboard` (no `?selected`). Right pane closes; left column fills the width or right column shows the summary widgets. | Pass if the URL no longer contains `?selected` after pressing Escape. | DONE |
| (h) | Open the same invoice in two tabs. In Tab 1: edit a field → tap `[Übernehmen]`. Then in Tab 2: edit the same field → tap `[Übernehmen]` | Tab 2 shows: `"Rechnung wurde zwischenzeitlich geändert. Bitte Seite neu laden."` with a `[Seite neu laden]` link/button. Tab 2's correction is NOT saved. | Pass if the German concurrency message appears in Tab 2 and the field value in Tab 2 reflects Tab 1's correction after reload. | DONE |
| (i) | Edit an invoice that has `status=exported` (or manually set it in psql). Tap a field. | Field does NOT enter edit mode. A muted banner `"Exportierte Rechnungen können nicht mehr bearbeitet werden."` is visible. | Pass if no input appears when tapping fields and the exported banner is shown. | DONE |
| (j) | Upload a new invoice from a second tab while viewing `/dashboard` in Tab 1 | Tab 1's invoice list updates within ~1–2 seconds showing the new invoice (captured status) without manual refresh. | Pass if the new invoice row appears in the list without a manual page reload. | DONE |
| (k) | Navigate to `/einstellungen` and `/erfassen` | Both pages render without error. No regressions in layout or functionality. | Pass if both pages load with no console errors and their usual content. | DONE |

**Manual Steps for GOZE:**
1. `pnpm dev` from repo root
2. Sign in at `/login`
3. Run checks (a)–(k) in order
4. For check (h): use two separate browser windows
5. For check (i): `psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres' -c "UPDATE invoices SET status='exported' WHERE id='<your-test-invoice-id>';"` — restore after check
6. Mark each check `DONE` or `FAIL` with notes on what you saw

#### DB Verification

| # | Query | Expected Return | What It Validates | Status |
|---|-------|----------------|-------------------|--------|
| (d1) | `psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres' -c "SELECT count(*) FROM public.invoice_field_corrections;"` | `count` increments by 1 after each `[Übernehmen]` tap (run before and after correction) | Confirms AC #11: `invoice_field_corrections` row is appended on every field save. | DONE |
| (d2) | `psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres' -c "SELECT corrected_to_ai FROM public.invoice_field_corrections ORDER BY created_at DESC LIMIT 1;"` | `corrected_to_ai` = `t` after a restore-to-AI correction, `f` after a normal correction | Confirms AC #9: `corrected_to_ai` flag is correctly set. | DONE |
| (d3) | `psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres' -c "SELECT invoice_data->'supplier_name'->>'value', invoice_data->'supplier_name'->>'confidence' FROM public.invoices WHERE id='<edited-invoice-id>';"` | `value` = corrected supplier name; `confidence` = `1.000` for user-corrected, AI confidence for restore. | Confirms AC #6: `invoice_data` JSONB updated correctly with confidence values. | DONE |
| (d4) | `psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres' -c "SELECT column_name, generation_expression FROM information_schema.columns WHERE table_name='invoices' AND is_generated='ALWAYS';"` | `gross_total_value` row has `generation_expression` containing `CASE WHEN` and `'^-?[0-9]+(\.[0-9]+)?$'`; same for `supplier_name_value` but without the cast. | Confirms P14/AC #16: generated columns use the safe cast. | DONE |
| (d5) | First insert test row: `psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres' -c "INSERT INTO public.invoices (id, tenant_id, status, file_path, file_type, original_filename, invoice_data) SELECT gen_random_uuid(), tenant_id, 'captured', 'test/test.pdf', 'application/pdf', 'test.pdf', '{\"gross_total\":{\"value\":\"1.234,56\",\"confidence\":0.5,\"reason\":null},\"supplier_name\":{\"value\":null,\"confidence\":0.5,\"reason\":null}}' FROM public.invoices LIMIT 1 RETURNING id;"` | INSERT succeeds (no error). `gross_total_value` for that row is `NULL` (German string → safe cast). | Confirms P14: non-numeric `gross_total` value (German locale string) does not crash the INSERT. | DONE |

### File List

- `supabase/migrations/20260424000000_invoice_field_corrections.sql` — NEW
- `supabase/migrations/20260424100000_invoice_sort_columns_safe_cast.sql` — NEW
- `apps/web/lib/invoice-fields.ts` — NEW
- `apps/web/lib/invoice-fields.test.ts` — NEW
- `apps/web/lib/format.ts` — MODIFIED (added `safeCurrency`, `parseGermanDecimal`, `formatValue`)
- `apps/web/lib/format.test.ts` — MODIFIED (added safeCurrency, parseGermanDecimal, formatValue tests)
- `apps/web/vitest.setup.ts` — MODIFIED (added window.matchMedia stub)
- `apps/web/components/invoice/editable-field.tsx` — NEW
- `apps/web/components/invoice/editable-field.test.tsx` — NEW
- `apps/web/components/invoice/source-document-viewer.tsx` — NEW
- `apps/web/components/invoice/source-document-viewer.test.tsx` — NEW
- `apps/web/components/invoice/source-document-viewer-wrapper.tsx` — NEW
- `apps/web/components/invoice/invoice-detail-pane.tsx` — NEW
- `apps/web/components/invoice/invoice-detail-pane.test.tsx` — NEW
- `apps/web/components/invoice/detail-pane-extraction-bootstrap.tsx` — NEW
- `apps/web/components/invoice/extraction-results-client.tsx` — DELETED
- `apps/web/components/dashboard/invoice-list-card.tsx` — MODIFIED (uses InvoiceListCardLink)
- `apps/web/components/dashboard/invoice-list-card.test.tsx` — MODIFIED (added next/navigation mock)
- `apps/web/components/dashboard/invoice-list-card-link.tsx` — NEW
- `apps/web/components/dashboard/dashboard-realtime-refresher.tsx` — NEW
- `apps/web/components/dashboard/dashboard-esc-handler.tsx` — NEW
- `apps/web/app/(app)/rechnungen/[id]/page.tsx` — MODIFIED (swapped ExtractionResultsClient → InvoiceDetailPane)
- `apps/web/app/(app)/dashboard/page.tsx` — MODIFIED (split-view grid, selected param, realtime refresher)
- `apps/web/app/actions/invoices.ts` — MODIFIED (added correctInvoiceField, getInvoiceSignedUrl)
- `apps/web/app/actions/invoices.test.ts` — MODIFIED (added correctInvoiceField + getInvoiceSignedUrl tests)
- `packages/shared/src/schemas/invoice.ts` — MODIFIED (exported CORRECTABLE_FIELD_PATHS)
- `packages/shared/src/types/database.ts` — MODIFIED (added invoice_field_corrections table types)

### Review Findings

- [x] [Review][Patch] State mutation during render: `setEditing(false)` called unconditionally in render body → infinite loop when `isExported=true` and `editing=true` [apps/web/components/invoice/editable-field.tsx]
- [x] [Review][Patch] Invalid PostgREST select expression `invoice_data->supplier_name->>value` in `correctInvoiceField` — breaks every field correction with 400 error [apps/web/app/actions/invoices.ts]
- [x] [Review][Patch] `initialAiValue` always equals `value` in InvoiceDetailPane — "AI-Wert wiederherstellen" restores corrected value not AI original; fix with `useState` freeze in EditableField [apps/web/components/invoice/invoice-detail-pane.tsx + editable-field.tsx]
- [x] [Review][Patch] `isRestoreToAi` always false: `handleSubmit(false)` hardcoded, restore path never calls `handleSubmit(true)` → `corrected_to_ai` always `false` in audit table; AC #9 violated [apps/web/components/invoice/editable-field.tsx]
- [x] [Review][Patch] Checkmark timer 2000ms; spec AC #7 requires exactly 1000ms for green checkmark fade [apps/web/components/invoice/editable-field.tsx]
- [x] [Review][Patch] Duplicate close button: custom `✕` button + shadcn SheetContent built-in close render simultaneously → two X icons; AC #18(f) smoke test confirmed [apps/web/components/invoice/source-document-viewer.tsx]
- [x] [Review][Patch] `isExported` banner inside `invoice !== null` branch — banner missing when `status=exported` and `invoice_data=null` [apps/web/components/invoice/invoice-detail-pane.tsx]
- [x] [Review][Patch] Line-item cells render as plain `<td>`, no `<EditableField>` wrapper — line items not editable despite AC #4 and CORRECTABLE_FIELD_PATHS covering them [apps/web/components/invoice/invoice-detail-pane.tsx]
- [x] [Review][Patch] `cursor` can become `undefined` in path traversal (mid-path null field) — throws TypeError, caught as generic error with no targeted logging [apps/web/app/actions/invoices.ts]
- [x] [Review][Patch] `DashboardEscHandler` fires on ALL keydown without `e.target` or `e.defaultPrevented` check — ESC in filter inputs/modals triggers unintended navigation [apps/web/components/dashboard/dashboard-esc-handler.tsx]
- [x] [Review][Patch] SourceDocumentViewer Sheet `side` always `"bottom"` — CSS data-attribute override doesn't switch the sheet; spec AC #8 requires right sheet on `md+` [apps/web/components/invoice/source-document-viewer.tsx]
- [x] [Review][Patch] `selectedId` query param used in Supabase query without UUID format validation — non-UUID string silently discards DB error (no Sentry, no log) [apps/web/app/(app)/dashboard/page.tsx]
- [x] [Review][Patch] `isUnchangedFromAi` always `false` (dead variable) — becomes meaningful after `initialAiValue` fix; expression `value !== initialAiValue` structurally never true with current prop wiring [apps/web/components/invoice/editable-field.tsx]
- [x] [Review][Patch] Date validation regex `/^\d{4}-\d{2}-\d{2}$/` accepts invalid dates like `2024-13-01` — no month/day bounds check [apps/web/components/invoice/editable-field.tsx]
- [x] [Review][Patch] `CORRECTABLE_FIELD_PATHS` snapshot test uses `≥132` — guards against removal but not addition; AC #14 requires deliberate commit on any change [apps/web/lib/invoice-fields.test.ts]
- [x] [Review][Patch] `InvoiceListCardLink` stale ref: `isLgRef.current = false` on first render — first click on lg+ before `useEffect` fires follows mobile navigation path [apps/web/components/dashboard/invoice-list-card-link.tsx]
- [x] [Review][Patch] Smoke (b): `InvoiceListFilters` placeholder metinleri 380px liste kolonuna sığmıyor — split-view aktifken filtre inputları taşıyor ve UI bozuluyor; `InvoiceListFilters` içindeki input/placeholder genişliklerini dar kol için uyarla [apps/web/components/dashboard/invoice-list-filters.tsx]
- [x] [Review][Patch] Smoke (b): `InvoiceDetailPane` header'ında overall confidence badge "Rechnung" başlık metniyle aynı hizada değil — `flex items-center` hizalama sorunu [apps/web/components/invoice/invoice-detail-pane.tsx]
- [x] [Review][Patch] Smoke (b): lg+ ekrandayken sol taraftaki secili current invoice user'a belirtilmiyor. UI/UX icin nice-to-have
- [x] [Review][Defer] SourceDocumentViewer TTL cache ineffective: component unmounts on close, `openedOnce.current` resets; 55s re-use branch unreachable in practice — deferred, design decision
- [x] [Review][Defer] `revalidatePath("/dashboard")` may not invalidate `?selected=` query-param pages in Next.js RSC cache — deferred, pre-existing Next.js cache behaviour
- [x] [Review][Defer] Safe-cast migration regex `'^-?[0-9]+(\.[0-9]+)?$'` yields NULL for scientific notation / non-standard formats — deferred, AI extractor emits standard numeric strings

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-04-24 | Story 3.2 implemented: InvoiceDetailPane RSC, EditableField with inline editing, SourceDocumentViewer, split-view dashboard, correctInvoiceField + getInvoiceSignedUrl server actions, invoice_field_corrections audit table, safe cast migration (P14), realtime refresher (P12). 176 tests total. | claude-sonnet-4-6 |
| 2026-04-24 | Code review complete: 16 patch findings, 3 deferred, 8 dismissed. Story moved to in-progress. | claude-sonnet-4-6 |
| 2026-04-25 | All 19 review findings resolved: render-body mutation, PostgREST select fix, AI-value freeze, isRestoreToAi wiring, 1000ms timer, duplicate close button, exported banner scope, line-item EditableField, cursor null check, ESC handler guard, sheet side dynamic, UUID validation, dead variable cleanup, date bounds, snapshot exact, stale ref removal, filter grid, badge alignment, selected card highlight. 141 tests pass. | claude-sonnet-4-6 |
