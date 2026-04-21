# Smoke Test Format Guide

**Version:** 1.0 — 2026-04-21
**Source:** Epic 2 Retrospective Action A1 + TD3
**Applies to:** Story 3.1 and all subsequent stories

---

## Purpose

This guide defines the canonical smoke test format for RechnungsAI stories. Every story that reaches "review" status must include a smoke test section following this format so that GOZE can run each check step-by-step, know exactly what to look for, and confirm pass or fail without guessing.

**Problem the old format had:**
- Steps listed without expected output ("tap Fertig → /dashboard")
- UX checks and psql queries mixed in a single "Note" column
- Non-critical developer queries buried alongside critical ones
- No pass/fail criterion — GOZE had to infer what "correct" looks like

**What the new format provides:**
- Explicit expected output for every step
- Clear pass criterion — a sentence GOZE can evaluate as true or false
- UX checks and DB verification in separate tables
- Only critical DB queries — no implementation-detail noise

---

## Format Specification

### Tier 1 — UX Checks Table

For each user-facing behaviour that must be verified:

```markdown
### UX Checks

| # | Action | Expected Output | Pass Criterion | Status |
|---|--------|----------------|----------------|--------|
| (a) | [What GOZE does — plain language, no jargon] | [Exactly what GOZE sees/hears/reads on screen] | [One sentence: what makes this a PASS] | DONE / FAIL / BLOCKED-BY-ENVIRONMENT |
```

**Column rules:**

| Column | Rule |
|--------|------|
| **Action** | Plain language. No code identifiers. What a non-developer would do: "Open the app → tap Sign In → enter an invalid email → tap Weiter." |
| **Expected Output** | Verbatim UI text in quotes (`"Bitte gib eine gültige E-Mail ein."`), or unambiguous description (`skeleton cascade → field rows appear`). Never vague (`"error appears"`). |
| **Pass Criterion** | One evaluable sentence. "Pass if the inline error `"…"` appears below the email field and no toast fires." |
| **Status** | `DONE` — GOZE ran it and it passed. `FAIL` — ran it and it failed (add note). `BLOCKED-BY-ENVIRONMENT` — dev agent cannot run it; GOZE must. Add manual steps in the row's Note if BLOCKED. |

### Tier 2 — DB Verification Table

For each critical state that cannot be observed in the UI alone:

```markdown
### DB Verification

| # | Query | Expected Return | What It Validates | Status |
|---|-------|----------------|-------------------|--------|
| (d1) | `psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres' -c "…"` | ```  count -------  1 (1 row)``` | [One sentence: what the return value proves] | DONE / FAIL / BLOCKED-BY-ENVIRONMENT |
```

**Column rules:**

| Column | Rule |
|--------|------|
| **Query** | Full copy-paste command. Use the standard local Supabase connection string. Include a `LIMIT` to avoid dumping entire tables. |
| **Expected Return** | Exact psql output — column header + value + row count. E.g.: `status \| original_filename \n --------+--------------- \n captured \| invoice.jpg \n (1 row)`. Never "some rows" or "non-null value". |
| **What It Validates** | One sentence linking the DB state to an acceptance criterion. "Confirms AC #2: row lands in `invoices` with `status='captured'` after successful upload." |
| **Status** | Same options as UX Checks. BLOCKED-BY-ENVIRONMENT only if GOZE does not have DB access (rare — assume they do). |

### What NOT to Include

- **Non-critical queries:** `SELECT *` dumps, schema introspection (`\d`, `\dT`), or queries that verify implementation details the developer already confirmed via `pnpm check-types`. These belong in the Dev Agent's implementation verification, not the smoke test GOZE runs.
- **Self-certification:** Do NOT write "all checks passed" or mark Status as `DONE` without actually running the check. The dev agent cannot run a real browser — mark `BLOCKED-BY-ENVIRONMENT` and provide manual steps.
- **Implementation jargon in Action column:** GOZE reads the Action column on a phone. "Call `uploadInvoice` Server Action" is not an action; "tap Hochladen in the viewfinder" is.
- **Happy-path-only checks:** If the AC specifies an error path (invalid file, network fail), the smoke test must cover it — do not skip it because it is harder to test manually.

---

## Worked Example — Story 2.3 (Batch Invoice Upload)

Story 2.3 had 10 sub-checks. Below is the same smoke test rewritten in the new format. This serves as the reference GOZE reviewed to confirm "I know exactly what to check and what to expect."

### UX Checks

| # | Action | Expected Output | Pass Criterion | Status |
|---|--------|----------------|----------------|--------|
| (a) | Sign in → open `/erfassen` → allow camera → capture 3 photos with auto-capture (hold phone still after each) → tap **Fertig** | Counter reads `"3 erfasst"` after each capture (never resets between captures). After Fertig: `/dashboard` loads. | Pass if counter shows `"3 erfasst"` when the 3rd photo is taken AND the route does NOT change to `/rechnungen/[id]` at any point during captures AND `/dashboard` loads after Fertig. | BLOCKED-BY-ENVIRONMENT |
| (b) | On `/erfassen`, tap **Galerie / Datei** → multi-select exactly 5 files: 2 JPG, 2 PDF, 1 XML | Counter ticks up 5 times: `"1 erfasst"` … `"5 erfasst"`. Counter briefly shows `"5 erfasst · 5 verarbeiten"` while AI extraction runs. | Pass if the counter reaches `"5 erfasst"` and the `· N verarbeiten` suffix appears (even briefly). No error banners. | BLOCKED-BY-ENVIRONMENT |
| (c) | On `/erfassen`, tap **Galerie / Datei** → select 25 files at once | Inline German error appears immediately (does not wait for upload): `"Bitte wähle höchstens 20 Dateien pro Aufnahme-Runde."` | Pass if the exact German text `"Bitte wähle höchstens 20 Dateien pro Aufnahme-Runde."` appears inline (not as a toast) and counter does NOT exceed `"20 erfasst"`. | BLOCKED-BY-ENVIRONMENT |
| (d) | On `/erfassen`, tap **Galerie / Datei** → select 5 files where exactly one file is over 10 MB | Inline error list appears with exactly one entry for the oversized filename: `"Die Datei ist zu groß (max. 10 MB)."`. The other 4 files upload normally. | Pass if only the oversized file shows an inline error AND the counter reaches `"4 erfasst"` (not 5). No other files are rejected. | BLOCKED-BY-ENVIRONMENT |
| (e) | Capture 20 PDFs via Galerie. Start a timer when the last file is selected. Stop the timer when all 20 reach `ready` or `review` status (visible when the `· N verarbeiten` suffix disappears from the counter). | Counter goes `"20 erfasst · 20 verarbeiten"` → `"20 erfasst"`. Total wall-clock ≤ 60 s. | Pass if the `· verarbeiten` suffix disappears within 60 seconds of the last file being selected. | BLOCKED-BY-ENVIRONMENT |
| (f) | Set `OPENAI_API_KEY=invalid-key` in `.env.local` → restart `pnpm dev` → capture 10 files → restore the key in `.env.local` → restart `pnpm dev` → capture 10 more files | First 10: counter shows `"10 erfasst"`, no extraction errors visible in UI (extractions fail silently server-side). Last 10: reach `"20 erfasst · 10 verarbeiten"` → `"20 erfasst"`. | Pass if the capture UI does NOT crash or show an error banner for the first batch AND the second batch completes extraction (counter `· verarbeiten` clears). | BLOCKED-BY-ENVIRONMENT |
| (g) | On the `/erfassen` viewfinder, swipe down ≥ 150 px on a blank area of the screen (not on a button) | App navigates to `/dashboard`. | Pass if `/dashboard` loads after the swipe AND the viewfinder is no longer visible. | BLOCKED-BY-ENVIRONMENT |
| (g2) | On the `/erfassen` viewfinder, start a swipe-down gesture directly on the shutter button | Viewfinder stays open. No navigation. | Pass if the route stays at `/erfassen` after releasing the swipe. | BLOCKED-BY-ENVIRONMENT |
| (g3) | On a desktop browser at `/erfassen`, press the **Escape** key | App navigates to `/dashboard`. | Pass if `/dashboard` loads after Escape. | BLOCKED-BY-ENVIRONMENT |
| (h) | DevTools → toggle **Offline** → capture 3 photos → toggle **Online** → watch the counter | While offline: counter shows `"3 erfasst · 3 in Warteschlange"`. After going online: queue drains. Counter becomes `"3 erfasst"` (no `in Warteschlange`). Route stays at `/erfassen` throughout — no redirect to `/rechnungen/[id]`. | Pass if NO route change occurs during offline capture OR drain AND the queue clears after going online. | BLOCKED-BY-ENVIRONMENT |
| (i) | Open `/einstellungen`, `/dashboard` | Pages load normally. No errors. | Pass if both pages render without a crash or blank screen. | BLOCKED-BY-ENVIRONMENT |
| (j) | On `/erfassen` or `/dashboard`, press the **?** key | Keyboard shortcut overlay opens. | Pass if the overlay appears and lists shortcuts. | BLOCKED-BY-ENVIRONMENT |

---

### DB Verification

Run after completing the UX Checks above. Standard local Supabase connection:

```
psql 'host=localhost port=54322 dbname=postgres user=postgres password=postgres'
```

| # | Query | Expected Return | What It Validates | Status |
|---|-------|----------------|-------------------|--------|
| (d1) | `SELECT status, file_type, original_filename FROM invoices ORDER BY created_at DESC LIMIT 5;` | 5 rows. `file_type` column shows mix of `image/jpeg`, `application/pdf`, `application/xml` matching the 5 files uploaded in check (b). `status` values are `captured`, `processing`, `ready`, or `review` (not `null`). | Confirms AC #2 + #3: all 5 files land in `invoices` with correct `file_type` populated. | BLOCKED-BY-ENVIRONMENT |
| (d2) | `SELECT COUNT(*) FROM invoices WHERE created_at > NOW() - INTERVAL '5 minutes';` (run immediately after check (c)) | `count` = 20 (not 25) | Confirms AC #9: the 20-file cap is enforced server-side — only 20 rows inserted despite 25 selected. | BLOCKED-BY-ENVIRONMENT |
| (d3) | `SELECT status, extraction_error FROM invoices WHERE created_at > NOW() - INTERVAL '5 minutes' ORDER BY created_at ASC;` (run after check (f) — first 10 with invalid key) | First 10 rows: `status = captured`, `extraction_error` is non-null (contains German error string). Last 10 rows: `status = ready` or `review`, `extraction_error IS NULL`. | Confirms AC #7 (failure isolation): failed extractions revert to `captured` with error stored; successful extractions reach `ready`/`review`. | BLOCKED-BY-ENVIRONMENT |
| (d4) | `SELECT COUNT(*) FROM invoices WHERE created_at > NOW() - INTERVAL '5 minutes';` (run after check (h) — offline drain) | `count` = 3 | Confirms AC #1: offline-queued captures drain and create rows; no rows skipped. | BLOCKED-BY-ENVIRONMENT |

---

**Manual Steps for GOZE (BLOCKED-BY-ENVIRONMENT checks):**

1. `pnpm dev` from repo root (uses Gemini free tier: `EXTRACTION_PROVIDER=google`)
2. Sign in at `/login` with a test account
3. Run UX Checks (a)–(j) in order
4. After checks (b), (c), (f), (h): run the corresponding DB Verification queries
5. Mark each check `DONE` or `FAIL` — if FAIL, note what you actually saw vs. the expected output

---

## Blank Template

Copy this into a new story's Completion Notes → Browser Smoke Test section. Fill in the Action, Expected Output, and Pass Criterion columns based on the story's Acceptance Criteria. Remove rows that do not apply.

```markdown
### Browser Smoke Test

**Environment:** `pnpm dev` from repo root. Supabase local: `host=localhost port=54322 dbname=postgres user=postgres password=postgres`.

#### UX Checks

| # | Action | Expected Output | Pass Criterion | Status |
|---|--------|----------------|----------------|--------|
| (a) | [step] | [verbatim UI text or description] | Pass if [one evaluable sentence] | BLOCKED-BY-ENVIRONMENT |
| (b) | [step] | [verbatim UI text or description] | Pass if [one evaluable sentence] | BLOCKED-BY-ENVIRONMENT |
| (c) | [step] | [verbatim UI text or description] | Pass if [one evaluable sentence] | BLOCKED-BY-ENVIRONMENT |

#### DB Verification

| # | Query | Expected Return | What It Validates | Status |
|---|-------|----------------|-------------------|--------|
| (d1) | `psql '...' -c "SELECT … FROM … WHERE … LIMIT N;"` | ```col_name\n---------\nvalue\n(1 row)``` | Confirms AC #N: [one sentence]. | BLOCKED-BY-ENVIRONMENT |

**Manual Steps for GOZE:**
1. [step]
2. [step]
```

---

## Format Checklist for Dev Agents

Before marking a story "review", confirm the smoke test section satisfies every item:

- [ ] Smoke test section exists in Completion Notes under the heading `### Browser Smoke Test`
- [ ] UX Checks table present with columns: #, Action, Expected Output, Pass Criterion, Status
- [ ] DB Verification table present (if story touches DB) with columns: #, Query, Expected Return, What It Validates, Status
- [ ] Every `Expected Output` cell contains verbatim UI text (in quotes) or an unambiguous description — not "error appears" or "page loads"
- [ ] Every `Pass Criterion` cell is a single evaluable sentence starting with "Pass if…"
- [ ] Every query in DB Verification is a complete copy-paste command with the full connection string
- [ ] Every query has an `Expected Return` that shows exact column headers + values + row count
- [ ] Dev Notes contains: `[Smoke test format: _bmad-output/implementation-artifacts/smoke-test-format-guide.md]`
- [ ] No non-critical queries included (schema introspection, `SELECT *` dumps)
- [ ] BLOCKED-BY-ENVIRONMENT items include manual steps for GOZE within the same row or immediately below the table

---

*Guide authored as Epic 3 preparation task TD3. Applies from Story 3.1 onwards.*
