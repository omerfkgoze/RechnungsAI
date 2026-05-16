import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const logAuditEventMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@/app/actions/invoices/shared", () => ({
  logAuditEvent: (...args: unknown[]) => logAuditEventMock(...args),
}));

const authGetUserMock = vi.fn();
const userSingleMock = vi.fn();
const verdokMaybeSingleMock = vi.fn();
const tenantSingleMock = vi.fn();
const downloadMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: authGetUserMock },
    from: (table: string) => {
      if (table === "users") {
        return { select: () => ({ eq: () => ({ single: userSingleMock }) }) };
      }
      if (table === "verfahrensdokumentation") {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: verdokMaybeSingleMock }) }),
          }),
        };
      }
      if (table === "tenants") {
        return { select: () => ({ eq: () => ({ single: tenantSingleMock }) }) };
      }
      return {};
    },
    storage: { from: () => ({ download: downloadMock }) },
  })),
}));

import { GET } from "./route";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const VERDOK_ID = "33333333-3333-4333-8333-333333333333";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  authGetUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  userSingleMock.mockResolvedValue({ data: { tenant_id: TENANT_ID }, error: null });
  verdokMaybeSingleMock.mockResolvedValue({
    data: {
      id: VERDOK_ID,
      pdf_storage_path: `${TENANT_ID}/verdok-2026-05-16T12:00:00.000Z.pdf`,
      generated_at: "2026-05-16T12:00:00.000Z",
    },
    error: null,
  });
  tenantSingleMock.mockResolvedValue({ data: { company_name: "Müller GmbH" }, error: null });
  downloadMock.mockResolvedValue({
    data: { arrayBuffer: async () => new TextEncoder().encode("%PDF-1.7").buffer },
    error: null,
  });
});

describe("GET /api/verdok/[id]/pdf", () => {
  it("returns 401 when unauthenticated", async () => {
    authGetUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const res = await GET(new Request("http://t/"), ctx(VERDOK_ID));
    expect(res.status).toBe(401);
  });

  it("returns 400 for a non-UUID id", async () => {
    const res = await GET(new Request("http://t/"), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("returns 404 for a cross-tenant id (tenant-scoped query yields no row)", async () => {
    verdokMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    const res = await GET(new Request("http://t/"), ctx(VERDOK_ID));
    expect(res.status).toBe(404);
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it("streams the PDF with attachment headers and a German-slug filename", async () => {
    const res = await GET(new Request("http://t/"), ctx(VERDOK_ID));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="Verfahrensdokumentation_mueller-gmbh_2026-05-16.pdf"',
    );
  });

  it("still serves the PDF when the best-effort download audit throws (F-10)", async () => {
    logAuditEventMock.mockRejectedValueOnce(new Error("audit down"));
    const res = await GET(new Request("http://t/"), ctx(VERDOK_ID));
    expect(res.status).toBe(200);
  });
});
