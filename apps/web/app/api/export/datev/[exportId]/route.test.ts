import { describe, it, expect, vi, beforeEach } from "vitest";

const sentryCaptureMock = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => sentryCaptureMock(...args),
}));

const authGetUserMock = vi.fn();
const userSingleMock = vi.fn();
const tenantSingleMock = vi.fn();
const datevSelectResultMock = vi.fn();
const auditInsertMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: authGetUserMock },
    from: (table: string) => {
      if (table === "users") {
        return { select: () => ({ eq: () => ({ single: userSingleMock }) }) };
      }
      if (table === "tenants") {
        return { select: () => ({ eq: () => ({ single: tenantSingleMock }) }) };
      }
      if (table === "datev_exports") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: datevSelectResultMock }),
            }),
          }),
        };
      }
      if (table === "audit_logs") {
        return { insert: auditInsertMock };
      }
      return {};
    },
  })),
}));

import { GET } from "./route";

const VALID_UUID = "a1b2c3d4-e5f6-4890-abcd-ef1234567890";
const TENANT_ID = "00000000-0000-0000-0000-00000000aaaa";
const USER_ID = "00000000-0000-0000-0000-00000000bbbb";

function makeCtx(exportId: string) {
  return { params: Promise.resolve({ exportId }) };
}

describe("GET /api/export/datev/[exportId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authGetUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    userSingleMock.mockResolvedValue({ data: { tenant_id: TENANT_ID }, error: null });
    tenantSingleMock.mockResolvedValue({
      data: { company_name: "Müller GmbH" },
      error: null,
    });
  });

  it("(a) valid request — 200 text/csv with attachment Content-Disposition and stored CSV body", async () => {
    const csv = "﻿EXTF;700;...";
    datevSelectResultMock.mockResolvedValueOnce({
      data: {
        id: VALID_UUID,
        tenant_id: TENANT_ID,
        csv,
        date_from: "20260501",
        date_to: "20260506",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      error: null,
    });

    const res = await GET(new Request(`https://x/api/export/datev/${VALID_UUID}`), makeCtx(VALID_UUID));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toContain('filename="datev-export-m-ller-gmbh-20260501-20260506.csv"');
    const body = new TextDecoder("utf-8", { ignoreBOM: true }).decode(
      new Uint8Array(await res.arrayBuffer()),
    );
    expect(body).toBe(csv);
    expect(auditInsertMock).not.toHaveBeenCalled();
  });

  it("(b) invalid uuid — 400", async () => {
    const res = await GET(new Request("https://x/api/export/datev/nope"), makeCtx("nope"));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("Ungültige Export-ID.");
  });

  it("(c) auth failure — 401", async () => {
    authGetUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await GET(new Request(`https://x/api/export/datev/${VALID_UUID}`), makeCtx(VALID_UUID));
    expect(res.status).toBe(401);
  });

  it("(d) export from another tenant (not found via RLS+filter) — 404", async () => {
    datevSelectResultMock.mockResolvedValueOnce({ data: null, error: null });
    const res = await GET(new Request(`https://x/api/export/datev/${VALID_UUID}`), makeCtx(VALID_UUID));
    expect(res.status).toBe(404);
  });

  it("(e) expired — 410 with German message", async () => {
    datevSelectResultMock.mockResolvedValueOnce({
      data: {
        id: VALID_UUID,
        tenant_id: TENANT_ID,
        csv: "x",
        date_from: "20260501",
        date_to: "20260506",
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      },
      error: null,
    });
    const res = await GET(new Request(`https://x/api/export/datev/${VALID_UUID}`), makeCtx(VALID_UUID));
    expect(res.status).toBe(410);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("abgelaufen");
  });

  it("(f) Supabase select error — 500 + Sentry capture", async () => {
    datevSelectResultMock.mockResolvedValueOnce({
      data: null,
      error: { code: "XX000", message: "boom" },
    });
    const res = await GET(new Request(`https://x/api/export/datev/${VALID_UUID}`), makeCtx(VALID_UUID));
    expect(res.status).toBe(500);
    expect(sentryCaptureMock).toHaveBeenCalled();
    expect(auditInsertMock).not.toHaveBeenCalled();
  });
});
