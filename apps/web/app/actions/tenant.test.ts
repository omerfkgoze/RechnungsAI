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

const authGetUserMock = vi.fn();
const userSingleMock = vi.fn();
const tenantUpdateMock = vi.fn();

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
      if (table === "tenants") {
        return {
          update: (patch: unknown) => ({
            eq: (_col: string, _val: unknown) => ({
              select: () => ({
                single: () => tenantUpdateMock(patch),
              }),
            }),
          }),
        };
      }
      return {};
    },
  })),
}));

import { updateTenantSettings } from "./tenant";
import * as Sentry from "@sentry/nextjs";

const VALID_INPUT = {
  company_name: "Mustermann GmbH",
  company_address: null,
  tax_id: null,
  skr_plan: "SKR03" as const,
  steuerberater_name: null,
  steuerberater_email: "kanzlei@example.de",
  datev_berater_nr: "12345",
  datev_mandanten_nr: "67890",
  datev_sachkontenlaenge: 4,
  datev_fiscal_year_start: 1,
  datev_default_kreditorenkonto: "70000",
};

describe("updateTenantSettings", () => {
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
    tenantUpdateMock.mockResolvedValue({
      data: { updated_at: "2026-05-04T10:00:00.000Z" },
      error: null,
    });
  });

  // (a) happy path
  it("(a) happy path — returns success with updatedAt and calls update with DATEV fields", async () => {
    const result = await updateTenantSettings(VALID_INPUT);
    expect(result).toEqual({
      success: true,
      data: { updatedAt: "2026-05-04T10:00:00.000Z" },
    });
    expect(tenantUpdateMock).toHaveBeenCalledOnce();
    const firstCall = tenantUpdateMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const patch = (firstCall as [Record<string, unknown>])[0];
    expect(patch).toMatchObject({
      datev_berater_nr: "12345",
      datev_mandanten_nr: "67890",
      datev_sachkontenlaenge: 4,
      datev_fiscal_year_start: 1,
      datev_default_kreditorenkonto: "70000",
      steuerberater_email: "kanzlei@example.de",
    });
  });

  // (b) Zod failure — invalid tax_id, no DB call
  it("(b) Zod failure — returns error without calling DB", async () => {
    const result = await updateTenantSettings({ ...VALID_INPUT, tax_id: "XX" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("USt-IdNr.");
    expect(tenantUpdateMock).not.toHaveBeenCalled();
  });

  // (c) Postgres 23514 — check constraint violation
  it("(c) Postgres 23514 → Ungültige Eingabe error", async () => {
    tenantUpdateMock.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "check constraint violation" },
    });
    const result = await updateTenantSettings(VALID_INPUT);
    expect(result).toEqual({
      success: false,
      error: "Ungültige Eingabe. Bitte überprüfe deine Daten.",
    });
  });

  // (d) auth failure — redirect to /login
  it("(d) auth failure → redirects to /login?returnTo=/einstellungen", async () => {
    authGetUserMock.mockResolvedValue({ data: { user: null }, error: new Error("no session") });
    await expect(updateTenantSettings(VALID_INPUT)).rejects.toThrow(/NEXT_REDIRECT/);
  });

  // (e) Postgres 42501 — insufficient privilege → redirect
  it("(e) Postgres 42501 → redirects to /login?returnTo=/einstellungen", async () => {
    tenantUpdateMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "insufficient_privilege" },
    });
    await expect(updateTenantSettings(VALID_INPUT)).rejects.toThrow(/NEXT_REDIRECT/);
  });

  // (f) unknown DB error → Sentry called, generic German error
  it("(f) unknown DB error → Sentry.captureException called, generic error returned", async () => {
    tenantUpdateMock.mockResolvedValue({
      data: null,
      error: { code: "99999", message: "unknown" },
    });
    const result = await updateTenantSettings(VALID_INPUT);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe("Etwas ist schiefgelaufen. Bitte versuche es erneut.");
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tags: { action: "settings:update" } }),
    );
  });
});
