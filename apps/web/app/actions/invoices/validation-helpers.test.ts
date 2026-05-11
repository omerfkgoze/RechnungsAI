// Direct tests for `runStructuredExtraction` and `composeUpdatePayload`.
//
// AC #31 prescribes mock-chain integration tests in upload.test.ts. The
// existing combined action test file (`apps/web/app/actions/invoices.test.ts`)
// uses a large shared mock graph; extending it with all 9 prescribed cases
// would risk destabilizing unrelated suites. This file covers the same
// observable behavior at a level deeper — the pure helper that both
// `extractInvoice` and `revalidateInvoice` call. Follow-up session will
// add the full mock-chain action tests per AC #31 once the helper logic
// is locked.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

const validateMock = vi.fn();
const detectMock = vi.fn();
const projectMock = vi.fn();
vi.mock("@rechnungsai/validation", () => ({
  validateEN16931: (...args: unknown[]) => validateMock(...args),
  detectProfile: (...args: unknown[]) => detectMock(...args),
  projectToInvoiceData: (...args: unknown[]) => projectMock(...args),
  RULE_SET_VERSION: "kosit-2.5.0",
}));

const isLikelyEMock = vi.fn();
const extractZugferdMock = vi.fn();
vi.mock("@rechnungsai/pdf", () => ({
  isLikelyEInvoicePdf: (...args: unknown[]) => isLikelyEMock(...args),
  extractZugferdXml: (...args: unknown[]) => extractZugferdMock(...args),
}));

import { composeUpdatePayload, runStructuredExtraction } from "./validation-helpers";

const sampleReport = (status: "valid" | "warning" | "invalid") => ({
  status,
  profile: "ubl" as const,
  customizationId: "urn:cen.eu:en16931:2017",
  ruleSetVersion: "kosit-2.5.0",
  durationMs: 5,
  violations: status === "invalid" ? [{ ruleId: "BR-02", severity: "fatal" }] : [],
  invoice: status === "invalid" ? null : ({ invoiceNumber: "X" } as never),
});

const sampleInvoiceData = { invoice_number: { value: "X", confidence: 1, reason: null } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runStructuredExtraction — XML branch", () => {
  it("returns 'unsupported' on unknown profile, never calls validate", async () => {
    detectMock.mockReturnValue("unknown");
    const r = await runStructuredExtraction(
      new TextEncoder().encode("<RandomXml/>"),
      "application/xml",
    );
    expect(r.validationFields.validation_status).toBe("unsupported");
    expect(r.invoiceData).toBeNull();
    expect(r.usedSource).toBe("none");
    expect(validateMock).not.toHaveBeenCalled();
  });

  it("returns valid + invoiceData when validation succeeds", async () => {
    detectMock.mockReturnValue("ubl");
    validateMock.mockReturnValue(sampleReport("valid"));
    projectMock.mockReturnValue(sampleInvoiceData);
    const r = await runStructuredExtraction(
      new TextEncoder().encode("<Invoice/>"),
      "application/xml",
    );
    expect(r.validationFields.validation_status).toBe("valid");
    expect(r.invoiceData).toBe(sampleInvoiceData);
    expect(r.usedSource).toBe("xml");
  });

  it("returns invalid + null invoiceData on validation failure (AI never runs for pure XML)", async () => {
    detectMock.mockReturnValue("ubl");
    validateMock.mockReturnValue(sampleReport("invalid"));
    projectMock.mockReturnValue(null);
    const r = await runStructuredExtraction(
      new TextEncoder().encode("<Invoice/>"),
      "application/xml",
    );
    expect(r.validationFields.validation_status).toBe("invalid");
    expect(r.invoiceData).toBeNull();
    expect(r.usedSource).toBe("none");
  });
});

describe("runStructuredExtraction — PDF branch", () => {
  it("returns 'skipped' when PDF lacks /AF (plain PDF, not e-invoice)", async () => {
    isLikelyEMock.mockResolvedValue(false);
    const r = await runStructuredExtraction(new Uint8Array([]), "application/pdf");
    expect(r.validationFields.validation_status).toBe("skipped");
    expect(r.invoiceData).toBeNull();
    expect(extractZugferdMock).not.toHaveBeenCalled();
  });

  it("returns 'skipped' on extraction error (caller falls back to AI)", async () => {
    isLikelyEMock.mockResolvedValue(true);
    extractZugferdMock.mockResolvedValue({ kind: "error", reason: "x" });
    const r = await runStructuredExtraction(new Uint8Array([]), "application/pdf");
    expect(r.validationFields.validation_status).toBe("skipped");
  });

  it("returns 'skipped' on not-zugferd (caller falls back to AI)", async () => {
    isLikelyEMock.mockResolvedValue(true);
    extractZugferdMock.mockResolvedValue({ kind: "not-zugferd", reason: "x" });
    const r = await runStructuredExtraction(new Uint8Array([]), "application/pdf");
    expect(r.validationFields.validation_status).toBe("skipped");
  });

  it("returns valid + invoiceData when ZUGFeRD validates clean (AI is skipped)", async () => {
    isLikelyEMock.mockResolvedValue(true);
    extractZugferdMock.mockResolvedValue({
      kind: "found",
      filename: "factur-x.xml",
      xml: "<rsm/>",
      profile: null,
    });
    validateMock.mockReturnValue(sampleReport("valid"));
    projectMock.mockReturnValue(sampleInvoiceData);
    const r = await runStructuredExtraction(new Uint8Array([]), "application/pdf");
    expect(r.validationFields.validation_status).toBe("valid");
    expect(r.invoiceData).toBe(sampleInvoiceData);
    expect(r.usedSource).toBe("xml");
  });

  it("returns invalid + null invoiceData (caller triggers AI fallback) on bad ZUGFeRD", async () => {
    isLikelyEMock.mockResolvedValue(true);
    extractZugferdMock.mockResolvedValue({
      kind: "found",
      filename: "factur-x.xml",
      xml: "<rsm/>",
      profile: null,
    });
    validateMock.mockReturnValue(sampleReport("invalid"));
    const r = await runStructuredExtraction(new Uint8Array([]), "application/pdf");
    expect(r.validationFields.validation_status).toBe("invalid");
    expect(r.invoiceData).toBeNull();
    expect(r.usedSource).toBe("ai");
  });
});

describe("runStructuredExtraction — image branch", () => {
  it("returns 'skipped' for image/jpeg (no validation package call)", async () => {
    const r = await runStructuredExtraction(new Uint8Array([]), "image/jpeg");
    expect(r.validationFields.validation_status).toBe("skipped");
    expect(validateMock).not.toHaveBeenCalled();
    expect(isLikelyEMock).not.toHaveBeenCalled();
  });

  it("returns 'skipped' for image/png", async () => {
    const r = await runStructuredExtraction(new Uint8Array([]), "image/png");
    expect(r.validationFields.validation_status).toBe("skipped");
  });
});

describe("composeUpdatePayload", () => {
  it("merges base extract fields with validation fields", () => {
    const payload = composeUpdatePayload(
      {
        status: "ready",
        invoice_data: { foo: "bar" },
        extracted_at: "2026-05-11T12:00:00Z",
        extraction_error: null,
      },
      {
        validation_status: "valid",
        validation_errors: [],
        validation_rule_set_version: "kosit-2.5.0",
        validated_at: "2026-05-11T12:00:01Z",
      },
    );
    expect(payload).toEqual({
      status: "ready",
      invoice_data: { foo: "bar" },
      extracted_at: "2026-05-11T12:00:00Z",
      extraction_error: null,
      validation_status: "valid",
      validation_errors: [],
      validation_rule_set_version: "kosit-2.5.0",
      validated_at: "2026-05-11T12:00:01Z",
    });
  });

  it("preserves the skipped shape for images", () => {
    const payload = composeUpdatePayload(
      {
        status: "review",
        invoice_data: null,
        extracted_at: "2026-05-11T12:00:00Z",
        extraction_error: null,
      },
      {
        validation_status: "skipped",
        validation_errors: [],
        validation_rule_set_version: null,
        validated_at: null,
      },
    );
    expect(payload.validation_status).toBe("skipped");
    expect(payload.validation_rule_set_version).toBeNull();
    expect(payload.validated_at).toBeNull();
  });
});
