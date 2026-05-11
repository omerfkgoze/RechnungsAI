import { describe, expect, it } from "vitest";

import { extractZugferdXml } from "../extract-zugferd-xml.js";
import { buildPlainPdf, buildZugferdPdf } from "./_fixtures.js";

describe("extractZugferdXml", () => {
  it("returns kind='error' on garbage bytes", async () => {
    const r = await extractZugferdXml(new Uint8Array([0, 1, 2, 3]));
    expect(r.kind).toBe("error");
  });

  it("returns kind='not-zugferd' on a plain PDF without attachments", async () => {
    const r = await extractZugferdXml(await buildPlainPdf());
    expect(r.kind).toBe("not-zugferd");
  });

  it("returns kind='found' with filename='factur-x.xml' for a ZUGFeRD PDF", async () => {
    const r = await extractZugferdXml(await buildZugferdPdf("factur-x.xml"));
    expect(r.kind).toBe("found");
    if (r.kind === "found") {
      expect(r.filename).toBe("factur-x.xml");
      expect(r.xml.startsWith("<?xml")).toBe(true);
      expect(r.profile).toBeNull();
    }
  });

  it("matches alternate ZUGFeRD filename 'zugferd-invoice.xml'", async () => {
    const r = await extractZugferdXml(
      await buildZugferdPdf("zugferd-invoice.xml"),
    );
    expect(r.kind).toBe("found");
    if (r.kind === "found") {
      expect(r.filename).toBe("zugferd-invoice.xml");
    }
  });
});
