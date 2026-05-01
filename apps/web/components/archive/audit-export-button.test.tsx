import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";

import { AuditExportButton } from "./audit-export-button";

const fetchMock = vi.fn();
global.fetch = fetchMock;

const createObjectURLMock = vi.fn(() => "blob:mock-url");
const revokeObjectURLMock = vi.fn();
global.URL.createObjectURL = createObjectURLMock;
global.URL.revokeObjectURL = revokeObjectURLMock;

describe("AuditExportButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is disabled when selectedIds is empty", () => {
    render(<AuditExportButton selectedIds={[]} />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("is disabled when selectedIds exceeds 500", () => {
    const ids = Array.from({ length: 501 }, (_, i) => `id-${i}`);
    render(<AuditExportButton selectedIds={ids} />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("POSTs selected IDs on click and triggers download via URL.createObjectURL", async () => {
    const ids = ["id-1", "id-2"];

    const mockBlob = new Blob(["mock-zip"], { type: "application/zip" });
    fetchMock.mockResolvedValueOnce(
      new Response(mockBlob, {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": 'attachment; filename="audit-export.zip"',
        },
      }),
    );

    render(<AuditExportButton selectedIds={ids} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
      // Let fetch resolve
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/archive/export",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ invoiceIds: ids }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(createObjectURLMock).toHaveBeenCalled();
  });
});
