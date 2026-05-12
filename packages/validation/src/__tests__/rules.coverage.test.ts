// Coverage linchpin (AC #5): every KoSIT 2.5.0 rule ID listed in the vendored
// manifest must be present in the union of the rule arrays — either as a real
// implemented rule or as a typed no-op stub in en16931-deferred.ts. New rule
// sets land = manifest bump + new rule entries; this test catches drift before
// merge.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { getRules } from "../rules/engine.js";

const manifestPath = fileURLToPath(
  new URL("./fixtures/kosit-corpus/manifest.json", import.meta.url),
);
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
  ruleSetVersion: string;
  ruleIds: string[];
};

describe("rules coverage vs KoSIT manifest", () => {
  const implementedIds = new Set(getRules("xrechnung").map((r) => r.id));

  it("manifest is non-empty and well-formed", () => {
    expect(manifest.ruleSetVersion).toBe("kosit-2.5.0");
    expect(manifest.ruleIds.length).toBeGreaterThan(150);
    expect(new Set(manifest.ruleIds).size).toBe(manifest.ruleIds.length);
  });

  it("every manifest rule ID is present in the rule arrays (real or stub)", () => {
    const missing = manifest.ruleIds.filter((id) => !implementedIds.has(id));
    expect(missing, `Unimplemented KoSIT rule IDs: ${missing.join(", ")}`).toEqual([]);
  });

  it("rule IDs are unique across all rule arrays", () => {
    const ids = getRules("xrechnung").map((r) => r.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes, `Duplicate rule IDs: ${[...new Set(dupes)].join(", ")}`).toEqual([]);
  });
});
