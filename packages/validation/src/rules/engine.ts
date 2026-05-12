// Rule engine: pure function over the normalized Invoice model.
// A rule is a TS object literal with a `run` predicate. Rules are pure and
// side-effect-free. `runRules` returns the violations in declaration order so
// the UI (Story 6.2) can group by category without re-sorting.

import type {
  Invoice,
  Severity,
  ValidationViolation,
  ViolationCategory,
  ViolationLocation,
} from "../types.js";

import { en16931CoreRules } from "./en16931-core.js";
import { en16931CalculationsRules } from "./en16931-calculations.js";
import { en16931CodelistsRules } from "./en16931-codelists.js";
import { en16931VatRules } from "./en16931-vat.js";
import { en16931DecRules } from "./en16931-dec.js";
import { deferredRules } from "./en16931-deferred.js";
import { xrechnungDeRules } from "./xrechnung-de.js";

export type RuleSet = "core" | "xrechnung";

export type RuleViolation = {
  location?: ViolationLocation;
  message: string;
  messageParams?: Record<string, string>;
};

export type Rule = {
  id: string;
  category: ViolationCategory;
  severity: Severity;
  citation: string;
  /** English developer-facing one-liner. NEVER user-visible. */
  summary: string;
  /** Pure predicate: returns null when the rule passes, RuleViolation when it fails. */
  run: (invoice: Invoice) => RuleViolation | null;
};

const CORE_RULES: readonly Rule[] = [
  ...en16931CoreRules,
  ...en16931CalculationsRules,
  ...en16931CodelistsRules,
  ...en16931VatRules,
  ...en16931DecRules,
  ...deferredRules,
];

const XRECHNUNG_RULES: readonly Rule[] = [...CORE_RULES, ...xrechnungDeRules];

export function getRules(ruleSet: RuleSet): readonly Rule[] {
  return ruleSet === "xrechnung" ? XRECHNUNG_RULES : CORE_RULES;
}

export function runRules(
  invoice: Invoice,
  ruleSet: RuleSet,
): ValidationViolation[] {
  const rules = getRules(ruleSet);
  const out: ValidationViolation[] = [];
  for (const rule of rules) {
    let hit: RuleViolation | null;
    try {
      hit = rule.run(invoice);
    } catch (err) {
      // A throwing rule is a bug. Surface as a STRUCT violation so the run
      // still completes (we never let one bad rule torpedo a whole report).
      out.push({
        ruleId: `STRUCT-RULE-THREW`,
        category: "STRUCT",
        severity: "error",
        citation: "Internal",
        message: `Regel "${rule.id}" konnte nicht ausgewertet werden.`,
      });
      void err;
      continue;
    }
    if (hit !== null) {
      out.push({
        ruleId: rule.id,
        category: rule.category,
        severity: rule.severity,
        citation: rule.citation,
        message: hit.message,
        location: hit.location,
      });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared numeric helpers — re-exported from math.ts for backward compatibility.
// Rule files import directly from "./math.js" to avoid circular deps.
// ─────────────────────────────────────────────────────────────────────────────
export { eq2, num, round2, sum } from "./math.js";
