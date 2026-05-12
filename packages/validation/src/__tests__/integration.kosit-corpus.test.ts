// Integration tier (AC #29): run the vendored KoSIT XRechnung test corpus
// through validateEN16931 and assert coarse expectations:
//   - business-cases/* are realistic conformant invoices → must parse, profile
//     must be recognized (ubl|cii), and must NOT be `invalid` purely because of
//     a structural/parse failure (STRUCT-* fatal). Rule-level violations are
//     tolerated while rule coverage is still being filled in (en16931-deferred).
//   - technical-cases/* are edge instances → must parse without throwing; any
//     status is acceptable.
//
// This is intentionally lenient on rule outcomes (the per-rule PASS/FAIL gate
// lives in rules.*.test.ts and the coverage gate in rules.coverage.test.ts).
// Its job is to prove the parsers survive real-world XRechnung XML.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { validateEN16931 } from "../index.js";

const corpusRoot = fileURLToPath(
  new URL("./fixtures/kosit-corpus", import.meta.url),
);

function xmlFiles(subdir: string): { name: string; xml: string }[] {
  const dir = `${corpusRoot}/${subdir}`;
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".xml"))
    .map((f) => ({ name: `${subdir}/${f}`, xml: readFileSync(`${dir}/${f}`, "utf-8") }));
}

const businessCases = [
  ...xmlFiles("business-cases-standard"),
  ...xmlFiles("business-cases-extension"),
];
const technicalCases = [
  ...xmlFiles("technical-cases-cius"),
  ...xmlFiles("technical-cases-cvd"),
];

const STRUCT_FATAL = (rid: string) =>
  rid === "STRUCT-XML-MALFORMED" ||
  rid === "STRUCT-PROFILE-UNKNOWN" ||
  rid === "STRUCT-XML-TOO-LARGE" ||
  rid === "STRUCT-UBL-ROOT-MISSING" ||
  rid === "STRUCT-CII-ROOT-MISSING";

describe("KoSIT corpus — integration", () => {
  it("corpus is present (vendoring step ran)", () => {
    expect(businessCases.length).toBeGreaterThan(20);
  });

  describe.each(businessCases)("business case %s", ({ xml }) => {
    it("parses, recognizes the profile, and has no structural failure", () => {
      const report = validateEN16931(xml, { ruleSet: "xrechnung" });
      expect(["ubl", "cii"]).toContain(report.profile);
      expect(report.invoice).not.toBeNull();
      const structFatal = report.violations.filter((v) => STRUCT_FATAL(v.ruleId));
      expect(
        structFatal,
        `Structural failure on conformant invoice: ${structFatal.map((v) => v.ruleId).join(", ")}`,
      ).toEqual([]);
    });
  });

  describe.each(technicalCases)("technical case %s", ({ xml }) => {
    it("does not throw", () => {
      expect(() => validateEN16931(xml, { ruleSet: "xrechnung" })).not.toThrow();
    });
  });
});
