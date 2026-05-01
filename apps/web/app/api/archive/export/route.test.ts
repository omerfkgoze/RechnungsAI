import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const logAuditEventMock = vi.fn();
vi.mock("@/app/actions/invoices", () => ({
  logAuditEvent: (...args: unknown[]) => logAuditEventMock(...args),
}));

// Per-test state
const authGetUserMock = vi.fn();
const userSingleMock = vi.fn();
const invoiceSelectChainMock = vi.fn();
const tenantSingleMock = vi.fn();
const downloadMock = vi.fn();
const auditLogSelectChainMock = vi.fn();
const auditInsertMock = vi.fn();

function makeInvoiceChain() {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.then = (cb: (v: unknown) => void, rej?: (e: unknown) => void) =>
    invoiceSelectChainMock().then(cb, rej);
  return chain;
}

function makeAuditLogChain() {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.then = (cb: (v: unknown) => void, rej?: (e: unknown) => void) =>
    auditLogSelectChainMock().then(cb, rej);
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: authGetUserMock },
    from: (table: string) => {
      if (table === "users") {
        return { select: () => ({ eq: () => ({ single: userSingleMock }) }) };
      }
      if (table === "invoices") {
        return makeInvoiceChain();
      }
      if (table === "tenants") {
        return { select: () => ({ eq: () => ({ single: tenantSingleMock }) }) };
      }
      if (table === "audit_logs") {
        return makeAuditLogChain();
      }
      return {};
    },
    storage: {
      from: () => ({ download: downloadMock }),
    },
  })),
}));

const VALID_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const VALID_UUID2 = "b2c3d4e5-f6a7-8901-bcde-f12345678901";

function makeRequest(body: unknown) {
  return new Request("https://x/api/archive/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Minimal valid invoice row
function makeInvoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_UUID,
    file_path: `tenants/t1/${VALID_UUID}.pdf`,
    file_type: "application/pdf",
    sha256: null,
    original_filename: "rechnung.pdf",
    supplier_name_value: "Muster GmbH",
    gross_total_value: 100,
    invoice_number_value: "RE-001",
    invoice_date_value: "2026-01-15",
    status: "ready",
    skr_code: "4200",
    bu_schluessel: null,
    approved_at: null,
    ...overrides,
  };
}

import { POST } from "./route";

describe("POST /api/archive/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authGetUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    userSingleMock.mockResolvedValue({ data: { tenant_id: "tenant-1" }, error: null });
    tenantSingleMock.mockResolvedValue({ data: { company_name: "Muster GmbH" }, error: null });
    invoiceSelectChainMock.mockResolvedValue({
      data: [makeInvoiceRow()],
      error: null,
    });
    downloadMock.mockResolvedValue({
      data: new Blob(["PDF content"], { type: "application/pdf" }),
      error: null,
    });
    auditLogSelectChainMock.mockResolvedValue({ data: [], error: null });
    auditInsertMock.mockResolvedValue({ error: null });
    logAuditEventMock.mockResolvedValue(undefined);
  });

  it("happy-path: returns ZIP with valid LFH and EOCD signatures", async () => {
    const res = await POST(makeRequest({ invoiceIds: [VALID_UUID] }));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");

    const bytes = new Uint8Array(await res.arrayBuffer());
    // ZIP Local File Header signature
    const lfhSig =
      (bytes[0] ?? 0) | ((bytes[1] ?? 0) << 8) | ((bytes[2] ?? 0) << 16) | ((bytes[3] ?? 0) << 24);
    expect(lfhSig >>> 0).toBe(0x04034b50);

    // Scan for EOCD signature
    let eocdFound = false;
    for (let i = bytes.length - 22; i >= 0; i--) {
      const sig =
        (bytes[i] ?? 0) | ((bytes[i + 1] ?? 0) << 8) | ((bytes[i + 2] ?? 0) << 16) | ((bytes[i + 3] ?? 0) << 24);
      if ((sig >>> 0) === 0x06054b50) { eocdFound = true; break; }
    }
    expect(eocdFound).toBe(true);
  });

  it("returns 401 when user is not authenticated", async () => {
    authGetUserMock.mockResolvedValue({ data: { user: null }, error: { message: "not authenticated" } });

    const res = await POST(makeRequest({ invoiceIds: [VALID_UUID] }));

    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("authentifiziert");
  });

  it("cross-tenant IDs are silently filtered — response still valid ZIP for included IDs", async () => {
    // Only 1 of 2 requested IDs exists in tenant scope
    invoiceSelectChainMock.mockResolvedValue({
      data: [makeInvoiceRow()],
      error: null,
    });

    const res = await POST(
      makeRequest({ invoiceIds: [VALID_UUID, VALID_UUID2] }),
    );

    expect(res.status).toBe(200);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadata: expect.objectContaining({
          requested_count: 2,
          invoice_count: 1,
          missing_count: 1,
        }),
      }),
    );
  });

  it("included_count = 0 returns 400 with German error message", async () => {
    invoiceSelectChainMock.mockResolvedValue({ data: [], error: null });

    const res = await POST(makeRequest({ invoiceIds: [VALID_UUID] }));

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("Keine Rechnungen");
  });

  it("mismatch: Sentry fires once per mismatch and ZIP still returns 200", async () => {
    const sha256 = "a".repeat(64);
    invoiceSelectChainMock.mockResolvedValue({
      data: [makeInvoiceRow({ sha256 })],
      error: null,
    });
    // Different bytes → mismatch
    downloadMock.mockResolvedValue({
      data: new Blob(["different bytes"], { type: "application/pdf" }),
      error: null,
    });
    const { captureException } = await import("@sentry/nextjs");

    const res = await POST(makeRequest({ invoiceIds: [VALID_UUID] }));

    expect(res.status).toBe(200);
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("hash mismatch") }),
      expect.objectContaining({ tags: { module: "gobd", action: "export_audit" } }),
    );
  });

  it("logAuditEvent called with event_type export_audit and documented metadata shape", async () => {
    await POST(makeRequest({ invoiceIds: [VALID_UUID] }));

    expect(logAuditEventMock).toHaveBeenCalledOnce();
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        invoiceId: null,
        eventType: "export_audit",
        metadata: expect.objectContaining({
          invoice_count: expect.any(Number),
          requested_count: expect.any(Number),
          missing_count: expect.any(Number),
          mismatch_count: expect.any(Number),
          format: "zip",
        }),
      }),
    );
  });
});
