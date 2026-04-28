# Deferred Work Triage — Epic 4 Boundary

**Date:** 2026-04-28
**Participants:** GOZE + Amelia
**Question:** Which items in `deferred-work.md` block Stories 4.1, 4.2, or 4.3?

---

## Verdict: No Hard Blockers for Epic 4

All three Epic 4 stories (4.1, 4.2, 4.3) can begin after P1–P5 prep tasks complete. Two design dependencies carried into story authoring (see Section 2).

---

## 1. Full Triage by Story Source

### From: 3-5-compliance-warnings-and-weekly-value-summary

| Item | Epic 4 Impact | Disposition |
|------|--------------|-------------|
| SQL regex rejects negative VAT (`vat_total`) in `tenant_weekly_value_summary()` | None. Credit note upload not in Epic 4 scope. | Deferred — revisit at credit note feature |
| EditableField `id` missing in editing state (`jumpToField` null) | None. A11y polish. | Deferred — a11y story |

### From: 3-4-swipe-to-approve-and-confidence-based-review-queue

| Item | Epic 4 Impact | Disposition |
|------|--------------|-------------|
| `approveInvoice` re-stamps `approved_at`/`approved_by` on `ready→ready` | **Design dependency for 4.2.** Story 4.2 resolves this: `audit_logs` becomes truth source; invoice columns become "last known state" only. See prep-p4 Section 5. | Carried into Story 4.2 as explicit task |
| NEXT_REDIRECT digest detection fragility | None. Pre-existing across all Server Actions. | Deferred — Next.js upgrade |
| Concurrent double-approve race (no SELECT FOR UPDATE) | None for Epic 4. `audit_logs` will record both approvals; audit chain remains correct. | Deferred — production observation |
| `undoInvoiceAction` trusts client-supplied `expectedCurrentStatus` | None for Epic 4. | Deferred — security hardening pass |
| `SwipeActionWrapper` reducedMotionRef not reactive to live OS change | None. | Deferred — a11y story |
| CSS/JS countdown dual constant (5000ms) | None. | Deferred — next touch of toast files |
| `SwipeActionWrapper` activates on desktop drag | None. | Deferred — if user feedback warrants |
| Silent 4th-toast eviction | None. | Deferred — if user confusion reported |
| Dashboard date range `from > to` no UX banner | None. | Deferred — filter UI improvement |
| `SessionSummary errorCount={0}` hardcoded | **Dependency for 4.2** — Story 4.2 audit_logs will provide real data. Wire-up is a Story 4.2 task (see prep-p4 Section 6). | Carried into Story 4.2 as explicit task |
| `SessionSummary streakWeeks={0}` hardcoded | Story 8.3 scope. Not Epic 4. | Deferred to Epic 8 |
| `InvoiceActionsHeader` renders for exported invoices | None. | Deferred — if user feedback warrants |
| `fireUndo` silent failure (no user toast on undo error) | None. | Deferred |
| `SessionSummary FirstSession` bfcache reappear | None. | Deferred — Story 8.3 preferences |

### From: 3-3-skr-categorization-and-bu-schluessel-mapping

| Item | Epic 4 Impact | Disposition |
|------|--------------|-------------|
| Always-visible "Beleg ansehen" trigger (deferred → Story 3.4) | **CLOSED.** `invoice-actions-header.tsx` has "Beleg ansehen" button with `SourceDocumentViewer` wired. Story 3.4 resolved this. | ✅ Mark [x] in deferred-work.md |
| SKR dropdown keyboard a11y | None. | Deferred — a11y story |
| `SkrCategorySelect` no AbortController (stale-result race) | None. | Deferred — future polish |
| `updateInvoiceSKR` non-atomic corrections insert | None for Epic 4. Story 4.2 will log categorize events in `audit_logs` using same sequential-with-Sentry pattern. | Deferred — server action infra refactor |
| `skr_plan` string coercion repeated in 3 places | None. | Deferred — centralized parser when touching files |
| `recentCodes` cross-plan filter (no `skr_plan` column) | None. | Deferred — plan-migration UX design |
| Test fragility (top-level await import, non-null assertion) | None. | Deferred — next test touch |

### From: 3-2-invoice-detail-view-and-field-editing

| Item | Epic 4 Impact | Disposition |
|------|--------------|-------------|
| SourceDocumentViewer TTL cache ineffective | None for Epic 4. Story 4.1 adds sha256; viewer functionality unchanged. | Deferred — future polish |
| `revalidatePath("/dashboard")` without `type: "layout"` | None. | Deferred — monitor cache behavior |
| Safe-cast migration NULL on scientific notation | None. | Deferred — if AI extractor format changes |

### From: 3-1-pipeline-dashboard-and-invoice-list

| Item | Epic 4 Impact | Disposition |
|------|--------------|-------------|
| No auth guard in dashboard page | None for Epic 4. | Deferred — middleware concern |
| `CHECK (extraction_attempts <= 5)` without NOT VALID | None. | Deferred — if row breaches |
| Global Escape listener conflict | None — Story 3.2 detail pane resolved this. | Deferred (pre-existing) |
| Per-field `safeParse` loop in `parseDashboardQuery` | None. | Deferred — refactor when touching |
| Dashboard realtime count (P12) | None for Epic 4. | Deferred |
| Generated column safe cast (P14) | None. | Deferred — if AI format changes |

### From: 2-3-batch-invoice-upload

| Item | Epic 4 Impact | Disposition |
|------|--------------|-------------|
| Serial `submitBlob` in multi-file path | None. | Deferred — design call needed |

### From: 1-3, 1-4, 1-5, 2-1, 2-2 (older stories)

No items in these sections block Epic 4. All are pre-existing debt that pre-dates the Epic 4 feature scope.

---

## 2. Design Dependencies (carry into story authoring)

These are not blockers — Epic 4 stories can be written and implemented — but the story author must account for them.

### D1 — `approveInvoice` re-stamp behavior → Story 4.2

**Context:** `approveInvoice` overwrites `approved_at`/`approved_by` on every call, losing the first approver's identity.

**Story 4.2 resolution:** `audit_logs` is the immutable record of all approval events. Invoice columns = last known state for display. Story 4.2 task: check `audit_logs` before writing invoice columns — if first approval, write both; if re-approval, write audit log only.

**Deferred item:** `deferred-work.md` entry for this item can be marked [x] once Story 4.2 is done.

### D2 — `SessionSummary errorCount` → Story 4.2

**Context:** `errorCount={0}` hardcoded — `WithCorrections` variant unreachable.

**Story 4.2 resolution:** Query `audit_logs WHERE event_type = 'field_edit'` for today's session. Story 4.2 task explicitly covers this (see prep-p4 Section 6).

---

## 3. Items to Close in `deferred-work.md`

The following deferred item is now resolved and should be marked `[x]`:

- `[x]` — "→ Story 3.4 scope: Always-visible 'Beleg ansehen' / Source Document Viewer trigger in `<InvoiceDetailPane />` header" — Resolved in Story 3.4: `InvoiceActionsHeader` has "Beleg ansehen" button wired to `SourceDocumentViewer`.

---

## 4. 100-Invoice Dashboard Limit — Story 4.3 Note

`deferred-work.md` (3-1): dashboard query is capped at 100 invoices. Story 4.3 (Archive Search and Audit Export) implements its own query path (date-range, supplier, amount filters + pagination) and must NOT use the dashboard query. Story author should note: archive search uses a dedicated Server Action, not the dashboard RSC.

---

## 5. Summary

| Category | Count |
|----------|-------|
| Hard blockers for Epic 4 | **0** |
| Design dependencies (carried into story authoring) | **2** (D1, D2) |
| Items resolved since last triage | **1** (3.3→3.4 Source Document Viewer) |
| Items deferred to future epics/sprints | ~35 |

**Epic 4 is clear to start.** P1–P5 complete. Stories 4.1, 4.2, 4.3 can be authored and implemented.

---

*Triage completed 2026-04-28. P5 resolved.*
