// Public API for @rechnungsai/validation.
//
// Sync, pure-compute. The caller (Story 6.1 extractInvoice / revalidateInvoice)
// owns DB writes, audit, logging. This package never imports from `@supabase/*`,
// `next/*`, `react/*`, or any apps/web path (verified by package boundary
// convention — see project root package.json `//dependencyRules`).

import { parseXml, XmlParseError } from "./parsers/xml.js";
import { detectProfile } from "./parsers/detect.js";
import { projectFromUbl } from "./parsers/ubl.js";
import { projectFromCii } from "./parsers/cii.js";
import { runRules, type RuleSet } from "./rules/engine.js";
import { projectToInvoiceData } from "./project-to-invoice-data.js";
import type {
  Invoice,
  Severity,
  ValidationReport,
  ValidationStatus,
  ValidationViolation,
  ViolationCategory,
} from "./types.js";

export const RULE_SET_VERSION = "kosit-2.5.0";
const MAX_XML_BYTES = 10 * 1024 * 1024;

export type ValidateOptions = {
  profile?: "auto" | "ubl" | "cii";
  ruleSet?: RuleSet;
};

export function validateEN16931(
  xml: string,
  opts?: ValidateOptions,
): ValidationReport {
  const t0 =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

  // AC #7 — input size guard (XXE / billion-laughs defense-in-depth).
  if (typeof xml !== "string" || xml.length > MAX_XML_BYTES) {
    return finalize(t0, {
      status: "invalid",
      profile: "unknown",
      customizationId: "",
      violations: [
        {
          ruleId: "STRUCT-XML-TOO-LARGE",
          category: "STRUCT",
          severity: "fatal",
          citation: "Package size guard (AC #7)",
          message: "XML-Datei zu groß (max. 10 MB).",
        },
      ],
      invoice: null,
    });
  }

  const requestedProfile = opts?.profile ?? "auto";
  const ruleSet: RuleSet = opts?.ruleSet ?? "xrechnung";

  const detected =
    requestedProfile === "ubl" || requestedProfile === "cii"
      ? requestedProfile
      : detectProfile(xml);

  if (detected === "unknown") {
    return finalize(t0, {
      status: "invalid",
      profile: "unknown",
      customizationId: "",
      violations: [
        {
          ruleId: "STRUCT-PROFILE-UNKNOWN",
          category: "STRUCT",
          severity: "fatal",
          citation: "Package profile detection",
          message: "E-Rechnungsformat erkannt, aber nicht unterstützt.",
        },
      ],
      invoice: null,
    });
  }

  let raw;
  try {
    raw = parseXml(xml);
  } catch (err) {
    return finalize(t0, {
      status: "invalid",
      profile: detected,
      customizationId: "",
      violations: [
        {
          ruleId: "STRUCT-XML-MALFORMED",
          category: "STRUCT",
          severity: "fatal",
          citation: "Package XML parse",
          message: "XML konnte nicht gelesen werden — Format ungültig.",
          location: err instanceof XmlParseError ? { xpath: "/" } : undefined,
        },
      ],
      invoice: null,
    });
  }

  const projection =
    detected === "ubl" ? projectFromUbl(raw) : projectFromCii(raw);
  const projectionViolations = projection.violations;
  const invoice = projection.invoice;

  if (!invoice) {
    return finalize(t0, {
      status: "invalid",
      profile: detected,
      customizationId: "",
      violations: projectionViolations,
      invoice: null,
    });
  }

  const ruleViolations = runRules(invoice, ruleSet);
  const violations = [...projectionViolations, ...ruleViolations];
  const status = computeStatus(violations);

  return finalize(t0, {
    status,
    profile: detected,
    customizationId: invoice.customizationId,
    violations,
    invoice,
  });
}

function computeStatus(violations: ValidationViolation[]): ValidationStatus {
  let hasFatal = false;
  let hasWarning = false;
  for (const v of violations) {
    if (v.severity === "fatal" || v.severity === "error") hasFatal = true;
    else if (v.severity === "warning") hasWarning = true;
  }
  if (hasFatal) return "invalid";
  if (hasWarning) return "warning";
  return "valid";
}

function finalize(
  t0: number,
  partial: Omit<ValidationReport, "ruleSetVersion" | "durationMs">,
): ValidationReport {
  const t1 =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const durationMs = Math.max(0, Math.round(t1 - t0));
  if (durationMs > 500) {
    // eslint-disable-next-line no-console
    console.warn("[validation] slow validate", { durationMs });
  }
  return {
    ...partial,
    ruleSetVersion: RULE_SET_VERSION,
    durationMs,
  };
}

export { detectProfile } from "./parsers/detect.js";
export { projectToInvoiceData };

export type {
  Invoice,
  Severity,
  ValidationReport,
  ValidationStatus,
  ValidationViolation,
  ViolationCategory,
};
