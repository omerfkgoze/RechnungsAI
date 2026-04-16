import { describe, expect, it } from "vitest";
import { extractInvoice } from "./extract-invoice.js";

describe("extractInvoice", () => {
  it("returns ActionResult with success:false until Story 2.2 is implemented", async () => {
    const result = await extractInvoice("dummy content");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("[ai:extract]");
    }
  });

  it("returns ActionResult shape — no thrown exception", async () => {
    const result = await extractInvoice("");
    expect(result).toHaveProperty("success");
  });
});
