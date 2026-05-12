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
//
// Remaining stubs (as of Story 6.1 Session 4): these three require codelist data
// that is not yet vendored into the package —
//   - BR-CL-11: registration scheme identifier ⊂ ISO 6523 ICD list
//   - BR-CL-22: tax-exemption-reason scheme identifier ⊂ CEF VATEX list
//   - BR-CL-26: delivery-location scheme identifier ⊂ ISO 6523 ICD list
// Implement once the ISO 6523 ICD + CEF VATEX code sets are added under
// rules/codelists/ (same recipe as iso4217-currency.ts).

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
  stub("BR-CL-11", "BR-CL"),
  stub("BR-CL-22", "BR-CL"),
  stub("BR-CL-26", "BR-CL"),
];
