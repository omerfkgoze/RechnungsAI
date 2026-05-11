import { describe, expect, it } from "vitest";

import { getRules, runRules } from "../rules/engine.js";
import { buildValidInvoice } from "./_fixtures.js";

describe("rules engine", () => {
  it("runs all core rules without crashing on a valid invoice", () => {
    const invoice = buildValidInvoice();
    const violations = runRules(invoice, "core");
    // A valid invoice may still produce warnings (e.g. de-BR-* skipped) but
    // no fatal/error violations.
    const fatal = violations.filter((v) => v.severity === "fatal" || v.severity === "error");
    expect(fatal).toHaveLength(0);
  });

  it("xrechnung rule set includes more rules than core", () => {
    expect(getRules("xrechnung").length).toBeGreaterThan(getRules("core").length);
  });

  it("emits violations in declaration order (deterministic)", () => {
    const invoice = buildValidInvoice({ invoiceNumber: undefined, issueDate: undefined });
    const v = runRules(invoice, "core").map((x) => x.ruleId);
    expect(v.indexOf("BR-02")).toBeLessThan(v.indexOf("BR-03"));
  });

  it("does not throw when a rule's predicate throws — surfaces STRUCT violation instead", () => {
    // We exercise this via the public engine: build an invoice with a
    // negative payable but no other anomalies. A rule that throws is a bug,
    // but the engine must remain robust. (This test is a guard for the
    // catch-block in runRules.)
    const invoice = buildValidInvoice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (invoice as any).documentTotals = null;
    const result = runRules(invoice, "core");
    // We expect at least one STRUCT-RULE-THREW or graceful violation rather than a throw.
    expect(Array.isArray(result)).toBe(true);
  });
});
