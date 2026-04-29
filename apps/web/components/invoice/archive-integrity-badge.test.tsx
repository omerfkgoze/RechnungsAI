import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ArchiveIntegrityBadge } from "./archive-integrity-badge";

const verifyMock = vi.fn();
vi.mock("@/app/actions/invoices", () => ({
  verifyInvoiceArchive: (...args: unknown[]) => verifyMock(...args),
}));

const HASH = "a".repeat(64);
const SHORT = `SHA-256: …${"a".repeat(8)}`;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ArchiveIntegrityBadge", () => {
  it("renders gray legacy text when sha256 is null — no action called", () => {
    render(<ArchiveIntegrityBadge invoiceId="inv-1" sha256={null} />);
    expect(screen.getByText("Archiv-Hash nicht verfügbar (Legacy-Upload)")).toBeDefined();
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("shows blue pending state then green verified state", async () => {
    verifyMock.mockResolvedValueOnce({
      success: true,
      data: { status: "verified", sha256: HASH },
    });
    render(<ArchiveIntegrityBadge invoiceId="inv-1" sha256={HASH} />);
    // pending state appears immediately
    expect(screen.getByText("Integrität wird geprüft…")).toBeDefined();
    // then transitions to verified
    await waitFor(() => {
      expect(screen.getByText((t) => t.includes("Archiv unverändert"))).toBeDefined();
      expect(screen.getByText((t) => t.includes(SHORT))).toBeDefined();
    });
  });

  it("shows amber mismatch state", async () => {
    verifyMock.mockResolvedValueOnce({
      success: true,
      data: { status: "mismatch", sha256: HASH },
    });
    render(<ArchiveIntegrityBadge invoiceId="inv-1" sha256={HASH} />);
    await waitFor(() => {
      expect(
        screen.getByText((t) => t.includes("Archiv-Integrität gestört")),
      ).toBeDefined();
    });
  });

  it("shows red error state when action fails", async () => {
    verifyMock.mockResolvedValueOnce({ success: false, error: "Rechnung nicht gefunden." });
    render(<ArchiveIntegrityBadge invoiceId="inv-1" sha256={HASH} />);
    await waitFor(() => {
      expect(screen.getByText("Prüfung fehlgeschlagen")).toBeDefined();
    });
  });
});
