---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments:
  - _bmad-output/implementation-artifacts/epic-5-retro-2026-05-10.md
workflowType: 'research'
lastStep: 1
research_type: 'technical'
research_topic: 'EN 16931 e-invoice validation architecture for packages/validation (XRechnung UBL 2.1 + ZUGFeRD CII D16B)'
research_goals: 'Decide XML parser, namespace strategy, rule encoding (declarative vs imperative), en16931-rules.ts shape, file layout, test strategy with real EN 16931 sample XML'
user_name: 'GOZE'
date: '2026-05-10'
web_research_enabled: true
source_verification: true
---

# Research Report: Technical — EN 16931 Validation Architecture

**Date:** 2026-05-10
**Author:** GOZE
**Research Type:** Technical Architecture Spike (Epic 6 P1)
**Driver:** epic-5-retro-2026-05-10.md → Preparation Tasks → P1

---

## Research Overview

This document is the architecture spike for `packages/validation`, a currently-empty stub in the RechnungsAI monorepo that must, by Epic 6 Story 6.1, validate inbound German e-invoices against EN 16931 (both supported syntaxes — XRechnung UBL 2.1, and CII D16B / ZUGFeRD / Factur-X). The spike was scheduled in `epic-5-retro-2026-05-10.md` under Preparation Tasks → P1, applying Epic 5 retro action item **A1** (wire-up spike rule for ≥4-surface stories).

The research covered six binding decisions: XML parser choice, UBL/CII namespace strategy, rule-encoding strategy, rule-file shape, package file layout, and test strategy with real EN 16931 sample XML. Each decision was anchored to a primary source (KoSIT, EN 16931 artefacts, fast-xml-parser docs, Vercel runtime guidance) and to existing precedents in the codebase (`packages/datev`, `packages/gobd`). One incoming wording — the original P1 file-layout sketch `src/{xrechnung,zugferd,rules}.ts` — was revised: ZUGFeRD is a transport (PDF/A-3 envelope), not a syntax, so the parser axis is **UBL vs CII**, with ZUGFeRD PDF extraction belonging to the separate P2 spike.

**For the headline decisions and decision matrix, see the Executive Summary directly below. Detailed reasoning is in the four body sections (Technology Stack, Integration Patterns, Architectural Patterns, Implementation Approaches).**

---

## Executive Summary

`packages/validation` will be a pure-compute TypeScript ESM package mirroring `packages/datev` in shape and zero-dep posture, exposing a single sync entry `validateEN16931(xml, opts) → ValidationReport`. Internally: one XML parser (`fast-xml-parser` v5.x with `removeNSPrefix: true`), two thin projection functions (UBL and CII) that produce a **single normalized `Invoice` model**, and a rule engine that runs ~150 rules encoded as **TS object literals with imperative `run` predicates** (hybrid encoding, not pure-declarative XPath-on-JS-objects). Rules are split by category, not by ID. Validation runs synchronously inside a Node.js-runtime Server Action at upload time; the package itself is runtime-agnostic. Tests use a vendored subset of the official **KoSIT XRechnung test suite** as a fixture corpus, with a coverage test that asserts every KoSIT 2.5.0 rule ID is implemented.

This architecture transposes the Epic 4/5 versioned-format payoff into the validation domain: new syntaxes are new `parsers/*.ts` files with zero diff to existing code, and rule-set bumps are tracked via a `ruleSetVersion` string stamped into audit logs rather than carrying multiple rule-set codebases. The decision to keep validation sync, in-process, and audit-via-single-UPDATE is a deliberate scope reduction vs DATEV's RPC-wrapped atomicity, because `validation_status` is not a GoBD legal record — it is an internal UX field. The package introduces no native bindings, no third-party API, and no new runtime cost.

**Key Technical Findings:**

- **XML parsing** — `fast-xml-parser` v5.x is the clear pick: zero deps (preserves the `packages/datev` precedent), `removeNSPrefix: true` + `preserveOrder: true` cover UBL/CII namespace handling, default-non-resolving (XXE-safe), v6 is experimental, alternatives are either unmaintained (`xmldom`) or pull in native bindings (`libxmljs2`).
- **Namespace strategy** — One normalized `Invoice` model, two thin parsers (`parsers/ubl.ts`, `parsers/cii.ts`); rules run once on the normalized model. CustomizationID determines XRechnung CIUS vs Extension vs core EN 16931.
- **Rule encoding** — Hybrid: rules are TS object literals `{ id, category, severity, citation, summary, run }`. Rule metadata is data; `run` is imperative TS. Code-list rules reduce to Set/Map lookups. Calculation rules (`BR-CO-*`) are ordinary TS arithmetic. ~30% of EN 16931 rules are arithmetic — pure-declarative XPath-on-JS-objects handles these poorly, decision driver.
- **File layout** — `parsers/{xml,detect,ubl,cii}`, `rules/{engine, en16931-core, en16931-calculations, en16931-codelists, en16931-vat, xrechnung-de, codelists/}`. ZUGFeRD is *not* a top-level file (P1 wording revised) — it's a transport handled by P2.
- **Test strategy** — Four-tier pyramid: T1 parser units, T2 rule-per-rule with `Invoice` fixtures, **T3 coverage test (KoSIT rule-ID manifest vs implementation) — the single most valuable guardrail**, T4 integration against vendored KoSIT corpus. Plus author-built negative fixtures.
- **Choreography** — Sync at upload in Node.js-runtime Server Action. Vercel itself recommends Node runtime for CPU-bound work and is not investing further in the Edge runtime. Package being sync + pure means moving to background later costs zero package changes.
- **Atomicity** — Single-statement UPDATE on `invoices` row is sufficient; no `commit_datev_export`-style RPC required. `validation_status` is internal UX, not legal record.

**Decision Matrix (one-screen reference):**

| # | Decision | Choice | Primary reason |
|---|---|---|---|
| 1 | XML parser | `fast-xml-parser` v5.x | Zero-dep, namespace handling, XXE-safe by default, datev precedent |
| 2 | Namespace strategy | One normalized `Invoice` + two projection parsers | Single rule set; future syntaxes added without rule duplication |
| 3 | Rule encoding | Hybrid (TS object + imperative `run`) | Arithmetic rules dominate; zero-dep; type-safe; audit-shape-aligned |
| 4 | Rule file shape | `Rule = { id, category, severity, citation, summary, run }` | Data-as-metadata; tree-shake-friendly; per-rule isolation |
| 5 | File layout | `parsers/{xml,detect,ubl,cii}`, `rules/{engine,…,codelists/}` | UBL/CII axis (not XRechnung/ZUGFeRD axis); category-grouped rules |
| 6 | Test strategy | 4-tier pyramid with vendored KoSIT corpus + coverage assertion | Drift becomes a failing test, not a silent gap |
| 7 | Where validation runs | Sync, Server Action, Node.js runtime | Vercel guidance; CPU-bound; sub-500ms budget for 200-line invoice; future Option B is zero-cost-to-package |
| 8 | Atomicity | Single-statement UPDATE; no RPC | `validation_status` is not GoBD-binding |
| 9 | ZUGFeRD PDF extraction | Out of scope — owned by P2 | ZUGFeRD is a transport; once extracted, content is plain CII |
| 10 | Rule-set versioning | In-place update + `ruleSetVersion` stamped to audit | Cheap forward-compat without duplicate rule-set carry-cost |

**Strategic Technical Recommendations:**

1. **Land P2 (ZUGFeRD PDF extraction), P3 (email-infra A5 decision), and P4 (Story 6.1 wire-up spike) in parallel with Story 6.1 prep.** Story 6.1 should be a thin wire-up story per Epic 5 retro A1 — this spike makes that possible.
2. **Start Story 6.1 with the 6-phase plan** in §Implementation Approaches: skeleton → UBL end-to-end (3 rules) → full UBL → CII parser → de-BR-* → caller wiring + migration. The Phase 6 caller wiring folds in Epic 6 P5 (audit allow-list extension).
3. **Vendor a pinned snapshot of `itplr-kosit/xrechnung-testsuite`** at a known release tag (~20 representative fixtures) and commit `LICENSE.kosit.md`. The T3 coverage test against KoSIT 2.5.0 manifest is the load-bearing drift detector.
4. **Pin `fast-xml-parser` to a known-good v5 minor** and stay off v6 until stable. Add an explicit security test asserting fxp's default-non-resolving behavior for XXE protection.
5. **Track Epic 6 patch-count and post-merge-fix-count vs Epic 5 Story 5.3 baseline (19 + 2)** as the headline KPI for whether the A1 spike discipline is paying off.

---

---

## Technical Research Scope Confirmation

**Research Topic:** EN 16931 e-invoice validation architecture for packages/validation (XRechnung UBL 2.1 + ZUGFeRD CII D16B)

**Research Goals:**
1. XML parser choice (`fast-xml-parser` hypothesis vs alternatives)
2. UBL 2.1 / CII D16B namespace strategy (one normalized model vs two)
3. Rule-encoding strategy (declarative JSON vs imperative TS)
4. `en16931-rules.ts` shape
5. File layout: `packages/validation/src/{xrechnung,zugferd,rules}.ts`
6. Test strategy with real EN 16931 sample XML

**Technical Research Scope:**

- Architecture Analysis — UBL 2.1 vs CII D16B parser patterns, KoSIT reference validator, packages/datev versioned-format payoff applied to validation
- Implementation Approaches — Declarative (JSON / Schematron-like) vs imperative (TS function-per-rule) rule encoding
- Technology Stack — `fast-xml-parser` vs `@xmldom/xmldom` vs `libxmljs2`; ZUGFeRD PDF/A-3 attachment extraction (P2 prep)
- Integration Patterns — Parser → normalized model → rule engine → error-report contract; XRechnung CIUS profile differences
- Performance Considerations — sync (upload) vs async (Edge Function); ~140 BR + BR-CL rule throughput

**Research Methodology:**

- Current public sources (KoSIT GitHub, EN 16931 official spec, fast-xml-parser docs, Peppol BIS docs)
- Multi-source validation for critical claims
- Confidence levels for uncertain information
- Comprehensive technical coverage with architecture-specific insights

**Scope Confirmed:** 2026-05-10

---

## Technology Stack Analysis

> Sections below are adapted from the generic technical-research template to answer the six binding decisions of P1. The package is a single TS workspace package in an existing pnpm monorepo — language/runtime/build tooling is dictated by the repo (TypeScript ESM, mirroring `packages/datev` and `packages/gobd`). Stack analysis therefore narrows to: XML parsing library, ZUGFeRD PDF extraction library, rule-encoding strategy, and namespace handling.

### XML Parser Choice

**Decision (recommended):** `fast-xml-parser` v5.x.

**Comparison:**

| Library | Last release | Deps | Bundle | DOM-style | Namespace stripping | Element-order preservation | Status |
|---|---|---|---|---|---|---|---|
| `fast-xml-parser` | 5.7.3 (2026-05-05) | 0 | 20–26 KB min | No (object) | `removeNSPrefix: true` | `preserveOrder: true` | Active, ~87k req/s in compare benchmarks |
| `@xmldom/xmldom` | last meaningful release ≥ 2 years ago | 0 | similar | Yes (DOM) | manual via `localName` | inherent to DOM | Effectively unmaintained in npm-compare review |
| `libxmljs2` | active | **native (libxml2)** — requires `node-gyp`, prebuilt binaries | larger | Yes + XPath + Schematron via XSLT | full | full | Powerful but breaks the Epic 5 "zero new native deps" precedent |
| `xml2js` | active | 2 (`sax`, `xmlbuilder`) | smaller | No | partial | partial | OK but slower; loses to fxp on perf and zero-dep |

**Why `fast-xml-parser`:**

1. **Zero deps** — matches `packages/datev` precedent ("pure compute, zero new deps", Epic 5 What-Went-Well #2). `libxmljs2` would introduce a native binding and `node-gyp` build risk in CI/Vercel — explicit non-goal.
2. **Native namespace handling for our case.** UBL 2.1 uses `cbc:`/`cac:` prefixes, CII uses `rsm:`/`ram:`/`udt:`. With `removeNSPrefix: true` parsed objects collapse to readable shapes (e.g., `cbc:ID` → `ID`). Combined with `preserveOrder: true` we keep schema-required ordering for round-trip needs (we don't need round-trip, but keeping options open).
3. **Bundle size** is irrelevant in Node (Server Action / Edge Function) but `fxparser.min.js` is 20 KB — well under any sane budget.
4. **TypeScript types** ship in package; `XMLParser` class API is stable since v4.
5. **Pure ESM build** is compatible with `packages/datev` mirror.

**Caveats / risk acknowledgments:**

- fxp is **not a validating parser against XSD**. We are not relying on schema validation in JS; we are extracting a normalized model and applying business rules in TS. Structural well-formedness is sufficient at this layer; document conformance is the rule engine's job. (The official KoSIT validator does both XSD + Schematron — we deliberately re-implement only the *business-rule* layer in TS, see "Rule-Encoding Strategy" below for boundary.)
- v6 is "experimental, released alongside v4" per CHANGELOG; **stay on v5.x** until v6 stabilizes.
- `removeNSPrefix` has had edge-case bugs historically (issue #596) — pin to a known-good v5 minor and test against the real KoSIT sample-XML corpus (test strategy below).

_Sources:_ [fast-xml-parser repo](https://github.com/NaturalIntelligence/fast-xml-parser) · [v4 XMLparseOptions](https://github.com/NaturalIntelligence/fast-xml-parser/blob/master/docs/v4/2.XMLparseOptions.md) · [npm-compare fxp vs xmldom vs xml2js](https://npm-compare.com/fast-xml-parser,xml-js,xml2js,xmldom) · [issue #134 comparison-to-xmldom](https://github.com/NaturalIntelligence/fast-xml-parser/issues/134)

### ZUGFeRD / Factur-X PDF Attachment Extraction (P2 prep)

This is **out of scope for P1** and is the subject of a separate spike (P2). Captured here only so P1 decisions don't foreclose P2:

- ZF v2 / Factur-X attachment filename is one of `zugferd-invoice.xml`, `factur-x.xml`, `xrechnung.xml`. Root element `CrossIndustryInvoice` (D16B). ZF v1 used `ZUGFeRD-invoice.xml` and root `CrossIndustryDocument` — we **intentionally do not target ZF v1** (deprecated since 2019); document this as an explicit non-goal.
- A modern, MIT/Apache TS extractor exists: [`@stackforge-eu/factur-x`](https://jsr.io/@stackforge-eu/factur-x) — extracts XML, filename, and detected profile from PDF/A-3. Returns `{ xml, filename, profile }`.
- Alternative: `pdf-lib` (already common in JS toolchains, MIT, no native deps) — read `/AF` Associated Files entry from document catalog, extract embedded stream. More code, but one less third-party dep.
- We do **not** need `pdf-parse` or any rasterizer; we only need attachment extraction, which is purely a PDF object-catalog walk.

P2 will pick between `@stackforge-eu/factur-x` (cheap, narrow) and a hand-rolled `pdf-lib` extractor (slightly more work, broader future use). Either lets the P1 architecture stay parser-agnostic: the validation entry point should accept already-extracted XML.

_Sources:_ [pdflib KB on ZUGFeRD/Factur-X](https://www.pdflib.com/pdf-knowledge-base/zugferd-and-factur-x/) · [@stackforge-eu/factur-x on JSR](https://jsr.io/@stackforge-eu/factur-x) · [Textcontrol PDF/A-3 extract notes](https://www.textcontrol.com/blog/2021/01/18/extract-zugferd-facturx-attachments-from-adobe-pdf-documents/)

### Rule-Encoding Strategy

**Decision (recommended):** **Hybrid — declarative metadata + imperative TS predicates**, with the declarative side being the primary surface and imperative blocks reserved for arithmetic/cross-field rules.

#### Background

EN 16931 + XRechnung CIUS produces **~150 rules** across categories:

- `BR-01..BR-65` — core EN 16931 business rules
- `BR-CO-*` — calculation rules (totals, VAT amounts, rounding)
- `BR-CL-*` — code-list constraints (currency, country, VAT category, unit codes)
- `BR-S-*`, `BR-Z-*`, `BR-E-*`, `BR-AE-*`, `BR-G-*`, `BR-IC-*`, `BR-IG-*`, `BR-IP-*`, `BR-O-*` — VAT category-specific rules (S=standard, Z=zero, E=exempt, AE=reverse-charge, G=export, IC=intra-community, IG/IP=Canary/territories, O=outside-scope)
- `BR-DEC-*` — decimal precision rules
- `de-BR-*` (XRechnung CIUS) — German extension rules (~50 additional)

The official artifacts are **Schematron** (XSLT 100% codebase in both `eInvoicing-EN16931` and `xrechnung-schematron` repos). Each rule is a `<sch:assert test="…">…</sch:assert>` with an XPath predicate.

#### Three options considered

**Option A — Pure declarative (JSON / Schematron-style transpile).** Transpile or hand-port each Schematron rule into a JSON entry: `{ id, severity, context: <XPath>, test: <XPath>, message }`. A JS XPath engine evaluates against the parsed XML or against the normalized model.

- Pros: 1:1 traceability with KoSIT; auditable; updates as data, not code.
- Cons: requires an XPath engine in JS (~adds dep — `xpath` npm package, native unavailable in Edge runtime); XPath against fxp's plain-object output requires an extra adapter; conditional/arithmetic rules (`BR-CO-*`) are awkward in XPath-on-JS-objects.

**Option B — Pure imperative TS function-per-rule.** Each rule is a function `(invoice: Invoice) => RuleResult`. Compose into a `runRules(invoice, rules)` engine.

- Pros: Type-safe; cross-field math is trivial; no XPath dep; easy to test; matches the Epic 5 `packages/datev` "pure compute, zero new deps" precedent.
- Cons: ~150 functions to hand-write; rule-spec drift risk vs upstream; harder to tell at a glance "do we still match KoSIT 2.5.0?".

**Option C — Hybrid (recommended).** Each rule is a TS object: `{ id, category, severity, citation, run: (invoice) => boolean | RuleViolation }`. The `run` field is imperative TS, but the rule object itself is metadata. Code-list rules (`BR-CL-*`) reduce to reusable predicates over Sets/Maps; calculation rules (`BR-CO-*`) are ordinary TS arithmetic. A small number of "structural existence" rules (e.g., BR-01 *"An Invoice shall have a Specification identifier"*) are one-liners.

- Pros: zero new deps; type-safe; rule-set is enumerable as data (good for audit reports and `validation_errors` JSON shape); KoSIT traceability via per-rule `citation: "BR-01"`/`"de-BR-04"`; matches `packages/datev`'s `mapBuSchluessel`/`extf-v700` style of "pure functions + small data tables".
- Cons: still hand-writing rules, but each is small and testable.

**Why Option C over A:** the deciding factor is the Edge runtime / zero-dep constraint and the fact that ~30% of rules are arithmetic (totals, rounding, VAT-amount cross-checks) that XPath-on-JS-objects handles poorly. We accept the upstream-drift risk and mitigate it with: (a) a `rules-coverage.test.ts` that asserts our `rules` array contains every rule ID in KoSIT 2.5.0's manifest, and (b) the test corpus from KoSIT (see "Test Strategy"). Drift becomes a failing test, not a silent gap.

**Why Option C over B:** keeping the rule object as metadata means `validation_errors` JSON in the DB can carry `{ ruleId, category, severity, citation, message }` directly without the engine "knowing" about the rule. This is the same shape KoSIT reports use, which is good for forwarding errors to a Steuerberater.

_Sources:_ [eInvoicing-EN16931 validation artefacts](https://github.com/ConnectingEurope/eInvoicing-EN16931) · [KoSIT xrechnung-schematron 2.5.0 (2026-02-05)](https://github.com/itplr-kosit/xrechnung-schematron) · [validator-configuration-xrechnung 2026-01-31](https://github.com/itplr-kosit/validator-configuration-xrechnung) · [Peppol BIS UBL EN16931 Schematron](https://peppol-docs.agid.gov.it/docs/xml/ENG/sch/peppolbis-en16931-ubl-3.0-invoice/Schematron/ENG/CEN/CEN-EN16931-UBL.html) · [ValidateFin EN 16931 guide](https://validatefin.com/en/blog/en16931-complete-guide)

### Namespace Strategy: One Normalized Model, Two Parsers

**Decision (recommended):** **One normalized internal model (`Invoice`)**; two thin parsers (`xrechnung.ts` for UBL, `zugferd.ts` for CII) project the wire-format objects onto it. Rules run only on the normalized model.

#### Background

UBL 2.1 and CII D16B express the **same EN 16931 semantic model** with different element trees and different namespaces:

- UBL — `xmlns:cbc="…/CommonBasicComponents-2"`, `xmlns:cac="…/CommonAggregateComponents-2"`. Invoice root is `<Invoice>` (or `<CreditNote>`).
- CII D16B — `xmlns:rsm="…/CrossIndustryInvoice:100"`, `xmlns:ram="…/ReusableAggregateBusinessInformationEntity:100"`, `xmlns:udt="…/UnqualifiedDataType:100"`. Invoice root is `<rsm:CrossIndustryInvoice>`.
- XRechnung **CIUS** profiles further constrain (e.g., mandatory `BT-10` Buyer reference, mandatory `BT-23` BusinessProcessTypeCode `urn:fdc:peppol.eu:2017:poacc:billing:01:1.0` or the XRechnung CustomizationID).

Two failed alternatives:

- **Two complete rule sets, one per syntax** — duplicates ~150 rules. KoSIT itself maintains separate Schematron files for UBL and CII because Schematron is XPath-bound to the syntax tree. We're rebuilding the rules layer in TS, so we can amortize: parsing collapses syntax differences, rules run once.
- **Operate directly on raw fxp output with `removeNSPrefix: true`** — tempting but fragile: UBL `cbc:ID` and CII `ram:ID` exist in different paths, so a "BR-01: invoice must have ID" rule still has two XPaths. Stripping the prefix doesn't unify the trees.

#### Recommended shape

```
Raw bytes ──► fxp parse (preserveOrder: true, removeNSPrefix: true, parseAttributeValue: false)
                │
                ├──► detectProfile(rawObj) ──► "ubl" | "cii"
                │
                ├──► (ubl)  projectFromUbl(rawObj) ──► Invoice
                ├──► (cii)  projectFromCii(rawObj) ──► Invoice
                │
                ▼
            Invoice (normalized) ──► runRules(invoice, en16931Rules) ──► ValidationReport
```

**Profile detection** uses `CustomizationID` (UBL: `<cbc:CustomizationID>`; CII: `<ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>`). This is the same field KoSIT's `scenarios.xml` matches on. Known values include `urn:cen.eu:en16931:2017` (pure EN 16931 UBL), `urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0` (XRechnung 3.0 CIUS), and the CII counterparts.

**Element ordering** is enforced by UBL/CII XSDs (`xs:sequence`) but we don't validate XSD in JS; we trust the upstream sender's tooling. If projection fails (a required EN 16931 BT/BG is missing), the projection function emits a `STRUCT-MISSING` violation that the rule engine treats as a hard fail — equivalent to a Schematron pre-condition failure.

**Why this is right for us:**

- Story 6.2 wants to display *"Invoice X has rule violations Y, Z"* in German. The report is per-rule, not per-syntax. The user shouldn't see UBL vs CII at all.
- `audit_logs.event_type = 'validation_failed'` (planned per Epic 6 P5) carries one consistent shape regardless of input syntax.
- Future PEPPOL BIS / NLCIUS support is one new `projectFromXxx` and a CustomizationID branch — no rule duplication.

_Sources:_ [E-Rechn.de — XRechnung Factur-X UBL formats](https://e-rechn.de/en/blog/e-invoice-formats-xrechnung-facturx-ubl) · [Invoice-Converter CII reference](https://www.invoice-converter.com/en/resources/compliance/cii-cross-industry-invoice) · [phax/en16931-cii2ubl converter (CII↔UBL semantic mapping reference)](https://github.com/phax/en16931-cii2ubl) · [InvoiceNavigator EN 16931 validator](https://www.invoicenavigator.eu/validator)

### Database & Storage Implications

`packages/validation` is **pure compute** — no DB calls. Persistence is the caller's job (Story 6.1 wires Server Action → DB). For completeness:

- `invoices.validation_status` — `enum('pending','valid','invalid','warning','error')` or text + check constraint.
- `invoices.validation_errors` — `jsonb` array of `{ ruleId, category, severity, citation, message, location?: { bt: string, bg?: string } }`.
- `audit_logs.event_type` — extend allow-list with `validation_failed`, `validation_passed` (per epic-5 retro Epic 6 P5).
- No new table needed in Story 6.1; if we later persist *runs* (re-validation history) that's a Story 6.x decision, not P1.

### Test & Build Tooling

Inherited from monorepo, no new choices: Vitest (mirrors `packages/datev` test layout), tsup or `tsc --build` ESM output, pnpm workspace, ESLint shared config. **No new build dependency added by this package.**

### Technology Adoption Trends

- KoSIT releases **monthly cadence** — last validator-configuration release 2026-01-31, schematron 2.5.0 on 2026-02-05. Our rule set will lag upstream by weeks, not months; we should pin to a KoSIT version and bump quarterly.
- v6 of `fast-xml-parser` is in alongside-v4-experimental status (per CHANGELOG); v5.7.x is the current stable line.
- ZUGFeRD v2.x / Factur-X is the live target; ZF v1 explicitly excluded.

_Sources:_ [KoSIT validator-configuration releases](https://github.com/itplr-kosit/validator-configuration-xrechnung/releases) · [xrechnung-schematron releases](https://github.com/itplr-kosit/xrechnung-schematron/releases) · [fast-xml-parser CHANGELOG](https://github.com/NaturalIntelligence/fast-xml-parser/blob/master/CHANGELOG.md)

## Integration Patterns Analysis

> The generic API/protocol/microservice template doesn't fit a pure-compute TS package. The real integration questions for `packages/validation` are: (1) the parser → rule-engine contract inside the package, (2) the package → caller (Server Action) contract, (3) the error-report shape used by Story 6.2 UI and `audit_logs`, (4) where validation runs (sync at upload, on-demand, async background), and (5) how the package interoperates with Epic 6 P5 audit allow-list and the `invoices` table.

### Package Public API (Caller Contract)

`packages/validation` exposes one entry point and one supporting helper:

```ts
// packages/validation/src/index.ts
export function validateEN16931(
  xml: string,
  opts?: { profile?: 'auto' | 'ubl' | 'cii'; ruleSet?: 'core' | 'xrechnung' }
): ValidationReport;

export function detectProfile(xml: string): 'ubl' | 'cii' | 'unknown';

export type ValidationReport = {
  status: 'valid' | 'invalid' | 'warning';
  profile: 'ubl' | 'cii';
  customizationId: string;            // e.g. "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0"
  ruleSetVersion: string;             // e.g. "kosit-2.5.0"
  durationMs: number;
  violations: ValidationViolation[];
};

export type ValidationViolation = {
  ruleId: string;                     // "BR-01" | "BR-CO-10" | "de-BR-04" | …
  category: 'BR' | 'BR-CO' | 'BR-CL' | 'BR-S' | 'BR-DEC' | 'de-BR' | 'STRUCT';
  severity: 'fatal' | 'error' | 'warning';
  citation: string;                   // human reference, e.g. "EN 16931 §6.6 BR-01"
  message: string;                    // German, end-user-facing
  location?: { bt?: string; bg?: string; xpath?: string };
};
```

**Design rules:**

- **Pure compute, sync, no I/O.** Mirrors `packages/datev`'s `buildExtfV700`. The caller owns DB writes, logging, and audit emission. The package never imports `@supabase/*` or anything else from the workspace.
- **Sync (not async) signature** — the work is CPU-only; making it async would be a lie about the cost shape and force `await` ceremony at every call site for no concurrency benefit.
- **`ruleSet` opt-in.** `'core'` runs only `BR-*` + `BR-CO-*` + `BR-CL-*` + `BR-S-*` + `BR-DEC-*`. `'xrechnung'` adds `de-BR-*`. Default for Story 6.1 is `'xrechnung'` (we are a German app); the option exists so future tenants doing pure EN 16931 / Peppol can switch.
- **`customizationId` returned even on `'unknown'` profile** so the UI can show "we couldn't recognize this format" with the actual identifier we saw.
- **No Promise or stream.** Rules are O(rules × invoice-lines); a 200-line invoice runs all ~150 rules in low-millisecond range. We are not the bottleneck.

### Internal Contract: Parser → Rule Engine

Three internal surfaces, each pure:

```
┌─────────────────────────┐    ┌──────────────────────────┐    ┌────────────────────────┐
│  parsers/xml.ts         │    │  parsers/{ubl,cii}.ts    │    │  rules/engine.ts       │
│  parseXml(xml) → RawObj │ →  │  projectFromUbl(RawObj)  │ →  │  runRules(invoice,     │
│  fxp-wrapped, no logic  │    │  projectFromCii(RawObj)  │    │           ruleSet)     │
│                         │    │      → Invoice           │    │      → Violation[]     │
└─────────────────────────┘    └──────────────────────────┘    └────────────────────────┘
```

**`Invoice` (normalized model):** captures the EN 16931 BG/BT structure (~20 BGs, ~150 BTs). Examples:

```ts
type Invoice = {
  // BT-1 Invoice number, BT-2 Issue date, BT-3 Type code, etc.
  invoiceNumber: string; issueDate: string /*ISO*/; typeCode: string;
  customizationId: string; profileId?: string;
  buyerReference?: string;                                  // BT-10 (de-BR mandatory)
  seller: Party;       // BG-4
  buyer: Party;        // BG-7
  payeeName?: string;  // BG-10
  taxRepresentative?: Party; // BG-11
  delivery?: Delivery; // BG-13
  paymentInstructions?: PaymentInstructions; // BG-16
  documentLevelAllowances: AllowanceCharge[]; // BG-20
  documentLevelCharges:    AllowanceCharge[]; // BG-21
  documentTotals: DocumentTotals; // BG-22
  vatBreakdown: VatBreakdownLine[]; // BG-23
  invoiceLines: InvoiceLine[]; // BG-25
  // …
};
```

**Why this contract:**

- **Type safety vs raw XML walking.** Rules see `invoice.documentTotals.taxExclusiveAmount` instead of `raw['Invoice']['cbc:LegalMonetaryTotal']?.[0]?.['cbc:TaxExclusiveAmount']?.[0]?.value`. The fxp output is messy; we pay the cost of projection once.
- **Single rule set.** A rule like `BR-CO-13: Sum of line net amounts equals taxExclusiveAmount` is one TS function over `Invoice`, not two against UBL and CII trees.
- **Projection failure is itself a violation.** If `BT-1` is missing, projection emits `STRUCT-BT-1-MISSING` (severity `fatal`) and the rule engine still runs over the partial model — we report what we can in one pass. (KoSIT's two-phase XSD-then-Schematron stops on schema fail; we choose to keep going for better UX in the correction-email loop of Story 6.2.)

### Where Validation Runs (Choreography)

This is one of the P1 deliverables. Three options:

| Option | Where it runs | Pro | Con | Verdict |
|---|---|---|---|---|
| **A** Sync inside Server Action on upload | Node.js runtime Server Action | Result immediately visible; no race; matches `prepareDatevExport` pattern | Server Action latency = parse + project + ~150 rules; OK for typical invoices, risky for 1000-line invoices | **Recommended for Story 6.1** |
| **B** Async via Edge Function / job queue | Vercel Edge Function or DB-row job | Server Action returns fast; UI shows "validating…" | Edge Runtime has 1–4 MB code limit incl. fonts/imports — fxp is small but rule code grows; Vercel is **not investing further in Edge runtime**; needs job table, polling/realtime UI | Not for 6.1; reconsider only if perf requires |
| **C** On-demand from a button | Server Action triggered by user | Simplest to ship; no auto-flow | Hides latency from upload UX; doesn't match user expectation of "I uploaded, did it pass?" | Reject |

**Recommended for Story 6.1: Option A on the Node.js runtime.** Matches what Vercel itself recommends for CPU-bound Server Actions: *"Serverless (Node.js runtime) is ideal if you need a scalable solution that can handle more complex computational loads than the Edge Runtime."* Performance budget: 200-line invoice should be well under 100 ms; we'll measure during Story 6.1 with the KoSIT corpus and document. If a tenant ever uploads a 10k-line invoice and the Server Action exceeds Vercel's 60s function limit, we revisit Option B — but we don't pre-build for that case.

**Important:** the package is sync and pure — switching from A to B later requires zero changes to `packages/validation`, only to the caller. This is the same elasticity `packages/datev` gave us.

_Sources:_ [Next.js Edge Runtime API Ref](https://nextjs.org/docs/app/api-reference/edge) · [Next.js Edge vs Node runtime guide](https://nextjs.org/docs/14/app/building-your-application/rendering/edge-and-nodejs-runtimes) · [Vercel Edge Runtime docs](https://vercel.com/docs/functions/runtimes/edge) · [Vercel direction: not investing further in Edge runtime](https://github.com/vercel/next.js/discussions/69486)

### Profile Detection & Routing

`detectProfile(xml)` does a cheap pre-parse using fxp's tag-only mode (or a regex on the root element) to pick UBL vs CII before full parsing:

- Root `<Invoice>` (any prefix) with UBL namespace → `'ubl'`
- Root `<CrossIndustryInvoice>` (any prefix) with `urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100` → `'cii'`
- Root `<CreditNote>` UBL → `'ubl'` (we treat credit notes as a doc-type variant of `Invoice`, not a separate normalized model — BT-3 InvoiceTypeCode handles it)
- Otherwise `'unknown'` and `validateEN16931` returns one synthetic `STRUCT-PROFILE-UNKNOWN` violation.

CustomizationID is parsed *after* full projection, not at detection — detection is structural; profile compliance is rule-driven (`BR-01: Specification identifier shall exist`, `de-BR-01: must be one of the recognized XRechnung CIUS IDs`).

### Caller Wiring (Story 6.1 — informative, not part of P1)

```ts
// apps/web/app/api/invoices/[id]/validate/route.ts (sketch)
const xml = await loadInvoiceXml(invoiceId);                // existing helper
const report = validateEN16931(xml, { ruleSet: 'xrechnung' });

// 1) Persist on the invoice row (single UPDATE)
await supabase.from('invoices').update({
  validation_status: report.status,
  validation_errors: report.violations,    // jsonb
  validated_at: new Date().toISOString(),
  validation_rule_set_version: report.ruleSetVersion,
}).eq('id', invoiceId);

// 2) Audit (Epic 6 P5 — extend allow-list)
await emitAuditLog({
  event_type: report.status === 'valid' ? 'validation_passed' : 'validation_failed',
  invoice_id: invoiceId,
  metadata: { profile: report.profile, customizationId: report.customizationId,
              violationCount: report.violations.length, ruleSetVersion: report.ruleSetVersion },
});
```

Atomicity question (Epic 5 retro Insight #1): the UPDATE is single-statement so atomic by default; the audit emission is a separate write. If the audit emit fails, the validation result still landed — acceptable, because `validation_status` itself is the source of truth and audit is a secondary log. This is **different from** the DATEV case (where status flip and audit had to be one transaction because `status: 'exported'` was the legal record). Here, `validation_status` is not legally binding under GoBD; it's an internal UX field. Single-statement update is sufficient. If we later want stronger guarantees, we wrap in a SQL function — same pattern as `commit_datev_export` — but **not for 6.1**.

### Error-Report Shape: Why It Matches `audit_logs.metadata` JSON

The `ValidationViolation` shape was designed to drop straight into:

- `invoices.validation_errors` (jsonb array) — Story 6.2 UI reads this directly: per-row `{ ruleId, severity, message, location.bt }`.
- The correction email body (Story 6.2) — group-by `category`, render bullet list with citations. Either via real email infra (decision A5 → P3) or `mailto:` shim.
- `audit_logs.metadata.violations` summary — only counts and rule IDs, not full messages, to keep audit rows small.

This is the same trick `packages/datev` used: emit data in a shape that's already what consumers want to store, no transformation layer. Epic 5 retro What-Went-Well #6 (`mapBuSchluessel` reuse) — same principle.

### Rule-Set Versioning (KoSIT Drift)

`ValidationReport.ruleSetVersion: 'kosit-2.5.0'` is a string baked into the build. When we bump to a new KoSIT release we change the string. `audit_logs.metadata.ruleSetVersion` lets a future audit say *"this invoice was validated against rule set 2.5.0 — the rule set has since moved to 2.6.0; re-validation may yield different results."* Cheap forward-compatibility for compliance reviews.

### Out of Scope for Integration Patterns

The generic template's REST/GraphQL/gRPC/webhooks/AMQP/MQTT/OAuth/JWT/mTLS sections do not apply: this package is in-process. Auth, transport security, rate limiting are the Server Action's concerns and inherit from existing app middleware (RLS at DB, cookie-based session).

## Architectural Patterns and Design

> Generic architecture-pattern catalogs (SOLID, Clean, Hexagonal, Microservices) are not the architectural questions in front of us. The architectural questions for `packages/validation` are: package file layout (P1 Goal 5), rule file shape (P1 Goal 4), versioned-format pattern transposition from `packages/datev`, modularity for future syntaxes. This section answers those.

### Recommended File Layout

```
packages/validation/
├── package.json                    # name "@rechnungsai/validation", type "module"
├── tsconfig.json                   # extends repo base
├── README.md                       # 1-page: purpose, public API, ruleSetVersion policy
└── src/
    ├── index.ts                    # public exports: validateEN16931, detectProfile, types
    ├── types.ts                    # ValidationReport, ValidationViolation, Invoice, Party, …
    │
    ├── parsers/
    │   ├── xml.ts                  # parseXml(xml) → RawObj — fxp wrapper, no logic
    │   ├── detect.ts               # detectProfile(xml) → 'ubl' | 'cii' | 'unknown'
    │   ├── ubl.ts                  # projectFromUbl(RawObj) → Invoice
    │   └── cii.ts                  # projectFromCii(RawObj) → Invoice
    │
    ├── rules/
    │   ├── engine.ts               # runRules(invoice, ruleSet) → Violation[]
    │   ├── en16931-core.ts         # BR-01..BR-65 + BR-DEC-* (core CEN rules)
    │   ├── en16931-calculations.ts # BR-CO-* (totals, rounding, VAT-amount cross-checks)
    │   ├── en16931-codelists.ts    # BR-CL-* (currency, country, VAT cat, unit codes)
    │   ├── en16931-vat.ts          # BR-S/Z/E/AE/G/IC/IG/IP/O-* (VAT category-specific)
    │   ├── xrechnung-de.ts         # de-BR-* (XRechnung CIUS German extension)
    │   └── codelists/
    │       ├── iso4217-currency.ts # static Set<string>, ISO 4217 alphabetic codes
    │       ├── iso3166-country.ts  # static Set<string>
    │       ├── unece-rec20-units.ts# static Set<string>, UN/ECE Rec. 20 + Rec. 21
    │       └── vat-categories.ts   # 'S'|'Z'|'E'|'AE'|'G'|'IC'|'IG'|'IP'|'O'|'K'|'L'|'M'
    │
    └── __tests__/
        ├── parse.ubl.test.ts
        ├── parse.cii.test.ts
        ├── rules.coverage.test.ts  # asserts: every KoSIT 2.5.0 rule ID is implemented
        ├── rules.engine.test.ts
        ├── rules.en16931-core.test.ts
        ├── rules.en16931-calculations.test.ts
        ├── rules.en16931-codelists.test.ts
        ├── rules.xrechnung-de.test.ts
        ├── integration.kosit-corpus.test.ts  # runs against KoSIT sample-XML corpus
        └── fixtures/
            ├── kosit-corpus/        # sample XMLs, license-acknowledged copies
            ├── synthetic-ubl/       # hand-crafted edge cases (one per rule)
            └── synthetic-cii/
```

**Rationale (decisions, not theater):**

- **`parsers/` flat, two files per syntax.** Mirrors the `packages/datev/src/formats/extf-v700.ts` pattern: one file per format, additive on new ones. Adding NLCIUS or PEPPOL BIS later = new `projectFromXxx.ts`, no diff to existing.
- **Rules split by category, not by individual rule.** A file-per-rule structure (`br-01.ts`, `br-02.ts`, …) was considered and **rejected**: 150 files, churn for trivial diffs, and category-level tests stop being co-located. Category-level files keep ~10–30 rules each, related logic adjacent.
- **`codelists/` is data, not code.** Each is `export const SET = new Set([...])`. Updating ISO 4217 = swap one file. We never write business logic in this folder.
- **`rules.coverage.test.ts` is the linchpin.** It enumerates KoSIT 2.5.0 rule IDs (committed as a JSON manifest in `fixtures/kosit-corpus/manifest.json`) and asserts every ID is present in our `rules` array. Drift becomes a failing test.
- **No `xrechnung.ts`, `zugferd.ts` at top level.** The original P1 wording proposed `src/{xrechnung,zugferd,rules}.ts` — we explicitly **revise that decomposition**. ZUGFeRD is *not a syntax* — it's a *transport* (PDF/A-3 envelope around CII). Once you extract the embedded XML, the inside is CII, indistinguishable from a bare CII file. So the parser axis is **UBL vs CII**, not **XRechnung vs ZUGFeRD vs others**. ZUGFeRD extraction belongs in P2 spike and likely lands as a separate `packages/zugferd-extract` (or a small helper in this package's `parsers/zugferd-pdf.ts` once P2 decides).
- **`rules/engine.ts` is the only file with control flow.** Everything else is data tables and predicates. This is the key payoff of the hybrid encoding strategy.

### Rule File Shape (P1 Goal 4)

A rule is a TS object literal. The category file is just an array of these:

```ts
// packages/validation/src/rules/en16931-core.ts
import type { Rule } from './engine';

export const en16931CoreRules: readonly Rule[] = [
  {
    id: 'BR-01',
    category: 'BR',
    severity: 'fatal',
    citation: 'EN 16931:2017 §6.6 BR-01',
    summary: 'An Invoice shall have a Specification identifier (BT-24)',
    run: (inv) =>
      inv.customizationId
        ? null
        : { location: { bt: 'BT-24' }, message: 'Pflichtfeld BT-24 (Spezifikationskennung) fehlt.' },
  },
  {
    id: 'BR-02',
    category: 'BR',
    severity: 'fatal',
    citation: 'EN 16931:2017 §6.6 BR-02',
    summary: 'An Invoice shall have an Invoice number (BT-1)',
    run: (inv) =>
      inv.invoiceNumber
        ? null
        : { location: { bt: 'BT-1' }, message: 'Pflichtfeld BT-1 (Rechnungsnummer) fehlt.' },
  },
  // … BR-03 through BR-65
];
```

```ts
// packages/validation/src/rules/engine.ts
export type RuleResult = null | { location?: Location; message: string; messageParams?: Record<string, unknown> };
export type Rule = {
  id: string;
  category: ViolationCategory;
  severity: Severity;
  citation: string;
  summary: string;            // English, developer-facing — not shown to end users
  run: (invoice: Invoice) => RuleResult;
};

export function runRules(
  invoice: Invoice,
  ruleSet: 'core' | 'xrechnung'
): ValidationViolation[] {
  const rules: readonly Rule[] = ruleSet === 'xrechnung' ? ALL_RULES : CORE_ONLY;
  const violations: ValidationViolation[] = [];
  for (const rule of rules) {
    const r = rule.run(invoice);
    if (r) {
      violations.push({
        ruleId: rule.id, category: rule.category, severity: rule.severity,
        citation: rule.citation, message: r.message, location: r.location,
      });
    }
  }
  return violations;
}
```

**Why this shape:**

- **`run` returns `null | RuleResult`, not `boolean`.** The reason: when a rule fails, we already have the contextual data needed to build a useful message ("expected sum = 100.00, got 99.99"). Forcing the message to live separately in a string table forces a second pass and loses context. By returning the `RuleResult` directly, each rule is self-contained.
- **German `message`, English `summary`.** End users see `message`. Developers reading the rules file see `summary`. We never i18n end-user messages from English — we write them in German once. (If we ever serve non-DE tenants, the `messageParams` field allows decoupling.)
- **`run` is pure and side-effect-free.** Easy unit testing: feed an `Invoice`, assert `null` or assert the violation shape.
- **Rules are `readonly` arrays.** Frozen at module init. The `runRules` function never mutates them.
- **Tree-shake-friendly.** Importing only `en16931CoreRules` excludes the German extension at bundle level if a future caller wants pure EN 16931. (Server-side this doesn't matter, but it's good hygiene.)

### Versioned-Format Pattern: Transposed from `packages/datev`

Epic 4 retro recommendation that Epic 5 realized: `formats/extf-v700.ts` as a single file, future `extf-v710.ts` lands as a new file with zero diff to existing code. `packages/validation` applies the same idea on **two axes**:

- **Syntax axis** — `parsers/ubl.ts`, `parsers/cii.ts`. Adding EDIFACT later = `parsers/edifact.ts`. Existing files untouched.
- **Rule-set version axis** — currently `KoSIT 2.5.0`. When KoSIT 2.6.0 ships, two options:
  1. **In-place update** — mutate the rule files. Cheap, but loses traceability for already-validated invoices.
  2. **Versioned rule modules** — `rules/v2_5_0/`, `rules/v2_6_0/`. Heavyweight, only justified if we ever need to re-validate an old invoice "as it was scored at the time."

Recommendation for now: **option 1, in-place update, with `ruleSetVersion` stamped into `audit_logs` and `invoices.validation_rule_set_version`**. We get traceability via the audit trail without the cost of carrying duplicate rule sets in code. Reconsider option 2 only if a real-world compliance review demands time-travel re-validation.

### Modularity & Coupling Boundaries

Hard rules for the package:

- **No imports from `apps/web`.** Verified by ESLint config (already enforced for `packages/datev`).
- **No imports from `@supabase/*`, `next/*`, `react/*`.** Pure compute, runtime-agnostic. Could run in a Web Worker, an Edge Function (if we later need it), or a CLI.
- **One dep:** `fast-xml-parser`. No other runtime dep. Dev-only: `vitest`, `tsup`/`tsc`.
- **No re-export of fxp.** Callers don't see fxp — they see `validateEN16931(xml)`. Prevents fxp version skew across the monorepo.

This is exactly the boundary `packages/datev` and `packages/gobd` enforce. No new pattern, just continuity.

### Performance & Scalability Notes

- Parsing dominates the budget (90%+) for typical invoices; rule evaluation is cheap (predicate per rule, ~150 predicates, each O(1) or O(lineItems)).
- Worst case: a 10,000-line invoice. fxp parses linearly; projection and rules scale linearly with line count. Estimated <500 ms even at that size on a Vercel Node runtime instance — well inside Server Action budgets. Will be measured during 6.1 implementation.
- No streaming parser needed — invoices fit in memory by definition (tens to hundreds of KB; pathological max measured in MB, not GB).
- No caching layer needed — every invoice is validated once at upload (or on-demand re-trigger). Cache hit rate would be ~0.

### Security Considerations

- **XML External Entity (XXE) attacks.** fast-xml-parser does **not resolve external entities** by default — it's a non-validating, non-resolving parser. We get XXE protection for free. Confirm in v5.x docs and pin to a known-safe minor.
- **Billion-laughs / quadratic blowup.** fxp's tokenizer doesn't expand entities recursively, so the classic billion-laughs attack vector is closed. Quadratic-blowup style attacks (deeply nested elements) are bounded by Node's stack — we add an input size check (e.g., reject XML > 10 MB) at the route handler, not the package, since size limits are policy not protocol.
- **PII in violation messages.** Don't echo raw XML content into messages. Reference BT/BG IDs only. (E.g., not `"Buyer name 'Max Müller' invalid"` — instead `"BT-44 (Käufername) ungültig"`.)
- **Audit log size.** `audit_logs.metadata.violations` should carry rule IDs + counts, not full message strings, to keep audit rows from bloating with German prose.

These are the only architectural-level security concerns specific to validation; all else (auth, RLS, CSRF) is the caller's responsibility.

### Open Architectural Questions (deferred to story prep, not P1)

1. **Where does the XML come from?** Story 6.1 may store the original XML on `invoices.original_xml` (text or storage URL) or read it from the upload pipeline. Decision belongs to 6.1's wire-up spike (P4).
2. **Re-validation triggers.** Should `validation_status` be re-computed when a rule set bumps? Or only on explicit user action? Probably the latter, but capture the question.
3. **PDF preview vs XML preview in Story 6.2 UI.** Out of scope for P1; ZUGFeRD's PDF half is the ZUGFeRD spike's (P2) concern.

## Implementation Approaches and Technology Adoption

> Generic adoption-strategy / DevOps maturity content does not apply (this is a single TS package shipped through an existing CI). This section delivers the remaining P1 commitment — **test strategy with real EN 16931 sample XML (P1 Goal 6)** — plus a concrete implementation roadmap for Story 6.1.

### Test Strategy with Real EN 16931 Sample XML (P1 Goal 6)

The deciding asset is the official **KoSIT XRechnung test suite** ([`itplr-kosit/xrechnung-testsuite`](https://github.com/itplr-kosit/xrechnung-testsuite)). It ships anonymised real-world invoices, organised as:

- `src/test/business-cases/standard/` — positive examples that conform to XRechnung CIUS (e.g., `01.01a-INVOICE_ubl.xml`, `01.09a-INVOICE_uncefact.xml`, both UBL and UN/CEFACT/CII).
- `src/test/business-cases/extension/` — examples using the XRechnung Extension.
- `src/test/technical-cases/` — instances designed to cover technical aspects (edge cases, optional fields, character handling, etc.).

This is the same corpus the KoSIT validator itself is regression-tested against. Using it as our fixture set makes "we match KoSIT 2.5.0" a verifiable claim.

#### Four-tier test pyramid

| Tier | Scope | Fixtures | Goal |
|---|---|---|---|
| **T1 Unit — parsers** | `parsers/{xml,detect,ubl,cii}.ts` | Hand-crafted minimal UBL/CII snippets per BG (business group) | Every projection path covered; profile detection branches enumerated |
| **T2 Unit — rules** | Each rule in `rules/*.ts` | Hand-crafted minimal `Invoice` objects (NOT XML) — one passing + one failing per rule | Each of ~150 rules has at least 2 cases; mutation-style negative for arithmetic rules |
| **T3 Coverage** | `__tests__/rules.coverage.test.ts` | `fixtures/kosit-corpus/manifest.json` (rule-ID list lifted from KoSIT 2.5.0 release) | Asserts every upstream rule ID is implemented in our `rules` array; new KoSIT release → bump manifest → failing tests surface gaps |
| **T4 Integration — KoSIT corpus** | `__tests__/integration.kosit-corpus.test.ts` | Sampled subset of `business-cases/standard` + `business-cases/extension` + `technical-cases` | Each fixture passes (status `valid`) end-to-end through `validateEN16931`. Cherry-pick a handful of crafted-negative fixtures to assert specific rule failures fire |

**License & licensing notes for fixtures:**

- The KoSIT test suite is published under the same terms as KoSIT artifacts (Apache 2.0 / Federal Republic of Germany open data). Vendoring a snapshot into our `__tests__/fixtures/kosit-corpus/` is permitted with attribution; add a `LICENSE.kosit.md` next to the fixtures.
- Pin to a specific KoSIT release tag (e.g., `xrechnung-testsuite-2.4.0`); document the version in `fixtures/kosit-corpus/VERSION` so drift is visible.
- Don't vendor the whole 100+ MB corpus — select ~20 representative fixtures (5 standard UBL, 5 standard CII, 5 extension, 5 technical). Full corpus run is a one-off validation step we do manually when bumping rule-set version.

**Negative fixtures (we author):**

- `fixtures/synthetic-ubl/` — one file per "must fail X rule" assertion: an invoice missing BT-1, an invoice with wrong calculation, an invoice with invalid currency code, etc. Hand-crafted to be minimal.
- Same for CII.
- These prove "we *catch* what we claim" — the corpus proves "we don't *false-positive* on real data". Together they pin down the rule layer.

#### Test execution policy

- **`pnpm --filter @rechnungsai/validation test`** runs T1+T2+T3+T4 locally and in CI. Total runtime budget: <30s.
- The T3 coverage test is the **single most valuable guardrail**: it's how we catch silent drift when KoSIT publishes a new release (e.g., a new `de-BR-26` we haven't implemented).
- T4 KoSIT-corpus tests are tagged `integration` and can be run separately; they require the fixtures to be present (a small build step or a committed snapshot).
- No browser-based test in this package — it is server-side compute. UI smoke testing belongs to Story 6.2.

#### Test naming convention

`describe('BR-CO-13: Sum of line net amounts equals taxExclusiveAmount', …)` — the test description carries the rule ID so failures in CI immediately point to the spec.

_Sources:_ [KoSIT xrechnung-testsuite repo](https://github.com/itplr-kosit/xrechnung-testsuite) · [Sample UBL test instance `01.01a`](https://github.com/itplr-kosit/xrechnung-testsuite/blob/master/src/test/business-cases/standard/01.01a-INVOICE_ubl.xml) · [Sample CII (UN/CEFACT) test instance `01.09a`](https://github.com/itplr-kosit/xrechnung-testsuite/blob/master/src/test/business-cases/standard/01.09a-INVOICE_uncefact.xml) · [testsuite development docs](https://github.com/itplr-kosit/xrechnung-testsuite/blob/master/doc/development.md)

### Implementation Roadmap (Story 6.1 sequencing)

This roadmap is informative — Story 6.1 is the place to expand it into a story file. P1's job is to make 6.1 a thin wire-up story, not a research story.

**Phase 0 — Prep (alongside P2, P3, P4 spikes):**
1. Vendor KoSIT testsuite snapshot — pin version, write `LICENSE.kosit.md`.
2. Lift rule-ID manifest from `xrechnung-schematron 2.5.0` (XSLT files, parse `<sch:assert id="…">`).

**Phase 1 — Skeleton (Story 6.1 first half):**
1. `packages/validation/package.json`, `tsconfig.json`, `vitest.config.ts` — mirror `packages/datev` line-by-line.
2. `types.ts` — `Invoice`, `Party`, `DocumentTotals`, `VatBreakdownLine`, `InvoiceLine`, `ValidationReport`, `ValidationViolation`. Type-only file.
3. `parsers/xml.ts` — fxp wrapper, single function. T1 tests cover XML edge cases (empty, malformed, BOM, encoding declaration).
4. `parsers/detect.ts` — profile detection. T1 tests for UBL root, CII root, unknown, edge cases (root in default namespace, root with prefix).

**Phase 2 — One parser end-to-end (UBL first):**
1. `parsers/ubl.ts` — minimal projection: BT-1, BT-2, BT-24, BG-4 (Seller). T1 unit tests.
2. `rules/engine.ts` + `rules/en16931-core.ts` with BR-01, BR-02, BR-24 only.
3. `index.ts` — `validateEN16931` ties parser + engine.
4. T2 unit tests for each rule with `Invoice` fixtures.
5. T4 integration: one KoSIT UBL fixture parses and validates `valid`.

**Phase 3 — Expand projection breadth (UBL):**
1. Complete UBL projection for all required BGs/BTs.
2. Implement BR-03 through BR-65.
3. Implement BR-CO-* (calculations) — this is where most of the work is.
4. Implement BR-CL-* + import codelists.
5. T3 coverage test passes for `'core'` ruleSet.

**Phase 4 — CII parser:**
1. `parsers/cii.ts` — mirror UBL projection against CII tree.
2. T4 integration: KoSIT CII fixtures validate `valid`.

**Phase 5 — XRechnung German extension:**
1. `rules/xrechnung-de.ts` — implement de-BR-* (~50 rules).
2. T3 coverage test passes for `'xrechnung'` ruleSet.
3. T4 integration: KoSIT extension fixtures pass.

**Phase 6 — Caller wiring (still Story 6.1 if scope holds):**
1. Migration: `invoices.validation_status`, `invoices.validation_errors jsonb`, `invoices.validated_at`, `invoices.validation_rule_set_version`. Add `validation_passed`/`validation_failed` to `audit_logs_event_type_chk` (the Epic 6 P5 task — fold in here).
2. Server Action `validateInvoice(invoiceId)` — load XML, call `validateEN16931`, persist, audit.
3. Mark Story 6.1 done.

**Out of Phase 6, deferred to 6.2:** ZUGFeRD PDF extraction (P2's output) and UI presentation.

### Risk Assessment and Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Rule set drift vs KoSIT | High over time | Medium (silent gaps) | T3 coverage test + quarterly KoSIT bump |
| Misimplementation of BR-CO-* arithmetic (rounding, half-up vs half-even) | Medium | High (false positives on legitimate invoices) | T4 corpus run on real fixtures; rounding-mode unit test referencing EN 16931 §6.7 |
| fxp `removeNSPrefix` edge case | Low | Medium | Pin minor version; T1 tests with realistic namespace cocktail |
| Validation latency exceeds Server Action budget | Low | Medium | Measure during Phase 2; fall-back path to Option B (background validation) is design-ready |
| XXE / XML attack surface | Low (fxp default-safe) | High if regressed | Lock fxp version; add explicit security test asserting fxp default-non-resolving behavior |
| GDPR — raw XML may contain PII (buyer name, address) | Medium | High | Audit log carries IDs only, not full violation message text; if `invoices.original_xml` stores raw XML, scrub on user deletion (Epic 5 retro A4) |
| Rule count larger than estimated (KoSIT 2.5.0 may exceed 150) | Medium | Low (more work, not blocker) | Phase 3/5 are explicitly time-bounded by rule count; story 6.1 may need to split if real count > 180 |

### Skill / Knowledge Requirements

- Working familiarity with **EN 16931 BT/BG semantic model** — invest 1–2 hours reading the [EN 16931 ValidateFin guide](https://validatefin.com/en/blog/en16931-complete-guide) and skimming an existing Schematron file before writing rules. The semantic model (BT-1 InvoiceNumber, BG-4 Seller, etc.) is the only conceptual barrier to entry; once internalised, rule coding is mechanical.
- TS, Vitest, pnpm workspace — standard repo skills, no gap.
- Schematron is **not** required reading at the implementation level (we don't run XSLT in production); the Schematron files are reference documentation for what each rule means.

### Cost & Operational Notes

- **Zero runtime cost added.** Validation runs on existing Vercel Node.js Server Action infra.
- **Zero new external service.** No third-party validator API.
- **Build cost:** one new workspace package; `pnpm install` adds `fast-xml-parser` (~26 KB) to the lockfile. Negligible.
- **Operational monitoring:** `audit_logs.event_type IN ('validation_failed','validation_passed')` is the dashboard signal. No new Sentry rules required for Story 6.1; if validation latency p95 climbs, log `report.durationMs` to enable an alert later.

### Success Metrics and KPIs (for Story 6.1)

- T3 coverage test green at merge time (every KoSIT 2.5.0 rule ID has an implementation).
- T4 integration suite: 20/20 selected KoSIT corpus fixtures validate as expected.
- p95 validation latency on Server Action: < 500 ms for invoices up to 200 lines (measured during Phase 6).
- Zero post-merge fixes related to rule logic (regression criterion vs Epic 5's 2 post-merge fixes).

## Technical Research Recommendations

### Implementation Roadmap (Condensed)

1. Land P2, P3, P4 spikes alongside Story 6.1 prep.
2. Story 6.1 follows the six-phase plan above, with one wire-up spike (P4) covering the choreography that Epic 5 retro A1 mandates.
3. Story 6.2 (display + correction email) blocked on P3 (email-infra A5 decision).

### Technology Stack Recommendations

- `fast-xml-parser` v5.x (pin a known-good minor)
- TypeScript ESM, Vitest, pnpm workspace
- No new runtime dep beyond fxp; no native bindings; no third-party validation API

### Skill Development Requirements

- Half a day of EN 16931 semantic-model orientation per dev touching this package
- Schematron reading is reference-only, not implementation skill

### Success Metrics and KPIs

- See "Success Metrics and KPIs" above
- Plus: Epic 6 retro KPI — patch count and post-merge-fix count vs Epic 5's 5.3 baseline (19 + 2). Spike discipline (A1) is being tested; this is the headline measurement

---

## Technical Research Conclusion

### Summary of Key Technical Findings

The six P1 decisions are tightly coupled: choosing `fast-xml-parser` enables zero-dep continuity with `packages/datev`; collapsing UBL and CII into one normalized model enables one rule set; the hybrid rule-encoding shape enables the rule-set to live as data in `invoices.validation_errors` jsonb with no transformation layer; the file layout enforces tree-shakeable, additive growth; the KoSIT-corpus-backed test strategy turns rule drift from "silent risk" into "failing test." The non-decision — pulling ZUGFeRD out of the file-layout axis and routing PDF extraction to P2 — is the most consequential clarification of the spike: it prevents Story 6.1 from carrying a transport concern alongside a validation concern.

### Strategic Technical Impact Assessment

This package is the third in a row to apply the versioned-format pattern (`packages/gobd`, `packages/datev`, now `packages/validation`). The pattern has compounded into a recognisable RechnungsAI house style: pure-compute TS packages, zero new runtime deps, one external standard each, and a "new format = new file" growth axis. Future compliance work (NLCIUS, PEPPOL BIS, EDIFACT, future EN 16931 revisions) gets cheaper with each iteration because the cost is now a parser projection, not a fresh architecture decision. The same shape will likely serve Epic 7 (export beyond DATEV) and any future German tax / regulatory format we adopt.

### Next Steps Technical Recommendations

1. **Approve this spike** as the P1 deliverable; mark P1 done in Epic 6 prep tracking.
2. **Launch P2 spike** (ZUGFeRD PDF/A-3 attachment extraction) — small, narrow, output is one decision: vendored library (`@stackforge-eu/factur-x`) or hand-rolled `pdf-lib`-based extractor.
3. **Launch P3 spike** (email infra A5 resolution) — gate for Story 6.2, not 6.1, but its decision affects the Epic 6 sequencing diagram.
4. **Launch P4 spike** (Story 6.1 wire-up choreography) — uses this spike as the upstream contract; covers: where XML originates (upload pipeline vs `invoices.original_xml`), Server Action signature, error-shape contract for the 6.2 UI consumer, re-validation trigger policy.
5. **Vendor KoSIT testsuite snapshot** before Story 6.1 begins so Phase 1 fixtures are ready on day one.
6. After P2/P3/P4 land, **create Story 6.1** using the 6-phase plan in §Implementation Approaches as the body of the story file — this story should be a wire-up story, not a research story.

---

## Source Documentation

**Primary technical sources (Schematron / standards / artefacts):**
- [KoSIT xrechnung-schematron (XRechnung 3.0.2 rules, v2.5.0, 2026-02-05)](https://github.com/itplr-kosit/xrechnung-schematron)
- [KoSIT validator-configuration-xrechnung (release 2026-01-31)](https://github.com/itplr-kosit/validator-configuration-xrechnung)
- [KoSIT xrechnung-testsuite (test corpus)](https://github.com/itplr-kosit/xrechnung-testsuite)
- [ConnectingEurope eInvoicing-EN16931 (CEN base Schematron)](https://github.com/ConnectingEurope/eInvoicing-EN16931)
- [Peppol BIS UBL EN16931 Schematron docs](https://peppol-docs.agid.gov.it/docs/xml/ENG/sch/peppolbis-en16931-ubl-3.0-invoice/Schematron/ENG/CEN/CEN-EN16931-UBL.html)
- [phax/en16931-cii2ubl (CII↔UBL semantic mapping reference)](https://github.com/phax/en16931-cii2ubl)

**XML parser:**
- [fast-xml-parser repo](https://github.com/NaturalIntelligence/fast-xml-parser)
- [fast-xml-parser v4 XMLparseOptions docs](https://github.com/NaturalIntelligence/fast-xml-parser/blob/master/docs/v4/2.XMLparseOptions.md)
- [fast-xml-parser CHANGELOG](https://github.com/NaturalIntelligence/fast-xml-parser/blob/master/CHANGELOG.md)
- [npm-compare fxp vs xmldom vs xml2js](https://npm-compare.com/fast-xml-parser,xml-js,xml2js,xmldom)
- [issue #134 — comparison vs xmldom](https://github.com/NaturalIntelligence/fast-xml-parser/issues/134)

**ZUGFeRD / Factur-X extraction (P2 prep):**
- [pdflib KB — ZUGFeRD/Factur-X](https://www.pdflib.com/pdf-knowledge-base/zugferd-and-factur-x/)
- [@stackforge-eu/factur-x on JSR](https://jsr.io/@stackforge-eu/factur-x)
- [Textcontrol — PDF/A-3 extraction notes](https://www.textcontrol.com/blog/2021/01/18/extract-zugferd-facturx-attachments-from-adobe-pdf-documents/)

**Runtime / choreography:**
- [Next.js Edge Runtime API Reference](https://nextjs.org/docs/app/api-reference/edge)
- [Next.js Edge vs Node runtime guide](https://nextjs.org/docs/14/app/building-your-application/rendering/edge-and-nodejs-runtimes)
- [Vercel Edge Runtime docs](https://vercel.com/docs/functions/runtimes/edge)
- [Vercel discussion — Node runtime direction](https://github.com/vercel/next.js/discussions/69486)

**Background reading:**
- [E-Rechn.de — XRechnung / Factur-X / UBL explained](https://e-rechn.de/en/blog/e-invoice-formats-xrechnung-facturx-ubl)
- [InvoiceNavigator EN 16931 validator](https://www.invoicenavigator.eu/validator)
- [ValidateFin EN 16931 complete guide](https://validatefin.com/en/blog/en16931-complete-guide)
- [Invoice-Converter — CII reference](https://www.invoice-converter.com/en/resources/compliance/cii-cross-industry-invoice)

**Web search queries used (for transparency):**

1. `fast-xml-parser vs xmldom 2026 namespace handling typescript`
2. `KoSIT validator EN 16931 Schematron rules XRechnung github`
3. `XRechnung 2024 UBL 2.1 CII D16B namespace structure validation`
4. `ZUGFeRD Factur-X PDF/A-3 embedded XML extraction javascript`
5. `fast-xml-parser removeNSPrefix preserveOrder option XML namespace`
6. `EN 16931 business rules count BR-CO BR-CL BR-S total number Schematron`
7. `Next.js 15 Server Action CPU-bound work edge runtime vs node runtime 2026`
8. `KoSIT XRechnung test suite sample XML invoices github testsuite`

---

**Technical Research Completion Date:** 2026-05-10
**Spike ID:** Epic 6 P1
**Document Status:** Complete — ready for review and downstream consumption by P2/P3/P4 spike planning and Story 6.1 creation.
**Source Verification:** All technical claims cited; multi-source where conflict was plausible.
**Confidence:** High on decisions 1–8 (well-sourced); medium on Decision 10 (rule-set versioning) — the in-place-update preference is a judgment call that can be revisited if a compliance auditor ever requests as-of re-validation.

_This document is the architecture spike output for Epic 6 P1. It informs but does not author Story 6.1 — the implementation story will be created separately using this as upstream context._
