import { describe, expect, it } from "vitest";
import { computeVerdokConfigHash, type VerdokHashInput } from "./verdok-hash.js";

const BASE: VerdokHashInput = {
  company_name: "Müller GmbH",
  company_address: "Hauptstraße 1, 10115 Berlin",
  tax_id: "DE123456789",
  skr_plan: "SKR03",
  datev_berater_nr: "1234567",
  datev_mandanten_nr: "10001",
  datev_sachkontenlaenge: 4,
  datev_fiscal_year_start: 1,
  datev_default_kreditorenkonto: "70000",
  steuerberater_name: "Dr. Schmidt",
};

describe("computeVerdokConfigHash", () => {
  it("produces a 64-char lowercase hex string", async () => {
    const hash = await computeVerdokConfigHash(BASE);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same input twice → same hash", async () => {
    const h1 = await computeVerdokConfigHash(BASE);
    const h2 = await computeVerdokConfigHash(BASE);
    expect(h1).toBe(h2);
  });

  it("is field-sensitive — different company_name → different hash", async () => {
    const h1 = await computeVerdokConfigHash(BASE);
    const h2 = await computeVerdokConfigHash({ ...BASE, company_name: "Meier GmbH" });
    expect(h1).not.toBe(h2);
  });

  it("is enum-field sensitive — SKR03 → SKR04 → different hash", async () => {
    const h1 = await computeVerdokConfigHash({ ...BASE, skr_plan: "SKR03" });
    const h2 = await computeVerdokConfigHash({ ...BASE, skr_plan: "SKR04" });
    expect(h1).not.toBe(h2);
  });

  it("distinguishes null from non-null on a nullable field", async () => {
    const h1 = await computeVerdokConfigHash({ ...BASE, steuerberater_name: null });
    const h2 = await computeVerdokConfigHash({ ...BASE, steuerberater_name: "Dr. Schmidt" });
    expect(h1).not.toBe(h2);
  });

  it("is canonicalized — reordered object keys → same hash", async () => {
    const reordered: VerdokHashInput = {
      steuerberater_name: BASE.steuerberater_name,
      tax_id: BASE.tax_id,
      datev_default_kreditorenkonto: BASE.datev_default_kreditorenkonto,
      datev_fiscal_year_start: BASE.datev_fiscal_year_start,
      datev_sachkontenlaenge: BASE.datev_sachkontenlaenge,
      datev_mandanten_nr: BASE.datev_mandanten_nr,
      datev_berater_nr: BASE.datev_berater_nr,
      skr_plan: BASE.skr_plan,
      company_address: BASE.company_address,
      company_name: BASE.company_name,
    };
    const h1 = await computeVerdokConfigHash(BASE);
    const h2 = await computeVerdokConfigHash(reordered);
    expect(h1).toBe(h2);
  });

  it("treats undefined-coerced nullable fields identically to explicit null", async () => {
    // Guards the `?? null` invariant: a caller passing `undefined` (e.g. a DB
    // row with a missing column) must hash the same as an explicit null.
    const withNull = await computeVerdokConfigHash({ ...BASE, company_address: null });
    const withUndefined = await computeVerdokConfigHash({
      ...BASE,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      company_address: undefined as any,
    });
    expect(withNull).toBe(withUndefined);
  });

  // Linchpin — guards against silent field drift. Adding/removing a field in
  // VerdokHashInput makes this object literal fail to compile before the
  // count assertion runs.
  it("VerdokHashInput covers exactly the 10 expected tenant fields", () => {
    const expectedCount = 10;
    const sample: VerdokHashInput = {
      company_name: null,
      company_address: null,
      tax_id: null,
      skr_plan: "SKR03",
      datev_berater_nr: null,
      datev_mandanten_nr: null,
      datev_sachkontenlaenge: 4,
      datev_fiscal_year_start: 1,
      datev_default_kreditorenkonto: null,
      steuerberater_name: null,
    };
    expect(Object.keys(sample)).toHaveLength(expectedCount);
  });
});
