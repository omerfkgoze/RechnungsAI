// Deferred EN 16931 rules — typed no-op stubs.
//
// These rule IDs belong to the KoSIT 2.5.0 rule set (see
// __tests__/fixtures/kosit-corpus/manifest.json) but their predicate logic is not
// yet implemented. They ship as no-op stubs (run: () => null) so the coverage
// assertion (rules.coverage.test.ts) holds and so that giving each one a real body
// later is a localized change with no engine wiring churn.
//
// When you implement a rule: remove its entry here and add the real Rule object to
// the appropriate en16931-*.ts / xrechnung-de.ts file with PASS+FAIL unit tests.

import type { Rule } from "./engine.js";

const stub = (id: string, category: Rule["category"]): Rule => ({
  id,
  category,
  severity: "error",
  citation: "EN 16931:2017 (rule predicate not yet implemented)",
  summary: `Deferred stub for ${id} — no validation performed yet.`,
  run: () => null,
});

export const deferredRules: readonly Rule[] = [
  stub("BR-33", "BR"),
  stub("BR-38", "BR"),
  stub("BR-41", "BR"),
  stub("BR-42", "BR"),
  stub("BR-43", "BR"),
  stub("BR-44", "BR"),
  stub("BR-49", "BR"),
  stub("BR-51", "BR"),
  stub("BR-53", "BR"),
  stub("BR-54", "BR"),
  stub("BR-55", "BR"),
  // BR-AE-02..08 — implemented in en16931-vat.ts
  stub("BR-AF-01", "BR"),
  stub("BR-AF-02", "BR"),
  stub("BR-AF-03", "BR"),
  stub("BR-AF-04", "BR"),
  stub("BR-AF-05", "BR"),
  stub("BR-AF-06", "BR"),
  stub("BR-AF-07", "BR"),
  stub("BR-AF-08", "BR"),
  stub("BR-AF-09", "BR"),
  stub("BR-AF-10", "BR"),
  stub("BR-AG-01", "BR"),
  stub("BR-AG-02", "BR"),
  stub("BR-AG-03", "BR"),
  stub("BR-AG-04", "BR"),
  stub("BR-AG-05", "BR"),
  stub("BR-AG-06", "BR"),
  stub("BR-AG-07", "BR"),
  stub("BR-AG-08", "BR"),
  stub("BR-AG-09", "BR"),
  stub("BR-AG-10", "BR"),
  stub("BR-B-01", "BR"),
  stub("BR-B-02", "BR"),
  stub("BR-CL-05", "BR-CL"),
  stub("BR-CL-11", "BR-CL"),
  stub("BR-CL-18", "BR-CL"),
  stub("BR-CL-22", "BR-CL"),
  stub("BR-CL-26", "BR-CL"),
  // BR-CO-03 / BR-CO-05..08 — implemented in en16931-calculations.ts
  // BR-DEC-* — implemented in en16931-dec.ts
  // BR-S/Z/E/AE/G/IC/O-* VAT-category families — implemented in en16931-vat.ts
];
