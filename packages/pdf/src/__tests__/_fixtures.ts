// Synthetic PDF/A-3 fixture builder using pdf-lib's own attachment API.
// AC #12 BLOCKED-BY-ENVIRONMENT fallback path: rather than vendoring public-
// domain ZUGFeRD corpora (network access required + license posture review),
// we hand-assemble minimal PDFs that exercise the extraction code paths.
//
// Limitations:
//   - These PDFs are NOT cryptographically signed nor PDF/A-3 conformant; they
//     embed a file and set /AF on the catalog, which is what our extraction
//     code path looks for.
//   - The real-world corpus is queued for Task 4 follow-up; substitute these
//     fixtures with real PDFs once available.

import { AFRelationship, PDFDocument } from "pdf-lib";

const MINIMAL_CII = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100">
  <rsm:ExchangedDocument><dummy/></rsm:ExchangedDocument>
</rsm:CrossIndustryInvoice>`;

export async function buildPlainPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  return await doc.save();
}

export async function buildZugferdPdf(
  filename = "factur-x.xml",
  xml = MINIMAL_CII,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  await doc.attach(new TextEncoder().encode(xml), filename, {
    mimeType: "application/xml",
    description: "ZUGFeRD invoice XML",
    afRelationship: AFRelationship.Alternative,
  });
  return await doc.save();
}
