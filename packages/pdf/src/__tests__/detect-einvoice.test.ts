import { describe, expect, it } from "vitest";

import { isLikelyEInvoicePdf } from "../detect-einvoice.js";
import { buildPlainPdf, buildZugferdPdf } from "./_fixtures.js";

describe("isLikelyEInvoicePdf", () => {
  it("returns false on garbage bytes", async () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    expect(await isLikelyEInvoicePdf(bytes)).toBe(false);
  });

  it("returns false on a plain PDF without /AF", async () => {
    const bytes = await buildPlainPdf();
    expect(await isLikelyEInvoicePdf(bytes)).toBe(false);
  });

  it("returns true on a PDF with embedded factur-x.xml /AF entry", async () => {
    const bytes = await buildZugferdPdf();
    expect(await isLikelyEInvoicePdf(bytes)).toBe(true);
  });
});
