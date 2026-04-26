import { describe, expect, it } from "vitest";
import { BU_SCHLUESSEL_LABELS, mapBuSchluessel, SKR03_CODES, SKR04_CODES } from "./skr.js";

describe("mapBuSchluessel", () => {
  it("returns 9 for 19% VAT", () => {
    expect(mapBuSchluessel(0.19)).toBe(9);
  });

  it("returns 8 for 7% VAT", () => {
    expect(mapBuSchluessel(0.07)).toBe(8);
  });

  it("returns 0 for 0% VAT", () => {
    expect(mapBuSchluessel(0)).toBe(0);
  });

  it("returns 0 for null VAT", () => {
    expect(mapBuSchluessel(null)).toBe(0);
  });

  it("returns 9 for boundary value 0.194 (within ±0.005 of 0.19)", () => {
    expect(mapBuSchluessel(0.194)).toBe(9);
  });

  it("returns 8 for near-boundary value 0.073 (within ±0.005 of 0.07)", () => {
    expect(mapBuSchluessel(0.073)).toBe(8);
  });

  it("returns 0 for unknown VAT rate 0.13", () => {
    expect(mapBuSchluessel(0.13)).toBe(0);
  });
});

describe("SKR03_CODES", () => {
  it("code 3400 label contains Wareneingang", () => {
    expect(SKR03_CODES["3400"]).toContain("Wareneingang");
  });

  it("code 4940 exists", () => {
    expect(SKR03_CODES["4940"]).toBeDefined();
  });
});

describe("SKR04_CODES", () => {
  it("code 4400 exists", () => {
    expect(SKR04_CODES["4400"]).toBeDefined();
  });
});

describe("BU_SCHLUESSEL_LABELS", () => {
  it("has label for key 9", () => {
    expect(BU_SCHLUESSEL_LABELS[9]).toBeDefined();
  });

  it("has label for key 44", () => {
    expect(BU_SCHLUESSEL_LABELS[44]).toBeDefined();
  });
});
