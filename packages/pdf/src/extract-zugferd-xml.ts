// Extract the embedded ZUGFeRD / Factur-X / XRechnung XML from a PDF/A-3.
// Returns the FIRST attachment matching the ZUGFeRD filename or AFRelationship
// signals (P2 §4.3). Other attachments (delivery notes, supplementary docs)
// are intentionally ignored — picking the wrong file silently was the P2 §7
// watch point.

import { extractAttachments } from "./extract-attachments.js";
import type { ZugferdExtractionResult } from "./types.js";

const KNOWN_FILENAMES: ReadonlySet<string> = new Set([
  "factur-x.xml",
  "zugferd-invoice.xml",
  "xrechnung.xml",
]);

const XML_MIME = new Set(["application/xml", "text/xml"]);
const ACCEPTED_RELATIONSHIPS = new Set(["Source", "Alternative"]);

export async function extractZugferdXml(
  bytes: Uint8Array,
): Promise<ZugferdExtractionResult> {
  let attachments;
  try {
    attachments = await extractAttachments(bytes);
  } catch (err) {
    return {
      kind: "error",
      reason: "pdf-parse-failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (attachments.length === 0) {
    return { kind: "not-zugferd", reason: "no-embedded-files" };
  }

  // Filename match first.
  for (const att of attachments) {
    if (KNOWN_FILENAMES.has(att.filename.toLowerCase())) {
      const xml = bytesToUtf8(att.bytes);
      if (xml === undefined) {
        return { kind: "error", reason: "xml-decode-failed", detail: att.filename };
      }
      return { kind: "found", filename: att.filename, xml, profile: null };
    }
  }

  // AFRelationship + MIME fallback.
  for (const att of attachments) {
    const isXml = att.mimeType && XML_MIME.has(att.mimeType);
    const rel = att.relationship ?? "";
    if (isXml && ACCEPTED_RELATIONSHIPS.has(rel)) {
      const xml = bytesToUtf8(att.bytes);
      if (xml === undefined) {
        return { kind: "error", reason: "xml-decode-failed", detail: att.filename };
      }
      return { kind: "found", filename: att.filename, xml, profile: null };
    }
  }

  return { kind: "not-zugferd", reason: "no-matching-attachment" };
}

function bytesToUtf8(bytes: Uint8Array): string | undefined {
  try {
    // TextDecoder consumes UTF-8 BOM transparently.
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (typeof decoded === "string" && decoded.length > 0) return decoded;
    return undefined;
  } catch {
    return undefined;
  }
}
