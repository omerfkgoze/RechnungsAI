import { describe, expect, it } from "vitest";

import { extractAttachments } from "../extract-attachments.js";
import { buildPlainPdf, buildZugferdPdf } from "./_fixtures.js";

describe("extractAttachments", () => {
  it("returns an empty array for a plain PDF", async () => {
    expect(await extractAttachments(await buildPlainPdf())).toEqual([]);
  });

  it("returns the embedded file with filename + bytes", async () => {
    const all = await extractAttachments(await buildZugferdPdf());
    expect(all).toHaveLength(1);
    expect(all[0]?.filename).toBe("factur-x.xml");
    expect(all[0]?.bytes.byteLength).toBeGreaterThan(0);
  });
});
