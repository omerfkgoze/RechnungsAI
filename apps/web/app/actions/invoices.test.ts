import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`) as Error & {
      digest: string;
    };
    err.digest = `NEXT_REDIRECT;${url}`;
    throw err;
  }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

const aiExtractMock = vi.fn();
const aiCategorizeMock = vi.fn();
vi.mock("@rechnungsai/ai", () => ({
  extractInvoice: (...args: unknown[]) => aiExtractMock(...args),
  categorizeInvoice: (...args: unknown[]) => aiCategorizeMock(...args),
}));

const uploadMock = vi.fn();
const removeMock = vi.fn();
const createSignedUrlMock = vi.fn();
const insertSingleMock = vi.fn();
const userSingleMock = vi.fn();
const tenantSingleMock = vi.fn();
const authGetUserMock = vi.fn();
const invoiceSelectSingleMock = vi.fn();
const invoiceUpdateEqMock = vi.fn();
const fieldCorrectionInsertMock = vi.fn();
const categorizationCorrectionInsertMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: authGetUserMock },
    from: (table: string) => {
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({ single: userSingleMock }),
          }),
        };
      }
      if (table === "invoices") {
        return {
          insert: () => ({
            select: () => ({ single: insertSingleMock }),
          }),
          select: () => ({
            eq: (col: string, val: unknown) => ({
              single: invoiceSelectSingleMock,
              eq: () => ({ single: invoiceSelectSingleMock }),
            }),
          }),
          update: (patch: unknown) => ({
            eq: (col: string, val: unknown) => {
              const call = () => invoiceUpdateEqMock(patch, col, val);
              return {
                // Second .eq() for optimistic-lock flip or concurrency guard
                eq: () => ({ select: () => ({ single: call, maybeSingle: call }) }),
                // Direct await: await supabase.from('invoices').update().eq()
                then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
                  Promise.resolve(call()).then(res, rej),
              };
            },
          }),
        };
      }
      if (table === "invoice_field_corrections") {
        return {
          insert: (values: unknown) => fieldCorrectionInsertMock(values),
        };
      }
      if (table === "tenants") {
        return {
          select: () => ({
            eq: () => ({ single: tenantSingleMock }),
          }),
        };
      }
      if (table === "categorization_corrections") {
        return {
          insert: (values: unknown) => categorizationCorrectionInsertMock(values),
        };
      }
      return {};
    },
    storage: {
      from: () => ({
        upload: uploadMock,
        remove: removeMock,
        createSignedUrl: createSignedUrlMock,
      }),
    },
  })),
}));

import { approveInvoice, categorizeInvoice, correctInvoiceField, extractInvoice, flagInvoice, getInvoiceSignedUrl, undoInvoiceAction, updateInvoiceSKR, uploadInvoice } from "./invoices";

function makeFile(
  name: string,
  type: string,
  size: number,
  content = "payload",
): File {
  const blob = new Blob([content.padEnd(size, "x")], { type });
  return new File([blob], name, { type });
}

describe("uploadInvoice — validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authGetUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    userSingleMock.mockResolvedValue({
      data: { tenant_id: "tenant-1" },
      error: null,
    });
    uploadMock.mockResolvedValue({ error: null });
    removeMock.mockResolvedValue({ error: null });
    insertSingleMock.mockResolvedValue({ data: { id: "inv-1" }, error: null });
  });

  it("rejects missing file with German message", async () => {
    const fd = new FormData();
    const result = await uploadInvoice(fd);
    expect(result).toEqual({ success: false, error: "Keine Datei gefunden." });
  });

  it("rejects disallowed mime type", async () => {
    const fd = new FormData();
    fd.set("file", makeFile("malware.exe", "application/x-msdownload", 100));
    const result = await uploadInvoice(fd);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Dateityp");
    }
  });

  it("rejects oversize file", async () => {
    const fd = new FormData();
    fd.set("file", makeFile("huge.pdf", "application/pdf", 11 * 1024 * 1024));
    const result = await uploadInvoice(fd);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Die Datei ist zu groß (max. 10 MB).");
    }
  });

  it("infers XML mime from extension when browser reports empty type", async () => {
    const fd = new FormData();
    fd.set("file", makeFile("rechnung.xml", "", 100));
    const result = await uploadInvoice(fd);
    expect(result.success).toBe(true);
  });
});

describe("uploadInvoice — happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authGetUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    userSingleMock.mockResolvedValue({
      data: { tenant_id: "tenant-1" },
      error: null,
    });
    uploadMock.mockResolvedValue({ error: null });
    insertSingleMock.mockResolvedValue({ data: { id: "inv-1" }, error: null });
  });

  it("uploads and inserts — returns success with filePath under tenant folder", async () => {
    const fd = new FormData();
    fd.set("file", makeFile("rechnung.jpg", "image/jpeg", 500));
    const result = await uploadInvoice(fd);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filePath.startsWith("tenant-1/")).toBe(true);
      expect(result.data.filePath.endsWith(".jpg")).toBe(true);
    }
    expect(uploadMock).toHaveBeenCalledOnce();
    expect(insertSingleMock).toHaveBeenCalledOnce();
  });
});

describe("uploadInvoice — error compensation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authGetUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    userSingleMock.mockResolvedValue({
      data: { tenant_id: "tenant-1" },
      error: null,
    });
    uploadMock.mockResolvedValue({ error: null });
    insertSingleMock.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "bad" },
    });
    removeMock.mockResolvedValue({ error: null });
  });

  it("removes storage object on insert failure and returns German error", async () => {
    const fd = new FormData();
    fd.set("file", makeFile("rechnung.pdf", "application/pdf", 500));
    const result = await uploadInvoice(fd);
    expect(result.success).toBe(false);
    expect(removeMock).toHaveBeenCalledOnce();
  });

  it("maps storage 409 to duplicate message", async () => {
    vi.clearAllMocks();
    authGetUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    userSingleMock.mockResolvedValue({
      data: { tenant_id: "tenant-1" },
      error: null,
    });
    uploadMock.mockResolvedValue({
      error: { statusCode: "409", message: "conflict" },
    });
    const fd = new FormData();
    fd.set("file", makeFile("dup.jpg", "image/jpeg", 500));
    const result = await uploadInvoice(fd);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("existiert bereits");
    }
  });
});

const VALID_UUID = "11111111-1111-1111-1111-111111111111";

function field<T>(value: T, confidence: number, reason: string | null = null) {
  return { value, confidence, reason };
}

function mockInvoiceData(confidence = 0.99) {
  return {
    invoice_number: field("R-1", confidence),
    invoice_date: field("2024-03-15", confidence),
    supplier_name: field("ACME GmbH", confidence),
    supplier_address: field(null, confidence),
    supplier_tax_id: field(null, confidence),
    recipient_name: field(null, confidence),
    recipient_address: field(null, confidence),
    line_items: [],
    net_total: field(100, confidence),
    vat_total: field(19, confidence),
    gross_total: field(119, confidence),
    currency: field("EUR", confidence),
    payment_terms: field(null, confidence),
  };
}

describe("extractInvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authGetUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    userSingleMock.mockResolvedValue({
      data: { tenant_id: "tenant-1" },
      error: null,
    });
    invoiceSelectSingleMock.mockResolvedValue({
      data: {
        id: VALID_UUID,
        tenant_id: "tenant-1",
        status: "captured",
        file_path: "tenant-1/abc.pdf",
        file_type: "application/pdf",
        original_filename: "abc.pdf",
        extraction_attempts: 0,
      },
      error: null,
    });
    invoiceUpdateEqMock.mockResolvedValue({ data: { id: VALID_UUID }, error: null });
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: "https://signed.example/abc.pdf" },
      error: null,
    });
    aiExtractMock.mockResolvedValue({ success: true, data: mockInvoiceData() });
  });

  it("rejects invalid UUID with German message", async () => {
    const result = await extractInvoice("not-a-uuid");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Ungültige Rechnungs-ID.");
    }
  });

  it("returns success without re-extraction when status is 'ready' (idempotency)", async () => {
    invoiceSelectSingleMock.mockResolvedValueOnce({
      data: {
        id: VALID_UUID,
        tenant_id: "tenant-1",
        status: "ready",
        file_path: "x",
        file_type: "application/pdf",
        original_filename: "x.pdf",
        extraction_attempts: 1,
      },
      error: null,
    });
    const result = await extractInvoice(VALID_UUID);
    expect(result.success).toBe(true);
    expect(aiExtractMock).not.toHaveBeenCalled();
  });

  it("rejects concurrent call when status is 'processing'", async () => {
    invoiceSelectSingleMock.mockResolvedValueOnce({
      data: {
        id: VALID_UUID,
        tenant_id: "tenant-1",
        status: "processing",
        file_path: "x",
        file_type: "application/pdf",
        original_filename: "x.pdf",
        extraction_attempts: 1,
      },
      error: null,
    });
    const result = await extractInvoice(VALID_UUID);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Extraktion läuft bereits");
    }
    expect(aiExtractMock).not.toHaveBeenCalled();
  });

  it("happy path flips status to 'ready' when overall confidence is high", async () => {
    const result = await extractInvoice(VALID_UUID);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("ready");
      expect(result.data.overall).toBeGreaterThanOrEqual(0.95);
    }
    expect(aiExtractMock).toHaveBeenCalledOnce();
  });

  it("flips status to 'review' when overall confidence is below high threshold", async () => {
    aiExtractMock.mockResolvedValueOnce({
      success: true,
      data: mockInvoiceData(0.8),
    });
    const result = await extractInvoice(VALID_UUID);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe("review");
  });

  it("reverts status to 'captured' with extraction_error when AI fails", async () => {
    aiExtractMock.mockResolvedValueOnce({
      success: false,
      error: "KI-Provider überlastet. Bitte in einer Minute erneut versuchen.",
    });
    const result = await extractInvoice(VALID_UUID);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("überlastet");
    const patches = invoiceUpdateEqMock.mock.calls.map(
      (c) => c[0] as Record<string, unknown>,
    );
    const revert = patches.find((p) => p.status === "captured");
    expect(revert).toBeDefined();
    expect(revert?.extraction_error).toContain("überlastet");
  });

  it("TD4: short-circuits when extraction_attempts >= 5 with German error", async () => {
    invoiceSelectSingleMock.mockResolvedValueOnce({
      data: {
        id: VALID_UUID,
        tenant_id: "tenant-1",
        status: "captured",
        file_path: "x",
        file_type: "application/pdf",
        original_filename: "x.pdf",
        extraction_attempts: 5,
      },
      error: null,
    });
    const result = await extractInvoice(VALID_UUID);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/Maximale Anzahl/);
    }
    // Must NOT flip to 'processing' nor call the AI extractor
    expect(aiExtractMock).not.toHaveBeenCalled();
    const patches = invoiceUpdateEqMock.mock.calls.map(
      (c) => c[0] as Record<string, unknown>,
    );
    expect(patches.find((p) => p.status === "processing")).toBeUndefined();
  });

  it("returns 'Rechnung nicht gefunden' when row is missing", async () => {
    invoiceSelectSingleMock.mockResolvedValueOnce({ data: null, error: null });
    const result = await extractInvoice(VALID_UUID);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Rechnung nicht gefunden.");
  });
});

function makeInvoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_UUID,
    tenant_id: "tenant-1",
    status: "ready",
    invoice_data: {
      supplier_name: { value: "ACME GmbH", confidence: 0.99, reason: null },
      gross_total: { value: 119, confidence: 0.99, reason: null },
    },
    updated_at: "2026-04-24T10:00:00.000Z",
    ...overrides,
  };
}

describe("correctInvoiceField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authGetUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    userSingleMock.mockResolvedValue({ data: { tenant_id: "tenant-1" }, error: null });
    invoiceSelectSingleMock.mockResolvedValue({ data: makeInvoiceRow(), error: null });
    invoiceUpdateEqMock.mockResolvedValue({ data: { id: VALID_UUID }, error: null });
    fieldCorrectionInsertMock.mockResolvedValue({ error: null });
  });

  it("rejects invalid fieldPath not in allow-list", async () => {
    const result = await correctInvoiceField({
      invoiceId: VALID_UUID,
      fieldPath: "__proto__",
      newValue: "hack",
      priorUpdatedAt: "2026-04-24T10:00:00.000Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Ungültiges Feld.");
  });

  it("rejects when invoice status is 'exported'", async () => {
    invoiceSelectSingleMock.mockResolvedValueOnce({
      data: makeInvoiceRow({ status: "exported" }),
      error: null,
    });
    const result = await correctInvoiceField({
      invoiceId: VALID_UUID,
      fieldPath: "supplier_name",
      newValue: "New GmbH",
      priorUpdatedAt: "2026-04-24T10:00:00.000Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Exportierte Rechnungen");
    expect(invoiceUpdateEqMock).not.toHaveBeenCalled();
  });

  it("happy path: writes expected jsonb shape with confidence=1.0 and reason", async () => {
    const result = await correctInvoiceField({
      invoiceId: VALID_UUID,
      fieldPath: "supplier_name",
      newValue: "Neuer Lieferant GmbH",
      priorUpdatedAt: "2026-04-24T10:00:00.000Z",
    });
    expect(result.success).toBe(true);
    const updatedPatch = invoiceUpdateEqMock.mock.calls[0]?.[0] as Record<string, unknown>;
    const invoiceData = updatedPatch.invoice_data as Record<string, { value: unknown; confidence: number; reason: string } | undefined>;
    expect(invoiceData.supplier_name?.value).toBe("Neuer Lieferant GmbH");
    expect(invoiceData.supplier_name?.confidence).toBe(1.0);
    expect(invoiceData.supplier_name?.reason).toBe("Vom Nutzer korrigiert");
  });

  it("inserts invoice_field_corrections row with corrected_to_ai=false for normal correction", async () => {
    await correctInvoiceField({
      invoiceId: VALID_UUID,
      fieldPath: "supplier_name",
      newValue: "Corrected GmbH",
      priorUpdatedAt: "2026-04-24T10:00:00.000Z",
    });
    const inserted = fieldCorrectionInsertMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.corrected_to_ai).toBe(false);
    expect(inserted.field_path).toBe("supplier_name");
    expect(inserted.invoice_id).toBe(VALID_UUID);
  });

  it("restore-to-AI path writes corrected_to_ai=true and preserves original AI confidence", async () => {
    await correctInvoiceField({
      invoiceId: VALID_UUID,
      fieldPath: "supplier_name",
      newValue: "ACME GmbH",
      priorUpdatedAt: "2026-04-24T10:00:00.000Z",
      isRestoreToAi: true,
      aiConfidence: 0.85,
    });
    const updatedPatch = invoiceUpdateEqMock.mock.calls[0]?.[0] as Record<string, unknown>;
    const invoiceData = updatedPatch.invoice_data as Record<string, { confidence: number; reason: string } | undefined>;
    expect(invoiceData.supplier_name?.confidence).toBe(0.85);
    expect(invoiceData.supplier_name?.reason).toBe("Nutzer hat AI-Wert wiederhergestellt");
    const inserted = fieldCorrectionInsertMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.corrected_to_ai).toBe(true);
  });

  it("concurrency guard: stale updated_at returns German error without writing", async () => {
    // Update returns no rows (0 affected = concurrency miss)
    invoiceUpdateEqMock.mockResolvedValueOnce({ data: null, error: null });
    const result = await correctInvoiceField({
      invoiceId: VALID_UUID,
      fieldPath: "supplier_name",
      newValue: "Concurrent GmbH",
      priorUpdatedAt: "2026-04-24T10:00:00.000Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("zwischenzeitlich");
  });

  it("returns error when invoice is not found (PGRST116 code)", async () => {
    invoiceSelectSingleMock.mockResolvedValueOnce({ data: null, error: null });
    const result = await correctInvoiceField({
      invoiceId: VALID_UUID,
      fieldPath: "gross_total",
      newValue: 200,
      priorUpdatedAt: "2026-04-24T10:00:00.000Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("nicht gefunden");
  });

  it("rejects invalid UUID with German message", async () => {
    const result = await correctInvoiceField({
      invoiceId: "not-a-uuid",
      fieldPath: "supplier_name",
      newValue: "Test",
      priorUpdatedAt: "2026-04-24T10:00:00.000Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Ungültige");
  });
});

describe("getInvoiceSignedUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authGetUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    userSingleMock.mockResolvedValue({ data: { tenant_id: "tenant-1" }, error: null });
    invoiceSelectSingleMock.mockResolvedValue({
      data: {
        id: VALID_UUID,
        tenant_id: "tenant-1",
        file_path: "tenant-1/abc.pdf",
        file_type: "application/pdf",
      },
      error: null,
    });
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: "https://signed.example/abc.pdf" },
      error: null,
    });
  });

  it("returns signed URL and file type for valid tenant invoice", async () => {
    const result = await getInvoiceSignedUrl(VALID_UUID);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.url).toContain("signed.example");
      expect(result.data.fileType).toBe("application/pdf");
    }
  });

  it("returns 'Rechnung nicht gefunden' for non-tenant invoice", async () => {
    invoiceSelectSingleMock.mockResolvedValueOnce({
      data: { id: VALID_UUID, tenant_id: "other-tenant", file_path: "x", file_type: "application/pdf" },
      error: null,
    });
    const result = await getInvoiceSignedUrl(VALID_UUID);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("nicht gefunden");
  });

  it("rejects invalid UUID", async () => {
    const result = await getInvoiceSignedUrl("invalid");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Ungültige");
  });
});

function makeReadyInvoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_UUID,
    tenant_id: "tenant-1",
    status: "ready",
    invoice_data: {
      supplier_name: { value: "ACME GmbH", confidence: 0.99, reason: null },
      line_items: [
        {
          description: { value: "Bürobedarf", confidence: 0.99, reason: null },
          vat_rate: { value: 0.19, confidence: 0.99, reason: null },
        },
      ],
    },
    skr_code: null,
    ...overrides,
  };
}

describe("categorizeInvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authGetUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    userSingleMock.mockResolvedValue({ data: { tenant_id: "tenant-1" }, error: null });
    tenantSingleMock.mockResolvedValue({ data: { skr_plan: "skr03" }, error: null });
    invoiceSelectSingleMock.mockResolvedValue({ data: makeReadyInvoiceRow(), error: null });
    invoiceUpdateEqMock.mockResolvedValue({ data: { id: VALID_UUID }, error: null });
    aiCategorizeMock.mockResolvedValue({
      success: true,
      data: { skrCode: "4230", confidence: 0.88, buSchluessel: null },
    });
  });

  it("rejects non-ready status (captured) with German message", async () => {
    invoiceSelectSingleMock.mockResolvedValueOnce({
      data: makeReadyInvoiceRow({ status: "captured" }),
      error: null,
    });
    const result = await categorizeInvoice(VALID_UUID);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Extraktion");
    expect(aiCategorizeMock).not.toHaveBeenCalled();
  });

  it("happy path persists skr_code, bu_schluessel, categorization_confidence", async () => {
    const result = await categorizeInvoice(VALID_UUID);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skrCode).toBe("4230");
      expect(result.data.confidence).toBe(0.88);
      expect(result.data.buSchluessel).toBe(9);
    }
    const patch = invoiceUpdateEqMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch.skr_code).toBe("4230");
    expect(patch.bu_schluessel).toBe(9);
    expect(patch.categorization_confidence).toBe(0.88);
  });

  it("returns error when invoice not found", async () => {
    invoiceSelectSingleMock.mockResolvedValueOnce({ data: null, error: null });
    const result = await categorizeInvoice(VALID_UUID);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("nicht gefunden");
  });

  it("prefers AI buSchluessel (44) over deterministic mapping when AI returns non-null", async () => {
    aiCategorizeMock.mockResolvedValueOnce({
      success: true,
      data: { skrCode: "3500", confidence: 0.9, buSchluessel: 44 },
    });
    const result = await categorizeInvoice(VALID_UUID);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.buSchluessel).toBe(44);
    const patch = invoiceUpdateEqMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch.bu_schluessel).toBe(44);
  });
});

describe("updateInvoiceSKR", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authGetUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    userSingleMock.mockResolvedValue({ data: { tenant_id: "tenant-1" }, error: null });
    invoiceSelectSingleMock.mockResolvedValue({
      data: makeReadyInvoiceRow({ skr_code: "4940" }),
      error: null,
    });
    invoiceUpdateEqMock.mockResolvedValue({ data: { id: VALID_UUID }, error: null });
    categorizationCorrectionInsertMock.mockResolvedValue({ error: null });
  });

  it("happy path writes skr_code and inserts categorization_corrections row", async () => {
    const result = await updateInvoiceSKR({
      invoiceId: VALID_UUID,
      newSkrCode: "4230",
      supplierName: "ACME GmbH",
    });
    expect(result.success).toBe(true);
    const patch = invoiceUpdateEqMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch.skr_code).toBe("4230");
    expect(patch.categorization_confidence).toBe(1.0);
    const inserted = categorizationCorrectionInsertMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.corrected_code).toBe("4230");
    expect(inserted.original_code).toBe("4940");
    expect(inserted.supplier_name).toBe("ACME GmbH");
  });

  it("rejects exported status with German message", async () => {
    invoiceSelectSingleMock.mockResolvedValueOnce({
      data: makeReadyInvoiceRow({ status: "exported", skr_code: "4230" }),
      error: null,
    });
    const result = await updateInvoiceSKR({
      invoiceId: VALID_UUID,
      newSkrCode: "3400",
      supplierName: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Exportierte Rechnungen");
    expect(invoiceUpdateEqMock).not.toHaveBeenCalled();
  });

  it("rejects invalid UUID with German message", async () => {
    const result = await updateInvoiceSKR({
      invoiceId: "not-a-uuid",
      newSkrCode: "4230",
      supplierName: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Ungültige");
  });

  it("corrections insert failure is non-fatal — still returns success", async () => {
    categorizationCorrectionInsertMock.mockResolvedValueOnce({
      error: { code: "23503", message: "fk violation" },
    });
    const result = await updateInvoiceSKR({
      invoiceId: VALID_UUID,
      newSkrCode: "4230",
      supplierName: "ACME GmbH",
    });
    expect(result.success).toBe(true);
  });

  it("maps 19% VAT line item to bu_schluessel 9", async () => {
    const result = await updateInvoiceSKR({
      invoiceId: VALID_UUID,
      newSkrCode: "3400",
      supplierName: null,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.buSchluessel).toBe(9);
  });

  it("invoice not found returns German error", async () => {
    invoiceSelectSingleMock.mockResolvedValueOnce({ data: null, error: null });
    const result = await updateInvoiceSKR({
      invoiceId: VALID_UUID,
      newSkrCode: "4230",
      supplierName: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("nicht gefunden");
  });
});

describe("approveInvoice / flagInvoice / undoInvoiceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authGetUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    userSingleMock.mockResolvedValue({ data: { tenant_id: "tenant-1" }, error: null });
    invoiceUpdateEqMock.mockResolvedValue({ data: { id: VALID_UUID, status: "ready" }, error: null });
  });

  function row(status: InvoiceStatus, tenantId = "tenant-1") {
    return {
      data: { id: VALID_UUID, tenant_id: tenantId, status },
      error: null,
    };
  }

  type InvoiceStatus = "captured" | "processing" | "ready" | "review" | "exported";

  it("approveInvoice happy path on review → flips to ready and stamps approval columns", async () => {
    invoiceSelectSingleMock.mockResolvedValueOnce(row("review"));
    invoiceUpdateEqMock.mockResolvedValueOnce({ data: { id: VALID_UUID, status: "ready" }, error: null });
    const result = await approveInvoice({ invoiceId: VALID_UUID, method: "swipe" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe("ready");
    const patch = invoiceUpdateEqMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch.status).toBe("ready");
    expect(patch.approval_method).toBe("swipe");
    expect(patch.approved_by).toBe("user-1");
    expect(typeof patch.approved_at).toBe("string");
  });

  it("approveInvoice on exported returns German error and does not update", async () => {
    invoiceSelectSingleMock.mockResolvedValueOnce(row("exported"));
    const result = await approveInvoice({ invoiceId: VALID_UUID, method: "button" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Exportierte Rechnungen");
    expect(invoiceUpdateEqMock).not.toHaveBeenCalled();
  });

  it("approveInvoice on captured/processing returns German extraction error", async () => {
    invoiceSelectSingleMock.mockResolvedValueOnce(row("captured"));
    const r1 = await approveInvoice({ invoiceId: VALID_UUID, method: "button" });
    expect(r1.success).toBe(false);
    if (!r1.success) expect(r1.error).toContain("Extraktion");
    invoiceSelectSingleMock.mockResolvedValueOnce(row("processing"));
    const r2 = await approveInvoice({ invoiceId: VALID_UUID, method: "button" });
    expect(r2.success).toBe(false);
    if (!r2.success) expect(r2.error).toContain("Extraktion");
    expect(invoiceUpdateEqMock).not.toHaveBeenCalled();
  });

  it("approveInvoice on already-ready idempotently re-stamps approval_method", async () => {
    invoiceSelectSingleMock.mockResolvedValueOnce(row("ready"));
    invoiceUpdateEqMock.mockResolvedValueOnce({ data: { id: VALID_UUID, status: "ready" }, error: null });
    const result = await approveInvoice({ invoiceId: VALID_UUID, method: "keyboard" });
    expect(result.success).toBe(true);
    const patch = invoiceUpdateEqMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch.status).toBe("ready");
    expect(patch.approval_method).toBe("keyboard");
  });

  it("flagInvoice happy path on ready → flips to review and clears approval columns", async () => {
    invoiceSelectSingleMock.mockResolvedValueOnce(row("ready"));
    invoiceUpdateEqMock.mockResolvedValueOnce({ data: { id: VALID_UUID, status: "review" }, error: null });
    const result = await flagInvoice({ invoiceId: VALID_UUID, method: "swipe" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe("review");
    const patch = invoiceUpdateEqMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch.status).toBe("review");
    expect(patch.approved_at).toBeNull();
    expect(patch.approved_by).toBeNull();
    expect(patch.approval_method).toBeNull();
  });

  it("flagInvoice on review is idempotent — no UPDATE issued", async () => {
    invoiceSelectSingleMock.mockResolvedValueOnce(row("review"));
    const result = await flagInvoice({ invoiceId: VALID_UUID, method: "button" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe("review");
    expect(invoiceUpdateEqMock).not.toHaveBeenCalled();
  });

  it("flagInvoice on exported returns German error", async () => {
    invoiceSelectSingleMock.mockResolvedValueOnce(row("exported"));
    const result = await flagInvoice({ invoiceId: VALID_UUID, method: "button" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Exportierte Rechnungen");
    expect(invoiceUpdateEqMock).not.toHaveBeenCalled();
  });

  it("undoInvoiceAction happy path restores snapshot when post-action state matches", async () => {
    invoiceSelectSingleMock.mockResolvedValueOnce(row("ready"));
    invoiceUpdateEqMock.mockResolvedValueOnce({ data: { id: VALID_UUID, status: "review" }, error: null });
    const result = await undoInvoiceAction({
      invoiceId: VALID_UUID,
      expectedCurrentStatus: "ready",
      snapshot: {
        status: "review",
        approved_at: null,
        approved_by: null,
        approval_method: null,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe("review");
    const patch = invoiceUpdateEqMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch.status).toBe("review");
    expect(patch.approval_method).toBeNull();
  });

  it("undoInvoiceAction concurrency miss returns German error when 0 rows affected", async () => {
    invoiceSelectSingleMock.mockResolvedValueOnce(row("review"));
    invoiceUpdateEqMock.mockResolvedValueOnce({ data: null, error: null });
    const result = await undoInvoiceAction({
      invoiceId: VALID_UUID,
      expectedCurrentStatus: "ready",
      snapshot: {
        status: "review",
        approved_at: null,
        approved_by: null,
        approval_method: null,
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("zwischenzeitlich");
  });

  it("approveInvoice tenant isolation rejects cross-tenant invoiceId", async () => {
    invoiceSelectSingleMock.mockResolvedValueOnce(row("review", "other-tenant"));
    const result = await approveInvoice({ invoiceId: VALID_UUID, method: "swipe" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("nicht gefunden");
    expect(invoiceUpdateEqMock).not.toHaveBeenCalled();
  });

  it("approveInvoice rejects invalid UUID with German message", async () => {
    const result = await approveInvoice({ invoiceId: "not-a-uuid", method: "swipe" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Ungültige");
    expect(invoiceSelectSingleMock).not.toHaveBeenCalled();
  });
});
