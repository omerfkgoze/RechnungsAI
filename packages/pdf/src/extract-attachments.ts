// Walk the PDF/A-3 `/EmbeddedFiles` name tree and return every embedded file
// stream with its filename + relationship metadata. The Kids-array recursion
// path is required because large PDFs page the name tree into a B-tree-like
// structure (P2 §4.3).
//
// Implementation notes:
//   - pdf-lib's high-level API doesn't expose `/EmbeddedFiles`. We walk the
//     low-level objects via `catalog.lookup` / `PDFDict.lookup`.
//   - For each filespec dict we read `/UF` then `/F` as the filename, look up
//     the embedded file stream via `/EF/F`, and decode its bytes.

import { inflateSync } from "node:zlib";

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFStream,
  PDFString,
} from "pdf-lib";

import type { ExtractedAttachment } from "./types.js";

export async function extractAttachments(
  bytes: Uint8Array,
): Promise<ExtractedAttachment[]> {
  const doc = await PDFDocument.load(bytes, {
    throwOnInvalidObject: false,
    updateMetadata: false,
  });

  // Approach 1: catalog → /Names → /EmbeddedFiles → name tree → recurse
  // Use untyped lookup() + instanceof to avoid pdf-lib throwing on missing keys.
  const namesRaw = doc.catalog.lookup(PDFName.of("Names"));
  const names = namesRaw instanceof PDFDict ? namesRaw : undefined;
  const embeddedFilesRaw = names ? names.lookup(PDFName.of("EmbeddedFiles")) : undefined;
  const embeddedFiles = embeddedFilesRaw instanceof PDFDict ? embeddedFilesRaw : undefined;

  const filespecs: PDFDict[] = [];
  if (embeddedFiles) {
    collectFromNameTree(embeddedFiles, filespecs);
  }

  // Approach 2: catalog → /AF (associated files). PDF/A-3 puts the ZUGFeRD
  // filespec here in addition to /Names. We merge unique dict refs.
  const afRaw = doc.catalog.lookup(PDFName.of("AF"));
  const afArray = afRaw instanceof PDFArray ? afRaw : undefined;
  if (afArray) {
    for (let i = 0; i < afArray.size(); i++) {
      const entryRaw = afArray.lookup(i);
      const entry = entryRaw instanceof PDFDict ? entryRaw : undefined;
      if (entry && !filespecs.includes(entry)) filespecs.push(entry);
    }
  }

  const out: ExtractedAttachment[] = [];
  for (const fs of filespecs) {
    const filename = readStr(fs, PDFName.of("UF")) ?? readStr(fs, PDFName.of("F"));
    if (!filename) continue;
    const efRaw = fs.lookup(PDFName.of("EF"));
    const ef = efRaw instanceof PDFDict ? efRaw : undefined;
    if (!ef) continue;
    const fRaw = ef.lookup(PDFName.of("F"));
    const ufRaw = ef.lookup(PDFName.of("UF"));
    const stream =
      (fRaw instanceof PDFStream ? fRaw : undefined) ??
      (ufRaw instanceof PDFStream ? ufRaw : undefined);
    if (!stream) continue;
    const streamBytes = readStreamBytes(stream);
    const mimeType =
      readStr(fs, PDFName.of("Subtype"))?.toLowerCase() ??
      readStr(stream.dict, PDFName.of("Subtype"))?.toLowerCase();
    const relationship = (() => {
      const v = fs.lookup(PDFName.of("AFRelationship"));
      if (!v) return undefined;
      // PDFName stores the relationship (e.g. /Alternative) — strip leading slash.
      if (v instanceof PDFName) return v.toString().replace(/^\//, "");
      if (typeof (v as unknown as { decodeText?: () => string }).decodeText === "function") {
        return (v as unknown as { decodeText: () => string }).decodeText();
      }
      return String(v);
    })();
    out.push({ filename, mimeType, relationship, bytes: streamBytes });
  }
  return out;
}

function collectFromNameTree(node: PDFDict, out: PDFDict[]): void {
  // Leaf: /Names array of alternating [string, filespec, string, filespec, ...]
  const namesArrRaw = node.lookup(PDFName.of("Names"));
  const namesArr = namesArrRaw instanceof PDFArray ? namesArrRaw : undefined;
  if (namesArr) {
    for (let i = 1; i < namesArr.size(); i += 2) {
      const fsRaw = namesArr.lookup(i);
      const fs = fsRaw instanceof PDFDict ? fsRaw : undefined;
      if (fs) out.push(fs);
    }
  }
  // Branch: /Kids array of intermediate nodes — recurse.
  const kidsRaw = node.lookup(PDFName.of("Kids"));
  const kids = kidsRaw instanceof PDFArray ? kidsRaw : undefined;
  if (kids) {
    for (let i = 0; i < kids.size(); i++) {
      const childRaw = kids.lookup(i);
      const child = childRaw instanceof PDFDict ? childRaw : undefined;
      if (child) collectFromNameTree(child, out);
    }
  }
}

function readStr(dict: PDFDict, key: PDFName): string | undefined {
  const v = dict.lookup(key);
  if (v === undefined) return undefined;
  if (v instanceof PDFString) return v.decodeText();
  if (v instanceof PDFHexString) return v.decodeText();
  return undefined;
}

function readStreamBytes(stream: PDFStream): Uint8Array {
  if (stream instanceof PDFRawStream) {
    const raw = stream.asUint8Array();
    // pdf-lib compresses embedded file streams with FlateDecode by default.
    // Decompress so callers receive the original bytes.
    const filterRaw = stream.dict.lookup(PDFName.of("Filter"));
    const isFlate =
      filterRaw instanceof PDFName && filterRaw.toString() === "/FlateDecode";
    if (isFlate) {
      try {
        return new Uint8Array(inflateSync(raw));
      } catch {
        return raw;
      }
    }
    return raw;
  }
  const contents = (stream as unknown as { getContents?: () => Uint8Array }).getContents;
  if (typeof contents === "function") {
    return contents.call(stream);
  }
  return new Uint8Array();
}
