import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SourceDocumentViewer } from "./source-document-viewer";

const getSignedUrlMock = vi.fn();
const verifyInvoiceArchiveMock = vi.fn();
vi.mock("@/app/actions/invoices", () => ({
  getInvoiceSignedUrl: (...args: unknown[]) => getSignedUrlMock(...args),
  verifyInvoiceArchive: (...args: unknown[]) => verifyInvoiceArchiveMock(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const DEFAULT_PROPS = {
  invoiceId: "inv-1",
  open: true,
  onOpenChange: vi.fn(),
  fieldLabel: "Lieferant",
  aiValue: "ACME GmbH",
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({
    text: async () => "<Invoice>test</Invoice>",
  } as unknown as Response);
});

describe("SourceDocumentViewer", () => {
  it("renders an img tag for image file types", async () => {
    getSignedUrlMock.mockResolvedValueOnce({
      success: true,
      data: { url: "https://example.com/img.jpg", fileType: "image/jpeg", sha256: null },
    });
    render(<SourceDocumentViewer {...DEFAULT_PROPS} />);
    await waitFor(() => {
      const img = document.querySelector("img");
      expect(img).toBeDefined();
      expect(img?.src).toContain("img.jpg");
    });
  });

  it("renders an object tag for pdf file types", async () => {
    getSignedUrlMock.mockResolvedValueOnce({
      success: true,
      data: { url: "https://example.com/doc.pdf", fileType: "application/pdf", sha256: null },
    });
    render(<SourceDocumentViewer {...DEFAULT_PROPS} />);
    await waitFor(() => {
      const obj = document.querySelector("object");
      expect(obj).toBeDefined();
      expect(obj?.data).toContain("doc.pdf");
    });
  });

  it("renders pre tag for XML file types and shows content", async () => {
    getSignedUrlMock.mockResolvedValueOnce({
      success: true,
      data: { url: "https://example.com/rechnung.xml", fileType: "application/xml", sha256: null },
    });
    render(<SourceDocumentViewer {...DEFAULT_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText("<Invoice>test</Invoice>")).toBeDefined();
    });
  });

  it("close button fires onOpenChange(false)", async () => {
    const onOpenChange = vi.fn();
    getSignedUrlMock.mockResolvedValueOnce({
      success: true,
      data: { url: "https://example.com/img.jpg", fileType: "image/jpeg", sha256: null },
    });
    render(<SourceDocumentViewer {...DEFAULT_PROPS} onOpenChange={onOpenChange} />);
    const closeBtn = screen.getByRole("button", { name: "Schließen" });
    fireEvent.click(closeBtn);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("mounts ArchiveIntegrityBadge in sheet header when sha256 is returned", async () => {
    const HASH = "b".repeat(64);
    getSignedUrlMock.mockResolvedValueOnce({
      success: true,
      data: { url: "https://example.com/img.jpg", fileType: "image/jpeg", sha256: HASH },
    });
    verifyInvoiceArchiveMock.mockResolvedValueOnce({
      success: true,
      data: { status: "verified", sha256: HASH },
    });
    render(<SourceDocumentViewer {...DEFAULT_PROPS} />);
    // Badge mounts and eventually shows the verified state with the short hash
    await waitFor(() => {
      expect(screen.getByText((t) => t.includes("Archiv unverändert"))).toBeDefined();
    });
  });
});
