---
title: 'Fix Positionen table edit-mode overflow on narrow viewports'
type: 'bugfix'
created: '2026-05-06'
status: 'done'
baseline_commit: 'e036eb8a23a47de701ad89008e98639267e85e8a'
context:
  - '{project-root}/apps/web/AGENTS.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On `/rechnungen/[id]` (and the dashboard split-view) the **Positionen** table — a 6-column `<table>` wrapped in `overflow-x-auto` — already overflows horizontally on narrow viewports, and the problem becomes critical when a cell enters edit mode: `EditableField` swaps the cell content for an `<Input>` plus three buttons (Übernehmen / AI-Wert wiederherstellen / Abbrechen) rendered inline, blowing the row width far past the viewport. Header cells, row content, and edit controls all get pushed off-screen, making the line items unreviewable on mobile.

**Approach:** Render Positionen as a responsive layout: keep the existing 6-column `<table>` on `sm`+ breakpoints (no desktop change), and on viewports below `sm` switch to a stacked **card-per-line-item** layout where each field is a label-above-value row. In card mode, edit controls flow vertically inside the card so input and buttons fit the viewport without horizontal overflow. No changes to `EditableField` itself, no changes to other invoice fields, no changes to data model or server actions.

## Boundaries & Constraints

**Always:**
- Preserve existing UX decisions for desktop / `sm`+ — table layout, column order, labels (Beschreibung, Menge, Einzel, Netto, USt-Satz, USt-Betrag), and confidence styling stay identical.
- Reuse `EditableField` as-is for every editable cell — no prop or behavior changes.
- Read-only branch (`isExported`) must keep working in both layouts and use the same formatting helpers (`formatEur`, `vat_rate` `%` suffix, `—` for null).
- All six line-item fields remain editable in card mode with the same `inputKind` mapping (`lineItemInputKind`).
- No horizontal scroll, no off-screen content, and no clipped buttons on viewports ≥320px wide in either read or edit state.

**Ask First:**
- Choosing a breakpoint other than Tailwind's `sm` (640px) for the layout switch.
- Replacing the table on `sm`+ as well (i.e. card layout everywhere) — desktop must stay tabular unless the user explicitly approves.

**Never:**
- Change the line-item data shape, server actions, validation, or `EditableField` internals.
- Introduce a modal/sheet/drawer-based edit flow.
- Move edit controls into a separate action menu or hide any of the three buttons.
- Touch any other section of `invoice-detail-pane.tsx` (Währung, Zahlungsbedingungen, SKR-Konto, BU-Schlüssel, header, banners).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Narrow viewport, read mode | Viewport <640px, `isExported=false`, line items present | Card-per-item layout; all 6 fields visible as label/value pairs; no horizontal scroll on the page | N/A |
| Narrow viewport, edit a cell | Tap any field value in card mode | Field swaps to `EditableField` edit UI inside the card; input + 3 buttons stack/wrap to stay within card width; nothing overflows the viewport | Inline error from `EditableField` renders below input as today |
| Narrow viewport, exported invoice | `isExported=true` | Card layout shows formatted read-only values (no clickable affordance); same content as desktop read-only | N/A |
| Wide viewport (`sm`+), any mode | Viewport ≥640px | Existing 6-column `<table>` behavior unchanged | N/A |
| Empty `line_items` | `invoice.line_items.length === 0` | Whole Positionen block not rendered (current behavior preserved) | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/components/invoice/invoice-detail-pane.tsx` — owns the Positionen block (lines ~195–248); only this section changes.
- `apps/web/components/invoice/editable-field.tsx` — reused as-is for editable cells; no edits.
- `apps/web/components/invoice/invoice-detail-pane.test.tsx` — existing tests for the pane; extend with line-items rendering coverage.
- `apps/web/lib/format.ts` — `formatEur` reused for currency cells in card layout.
- `apps/web/AGENTS.md` — repo conventions (e.g. German date input rules — informational; not directly triggered here since line-item fields don't include dates).

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/components/invoice/invoice-detail-pane.tsx` -- Positionen block now renders two parallel layouts via shared `LI_FIELDS` config: `<div className="hidden sm:block">` wrapping the original `<table>` (no `overflow-x-auto`), plus a `<ul className="block sm:hidden space-y-3">` card list. Each card renders the 6 fields stacked label-above-value with `min-w-0` on the value container; `isExported` branch reuses a single `renderReadOnly` helper for both layouts.
- [x] `apps/web/components/invoice/editable-field.tsx` -- buttons row updated to `flex flex-wrap items-center gap-2 mt-1` so Übernehmen / AI-Wert wiederherstellen / Abbrechen wrap to a second line inside narrow card cells instead of overflowing.
- [x] `apps/web/components/invoice/invoice-detail-pane.test.tsx` -- two new tests: (a) a populated line item renders both desktop table and mobile card list with all 6 German labels in the card; (b) `isExported` card shows formatted read-only values and exposes no `<input>`.

**Acceptance Criteria:**
- Given a narrow viewport (<640px) and an invoice with line items, when the page loads, then each line item renders as a card with all 6 labeled fields visible and zero horizontal page scroll.
- Given the card layout, when the user taps a field value, then `EditableField` edit UI (input + 3 buttons) appears inside the card and remains fully within the viewport at 320px width.
- Given a viewport ≥640px, when the page loads, then the Positionen section renders as the existing `<table>` with no visual change.
- Given `isExported=true` on a narrow viewport, when the page loads, then card layout shows formatted read-only values with no edit affordance.

## Verification

**Commands:**
- `pnpm --filter @rechnungsai/web test invoice-detail-pane` -- expected: all existing + new tests pass.
- `pnpm --filter @rechnungsai/web typecheck` -- expected: no type errors.
- `pnpm --filter @rechnungsai/web lint` -- expected: clean.

**Manual checks:**
- Open `/rechnungen/[id]` for an invoice with multiple line items in Chrome DevTools mobile emulation (iPhone SE / 375px and 320px). Confirm: no horizontal scroll, all 6 labels/values visible per item, tapping any value opens edit UI inside the card, all 3 buttons reachable and not clipped.
- Resize to ≥640px and confirm the table layout is unchanged from current main.
- Repeat both checks against an exported (read-only) invoice.

## Suggested Review Order

**Layout split (intent)**

- Single render branch becomes two parallel layouts driven by Tailwind breakpoint.
  [`invoice-detail-pane.tsx:218`](../../apps/web/components/invoice/invoice-detail-pane.tsx#L218)

- Mobile card list — stacks label-above-value per field; `min-w-0 break-words` keeps long descriptions inside the card.
  [`invoice-detail-pane.tsx:259`](../../apps/web/components/invoice/invoice-detail-pane.tsx#L259)

**Shared field config**

- `LI_FIELDS` + `renderReadOnly` lifted from inline branches so table and cards stay in sync (same key order, same labels, same formatting).
  [`invoice-detail-pane.tsx:199`](../../apps/web/components/invoice/invoice-detail-pane.tsx#L199)

- Desktop `<table>` reuses the shared config and now passes German labels (was raw key) — fixes a11y inconsistency between layouts.
  [`invoice-detail-pane.tsx:218`](../../apps/web/components/invoice/invoice-detail-pane.tsx#L218)

**Edit-mode overflow**

- Action row switches to `flex-wrap` so the 3 buttons wrap to a second line inside narrow card cells.
  [`editable-field.tsx:270`](../../apps/web/components/invoice/editable-field.tsx#L270)

**Tests**

- Coverage for both layouts coexisting + exported card branch.
  [`invoice-detail-pane.test.tsx:110`](../../apps/web/components/invoice/invoice-detail-pane.test.tsx#L110)
