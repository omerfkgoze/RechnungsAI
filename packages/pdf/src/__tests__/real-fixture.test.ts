// AC #12 / #30 — exercise the extraction code paths against a real-world
// ZUGFeRD 2.x / Factur-X PDF/A-3 (see fixtures/README.md for provenance).
// The synthetic PDFs in _fixtures.ts cannot reproduce a byte-identical real
// PDF/A-3 (compressed embedded streams, real name tree); this fixture closes
// that gap.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { isLikelyEInvoicePdf } from "../detect-einvoice.js";
import { extractAttachments } from "../extract-attachments.js";
import { extractZugferdXml } from "../extract-zugferd-xml.js";

const pdfBytes = new Uint8Array(
  readFileSync(
    fileURLToPath(new URL("./fixtures/zugferd-2-en16931.pdf", import.meta.url)),
  ),
);

describe("real ZUGFeRD PDF fixture", () => {
  it("isLikelyEInvoicePdf returns true (catalog /AF present)", async () => {
    expect(await isLikelyEInvoicePdf(pdfBytes)).toBe(true);
  });

  it("extractAttachments finds the embedded factur-x.xml and inflates the stream", async () => {
    const atts = await extractAttachments(pdfBytes);
    const xml = atts.find((a) => a.filename.toLowerCase() === "factur-x.xml");
    expect(xml).toBeDefined();
    const text = new TextDecoder("utf-8").decode(xml!.bytes);
    expect(text.trimStart().startsWith("<?xml")).toBe(true);
    expect(text).toContain("CrossIndustryInvoice");
  });

  it("extractZugferdXml returns kind='found' with the CII XML", async () => {
    const r = await extractZugferdXml(pdfBytes);
    expect(r.kind).toBe("found");
    if (r.kind === "found") {
      expect(r.filename.toLowerCase()).toBe("factur-x.xml");
      expect(r.xml.trimStart().startsWith("<?xml")).toBe(true);
      expect(r.xml).toContain("CrossIndustryInvoice");
      expect(r.profile).toBeNull();
    }
  });
});
