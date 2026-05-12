// AC #32 — mock-chain integration tests for `revalidateInvoice`.
//
// The pure choreography of `runStructuredExtraction` is covered deeper in
// `validation-helpers.test.ts`; this file checks the Server Action wiring:
// tenant-isolation guard, `status='processing'` block, auth redirect, the
// skip path for non-XML/PDF files, the happy XRechnung re-validate (single
// UPDATE + `revalidation_completed` audit event), audit-failure swallowing,
// and the PDF non-zugferd skip.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`) as Error & { digest: string };
    err.digest = `NEXT_REDIRECT;${url}`;
    throw err;
  }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

vi.mock("@rechnungsai/ai", () => ({
  categorizeInvoice: vi.fn(),
}));

// Validation + PDF packages — runStructuredExtraction's only external deps.
const validateMock = vi.fn();
const detectMock = vi.fn();
const projectMock = vi.fn();
vi.mock("@rechnungsai/validation", () => ({
  validateEN16931: (...a: unknown[]) => validateMock(...a),
  detectProfile: (...a: unknown[]) => detectMock(...a),
  projectToInvoiceData: (...a: unknown[]) => projectMock(...a),
  RULE_SET_VERSION: "kosit-2.5.0",
}));

const isLikelyEMock = vi.fn();
const extractZugferdMock = vi.fn();
vi.mock("@rechnungsai/pdf", () => ({
  isLikelyEInvoicePdf: (...a: unknown[]) => isLikelyEMock(...a),
  extractZugferdXml: (...a: unknown[]) => extractZugferdMock(...a),
}));

const logAuditMock = vi.fn();
vi.mock("./shared", async (orig) => {
  const actual = await orig<typeof import("./shared")>();
  return { ...actual, logAuditEvent: (...a: unknown[]) => logAuditMock(...a) };
});

// ── Supabase mock chain ──────────────────────────────────────────────────────
const authGetUserMock = vi.fn();
const userSingleMock = vi.fn();
const invoiceSelectSingleMock = vi.fn();
const invoiceUpdateResultMock = vi.fn();
const downloadMock = vi.fn();
const updatePatches: Record<string, unknown>[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: authGetUserMock },
    from: (table: string) => {
      if (table === "users") {
        return { select: () => ({ eq: () => ({ single: userSingleMock }) }) };
      }
      if (table === "invoices") {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: invoiceSelectSingleMock }) }) }),
          update: (patch: Record<string, unknown>) => {
            updatePatches.push(patch);
            const terminal = {
              then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
                Promise.resolve(invoiceUpdateResultMock()).then(res, rej),
            };
            return { eq: () => ({ eq: () => terminal }) };
          },
        };
      }
      return {};
    },
    storage: { from: () => ({ download: downloadMock }) },
  })),
}));

import { revalidateInvoice } from "./review";

const VALID_UUID = "11111111-1111-1111-1111-111111111111";

const validReport = {
  status: "valid" as const,
  profile: "ubl" as const,
  customizationId: "urn:cen.eu:en16931:2017",
  ruleSetVersion: "kosit-2.5.0",
  durationMs: 7,
  violations: [],
  invoice: { invoiceNumber: "X" } as never,
};

beforeEach(() => {
  vi.clearAllMocks();
  updatePatches.length = 0;
  authGetUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  userSingleMock.mockResolvedValue({ data: { tenant_id: "tenant-1" }, error: null });
  invoiceSelectSingleMock.mockResolvedValue({
    data: {
      id: VALID_UUID,
      tenant_id: "tenant-1",
      status: "ready",
      file_path: "tenant-1/inv.xml",
      file_type: "application/xml",
      validation_rule_set_version: "kosit-2.4.0",
    },
    error: null,
  });
  invoiceUpdateResultMock.mockResolvedValue({ error: null });
  downloadMock.mockResolvedValue({ data: new Blob(["<x/>"]), error: null });
  detectMock.mockReturnValue("ubl");
  validateMock.mockReturnValue(validReport);
  projectMock.mockReturnValue({ invoice_number: { value: "X", confidence: 1, reason: null } });
  isLikelyEMock.mockResolvedValue(false);
  extractZugferdMock.mockResolvedValue({ kind: "not-zugferd", reason: "no-embedded-files" });
  logAuditMock.mockResolvedValue(undefined);
});

describe("revalidateInvoice", () => {
  it("(a) re-validates an XRechnung XML: success, single UPDATE, audit revalidation_completed", async () => {
    const r = await revalidateInvoice(VALID_UUID);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe("valid");
      expect(r.data.violationCount).toBe(0);
    }
    expect(updatePatches).toHaveLength(1);
    expect(updatePatches[0]?.validation_status).toBe("valid");
    expect(logAuditMock).toHaveBeenCalledOnce();
    expect(logAuditMock.mock.calls[0]?.[1]).toMatchObject({ eventType: "revalidation_completed" });
  });

  it("(b) tenant-isolation guard — row belongs to another tenant → failure, no UPDATE", async () => {
    invoiceSelectSingleMock.mockResolvedValueOnce({
      data: { id: VALID_UUID, tenant_id: "tenant-2", status: "ready", file_path: "x", file_type: "application/xml", validation_rule_set_version: null },
      error: null,
    });
    const r = await revalidateInvoice(VALID_UUID);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("Rechnung nicht gefunden.");
    expect(updatePatches).toHaveLength(0);
  });

  it("(c) image file → skipped, no validation call", async () => {
    invoiceSelectSingleMock.mockResolvedValueOnce({
      data: { id: VALID_UUID, tenant_id: "tenant-1", status: "ready", file_path: "x.jpg", file_type: "image/jpeg", validation_rule_set_version: null },
      error: null,
    });
    const r = await revalidateInvoice(VALID_UUID);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ status: "skipped", violationCount: 0 });
    expect(validateMock).not.toHaveBeenCalled();
    expect(updatePatches).toHaveLength(1);
    expect(updatePatches[0]?.validation_status).toBe("skipped");
  });

  it("(d) status='processing' → blocked error", async () => {
    invoiceSelectSingleMock.mockResolvedValueOnce({
      data: { id: VALID_UUID, tenant_id: "tenant-1", status: "processing", file_path: "x", file_type: "application/xml", validation_rule_set_version: null },
      error: null,
    });
    const r = await revalidateInvoice(VALID_UUID);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("Extraktion läuft");
    expect(updatePatches).toHaveLength(0);
  });

  it("(e) auth failure → redirect thrown", async () => {
    authGetUserMock.mockResolvedValueOnce({ data: { user: null }, error: { message: "no session" } });
    await expect(revalidateInvoice(VALID_UUID)).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("(f) audit failure is swallowed — action still succeeds, Sentry captures", async () => {
    const Sentry = await import("@sentry/nextjs");
    logAuditMock.mockRejectedValueOnce(new Error("audit insert blew up"));
    const r = await revalidateInvoice(VALID_UUID);
    expect(r.success).toBe(true);
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalled();
  });

  it("(g) PDF that is not a ZUGFeRD invoice → skipped", async () => {
    invoiceSelectSingleMock.mockResolvedValueOnce({
      data: { id: VALID_UUID, tenant_id: "tenant-1", status: "ready", file_path: "x.pdf", file_type: "application/pdf", validation_rule_set_version: null },
      error: null,
    });
    isLikelyEMock.mockResolvedValueOnce(false);
    const r = await revalidateInvoice(VALID_UUID);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.status).toBe("skipped");
    expect(validateMock).not.toHaveBeenCalled();
  });

  it("rejects invalid UUID", async () => {
    const r = await revalidateInvoice("nope");
    expect(r.success).toBe(false);
  });
});
