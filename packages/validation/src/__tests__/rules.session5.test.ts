// PASS + FAIL coverage for the rules implemented in Story 6.1 Session 5
// (en16931-codelists-extra.ts): BR-CL-11 (ISO/IEC 6523 ICD on BT-30-1 / BT-47-1),
// BR-CL-22 (VATEX on BT-121), BR-CL-26 (ISO/IEC 6523 ICD on BT-71-1).

import { describe, expect, it } from "vitest";

import { en16931CodelistsExtraRules } from "../rules/en16931-codelists-extra.js";
import { isIso6523Icd } from "../rules/codelists/iso6523-icd.js";
import { isVatexCode } from "../rules/codelists/vatex.js";
import { buildValidInvoice, baseVat, findRule } from "./_fixtures.js";

const r = (id: string) => findRule(en16931CodelistsExtraRules, id);

describe("codelist helpers", () => {
  it("ISO 6523 ICD recognizes standard + 99xx codes, rejects junk", () => {
    expect(isIso6523Icd("0088")).toBe(true); // GLN
    expect(isIso6523Icd("0060")).toBe(true); // DUNS
    expect(isIso6523Icd("9930")).toBe(true); // DE Leitweg-ID range
    expect(isIso6523Icd("ZZZZ")).toBe(false);
    expect(isIso6523Icd(undefined)).toBe(false);
  });
  it("VATEX recognizes EU + national codes, rejects junk", () => {
    expect(isVatexCode("VATEX-EU-AE")).toBe(true);
    expect(isVatexCode("VATEX-EU-132-1A")).toBe(true);
    expect(isVatexCode("VATEX-FR-FRANCHISE")).toBe(true);
    expect(isVatexCode("EU-AE")).toBe(false);
    expect(isVatexCode(undefined)).toBe(false);
  });
});

describe("BR-CL-11 — company legal registration scheme id ⊂ ISO/IEC 6523 ICD", () => {
  it("PASS: no scheme id present", () => {
    expect(r("BR-CL-11").run(buildValidInvoice({ seller: { legalRegId: "HRB 12345" } }))).toBeNull();
  });
  it("PASS: seller scheme id is a valid ICD", () => {
    expect(
      r("BR-CL-11").run(buildValidInvoice({ seller: { legalRegId: "12345", legalRegSchemeId: "0088" } })),
    ).toBeNull();
  });
  it("PASS: buyer scheme id is a valid ICD", () => {
    expect(
      r("BR-CL-11").run(buildValidInvoice({ buyer: { legalRegId: "98765", legalRegSchemeId: "0060" } })),
    ).toBeNull();
  });
  it("FAIL: seller scheme id is not a valid ICD", () => {
    const v = r("BR-CL-11").run(buildValidInvoice({ seller: { legalRegId: "12345", legalRegSchemeId: "XXXX" } }));
    expect(v).not.toBeNull();
    expect(v?.location?.bt).toBe("BT-30-1");
  });
  it("FAIL: buyer scheme id is not a valid ICD", () => {
    const v = r("BR-CL-11").run(buildValidInvoice({ buyer: { legalRegId: "98765", legalRegSchemeId: "bogus" } }));
    expect(v).not.toBeNull();
    expect(v?.location?.bt).toBe("BT-47-1");
  });
});

describe("BR-CL-22 — VAT exemption reason code ⊂ CEF VATEX", () => {
  it("PASS: no exemption reason code", () => {
    expect(r("BR-CL-22").run(buildValidInvoice())).toBeNull();
  });
  it("PASS: valid VATEX code", () => {
    expect(
      r("BR-CL-22").run(
        buildValidInvoice({ vatBreakdown: [baseVat({ category: "E", rate: "0", exemptionReasonCode: "VATEX-EU-132-1A" })] }),
      ),
    ).toBeNull();
  });
  it("FAIL: invalid VATEX code", () => {
    const v = r("BR-CL-22").run(
      buildValidInvoice({ vatBreakdown: [baseVat({ category: "E", rate: "0", exemptionReasonCode: "NOT-A-VATEX" })] }),
    );
    expect(v).not.toBeNull();
    expect(v?.location?.bt).toBe("BT-121");
  });
});

describe("BR-CL-26 — deliver-to location identifier scheme id ⊂ ISO/IEC 6523 ICD", () => {
  it("PASS: no delivery / no location id", () => {
    expect(r("BR-CL-26").run(buildValidInvoice())).toBeNull();
    expect(r("BR-CL-26").run(buildValidInvoice({ delivery: { actualDate: "2026-05-10" } }))).toBeNull();
  });
  it("PASS: valid ICD scheme id", () => {
    expect(
      r("BR-CL-26").run(buildValidInvoice({ delivery: { locationId: { value: "4012345000009", schemeId: "0088" } } })),
    ).toBeNull();
  });
  it("FAIL: invalid ICD scheme id", () => {
    const v = r("BR-CL-26").run(
      buildValidInvoice({ delivery: { locationId: { value: "loc-1", schemeId: "9999X" } } }),
    );
    expect(v).not.toBeNull();
    expect(v?.location?.bt).toBe("BT-71-1");
  });
});
