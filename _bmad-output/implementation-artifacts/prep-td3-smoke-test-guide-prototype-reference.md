# Prep TD3: Smoke Test Guide — Prototype Reference

Status: done

**Type:** Technical Debt / Preparation Task (process improvement; blocks Story 3.1 quality gate)
**Source:** `_bmad-output/implementation-artifacts/epic-2-retro-2026-04-21.md` — Action Items § A1 + § TD3
**Created:** 2026-04-21

---

## Story

As the RechnungsAI engineering team,
we want a standalone smoke test format guide with a worked example and a copy-paste template,
so that every dev agent writing Story 3.1 onwards produces smoke test sections that GOZE can follow step-by-step — with explicit expected output per check, clear pass/fail criteria, and a clean separation of UX verification from critical DB queries.

**Why now:** Epic 2 retrospective identified that the current smoke test format lists steps without expected outputs, mixes UX checks and psql queries, and includes non-critical developer queries that add noise. GOZE confirmed: the issue is quality of instructions, not time. This guide is the prerequisite for Action A1 ("smoke test format redesign — Story 3.1 onwards") and the reference TD1 AC #9 pointed at.

---

## Acceptance Criteria

1. **Given** there is no canonical reference for the new smoke test format **When** this task completes **Then** a file `_bmad-output/implementation-artifacts/smoke-test-format-guide.md` exists that:
   - Defines the two-tier format (UX Checks table + DB Verification table)
   - Specifies what belongs in each column of each table
   - Lists what NOT to include (non-critical queries, self-certifying statements)

2. **Given** the format spec alone is not enough for agents to follow consistently **When** this task completes **Then** the guide includes a fully worked example — a complete smoke test section rewritten from an existing Epic 2 story (Story 2.3 chosen as it is the most recent and was manually smoke-tested by GOZE, surfacing 4 real issues) — demonstrating the new format end-to-end.

3. **Given** dev agents should be able to copy-paste a skeleton and fill it in **When** this task completes **Then** the guide includes a blank template that an agent can copy verbatim and fill in for any new story.

4. **Given** GOZE is the primary reader of smoke test output **When** the guide is read **Then** the UX Checks table reads as a natural checklist that GOZE can print or follow on a phone: clear action → unambiguous expected output → explicit pass criterion. No dev jargon in the action/expected-output columns.

5. **Given** DB verification is critical but distinct from UX **When** the guide is applied **Then** DB queries live in a separate table from UX checks, have their own "Expected Return" column with exact value (e.g. `(1 row)  status | captured`), and the queries are limited to those that confirm correctness that cannot be observed in the UI alone.

6. **Given** `pnpm test` passes 88 tests before this task **When** this task completes **Then** `pnpm test` still passes all 88 tests. No source code changes — this is a pure documentation deliverable.

7. **Given** `pnpm check-types`, `pnpm lint`, and `pnpm build` pass before this task **When** this task completes **Then** all three still pass. No source code changes.

8. **Given** future stories must reference the guide **When** a dev agent writes a smoke test section for Story 3.1 onwards **Then** the Dev Notes section of that story contains a reference: `[Smoke test format: _bmad-output/implementation-artifacts/smoke-test-format-guide.md]`.

---

## Tasks / Subtasks

- [x] **Task 1: Write the format guide document (AC: #1, #2, #3, #4, #5)**
  - [x] 1.1 Define two-tier format: UX Checks table + DB Verification table with column specs
  - [x] 1.2 Write guidelines for what goes in each column (Action, Expected Output, Pass Criterion, Status)
  - [x] 1.3 Write "what NOT to include" section (non-critical queries, implicit self-certification)
  - [x] 1.4 Write fully worked example based on Story 2.3 smoke test (rewrite in new format)
  - [x] 1.5 Write blank template agents can copy for new stories
  - [x] 1.6 Save as `_bmad-output/implementation-artifacts/smoke-test-format-guide.md`

- [x] **Task 2: Validate no regressions (AC: #6, #7)**
  - [x] 2.1 `pnpm test` → 88/88 pass (no regressions; no source changes)
  - [x] 2.2 `pnpm check-types` → zero errors
  - [x] 2.3 `pnpm lint` → zero new errors
  - [x] 2.4 `pnpm build` → all workspaces succeed

---

## Dev Notes

### Context from Epic 2 Retrospective

> **Smoke Tests Need Better Format**
> Current format lists steps but lacks: (a) expected output alongside each step, (b) "pass/fail" criteria per check, (c) distinction between developer-relevant psql and user-experience verification. GOZE confirmed: time is not the issue — quality of instructions is.

> **A1: Smoke test format redesign** — each story's smoke test section must include: (a) user-perspective steps with explicit expected output, (b) critical psql queries with expected return values, (c) non-critical queries removed.
> Success criteria: GOZE — "It is a very good reference for agents to write for GOZE smoke test details. I know exactly what to check and what to expect."

> **TD3:** Smoke test guide prototype reference for future Stories — GOZE needs step-by-step guide with expected outputs for status review Story.

TD1 AC #9 was the first attempt at the new format — the guide crystallises that attempt into a durable, reusable reference.

### What the guide must NOT contain

- Step descriptions without corresponding expected output
- psql queries that only confirm implementation details a developer would already know
- Self-certifying lines like "all checks DONE" without per-check evidence
- Jargon in the Action column (GOZE runs these on a phone / in a terminal — plain language)

### Story used for the worked example

Story 2.3 (Batch Invoice Upload) was chosen because:
- GOZE ran the manual smoke test in production conditions
- 4 real bugs were found during that smoke (badge text, exit blocking, mountedRef StrictMode issue, drain rehydration)
- The original format is available as a before/after contrast
- It is the most complex smoke test in Epic 2 (10 sub-checks, both UX + psql + offline + concurrency)

---

## File List

**Added (1 file):**
- `_bmad-output/implementation-artifacts/smoke-test-format-guide.md` — new format guide: two-tier spec, column definitions, worked Story 2.3 example, blank template

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-04-21 | Story file created | Amelia (Dev Agent) |
| 2026-04-21 | `smoke-test-format-guide.md` written; all validation gates green | Amelia (Dev Agent) |

---

## Dev Agent Record

### Implementation Plan

1. Study existing smoke test sections from Stories 2.1, 2.2, 2.3 and TD1 to understand the current format and its failure modes.
2. Design two-tier format based on retro A1 requirements: UX Checks table + DB Verification table.
3. Write format spec, column guidelines, and "what NOT to include" section.
4. Rewrite Story 2.3 sub-checks (a)–(j) in the new format as the worked example.
5. Write blank template.
6. Run full validation suite (no source changes, expecting full cache hit).

### Debug Log

No issues encountered. Pure documentation deliverable with no TypeScript or test surface.

### Completion Notes

#### Summary

TD3 complete. `smoke-test-format-guide.md` defines:
- **Two-tier format**: UX Checks table (Action / Expected Output / Pass Criterion / Status) + DB Verification table (Query / Expected Return / What It Validates / Status)
- **Column guidance**: what belongs in each column, what to omit
- **Worked example**: Story 2.3's 10 sub-checks fully rewritten in new format
- **Blank template**: copy-paste skeleton for any new story

Story 3.1 writers should open this file before drafting the smoke test section and reference it from Dev Notes.

#### Validation Results

| Gate | Result |
|------|--------|
| `pnpm test` | ✅ 88/88 passing (no regressions; full Turbo cache hit) |
| `pnpm check-types` | ✅ 0 errors |
| `pnpm lint` | ✅ 0 errors (7 pre-existing env-var warnings unchanged) |
| `pnpm build` | ✅ 3/3 workspaces (FULL TURBO cache hit — no source changes) |
