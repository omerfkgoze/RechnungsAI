// Cheap pre-check: does the PDF look like it carries embedded files at all?
// (P2 §4.4.) Used as the routing signal in `extractInvoice`'s PDF branch —
// must be fast. We only inspect the catalog's `/AF` array; no full document
// parse, no name-tree walk.

import { PDFArray, PDFDocument, PDFName } from "pdf-lib";

export async function isLikelyEInvoicePdf(bytes: Uint8Array): Promise<boolean> {
  try {
    const doc = await PDFDocument.load(bytes, {
      throwOnInvalidObject: false,
      // pdf-lib defaults are fine; we explicitly do NOT attempt to parse all
      // content streams — too expensive for a routing check.
      updateMetadata: false,
    });
    // Untyped lookup + instanceof — the typed `lookup(name, PDFArray)` overload
    // throws `PDFObjectMismatch` when `/AF` exists but is a `PDFDict` (some
    // ZUGFeRD producers emit an indirect single-filespec dict instead of an
    // array), which would silently route a valid ZUGFeRD PDF to AI.
    const afRaw = doc.catalog.lookup(PDFName.of("AF"));
    if (afRaw instanceof PDFArray) return afRaw.size() > 0;
    // A non-array but present `/AF` (single PDFDict filespec, indirect ref) is
    // still a strong e-invoice signal — let `extractAttachments`'s tolerant
    // walker confirm.
    return afRaw !== undefined;
  } catch {
    // Encrypted, corrupted, non-PDF → not our problem here. Caller falls back
    // to plain AI extraction on the original bytes.
    return false;
  }
}
