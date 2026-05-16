import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`) as Error & { digest: string };
    err.digest = `NEXT_REDIRECT;${url}`;
    throw err;
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

// Keep the PDF/React layer out of the Server Action unit test.
vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: vi.fn(async () => Buffer.from("%PDF-1.7 fake")),
}));
vi.mock("@/lib/pdf/fonts", () => ({ registerFonts: vi.fn() }));
vi.mock("@/lib/pdf/verdok-template", () => ({ VerdokTemplate: () => null }));

const logAuditEventMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@/app/actions/invoices/shared", () => ({
  logAuditEvent: (...args: unknown[]) => logAuditEventMock(...args),
}));

const authGetUserMock = vi.fn();
const userSingleMock = vi.fn();
const tenantSingleMock = vi.fn();
const existingVerdokMaybeSingleMock = vi.fn();
const uploadMock = vi.fn();
const upsertSingleMock = vi.fn();
const upsertSpy = vi.fn();
const storageRemoveMock = vi.fn();

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
      if (table === "verfahrensdokumentation") {
        return {
          // Pre-UPSERT lookup of the row this regeneration replaces.
          select: () => ({
            eq: () => ({ maybeSingle: existingVerdokMaybeSingleMock }),
          }),
          upsert: (payload: unknown, opts: unknown) => {
            upsertSpy(payload, opts);
            return { select: () => ({ single: upsertSingleMock }) };
          },
        };
      }
      return {};
    },
    storage: {
      from: () => ({ upload: uploadMock, remove: storageRemoveMock }),
    },
  })),
}));

import { generateVerdok } from "./verdok";

const TENANT_ID = "00000000-0000-0000-0000-0000000000a1";
const USER_ID = "00000000-0000-0000-0000-0000000000b2";

const COMPLETE_TENANT = {
  company_name: "Müller GmbH",
  company_address: "Hauptstraße 1, 10115 Berlin",
  tax_id: "DE123456789",
  skr_plan: "SKR03",
  datev_berater_nr: "1234567",
  datev_mandanten_nr: "10001",
  datev_sachkontenlaenge: 4,
  datev_fiscal_year_start: 1,
  datev_default_kreditorenkonto: "70000",
  steuerberater_name: "Dr. Schmidt",
};

beforeEach(() => {
  vi.clearAllMocks();
  authGetUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  userSingleMock.mockResolvedValue({ data: { tenant_id: TENANT_ID }, error: null });
  tenantSingleMock.mockResolvedValue({
    data: { id: TENANT_ID, ...COMPLETE_TENANT },
    error: null,
  });
  // Default: first generation — no prior row/object to clean up.
  existingVerdokMaybeSingleMock.mockResolvedValue({ data: null, error: null });
  uploadMock.mockResolvedValue({ error: null });
  upsertSingleMock.mockResolvedValue({ data: { id: "verdok-row-id" }, error: null });
  storageRemoveMock.mockResolvedValue({ error: null });
});

describe("generateVerdok — AC7 incomplete-settings guard", () => {
  it("returns the German settings message and never renders/uploads when a required field is missing", async () => {
    tenantSingleMock.mockResolvedValue({
      data: { ...COMPLETE_TENANT, datev_berater_nr: null },
      error: null,
    });

    const result = await generateVerdok();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Firmendaten und DATEV-Einstellungen");
    }
    expect(uploadMock).not.toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("treats whitespace-only company_name as missing", async () => {
    tenantSingleMock.mockResolvedValue({
      data: { ...COMPLETE_TENANT, company_name: "   " },
      error: null,
    });
    const result = await generateVerdok();
    expect(result.success).toBe(false);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range datev_fiscal_year_start (would render wrong month)", async () => {
    tenantSingleMock.mockResolvedValue({
      data: { id: TENANT_ID, ...COMPLETE_TENANT, datev_fiscal_year_start: 13 },
      error: null,
    });
    const result = await generateVerdok();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Firmendaten und DATEV-Einstellungen");
    }
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("rejects a null datev_sachkontenlaenge (would render 'null Stellen')", async () => {
    tenantSingleMock.mockResolvedValue({
      data: { id: TENANT_ID, ...COMPLETE_TENANT, datev_sachkontenlaenge: null },
      error: null,
    });
    const result = await generateVerdok();
    expect(result.success).toBe(false);
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});

describe("generateVerdok — config hash normalization", () => {
  it("trailing/leading whitespace yields the SAME config_hash (no spurious 7.2 update)", async () => {
    tenantSingleMock.mockResolvedValue({
      data: { id: TENANT_ID, ...COMPLETE_TENANT },
      error: null,
    });
    await generateVerdok();
    const cleanHash = upsertSpy.mock.calls[0]![0].config_hash;

    vi.clearAllMocks();
    authGetUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    userSingleMock.mockResolvedValue({ data: { tenant_id: TENANT_ID }, error: null });
    existingVerdokMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    uploadMock.mockResolvedValue({ error: null });
    upsertSingleMock.mockResolvedValue({ data: { id: "verdok-row-id" }, error: null });
    storageRemoveMock.mockResolvedValue({ error: null });
    tenantSingleMock.mockResolvedValue({
      data: {
        id: TENANT_ID,
        ...COMPLETE_TENANT,
        company_name: `  ${COMPLETE_TENANT.company_name}  `,
        steuerberater_name: `${COMPLETE_TENANT.steuerberater_name}\t`,
      },
      error: null,
    });
    await generateVerdok();
    const paddedHash = upsertSpy.mock.calls[0]![0].config_hash;

    expect(paddedHash).toBe(cleanHash);
  });
});

describe("generateVerdok — happy path UPSERT", () => {
  it("UPSERTs with an explicit ISO generated_at (D-1) and logs the audit event", async () => {
    const result = await generateVerdok();

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.id).toBe("verdok-row-id");

    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const [payload, opts] = upsertSpy.mock.calls[0]!;
    expect(opts).toEqual({ onConflict: "tenant_id" });
    expect(payload).toMatchObject({
      tenant_id: TENANT_ID,
      generated_by: USER_ID,
    });
    expect(payload.config_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof payload.generated_at).toBe("string");
    expect(payload.generated_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    // storage path and generated_at must share the same ISO stamp (lockstep).
    expect(payload.pdf_storage_path).toBe(
      `${TENANT_ID}/verdok-${payload.generated_at}.pdf`,
    );

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: "verdok_generated",
        tenantId: TENANT_ID,
        metadata: { config_hash: payload.config_hash },
      }),
    );

    // Returned generatedAt must be the server-authoritative stamp (the same
    // one written to the row) — not a client clock.
    if (result.success) {
      expect(result.data.generatedAt).toBe(payload.generated_at);
    }
  });

  it("does not clean up on first generation (no prior object)", async () => {
    await generateVerdok();
    expect(storageRemoveMock).not.toHaveBeenCalled();
  });

  it("removes the previous PDF object on regeneration (no orphan)", async () => {
    existingVerdokMaybeSingleMock.mockResolvedValue({
      data: { pdf_storage_path: `${TENANT_ID}/verdok-OLD.pdf` },
      error: null,
    });

    const result = await generateVerdok();

    expect(result.success).toBe(true);
    expect(storageRemoveMock).toHaveBeenCalledWith([
      `${TENANT_ID}/verdok-OLD.pdf`,
    ]);
  });

  it("a failed stale-cleanup still returns success (best-effort)", async () => {
    existingVerdokMaybeSingleMock.mockResolvedValue({
      data: { pdf_storage_path: `${TENANT_ID}/verdok-OLD.pdf` },
      error: null,
    });
    storageRemoveMock.mockResolvedValue({ error: { message: "remove failed" } });

    const result = await generateVerdok();

    expect(result.success).toBe(true);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
  });

  it("does NOT write the DB row when storage upload fails (F-5)", async () => {
    uploadMock.mockResolvedValue({ error: { message: "storage down" } });

    const result = await generateVerdok();

    expect(result.success).toBe(false);
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});
