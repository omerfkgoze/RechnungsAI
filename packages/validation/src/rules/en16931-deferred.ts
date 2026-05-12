// Deferred EN 16931 rules — typed no-op stubs.
//
// A rule ID lands here only while its predicate logic is genuinely
// un-implementable against the current normalized model (e.g. it needs a code
// set we haven't vendored, or a model/parser extension). Shipping it as a no-op
// stub keeps the coverage assertion (rules.coverage.test.ts) green and makes
// "give it a real body later" a localized change with no engine wiring churn.
//
// As of Story 6.1 Session 5 this list is EMPTY — every manifest ID has a real
// rule body. The last three (BR-CL-11 / BR-CL-22 / BR-CL-26) were converted in
// Session 5 once the ISO/IEC 6523 ICD + CEF VATEX code sets were vendored under
// rules/codelists/; see en16931-codelists-extra.ts. Party.legalRegSchemeId
// (BT-30-1 / BT-47-1) was added to the model + both parsers for BR-CL-11.
//
// To re-add a stub: `stub("BR-XX-YY", "BR-XX")` and document why it can't be a
// real rule yet.

import type { Rule } from "./engine.js";

// Retained for the next time a rule genuinely can't be implemented yet.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const stub = (id: string, category: Rule["category"]): Rule => ({
  id,
  category,
  severity: "error",
  citation: "EN 16931:2017 (rule predicate not yet implemented)",
  summary: `Deferred stub for ${id} — no validation performed yet.`,
  run: () => null,
});

export const deferredRules: readonly Rule[] = [];
