# PDF test fixtures

## `zugferd-2-en16931.pdf`

A real-world ZUGFeRD 2.x / Factur-X invoice PDF (PDF/A-3) with an embedded
`factur-x.xml` (`/AFRelationship /Alternative`).

- **Provenance:** orgaMAX example invoice ("Beispielrechnung"), supplied by the
  project owner as a representative real-world ZUGFeRD document. Used here solely
  as a binary test fixture for the PDF/A-3 attachment-extraction code path.
- **What it exercises:** `isLikelyEInvoicePdf` (catalog `/AF` present),
  `extractAttachments` (real `/EmbeddedFiles` name tree + FlateDecode-compressed
  embedded stream — the real-world shape), `extractZugferdXml` (filename match
  on `factur-x.xml`).

The synthetic PDFs built at runtime in `../_fixtures.ts` cover the remaining
cases (plain PDF / no attachments, the `zugferd-invoice.xml` filename-fallback
variant, garbage bytes). Synthetic fixtures are kept because pdf-lib cannot
re-emit a byte-identical real PDF/A-3 and we want deterministic edge-case inputs.

> If a public-domain ZUGFeRD reference corpus (e.g. FeRD / FNFE-MPE official
> samples) is later vetted for license, add `factur-x-basic.pdf` (BASIC profile)
> and `zugferd-1-legacy.pdf` (ZUGFeRD 1.0, `zugferd-invoice.xml`) here per AC #12.
