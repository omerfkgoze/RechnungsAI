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
  const names = doc.catalog.lookup(PDFName.of("Names"), PDFDict);
  const embeddedFiles = names
    ? names.lookup(PDFName.of("EmbeddedFiles"), PDFDict)
    : undefined;

  const filespecs: PDFDict[] = [];
  if (embeddedFiles) {
    collectFromNameTree(embeddedFiles, filespecs);
  }

  // Approach 2: catalog → /AF (associated files). PDF/A-3 puts the ZUGFeRD
  // filespec here in addition to /Names. We merge unique dict refs.
  const afArray = doc.catalog.lookup(PDFName.of("AF"), PDFArray);
  if (afArray) {
    for (let i = 0; i < afArray.size(); i++) {
      const entry = afArray.lookup(i, PDFDict);
      if (entry && !filespecs.includes(entry)) filespecs.push(entry);
    }
  }

  const out: ExtractedAttachment[] = [];
  for (const fs of filespecs) {
    const filename = readStr(fs, PDFName.of("UF")) ?? readStr(fs, PDFName.of("F"));
    if (!filename) continue;
    const ef = fs.lookup(PDFName.of("EF"), PDFDict);
    if (!ef) continue;
    const stream =
      ef.lookup(PDFName.of("F"), PDFStream) ?? ef.lookup(PDFName.of("UF"), PDFStream);
    if (!stream) continue;
    const streamBytes = readStreamBytes(stream);
    const mimeType =
      readStr(fs, PDFName.of("Subtype"))?.toLowerCase() ??
      readStr(stream.dict, PDFName.of("Subtype"))?.toLowerCase();
    const relationship = (() => {
      const v = fs.lookup(PDFName.of("AFRelationship"));
      if (!v) return undefined;
      if (typeof (v as { decodeText?: () => string }).decodeText === "function") {
        return (v as PDFName).encodedName.replace(/^\//, "");
      }
      return String(v);
    })();
    out.push({ filename, mimeType, relationship, bytes: streamBytes });
  }
  return out;
}

function collectFromNameTree(node: PDFDict, out: PDFDict[]): void {
  // Leaf: /Names array of alternating [string, filespec, string, filespec, ...]
  const namesArr = node.lookup(PDFName.of("Names"), PDFArray);
  if (namesArr) {
    for (let i = 1; i < namesArr.size(); i += 2) {
      const fs = namesArr.lookup(i, PDFDict);
      if (fs) out.push(fs);
    }
  }
  // Branch: /Kids array of intermediate nodes — recurse.
  const kids = node.lookup(PDFName.of("Kids"), PDFArray);
  if (kids) {
    for (let i = 0; i < kids.size(); i++) {
      const child = kids.lookup(i, PDFDict);
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
    return stream.asUint8Array();
  }
  const contents = (stream as unknown as { getContents?: () => Uint8Array }).getContents;
  if (typeof contents === "function") {
    return contents.call(stream);
  }
  return new Uint8Array();
}
