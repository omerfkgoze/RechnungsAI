// Validation helpers shared by `extractInvoice` (upload.ts) and
// `revalidateInvoice` (review.ts). This file is intentionally NOT marked
// "use server" — under Next.js 16, "use server" files may only export
// async Server Actions, and these helpers are pure utility functions called
// inside Server Actions (not at the boundary).
//
// Source: Story 6.1 spike P4 §3.1 (choreography), §5.3 (projection helper).

import * as Sentry from "@sentry/nextjs";
import {
  detectProfile,
  projectToInvoiceData,
  RULE_SET_VERSION,
  validateEN16931,
  type ValidationReport,
  type ValidationStatus,
} from "@rechnungsai/validation";
import {
  extractZugferdXml,
  isLikelyEInvoicePdf,
} from "@rechnungsai/pdf";
import { type Database, type Json } from "@rechnungsai/shared";

type InvoiceUpdate = Database["public"]["Tables"]["invoices"]["Update"];

export type CallerValidationStatus =
  | ValidationStatus
  | "unsupported"
  | "skipped"
  | "pending";

export type ValidationDbFields = {
  validation_status: CallerValidationStatus;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validation_errors: any[];
  validation_rule_set_version: string | null;
  validated_at: string | null;
};

export type StructuredExtractionResult = {
  validationFields: ValidationDbFields;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoiceData: any | null;
  usedSource: "xml" | "ai" | "none";
  report: ValidationReport | null;
};

export const SKIPPED_VALIDATION: ValidationDbFields = {
  validation_status: "skipped",
  validation_errors: [],
  validation_rule_set_version: null,
  validated_at: null,
};

export function reportToDbFields(report: ValidationReport): ValidationDbFields {
  return {
    validation_status: report.status,
    validation_errors: report.violations,
    validation_rule_set_version: report.ruleSetVersion,
    validated_at: new Date().toISOString(),
  };
}

type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];

export function composeUpdatePayload(
  base: {
    status: InvoiceStatus;
    invoice_data: Json | null;
    extracted_at: string;
    extraction_error: string | null;
  },
  v: ValidationDbFields,
): InvoiceUpdate {
  return {
    status: base.status,
    invoice_data: base.invoice_data,
    extracted_at: base.extracted_at,
    extraction_error: base.extraction_error,
    validation_status: v.validation_status,
    validation_errors: v.validation_errors,
    validation_rule_set_version: v.validation_rule_set_version,
    validated_at: v.validated_at,
  };
}

export async function runStructuredExtraction(
  bytes: Uint8Array,
  fileType: string,
): Promise<StructuredExtractionResult> {
  if (fileType === "application/xml" || fileType === "text/xml") {
    const xml = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const profile = detectProfile(xml);
    if (profile === "unknown") {
      return {
        validationFields: {
          validation_status: "unsupported",
          validation_errors: [
            {
              ruleId: "STRUCT-PROFILE-UNKNOWN",
              category: "STRUCT",
              severity: "fatal",
              citation: "",
              message: "E-Rechnungsformat erkannt, aber nicht unterstützt.",
            },
          ],
          validation_rule_set_version: RULE_SET_VERSION,
          validated_at: new Date().toISOString(),
        },
        invoiceData: null,
        usedSource: "none",
        report: null,
      };
    }
    const report = validateEN16931(xml, { ruleSet: "xrechnung" });
    const invoiceData = projectToInvoiceData(report);
    return {
      validationFields: reportToDbFields(report),
      invoiceData,
      usedSource: invoiceData ? "xml" : "none",
      report,
    };
  }

  if (fileType === "application/pdf") {
    const looksLikeE = await isLikelyEInvoicePdf(bytes);
    if (!looksLikeE) {
      return {
        validationFields: SKIPPED_VALIDATION,
        invoiceData: null,
        usedSource: "none",
        report: null,
      };
    }
    const result = await extractZugferdXml(bytes);
    if (result.kind === "error") {
      console.warn(
        "[invoices:validate] zugferd-extract-error",
        result.reason,
        result.detail,
      );
      Sentry.addBreadcrumb({
        category: "invoices",
        message: "zugferd-extract-error",
        level: "warning",
        data: { reason: result.reason, detail: result.detail },
      });
      return {
        validationFields: SKIPPED_VALIDATION,
        invoiceData: null,
        usedSource: "none",
        report: null,
      };
    }
    if (result.kind === "not-zugferd") {
      return {
        validationFields: SKIPPED_VALIDATION,
        invoiceData: null,
        usedSource: "none",
        report: null,
      };
    }
    const report = validateEN16931(result.xml, { ruleSet: "xrechnung" });
    if (report.status === "invalid") {
      return {
        validationFields: reportToDbFields(report),
        invoiceData: null,
        usedSource: "ai",
        report,
      };
    }
    const invoiceData = projectToInvoiceData(report);
    return {
      validationFields: reportToDbFields(report),
      invoiceData,
      usedSource: invoiceData ? "xml" : "none",
      report,
    };
  }

  return {
    validationFields: SKIPPED_VALIDATION,
    invoiceData: null,
    usedSource: "none",
    report: null,
  };
}
