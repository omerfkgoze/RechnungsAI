# Story 3.3: SKR Categorization and BU-Schluessel Mapping

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want the system to automatically suggest the correct SKR account code and VAT tax key for each invoice,
So that my bookkeeping categorization is accurate and DATEV-ready.

---

## Technical Concerns (≤3, per Epic 1 retro Action #2)

1. **AI categorization pipeline (FR8, FR9)** — New `packages/ai/src/categorize-invoice.ts` calls `generateObject` with a categorization prompt to suggest the best-fit SKR03 or SKR04 account code for an invoice, given the supplier name, invoice description, and line-item context. The tenant's `skr_plan` setting gates which code set the AI is constrained to. A new `categorizeInvoice(invoiceId)` Server Action in `apps/web/app/actions/invoices.ts` (following the same auth+tenant+row pattern as `extractInvoice`) persists `skr_code`, `bu_schluessel`, and `categorization_confidence` to the `invoices` row. Categorization is triggered lazily: a new `<CategoryBootstrap />` client component (mirroring `<DetailPaneExtractionBootstrap />`) fires when the detail pane renders with `invoice_data !== null` but `skr_code === null`.

2. **Searchable SKR select + learning loop (FR10, FR11, UX-DR15)** — A new `<SkrCategorySelect />` client component uses shadcn Popover+Command (NOT `<Select>`) so the user can type to filter the full SKR03/04 code list. The most recently used codes for this supplier are surfaced at the top of the list (queried server-side from `categorization_corrections` by `tenant_id + supplier_name`, passed as a prop). A new `updateInvoiceSKR` Server Action writes the user's override to `invoices.skr_code`, recalculates `bu_schluessel` deterministically, and inserts one row into `categorization_corrections` for the learning loop. On success, the client shows a supplier-specific AI-learning message: `"Bei der nächsten Rechnung von [Supplier] weiß ich Bescheid."` (supplier name from invoice_data) or the generic `"Verstanden — ich merke mir das."` when supplier_name is null.

3. **BU-Schlüssel deterministic mapping + display (FR12)** — A new pure function `mapBuSchluessel(vatRate: number | null): number` in `packages/shared/src/constants/skr.ts` covers all standard German VAT scenarios without AI involvement: 19% → 9, 7% → 8, 0% → 0 (exempt), `null` → 0. Reverse-charge and intra-EU scenarios are handled by the AI categorization prompt: when the AI detects a reverse-charge context it outputs `bu_schluessel: 44` (DATEV reverse-charge key); intra-EU acquisition → `bu_schluessel: 93`. The categorizeInvoice Server Action merges the AI-detected BU-Schlüssel (for special cases) with the deterministic mapping (for standard rates), preferring the AI value when non-null. The BU-Schlüssel is displayed alongside the VAT breakdown in `<InvoiceDetailPane />` as a read-only row (no editing; it derives from the SKR selection).

**Deferred to Story 3.4:** `[Freigeben]` / `[Flaggen]` approve buttons, swipe gestures, AccordionInvoiceCard approve action.
**Deferred to Story 3.5:** Compliance warnings, weekly value summary.
**Deferred to Epic 5:** DATEV CSV export (uses the BU-Schlüssel persisted here).

---

## Acceptance Criteria

1. **Given** an invoice has been processed by AI extraction (status `ready` or `review`)
   **When** the detail pane renders
   **Then** `<CategoryBootstrap />` detects `skr_code === null` and calls `categorizeInvoice(invoiceId)` automatically (client-side, using `useEffect`, StrictMode-safe ref guard identical to `detail-pane-extraction-bootstrap.tsx`)
   **And** during AI categorization the `<SkrCategorySelect />` shows a loading skeleton
   **And** on completion the suggested SKR code appears in the select with its ConfidenceIndicator (FR8, FR9)

2. **Given** AI categorization completes
   **When** the result is rendered
   **Then** the confidence score for the SKR suggestion is displayed via `<ConfidenceIndicator variant="dot" />` using the same confidence tokens as field rows (`high` ≥ 0.95, `medium` ≥ 0.70, `low` < 0.70)
   **And** the code is shown as `"3400 — Wareneingang 19% VSt"` (code + label from `SKR03_CODES` or `SKR04_CODES` in `packages/shared/src/constants/skr.ts`)
   **And** `skr_code`, `bu_schluessel`, and `categorization_confidence` are persisted to the `invoices` row in the same `categorizeInvoice` call

3. **Given** the `<SkrCategorySelect />` is rendered
   **When** it is interactive (invoice not exported)
   **Then** a Popover+Command searchable dropdown lists all valid codes for the tenant's SKR plan (SKR03 or SKR04)
   **And** the most-recently-corrected codes for this supplier are listed first (from `categorization_corrections` — up to 3 entries, deduplicated, ordered by `created_at DESC`)
   **And** typing in the search input filters codes by code number OR label text (case-insensitive)

4. **Given** the user selects a different code from the dropdown
   **When** they confirm the selection (click or Enter)
   **Then** `updateInvoiceSKR` Server Action is called with `{ invoiceId, newSkrCode, supplierName }`
   **And** `invoices.skr_code` is updated to the new code, `bu_schluessel` recalculated deterministically + merged with AI special-case detection, `categorization_confidence` set to `1.000` (user override)
   **And** one row is inserted into `categorization_corrections` with `original_code = oldSkrCode`, `corrected_code = newSkrCode`, `supplier_name` denormalized from `invoice_data.supplier_name.value` (FR10, FR11)
   **And** `revalidatePath("/dashboard")` and `revalidatePath(\`/rechnungen/${invoiceId}\`)` are called on success

5. **Given** `updateInvoiceSKR` succeeds
   **When** the client receives `{ success: true }`
   **Then** the select collapses showing the newly selected code
   **And** an inline AI-learning message renders for 3 seconds then fades:
   - If `supplierName` is non-null: `"Bei der nächsten Rechnung von [supplierName] weiß ich Bescheid."`
   - If `supplierName` is null: `"Verstanden — ich merke mir das."`
   **And** `<Toaster>` is NOT wired (per Story 3.2 decision) — the message renders as muted inline text below the select (no new dep)

6. **Given** an invoice includes VAT
   **When** the BU-Schlüssel is determined by `mapBuSchluessel`
   **Then** all standard German scenarios are covered:
   - `vat_rate` closest to `0.19` (within ±0.005) → BU-Schlüssel `9` (19% Vorsteuer)
   - `vat_rate` closest to `0.07` (within ±0.005) → BU-Schlüssel `8` (7% Vorsteuer)
   - `vat_rate === 0` or null → BU-Schlüssel `0` (steuerfrei / kein Vorsteuerabzug)
   - AI-detected reverse-charge → BU-Schlüssel `44`
   - AI-detected intra-EU acquisition → BU-Schlüssel `93`
   **And** the function is pure: no side effects, no DB access, 100% deterministic for the standard-rate cases (FR12)

7. **Given** categorization data is available
   **When** `<InvoiceDetailPane />` renders
   **Then** two new read-only display rows appear below the VAT breakdown:
   - **SKR-Konto** — `<SkrCategorySelect />` (editable if not exported; shows code + label + ConfidenceIndicator)
   - **BU-Schlüssel** — read-only `<dd>`: `"9 (19% VSt)"` / `"8 (7% VSt)"` / `"0 (Steuerfrei)"` / `"44 (Reverse Charge)"` / `"93 (Innergemeinschaftlicher Erwerb)"`; shows `"—"` when null
   **And** these rows do NOT appear in `FIELD_ORDER` (they are not `EditableField` instances — categorization has its own action pattern)

8. **Given** the categorization data is stored
   **When** the invoice record is updated
   **Then** `invoices.skr_code` contains the AI-suggested or user-confirmed SKR code (e.g., `"3400"`)
   **And** `invoices.bu_schluessel` contains the DATEV tax key integer (e.g., `9`)
   **And** `invoices.categorization_confidence` is `numeric(4,3)` (e.g., `0.873` for AI suggestion, `1.000` for user override)
   **And** `categorization_corrections` tracks all user overrides (not AI writes — only `updateInvoiceSKR` inserts here)

9. **Given** the invoice has `status = 'exported'`
   **When** the `<SkrCategorySelect />` is rendered with `isExported={true}`
   **Then** it renders as plain text (non-interactive): `"3400 — Wareneingang 19% VSt"` with no dropdown affordance
   **And** `updateInvoiceSKR` rejects with `"Exportierte Rechnungen können nicht mehr bearbeitet werden."` for any direct call

10. **Given** `categorizeInvoice` is called on an invoice that is not yet in `ready` or `review` status
    **When** the Server Action runs
    **Then** it returns `{ success: false, error: "Kategorisierung ist erst nach der Extraktion möglich." }`
    **And** no DB writes occur

11. **Given** unit tests exercise the new surface
    **When** `pnpm test` runs
    **Then** the suite gains:
    - `packages/shared/src/constants/skr.test.ts` — NEW. Cases: (a) `mapBuSchluessel(0.19)` → 9; (b) `mapBuSchluessel(0.07)` → 8; (c) `mapBuSchluessel(0)` → 0; (d) `mapBuSchluessel(null)` → 0; (e) boundary `mapBuSchluessel(0.194)` → 9; (f) `SKR03_CODES['3400']` → label contains "Wareneingang"; (g) `SKR04_CODES['4400']` exists. ≥7 cases.
    - `packages/ai/src/categorize-invoice.test.ts` — NEW. Cases: (a) happy path returns `{ skrCode, confidence, buSchluessel }`; (b) API error returns `ActionResult` error; (c) Zod parse error handled gracefully; (d) skrCode constrained to SKR03 set when `skrPlan === "skr03"`. ≥4 cases.
    - `apps/web/components/invoice/skr-category-select.test.tsx` — NEW. Cases: (a) renders AI-suggested code with ConfidenceIndicator; (b) opens popover and shows full code list; (c) typing "3400" filters to single result; (d) selecting new code calls `updateInvoiceSKR` and shows learning message; (e) `isExported=true` renders as plain text, no popover. ≥5 cases.
    - `apps/web/app/actions/invoices.test.ts` — MODIFY. Add: (a) `categorizeInvoice` rejects non-ready status; (b) happy path persists all three columns; (c) error when invoice not found; (d) `updateInvoiceSKR` happy path writes skr_code + inserts correction row; (e) `updateInvoiceSKR` rejects exported status; (f) `updateInvoiceSKR` rejects invalid UUID. ≥6 new cases.
    - **Target:** +3 new test files, +≥22 new cases. Total test count: 176 → **≥198**.

12. **Given** CI-equivalent commands run from the repo root
    **When** they execute
    **Then** `pnpm lint`, `pnpm check-types`, `pnpm build`, `pnpm test` all pass with zero new errors. `supabase db reset` applies all migrations cleanly (the categorization columns were already migrated in prep-TD2).

13. **Given** the smoke-test format (per `_bmad-output/implementation-artifacts/smoke-test-format-guide.md`) is mandatory
    **When** the story completes
    **Then** Completion Notes include a `### Browser Smoke Test` section covering at minimum:
    - **UX (a)** Open detail pane for a `ready`/`review` invoice with no prior categorization → SKR row appears with loading skeleton → code populates with ConfidenceIndicator.
    - **UX (b)** Open the SKR dropdown → type `"4"` → list filters to codes starting with 4 → select one → learning message appears for 3s.
    - **UX (c)** Re-open dropdown → most-recently-used code for this supplier appears at top of list.
    - **UX (d)** Open detail pane for `status=exported` invoice → SKR row shows plain text, no dropdown.
    - **UX (e)** Regression: field editing from Story 3.2 still works; Source Document Viewer still opens.
    - **DB (d1)** `skr_code`, `bu_schluessel`, `categorization_confidence` on the categorized invoice row are non-null.
    - **DB (d2)** After a user override: `categorization_corrections` gains one row with correct `original_code`, `corrected_code`, `supplier_name`.
    - Mark BLOCKED-BY-ENVIRONMENT per smoke-test guide.

---

## Tasks / Subtasks

- [ ] **Task 1: SKR constants + BU mapping (AC: #6, #7)**
  - [ ] 1.1 `packages/shared/src/constants/skr.ts` NEW — `SKR03_CODES: Record<string, string>` (≥20 most-common codes: 3400, 3410, 4400, 4940, 1200, 1210, etc.), `SKR04_CODES: Record<string, string>`, `mapBuSchluessel(vatRate: number | null): number` (pure), `BU_SCHLUESSEL_LABELS: Record<number, string>` (0, 8, 9, 44, 93).
  - [ ] 1.2 `packages/shared/src/constants/skr.test.ts` NEW — ≥7 cases per AC #11.
  - [ ] 1.3 `packages/shared/src/index.ts` — export `SKR03_CODES`, `SKR04_CODES`, `mapBuSchluessel`, `BU_SCHLUESSEL_LABELS`.

- [ ] **Task 2: AI categorization package (AC: #1, #2, #6)**
  - [ ] 2.1 `packages/ai/src/prompts/categorization.ts` NEW — German system prompt constraining the model to output a single `skrCode` (string) and optional `buSchluessel` (number | null) with a `confidence` score; prompt receives `{ supplierName, lineItemDescriptions, vatRate, skrPlan }` as context.
  - [ ] 2.2 `packages/ai/src/categorize-invoice.ts` NEW — `categorizeInvoice(input: CategorizeInvoiceInput): Promise<ActionResult<CategorizeInvoiceOutput>>`. Uses `generateObject` (same Zod v4 + AI SDK v6 pattern as `extract-invoice.ts`). Schema: `z.object({ skrCode: z.string(), confidence: z.number().min(0).max(1), buSchluessel: z.number().nullable() })`. Provider via `getExtractionModel()` (re-use existing). Log prefix `[ai:categorize]`.
  - [ ] 2.3 `packages/ai/src/index.ts` — export `categorizeInvoice`, `CategorizeInvoiceInput`, `CategorizeInvoiceOutput`.
  - [ ] 2.4 `packages/ai/src/categorize-invoice.test.ts` NEW — ≥4 cases per AC #11. Mock `generateObject`.

- [ ] **Task 3: Database types update (AC: #8)**
  - [ ] 3.1 `packages/shared/src/types/database.ts` — Add `categorization_corrections` table (Row/Insert/Update with `id, tenant_id, invoice_id, original_code, corrected_code, supplier_name, created_at`). Add `skr_code: string | null`, `bu_schluessel: number | null`, `categorization_confidence: number | null` to `invoices.Row`, `invoices.Insert`, `invoices.Update`. No generator available — update by hand per Story 3.1/3.2 precedent.

- [ ] **Task 4: Server Actions (AC: #1, #2, #4, #9, #10)**
  - [ ] 4.1 `apps/web/app/actions/invoices.ts` — add `categorizeInvoice(invoiceId: string): Promise<ActionResult<{ skrCode: string; confidence: number; buSchluessel: number | null }>>`. Auth + tenant + row fetch (same pattern as `extractInvoice`). Validates status is `ready | review | exported` (reject otherwise per AC #10). Reads `invoice_data` + `tenants.skr_plan`. Calls `aiCategorizeInvoice` from `@rechnungsai/ai`. Merges AI `buSchluessel` with `mapBuSchluessel(vatRate)` (prefer AI non-null value). Persists all three columns. Sentry tag `{ module: "invoices", action: "categorize" }`. Log prefix `[invoices:categorize]`.
  - [ ] 4.2 `apps/web/app/actions/invoices.ts` — add `updateInvoiceSKR(input: { invoiceId: string; newSkrCode: string; supplierName: string | null }): Promise<ActionResult<{ buSchluessel: number | null }>>`. Auth + tenant + row fetch. Rejects `status === 'exported'`. Validates `newSkrCode` is a non-empty string ≤10 chars. Determines `buSchluessel` from `mapBuSchluessel` applied to `invoice_data.line_items[0].vat_rate.value` (first non-null vat_rate wins; fallback `null`). Updates `invoices.skr_code`, `bu_schluessel`, `categorization_confidence = 1.000`. Inserts `categorization_corrections` row (non-fatal if insert fails — log + Sentry, still return success). Calls `revalidatePath`. Sentry tag `{ module: "invoices", action: "update_skr" }`. Log prefix `[invoices:update_skr]`.
  - [ ] 4.3 `apps/web/app/actions/invoices.test.ts` — MODIFY. Add ≥6 cases per AC #11.

- [ ] **Task 5: `<SkrCategorySelect />` client component (AC: #3, #4, #5, #9)**
  - [ ] 5.1 `apps/web/components/invoice/skr-category-select.tsx` NEW — `"use client"`. Props: `{ invoiceId, skrCode: string | null, skrConfidence: number | null, supplierName: string | null, skrPlan: "skr03" | "skr04", recentCodes: string[], isExported: boolean }`. Uses shadcn `<Popover>` + `<Command>` (verify both are in `apps/web/components/ui/` — do NOT add new shadcn components without verifying). Shows current code + label in trigger button with `<ConfidenceIndicator variant="dot">`. Calls `updateInvoiceSKR` via `useTransition`. Shows inline learning message for 3s after success.
  - [ ] 5.2 Verify `popover.tsx` and `command.tsx` exist in `apps/web/components/ui/`. If missing, note in Dev Notes and use `<Select>` + `<Input>` as fallback. Do NOT install shadcn components mid-story without documenting the decision.
  - [ ] 5.3 `apps/web/components/invoice/skr-category-select.test.tsx` NEW — ≥5 cases per AC #11. Mock `updateInvoiceSKR`.

- [ ] **Task 6: `<CategoryBootstrap />` client component (AC: #1)**
  - [ ] 6.1 `apps/web/components/invoice/category-bootstrap.tsx` NEW — `"use client"`. Props: `{ invoiceId, skrCode: string | null, status: InvoiceStatus }`. Fires `categorizeInvoice(invoiceId)` in `useEffect` when `skrCode === null && (status === 'ready' || status === 'review')`. StrictMode-safe `useRef` guard (identical pattern to `detail-pane-extraction-bootstrap.tsx:99,122`). Calls `router.refresh()` on success to re-render the detail pane with the new SKR data. No spinner — the `<SkrCategorySelect />` handles its own loading skeleton.

- [ ] **Task 7: Integrate into `<InvoiceDetailPane />` (AC: #7)**
  - [ ] 7.1 `apps/web/components/invoice/invoice-detail-pane.tsx` — MODIFY. Add props: `skrCode: string | null`, `buSchluessel: number | null`, `categorizationConfidence: number | null`, `skrPlan: string`, `recentSkrCodes: string[]`. Render `<CategoryBootstrap />` when `invoice !== null`. Add two display rows after the VAT breakdown section (after line_items table, before action buttons): SKR-Konto row (`<SkrCategorySelect />`) and BU-Schlüssel row (read-only `<dd>`). Do NOT add these to `FIELD_ORDER` — they are categorization rows, not extraction fields.
  - [ ] 7.2 `apps/web/app/(app)/rechnungen/[id]/page.tsx` — MODIFY. Add SELECT of `skr_code, bu_schluessel, categorization_confidence` from `invoices`. Add SELECT of top-3 `categorization_corrections` for this `tenant_id + supplier_name` (supplier_name read from `invoice_data.supplier_name.value`). Add SELECT of `tenants.skr_plan`. Pass all as props to `<InvoiceDetailPane />`.
  - [ ] 7.3 `apps/web/app/(app)/dashboard/page.tsx` — MODIFY (split-view path). When `selected` param is set and `<InvoiceDetailPane />` renders in the right column, also pass the new categorization props (same server-side fetches as 7.2).

- [ ] **Task 8: Validate + Smoke Test (AC: #12, #13)**
  - [ ] 8.1 `pnpm lint`, `pnpm check-types`, `pnpm build`, `pnpm test` all green — target ≥198 total tests.
  - [ ] 8.2 `### Browser Smoke Test` section per `smoke-test-format-guide.md` — all UX rows BLOCKED-BY-ENVIRONMENT; DB rows executable with psql.

---

## Dev Notes

### Scope Fences (from Story 3.2 deferred list + Epic 3 plan)
- **Approve / Flag buttons, swipe gestures** → Story 3.4. `<SkrCategorySelect />` does not trigger invoice status transitions.
- **Compliance warnings, weekly value summary** → Story 3.5.
- **DATEV CSV BU-Schlüssel usage** → Epic 5. The values persisted here are consumed there.
- **Bounding-box highlight in Source Viewer** → deferred indefinitely (TD7 in `deferred-work.md`).
- **No toast infrastructure** — per Story 3.2 decision, `<Toaster>` (sonner) is NOT wired. AI-learning message ships as inline muted text with fade. Do NOT add `sonner` as a dep.

### SKR Code List — Minimum Viable Set
Per architecture (`packages/shared/src/constants/skr.ts`), ship the most-common 20-30 codes per plan. Full lists from DATEV Kontenrahmen:

**SKR03 (most common for Kleinunternehmer/Freiberufler):**
| Code | Label |
|------|-------|
| 1200 | Bank |
| 1210 | Kasse |
| 3400 | Wareneingang 19% VSt |
| 3420 | Wareneingang 7% VSt |
| 3500 | Bezogene Leistungen 19% VSt |
| 3520 | Bezogene Leistungen 7% VSt |
| 4940 | Sonstige Betriebsausgaben |
| 4230 | Bürobedarf |
| 4240 | Zeitschriften, Bücher |
| 4260 | Miete |
| 4360 | Kfz-Kosten |
| 4530 | Werbekosten |
| 4600 | Reise-/Übernachtungskosten |
| 4650 | Bewirtungskosten |
| 4800 | Personalkosten |
| 4830 | Gehälter |
| 0800 | Maschinen |
| 0400 | EDV-Anlagen |
| 0650 | Geringwertige Wirtschaftsgüter |

**SKR04 (for GmbH/AG — use different numbering):**
| Code | Label |
|------|-------|
| 1200 | Bank |
| 1600 | Verbindlichkeiten aus LuL |
| 3200 | Handelsware |
| 4400 | Umsatzerlöse 19% USt |
| 4300 | Umsatzerlöse 7% USt |
| 6000 | Materialaufwand |
| 6200 | Bezogene Leistungen |
| 6310 | Bürobedarf |
| 6340 | Zeitschriften, Bücher |
| 6520 | Miete |
| 6570 | Kfz-Kosten |
| 6600 | Werbeaufwand |
| 6660 | Reise-/Übernachtungskosten |
| 6670 | Bewirtungsaufwand |
| 7000 | Personalaufwand |
| 7100 | Gehälter |
| 0300 | Maschinen |
| 0650 | Geringwertige Wirtschaftsgüter |

These are intentionally not exhaustive. The dev agent must NOT attempt to ship all ~1000+ DATEV codes — it will make tests brittle, bloat the bundle, and create review friction. The full code list can be expanded in a follow-up story.

### BU-Schlüssel Mapping Reference
| Scenario | BU-Schlüssel | Detection |
|----------|-------------|-----------|
| 19% Vorsteuer | 9 | `vat_rate ≈ 0.19` (±0.005) |
| 7% Vorsteuer | 8 | `vat_rate ≈ 0.07` (±0.005) |
| Steuerfrei / 0% | 0 | `vat_rate === 0` or null |
| Reverse Charge | 44 | AI categorization prompt detects "Reverse Charge" keyword in supplier data |
| Intra-EU Erwerb | 93 | AI categorization prompt detects "innergemeinschaftlicher Erwerb" context |

When multiple line items have different VAT rates, use the VAT rate of the first non-null line item. When `vat_total` is `0` and `gross_total = net_total`, fall back to `vat_rate = 0`.

### Shadcn Combobox Strategy
Before writing `<SkrCategorySelect />`, check:
```bash
ls apps/web/components/ui/ | grep -E 'popover|command'
```
If `popover.tsx` AND `command.tsx` both exist → use Popover+Command (shadcn Combobox pattern).
If either is missing → use `<Select>` + client-side filtering via `useState` on the options list. Do NOT run `npx shadcn` mid-story without documenting the choice.

The Combobox approach is strongly preferred per UX-DR ("searchable select with most-used codes at top") but the Select fallback is acceptable for MVP.

### AI Categorization Prompt Design
The prompt must:
1. Receive: `skrPlan` ("SKR03" or "SKR04"), `supplierName`, first 3 `lineItemDescriptions`, `vatRate` (from first non-null line item)
2. Output: one `skrCode` (must be a key in the corresponding code set), `confidence` [0,1], optional `buSchluessel` (number or null — only set for special cases like reverse-charge/intra-EU)
3. NOT output free-text outside the schema
4. Be prompted in German (same language discipline as extraction prompt)
5. Constrain the `skrCode` enum to the keys of the relevant code set — pass the code list in the prompt context

### Lazy Categorization vs. Extract-time Categorization
Story 3.3 ships lazy (triggered on detail pane open). This is intentional:
- Avoids making `extractInvoice` larger and harder to test
- Users who never open the detail pane don't incur AI cost
- The loading skeleton in `<SkrCategorySelect />` provides UX feedback during the async call

Future optimization (deferred): categorize during batch extraction pipeline (Story 2.3 follow-up).

### recentSkrCodes Query Pattern
```sql
SELECT corrected_code
FROM categorization_corrections
WHERE tenant_id = $1 AND supplier_name = $2
ORDER BY created_at DESC
LIMIT 10;
```
Deduplicate client-side (first occurrence wins). Pass up to 3 unique codes as `recentCodes` prop. If no supplier name is known (null), pass `[]`.

### Error Path Audit (Epic 2 retro A2) — for `categorizeInvoice` and `updateInvoiceSKR`
- Every exit path returns `ActionResult<T>` — no throws escape the outer try/catch (except `NEXT_REDIRECT`)
- DB SELECT errors distinguished from "not found" (PGRST116)
- `categorizeInvoice` skips DB write gracefully if AI call fails (return error, invoice skr_code stays null)
- `updateInvoiceSKR` corrections INSERT is non-fatal — log + Sentry, still return success (same pattern as `correctInvoiceField`)
- Sentry tags: `{ module: "invoices", action: "categorize" }` / `{ module: "invoices", action: "update_skr" }`
- Document audit in Dev Notes under "Error Path Audit"

### Source Tree Touch Points
- `packages/shared/src/constants/skr.ts` + `.test.ts` — NEW
- `packages/shared/src/index.ts` — MODIFY (re-export SKR symbols)
- `packages/shared/src/types/database.ts` — MODIFY (add categorization_corrections table + invoices columns)
- `packages/ai/src/prompts/categorization.ts` — NEW
- `packages/ai/src/categorize-invoice.ts` + `.test.ts` — NEW
- `packages/ai/src/index.ts` — MODIFY (export categorizeInvoice)
- `apps/web/app/actions/invoices.ts` — MODIFY (add categorizeInvoice + updateInvoiceSKR)
- `apps/web/app/actions/invoices.test.ts` — MODIFY (≥6 new cases)
- `apps/web/components/invoice/skr-category-select.tsx` + `.test.tsx` — NEW
- `apps/web/components/invoice/category-bootstrap.tsx` — NEW
- `apps/web/components/invoice/invoice-detail-pane.tsx` — MODIFY (add props + new rows)
- `apps/web/app/(app)/rechnungen/[id]/page.tsx` — MODIFY (fetch categorization data)
- `apps/web/app/(app)/dashboard/page.tsx` — MODIFY (pass categorization props in split-view)
- **NO** new top-level dependency. **NO** new Route Handler. **NO** new Edge Function.
- **NO** Framer Motion (Epic 1 retro discipline).

### Previous Story Intelligence
- **Story 3.2** shipped `<InvoiceDetailPane />` (RSC), `<EditableField />` client component, `correctInvoiceField` + `getInvoiceSignedUrl` Server Actions, `invoice_field_corrections` audit table, and `<DashboardRealtimeRefresher />`. All patterns must be preserved exactly.
- **`<DetailPaneExtractionBootstrap />`** (`apps/web/components/invoice/detail-pane-extraction-bootstrap.tsx`) is the reference for `<CategoryBootstrap />` — copy the StrictMode-safe `useRef` guard and `router.refresh()` pattern.
- **Story 3.2 explicitly deferred** categorization: "**Deferred to Story 3.3:** SKR categorization select, BU-Schlüssel display, categorization learning feedback." Do not add categorization-related code to `FIELD_ORDER`, `CORRECTABLE_FIELD_PATHS`, or `LABELS`.
- **Zod v4** — repo-wide (prep-td1). No `as unknown as` casts. `generateObject` in `packages/ai` is already on AI SDK v6 with Zod v4 peer dep (see `extract-invoice.ts`).
- **Smoke test format** — mandatory since Story 3.1; follow `smoke-test-format-guide.md`.
- **Story 3.2 review finding** — `InvoiceListFilters` in 380px split-view was fixed. Do NOT reintroduce wide grid classes in `invoice-list-filters.tsx`.
- **`apps/web/AGENTS.md`** — "This is NOT the Next.js you know." Read `node_modules/next/dist/docs/` before writing Server Actions, Server Components, or `searchParams`.
- **Test total baseline: 176** (Story 3.2 Task 8.1). Target: ≥198.

### Schema Already Applied
`supabase/migrations/20260421000000_categorization_corrections.sql` (prep-TD2) already applied:
- `invoices.skr_code text null` ✓
- `invoices.bu_schluessel smallint null` ✓
- `invoices.categorization_confidence numeric(4,3) null` ✓
- `categorization_corrections` table + RLS + index ✓
- UPDATE grant on `invoices` extended to the three new columns ✓

No new migration needed for Story 3.3. Only `database.ts` type update (Task 3.1) is required.

### Testing Standards
- Vitest + `@vitejs/plugin-react` + jsdom (already wired)
- Mock `@rechnungsai/ai` for categorization tests — do NOT call real AI in tests
- Mock `next/navigation` (same pattern as Story 3.1/3.2)
- Mock `@/lib/supabase/server` (same fake client pattern as `correctInvoiceField` tests)
- For `<SkrCategorySelect />` tests: mock `updateInvoiceSKR` Server Action at the module level
- `vi.useFakeTimers()` for the 3-second learning message fade

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story-3.3] — AC source (lines 621–649)
- [Source: _bmad-output/planning-artifacts/prd.md] — FR8 (529), FR9 (530), FR10 (531), FR11 (532), FR12 (533)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md] — SKR code select field (line 1861), AccordionInvoiceCard expanded anatomy (line 937), "Holz-Müller recognized" supplier pattern (line 508)
- [Source: _bmad-output/planning-artifacts/architecture.md] — categorizeInvoice Server Action (line 348, 559), packages/ai/src/categorize-invoice.ts (line 663), packages/shared/src/constants/skr.ts (line 654)
- [Source: _bmad-output/implementation-artifacts/prep-td2-categorization-corrections-table-migration.md] — Schema design decisions
- [Source: _bmad-output/implementation-artifacts/3-2-invoice-detail-view-and-field-editing.md] — Deferred items, `<DetailPaneExtractionBootstrap />` reference pattern, established test targets
- [Source: apps/web/components/invoice/detail-pane-extraction-bootstrap.tsx] — StrictMode-safe ref guard pattern to copy for CategoryBootstrap
- [Source: apps/web/app/actions/invoices.ts] — auth+tenant+row pattern (lines 200–230), revalidatePath pattern
- [Source: packages/ai/src/extract-invoice.ts] — generateObject pattern to follow for categorize-invoice.ts
- [Source: packages/ai/src/provider.ts] — getExtractionModel() re-use
- [Source: supabase/migrations/20260421000000_categorization_corrections.sql] — confirmed schema in place
- [Source: _bmad-output/implementation-artifacts/smoke-test-format-guide.md] — mandatory format

[Smoke test format: _bmad-output/implementation-artifacts/smoke-test-format-guide.md]

---

## Dev Agent Record

### Agent Model Used

<!-- to be filled by dev agent -->

### Debug Log References

### Completion Notes List

### Browser Smoke Test

<!-- to be filled by dev agent -->

### File List

<!-- to be filled by dev agent -->

### Review Findings

<!-- to be filled by code-review agent -->

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-04-26 | Story file created — comprehensive context engine output | claude-sonnet-4-6 |
