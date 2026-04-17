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

const uploadMock = vi.fn();
const removeMock = vi.fn();
const insertSingleMock = vi.fn();
const userSingleMock = vi.fn();
const authGetUserMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: authGetUserMock },
    from: (table: string) => {
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({
              single: userSingleMock,
            }),
          }),
        };
      }
      if (table === "invoices") {
        return {
          insert: () => ({
            select: () => ({
              single: insertSingleMock,
            }),
          }),
        };
      }
      return {};
    },
    storage: {
      from: () => ({
        upload: uploadMock,
        remove: removeMock,
      }),
    },
  })),
}));

import { uploadInvoice } from "./invoices";

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
