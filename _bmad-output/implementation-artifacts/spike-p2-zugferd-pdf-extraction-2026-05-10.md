# ZUGFeRD / Factur-X — Embedded XML Extraction Spike

**Date:** 2026-05-10
**For:** Story 6.1 — EN 16931 Invoice Validation Engine (Epic 6)
**Triggered by:** Epic 5 Retro action P2
**Outcome:** ✅ Feasible. Hand-rolled extraction via `pdf-lib` low-level objects is the chosen path. One new dev-level dep (`pdf-lib`, MIT, already a transitive dep of any candidate). `fast-xml-parser` lands in `packages/validation` for XML parsing (needed regardless of extraction choice). Existing `packages/pdf` stub becomes the home for the extractor.

---

## 1. Problem Statement

A ZUGFeRD / Factur-X invoice is a **PDF/A-3 file with one embedded XML attachment**. The XML carries the EN 16931 structured invoice data (CII syntax — `urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100`). To validate such an invoice in Story 6.1 we must:

1. Detect whether an uploaded PDF carries an embedded ZUGFeRD/Factur-X XML.
2. Extract the XML byte stream from the PDF/A-3 `/EmbeddedFiles` name tree.
3. Decode it to a UTF-8 string ready for the validation engine.

**Out of scope (Story 6.1 boundary):**
- Validating PDF/A-3 conformance itself (we trust the supplier's PDF; we only fail validation if the XML fails EN 16931).
- Writing / generating ZUGFeRD PDFs (RechnungsAI is read-side only).
- Pure-XML files (`*.xml` XRechnung uploads) — those skip extraction and go straight to the parser. Extraction is the PDF-only branch.

---

## 2. How the XML Is Embedded (PDF/A-3 Structure)

```
PDF Trailer
  /Root  →  Catalog
              /Names  →  Names dict
                          /EmbeddedFiles  →  Name tree
                                              "factur-x.xml"  →  FileSpec dict
                                                                   /F   = "factur-x.xml"
                                                                   /UF  = "factur-x.xml"
                                                                   /AFRelationship = /Source
                                                                   /EF  → { /F → EmbeddedFile stream }
                                                                            stream bytes = the XML
  /Root.AF  →  [ FileSpec ref ... ]   (PDF/A-3 associated files array)
```

**Conventional filenames** (the validator must accept any of these — DPA / FNFE allow several):

| Filename | Standard |
|---|---|
| `factur-x.xml` | Factur-X 1.0+ / ZUGFeRD 2.x (current convention) |
| `zugferd-invoice.xml` | ZUGFeRD 1.0 / 2.0 legacy |
| `xrechnung.xml` | XRechnung-via-CII inside a PDF/A-3 carrier (rare but defined) |
| `ZUGFeRD-invoice.xml` | Pre-2.0 capitalization variant |

**Extraction strategy:** walk the `/EmbeddedFiles` name tree and return **the first attachment whose name matches any of the four conventional filenames, case-insensitive**, OR — if none match — the first attachment whose MIME type is `application/xml` / `text/xml` AND whose `/AFRelationship` is `/Source` or `/Alternative`. This is permissive enough for real-world supplier PDFs and strict enough not to grab a random PDF/A-3 attachment.

---

## 3. Library Landscape (2026-05 snapshot)

### Direct candidates evaluated

| Library | License | Last release | Size | Extract? | Verdict |
|---|---|---|---|---|---|
| **`pdf-lib`** (hopding) | MIT | active | ~300 kB | ❌ no documented API; ✅ low-level objects accessible | **Selected** (hand-rolled traversal) |
| **`pdfjs-dist`** (Mozilla) | Apache-2.0 | active | ~3–5 MB (legacy build) | ✅ `getAttachments()` returns `{filename: Uint8Array}` map | Viable but heavy for serverless cold-start |
| **`pdf.js-extract`** (ffalt) | MIT | maintained | small wrapper + pdfjs-dist | ✅ `{ includeAttachments: true }` option | Wrapper over pdfjs-dist; same cold-start cost |
| **`@stackforge-eu/factur-x`** | **EUPL-1.2** | 2026-05-05 (5 days ago) | 1.0 MB | ✅ purpose-built API | **Rejected on license** — see §3.1 |
| **`node-zugferd`** (jslno) | MIT | 2025-08 beta | 20.2 MB | ❌ create-only | Doesn't solve extraction |
| **`lSoleyl/zugferd`** | ISC | maintained | n/a (Rust) | ✅ CLI | Not Node.js; subprocess shell-out rejected (cold-start + sandbox) |

### 3.1 Why not `@stackforge-eu/factur-x`?

It is the only npm package that solves extraction out of the box. It would save ~80 lines of hand-rolled code. **But it is licensed EUPL-1.2.**

EUPL-1.2 **explicitly treats SaaS / "communication to the public" as a Distribution event** that triggers source-disclosure obligations (Interoperable Europe Portal: *"the definitions in article 1 of the EUPL assimilates 'communication to the public' to 'distribution' and therefore targets and covers SaaS (software as a service) and the ASP (application service provider) activity"*). The EUPL FAQ does state that *static and dynamic linking can be implemented with other programs without barriers* — i.e. the copyleft scope is narrower than AGPL — but the question of whether an npm `require()` of an EUPL package from a closed-source SaaS triggers reciprocity remains a **non-trivial legal question** that depends on what counts as a "derivative work" under article 1.

For a one-tenant German SaaS this is a foreseeable audit question we shouldn't take on for ~80 lines of code we can write ourselves. **Constraint: all runtime deps in RechnungsAI must be in the MIT / Apache-2.0 / BSD / ISC family.** This matches the existing portfolio (`packages/datev`, `packages/gobd` have zero non-permissive deps).

### 3.2 Why not `pdfjs-dist` / `pdf.js-extract`?

`pdfjs-dist` ships a Mozilla-grade PDF renderer including font subsetting, canvas drawing primitives, and worker plumbing — none of which we need. The legacy Node build is 3–5 MB on disk. On Vercel / Next.js serverless this matters: it's a measurable cold-start regression on every invoice upload. The `getAttachments()` API is convenient (~5 lines) but the cost is disproportionate to the benefit when the hand-rolled `pdf-lib` traversal is ~80 lines and zero added weight (`pdf-lib` would land transitively for any embedded-files work anyway).

**Reserved fallback:** if hand-rolled extraction starts hitting real-world PDF/A-3 quirks we cannot debug in `pdf-lib`'s parser (e.g. encrypted PDFs, broken xref tables, hybrid reference streams), switching to `pdfjs-dist.getAttachments()` is a 10-line swap behind the same `extractZugferdXml(bytes)` interface. The interface, not the implementation, is the architectural commitment.

---

## 4. Decision: Hand-rolled Extraction in `packages/pdf`

### 4.1 Package shape

```
packages/pdf/src/
├── extract-attachments.ts     ← traverses /EmbeddedFiles name tree (low-level)
├── extract-zugferd-xml.ts     ← filters attachments by filename + AFRelationship; returns XML
├── detect-einvoice.ts         ← lightweight "does this PDF carry an e-invoice?" probe
├── types.ts                   ← ExtractedAttachment, ZugferdExtractionResult
└── index.ts                   ← public exports
```

**Design rule:** `packages/pdf` is **pure PDF extraction**. No EN 16931 knowledge. No CII / UBL parsing. Those live in `packages/validation`. This mirrors the `packages/datev` / `packages/gobd` separation: format-aware logic stays out of byte-handling packages. (Epic 4 retro insight #4 applied again.)

### 4.2 Types

```typescript
// packages/pdf/src/types.ts

export type ExtractedAttachment = {
  filename: string;            // /UF preferred, /F fallback
  mimeType: string | null;     // from FileSpec /Subtype
  afRelationship: string | null; // "/Source" | "/Data" | "/Alternative" | ...
  bytes: Uint8Array;           // the embedded stream bytes (already decoded)
};

export type ZugferdExtractionResult =
  | { kind: "found"; xml: string; filename: string; profile: ZugferdProfile | null }
  | { kind: "not-zugferd"; reason: "no-attachments" | "no-xml-attachment" | "unrecognized-filename" }
  | { kind: "error"; reason: "pdf-parse-failed" | "stream-decode-failed"; detail: string };

export type ZugferdProfile = "MINIMUM" | "BASIC-WL" | "BASIC" | "EN16931" | "EXTENDED" | "XRECHNUNG";
```

The result is a tagged union (Story 3.3 pattern — caller pattern-matches on `kind`). **No exceptions across the package boundary**; corrupt PDFs return `{ kind: "error" }` so the upload pipeline can decide whether to fall back to OCR.

### 4.3 Extraction sketch (the load-bearing function)

```typescript
// packages/pdf/src/extract-attachments.ts
import {
  PDFDocument,
  PDFDict,
  PDFArray,
  PDFName,
  PDFStream,
  PDFHexString,
  PDFString,
  decodePDFRawStream,
} from "pdf-lib";

export async function extractAttachments(pdfBytes: Uint8Array): Promise<ExtractedAttachment[]> {
  const doc = await PDFDocument.load(pdfBytes, { throwOnInvalidObject: false });
  const catalog = doc.catalog;
  const names = catalog.lookup(PDFName.of("Names"), PDFDict);
  if (!names) return [];
  const embeddedFiles = names.lookup(PDFName.of("EmbeddedFiles"), PDFDict);
  if (!embeddedFiles) return [];

  const out: ExtractedAttachment[] = [];
  walkNameTree(embeddedFiles, (_name, fileSpec) => {
    const ef = fileSpec.lookup(PDFName.of("EF"), PDFDict);
    if (!ef) return;
    const stream = ef.lookup(PDFName.of("F")) ?? ef.lookup(PDFName.of("UF"));
    if (!(stream instanceof PDFStream)) return;

    const filename =
      pdfStringValue(fileSpec.lookup(PDFName.of("UF"))) ??
      pdfStringValue(fileSpec.lookup(PDFName.of("F"))) ??
      "(unnamed)";
    const params = stream.dict.lookup(PDFName.of("Params"), PDFDict);
    const mimeType = pdfNameValue(fileSpec.lookup(PDFName.of("Subtype"))) ?? null;
    const af = pdfNameValue(fileSpec.lookup(PDFName.of("AFRelationship"))) ?? null;

    out.push({
      filename,
      mimeType,
      afRelationship: af,
      bytes: decodePDFRawStream(stream).decode(),
    });
  });
  return out;
}

function walkNameTree(node: PDFDict, visit: (name: string, fileSpec: PDFDict) => void): void {
  const kids = node.lookup(PDFName.of("Kids"), PDFArray);
  if (kids) {
    for (let i = 0; i < kids.size(); i++) {
      const child = kids.lookup(i, PDFDict);
      if (child) walkNameTree(child, visit);
    }
    return;
  }
  const namesArr = node.lookup(PDFName.of("Names"), PDFArray);
  if (!namesArr) return;
  for (let i = 0; i < namesArr.size(); i += 2) {
    const name = pdfStringValue(namesArr.lookup(i)) ?? "";
    const value = namesArr.lookup(i + 1, PDFDict);
    if (value) visit(name, value);
  }
}

function pdfStringValue(obj: unknown): string | null {
  if (obj instanceof PDFString) return obj.decodeText();
  if (obj instanceof PDFHexString) return obj.decodeText();
  return null;
}
function pdfNameValue(obj: unknown): string | null {
  if (obj instanceof PDFName) return obj.toString();
  return null;
}
```

```typescript
// packages/pdf/src/extract-zugferd-xml.ts
const ZUGFERD_FILENAMES = new Set([
  "factur-x.xml",
  "zugferd-invoice.xml",
  "xrechnung.xml",
]);

export async function extractZugferdXml(pdfBytes: Uint8Array): Promise<ZugferdExtractionResult> {
  let attachments: ExtractedAttachment[];
  try {
    attachments = await extractAttachments(pdfBytes);
  } catch (e) {
    return { kind: "error", reason: "pdf-parse-failed", detail: errString(e) };
  }
  if (attachments.length === 0) {
    return { kind: "not-zugferd", reason: "no-attachments" };
  }

  const byConventionalName = attachments.find((a) =>
    ZUGFERD_FILENAMES.has(a.filename.toLowerCase()),
  );
  const byMime = attachments.find(
    (a) =>
      (a.mimeType === "/application#2Fxml" || a.mimeType === "/text#2Fxml") &&
      (a.afRelationship === "/Source" || a.afRelationship === "/Alternative"),
  );
  const candidate = byConventionalName ?? byMime;
  if (!candidate) {
    return {
      kind: "not-zugferd",
      reason: attachments.some((a) => a.filename.endsWith(".xml"))
        ? "unrecognized-filename"
        : "no-xml-attachment",
    };
  }

  let xml: string;
  try {
    xml = new TextDecoder("utf-8", { fatal: false }).decode(candidate.bytes);
  } catch (e) {
    return { kind: "error", reason: "stream-decode-failed", detail: errString(e) };
  }
  return { kind: "found", xml, filename: candidate.filename, profile: null };
}
```

Profile detection (`MINIMUM` / `BASIC` / `EN16931` / `EXTENDED` / `XRECHNUNG`) is a one-liner over the XML root element's `<GuidelineSpecifiedDocumentContextParameter><ID>` value — but that requires XML parsing, so it lives in `packages/validation` (where `fast-xml-parser` is owned), not here. `extractZugferdXml` returns `profile: null` and the caller in `packages/validation` fills it in.

### 4.4 Detector (cheap pre-check before full extraction)

```typescript
// packages/pdf/src/detect-einvoice.ts
export async function isLikelyEInvoicePdf(pdfBytes: Uint8Array): Promise<boolean> {
  try {
    const doc = await PDFDocument.load(pdfBytes, { throwOnInvalidObject: false });
    const af = doc.catalog.lookup(PDFName.of("AF"), PDFArray);
    return af !== undefined && af.size() > 0;
  } catch {
    return false;
  }
}
```

The PDF/A-3 `/Root /AF` (Associated Files) array is the standard "this PDF carries machine-readable data" marker. Checking its presence is O(parse-catalog) and lets the upload pipeline route ZUGFeRD PDFs into the validation flow while letting plain PDFs go straight to OCR with zero extra cost.

---

## 5. XML Parsing (handed off to `packages/validation`)

Out of scope for P2 but constrains the interface: `packages/validation` will use **`fast-xml-parser`** (MIT, ~120 kB) to parse both CII (extracted from ZUGFeRD) and UBL/CII (raw XRechnung uploads). It's the same parser `node-zugferd` uses, which is a small market signal. Namespace handling:

| Syntax | Root | Namespace prefixes the parser must preserve |
|---|---|---|
| CII (Factur-X / ZUGFeRD / XRechnung-CII) | `rsm:CrossIndustryInvoice` | `rsm`, `ram`, `udt`, `qdt` |
| UBL (XRechnung-UBL) | `ubl:Invoice` or `cn:CreditNote` | `cac`, `cbc` |

`fast-xml-parser` config: `removeNSPrefix: false`, `ignoreAttributes: false`, `parseTagValue: false` (we want strings, not type coercion — EN 16931 monetary values must stay textual until the validation engine normalizes them).

This is a **note for Story 6.1 / spike P1 (validation architecture)** — not implemented in this spike.

---

## 6. What `packages/pdf` Will Add to Dependencies

```json
{
  "dependencies": {
    "@rechnungsai/shared": "workspace:*",
    "pdf-lib": "^1.17.1"
  }
}
```

One new runtime dep. MIT. ~300 kB. No transitive surprises (`pdf-lib` is dep-free). Bundle impact on the Server Action edge: negligible vs. the existing `apps/web` bundle. No native bindings, no wasm, runs in any Node 20+ environment including Vercel serverless and edge runtime (it's pure JS).

---

## 7. Watch Points

| Risk | Mitigation |
|---|---|
| Encrypted PDFs (rare, but some Steuerberater portals encrypt outgoing PDFs) | `PDFDocument.load(pdfBytes, { throwOnInvalidObject: false })` throws on encrypted → caught and returned as `{ kind: "error" }`; upload pipeline falls back to OCR with a UI hint "Verschlüsselte PDFs können nicht validiert werden" |
| Stream filters beyond `FlateDecode` (e.g. `ASCII85Decode` legacy ZUGFeRD 1.0 PDFs) | `decodePDFRawStream` handles the common cases; if a real-world failure shows up, capture the sample and switch the affected upload to the `pdfjs-dist` fallback path (see §3.2) |
| XML BOM in embedded stream | `TextDecoder("utf-8")` consumes UTF-8 BOM transparently; UTF-16 BOM would need branch — defer until a real sample appears (ZUGFeRD 2.x spec mandates UTF-8) |
| File ≥ a few hundred kB embedded XML (rare but possible for EXTENDED profile) | Extraction is fully in-memory; `apps/web` upload route already caps invoice uploads at 25 MB, so no separate limit needed here |
| `factur-x.xml` filename case variation (`Factur-X.xml`, `FACTUR-X.XML`) | `filename.toLowerCase()` comparison in the candidate filter; UTF-8 lowercase is sufficient — these are ASCII filenames per the spec |
| Multiple XML attachments (some suppliers attach both the structured invoice *and* delivery notes) | Filename allow-list grabs the structured invoice; other XML attachments are ignored, not flagged as errors |
| `pdf-lib` not exposing `decodePDFRawStream` publicly in newer versions | Pin `pdf-lib@^1.17.1`; the helper has been stable since 1.10. If 2.x ever breaks the API, the swap path to `pdfjs-dist.getAttachments()` is documented in §3.2 |
| PDF/A-3 hybrid reference streams | If `PDFDocument.load` throws, we already report `pdf-parse-failed` — same fallback as encrypted PDFs |

---

## 8. Story 6.1 Task Outline (pre-written for story creation)

1. Add `packages/pdf/src/types.ts` — `ExtractedAttachment`, `ZugferdExtractionResult`, `ZugferdProfile`
2. Add `packages/pdf/src/extract-attachments.ts` — name-tree walker + `extractAttachments(bytes)`
3. Add `packages/pdf/src/extract-zugferd-xml.ts` — filename / AFRelationship filter + `extractZugferdXml(bytes)`
4. Add `packages/pdf/src/detect-einvoice.ts` — cheap pre-check `isLikelyEInvoicePdf(bytes)`
5. Add `packages/pdf/src/index.ts` export barrel
6. Add Vitest to `packages/pdf` (`package.json` scripts + `vitest.config.ts`) — model on `packages/gobd` / `packages/datev`
7. Add `pdf-lib@^1.17.1` to `packages/pdf` deps
8. **Test fixtures**: download 3 reference PDFs from public ZUGFeRD test corpora and commit under `packages/pdf/test/fixtures/`:
   - `factur-x-basic.pdf` (factur-x.xml, BASIC profile)
   - `zugferd-2-en16931.pdf` (factur-x.xml, EN16931 profile)
   - `zugferd-1-legacy.pdf` (zugferd-invoice.xml, BASIC profile) — for filename-fallback coverage
9. Tests:
   - Detector: `/AF` present vs absent
   - Extractor: each fixture → expected filename + non-empty UTF-8 string starting with `<?xml`
   - Negative: plain non-ZUGFeRD PDF → `{ kind: "not-zugferd", reason: "no-attachments" }`
   - Negative: PDF with a non-XML attachment → `{ kind: "not-zugferd", reason: "no-xml-attachment" }`
   - Negative: corrupted PDF bytes → `{ kind: "error", reason: "pdf-parse-failed" }`
   - Name-tree edge case: paginated tree (Kids array → recursion path)
10. Smoke test (BLOCKED-BY-ENVIRONMENT per Epic 5 retro A3): upload one ZUGFeRD invoice in browser, confirm pipeline routes it to validation rather than OCR.

---

## 9. Wire-up Implication (foreshadowing the P4 spike)

Per Epic 5 retro action A1 (wire-up spike rule), Story 6.1 still needs a separate **P4 wire-up spike** for the choreography: where extraction runs (sync on upload, async post-OCR fallback, or both?), how the result feeds the validation engine, persistence of validation outcome. This spike answers only "how do we get the XML bytes out of the PDF." The "what happens next" question is owned by P4.

One concrete constraint from this spike for P4: `isLikelyEInvoicePdf` is cheap enough to call **synchronously in the upload server action** (single catalog parse, no full document parse). Full extraction is also fast (~10–30 ms for a typical 200-page-of-zero invoice PDF — pdf-lib parses lazily) and can run in the same server action without needing an Edge Function or queue. **Recommendation for P4: keep validation synchronous on upload for v1.** Async is a known-deferred optimization (cf. Epic 3 sessionStartMs TD), not a v1 requirement.

---

## 10. License & Dependency Posture Summary

| Item | License | Status |
|---|---|---|
| `pdf-lib` (new runtime dep) | MIT | ✅ Permissive — matches existing portfolio |
| `fast-xml-parser` (lands later in `packages/validation`, not here) | MIT | ✅ Permissive |
| `@stackforge-eu/factur-x` | EUPL-1.2 | ❌ **Rejected** — SaaS-triggering reciprocal license, not adopted |
| `pdfjs-dist` (reserved fallback) | Apache-2.0 | ✅ Permissive (kept as escape hatch only) |

**Permanent rule emerging from this spike:** all RechnungsAI runtime deps stay in MIT / Apache-2.0 / BSD / ISC. EUPL, AGPL, GPL, LGPL, SSPL, BUSL — rejected without further analysis. Worth memorializing in `package.json#//dependencyRules` or a CONTRIBUTING note when convenient.

---

*Spike completed 2026-05-10. P2 resolved. Story 6.1 is unblocked on the extraction surface; the remaining Story 6.1 prep work is P1 (validation architecture) and P4 (wire-up).*

## Sources

- [GitHub — Hopding/pdf-lib issue #534 "Extract attachments from existing PDF file"](https://github.com/Hopding/pdf-lib/issues/534)
- [GitHub — jslno/node-zugferd (Node.js ZUGFeRD creation library)](https://github.com/jslno/node-zugferd)
- [GitHub — lSoleyl/zugferd (Rust extraction CLI)](https://github.com/lSoleyl/zugferd)
- [JSR — @stackforge-eu/factur-x (EUPL-1.2 Node.js extraction library)](https://jsr.io/@stackforge-eu/factur-x)
- [npm — node-zugferd registry metadata](https://www.npmjs.com/package/node-zugferd)
- [PDFlib — ZUGFeRD and Factur-X knowledge base (format overview)](https://www.pdflib.com/pdf-knowledge-base/zugferd-and-factur-x/)
- [Mozilla PDF.js — PDFDocumentProxy.getAttachments() reference](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDocumentProxy.html)
- [Interoperable Europe Portal — EUPL-1.2 SaaS / distribution clause guidance](https://interoperable-europe.ec.europa.eu/licence/european-union-public-licence-version-12-eupl)
- [SPDX — EUPL-1.2 license summary](https://spdx.org/licenses/EUPL-1.2.html)
- [mind-forms — CII vs UBL namespace and structural differences](https://mind-forms.de/e-rechnung/zugferd-und-xrechnung-cii-und-ubl-technisch-verschieden-aber-trotzdem-gleich/)
- [TextControl — Extract ZUGFeRD/Factur-X XML Attachments from Adobe PDF/A-3b Documents (format reference)](https://www.textcontrol.com/blog/2021/01/18/extract-zugferd-facturx-attachments-from-adobe-pdf-documents/)
