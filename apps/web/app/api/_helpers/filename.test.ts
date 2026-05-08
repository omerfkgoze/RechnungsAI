import { describe, expect, it } from "vitest";
import { toTenantSlug } from "./filename";

describe("toTenantSlug", () => {
  // P10 — German tenants must round-trip readably; umlauts must transliterate
  // rather than collapse to '-'.
  it("transliterates umlauts and ß", () => {
    expect(toTenantSlug("Müller GmbH")).toBe("mueller-gmbh");
    expect(toTenantSlug("Bäckerei Größler")).toBe("baeckerei-groessler");
    expect(toTenantSlug("Süß ÖG")).toBe("suess-oeg");
  });

  it("strips combining marks via NFD", () => {
    // "café" written with a combining acute (e + U+0301) should also normalize
    expect(toTenantSlug("café")).toBe("cafe");
  });

  it("collapses non-ASCII / fully non-Latin company names to empty string (caller falls back)", () => {
    expect(toTenantSlug("株式会社")).toBe("");
  });

  it("trims leading/trailing dashes and clamps to 40 chars", () => {
    expect(toTenantSlug("---ACME---")).toBe("acme");
    const long = "a".repeat(60);
    expect(toTenantSlug(long).length).toBe(40);
  });
});
