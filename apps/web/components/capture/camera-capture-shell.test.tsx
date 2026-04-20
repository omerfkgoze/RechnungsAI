import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

// ─── Module mocks ──────────────────────────────────────────────
// Must be declared at module top (hoisted by Vitest).
vi.mock("@/app/actions/invoices", () => ({
  uploadInvoice: vi.fn(),
  extractInvoice: vi.fn(),
}));
vi.mock("@/lib/offline/invoice-queue", () => ({
  enqueueCapture: vi.fn(async () => `queue-${Math.random().toString(36).slice(2)}`),
  listPending: vi.fn(async () => []),
  markFailed: vi.fn(async () => {}),
  markUploaded: vi.fn(async () => {}),
  markUploading: vi.fn(async () => {}),
  requeueFailed: vi.fn(async () => {}),
  requeueUploading: vi.fn(async () => {}),
}));
vi.mock("@/lib/offline/register-sw", () => ({
  registerInvoiceSW: vi.fn(async () => {}),
}));
const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import { uploadInvoice, extractInvoice } from "@/app/actions/invoices";
import { CameraCaptureShell } from "./camera-capture-shell";
import { useCaptureStore } from "@/lib/stores/capture-store";
import { resetExtractionGate } from "./extraction-gate";

beforeEach(() => {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockRejectedValue(new Error("denied")),
    },
  });
  useCaptureStore.getState().reset();
  useCaptureStore.setState({ redirectAfterUpload: false });
  resetExtractionGate();
  routerPush.mockReset();
  vi.mocked(uploadInvoice).mockReset();
  vi.mocked(extractInvoice).mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

function makeFile(name: string, type: string, sizeBytes: number): File {
  const buf = new Uint8Array(sizeBytes);
  return new File([buf], name, { type });
}

function uploadFiles(input: HTMLInputElement, files: File[]) {
  // jsdom lacks DataTransfer. A FileList-like array-like works because the
  // handler calls `Array.from(e.target.files ?? [])`.
  const fileList: FileList = Object.assign(files.slice(), {
    item: (i: number) => files[i] ?? null,
  }) as unknown as FileList;
  fireEvent.change(input, { target: { files: fileList } });
}

async function waitForFallback() {
  await screen.findByText("Kamera nicht verfügbar.");
}

describe("CameraCaptureShell — multi-file picker (Story 2.3)", () => {
  it("selecting 3 files triggers 3 uploadInvoice + 3 extractInvoice calls", async () => {
    vi.mocked(uploadInvoice).mockImplementation(async () => ({
      success: true,
      data: {
        invoiceId: `inv-${Math.random().toString(36).slice(2)}`,
        filePath: "p",
      },
    }));
    vi.mocked(extractInvoice).mockResolvedValue({
      success: true,
      data: { status: "ready", overall: 0.95 },
    });

    render(<CameraCaptureShell />);
    await waitForFallback();

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.multiple).toBe(true);

    const files = [
      makeFile("a.jpg", "image/jpeg", 1000),
      makeFile("b.jpg", "image/jpeg", 1000),
      makeFile("c.jpg", "image/jpeg", 1000),
    ];
    await act(async () => {
      uploadFiles(input, files);
    });

    await waitFor(() => {
      expect(vi.mocked(uploadInvoice)).toHaveBeenCalledTimes(3);
    });
    await waitFor(() => {
      expect(vi.mocked(extractInvoice)).toHaveBeenCalledTimes(3);
    });
  });

  it("selecting 25 files processes only first 20 and surfaces cap error", async () => {
    vi.mocked(uploadInvoice).mockResolvedValue({
      success: true,
      data: { invoiceId: "inv-x", filePath: "p" },
    });
    vi.mocked(extractInvoice).mockResolvedValue({
      success: true,
      data: { status: "ready", overall: 0.95 },
    });

    render(<CameraCaptureShell />);
    await waitForFallback();

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const files = Array.from({ length: 25 }, (_, i) =>
      makeFile(`f${i}.jpg`, "image/jpeg", 500),
    );
    await act(async () => {
      uploadFiles(input, files);
    });

    await waitFor(() => {
      expect(vi.mocked(uploadInvoice)).toHaveBeenCalledTimes(20);
    });
    expect(
      screen.getByText("Bitte wähle höchstens 20 Dateien pro Aufnahme-Runde."),
    ).toBeInTheDocument();
  });

  it("one invalid file does not block the others (failure isolation)", async () => {
    vi.mocked(uploadInvoice).mockResolvedValue({
      success: true,
      data: { invoiceId: "inv-y", filePath: "p" },
    });
    vi.mocked(extractInvoice).mockResolvedValue({
      success: true,
      data: { status: "ready", overall: 0.95 },
    });

    render(<CameraCaptureShell />);
    await waitForFallback();

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const tooBig = 11 * 1024 * 1024;
    const files = [
      makeFile("ok1.jpg", "image/jpeg", 500),
      makeFile("huge.jpg", "image/jpeg", tooBig),
      makeFile("ok2.jpg", "image/jpeg", 500),
      makeFile("ok3.jpg", "image/jpeg", 500),
    ];
    await act(async () => {
      uploadFiles(input, files);
    });

    await waitFor(() => {
      expect(vi.mocked(uploadInvoice)).toHaveBeenCalledTimes(3);
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("extraction failure sets extractionError; others reach 'extracted'", async () => {
    const invoiceIds = ["inv-1", "inv-2", "inv-3"];
    let uploadCall = 0;
    vi.mocked(uploadInvoice).mockImplementation(async () => ({
      success: true,
      data: { invoiceId: invoiceIds[uploadCall++]!, filePath: "p" },
    }));
    let extractCall = 0;
    vi.mocked(extractInvoice).mockImplementation(async () => {
      const idx = extractCall++;
      if (idx === 1) {
        return { success: false, error: "KI-Dienst nicht erreichbar." };
      }
      return { success: true, data: { status: "ready", overall: 0.9 } };
    });

    render(<CameraCaptureShell />);
    await waitForFallback();

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const files = [
      makeFile("a.jpg", "image/jpeg", 100),
      makeFile("b.jpg", "image/jpeg", 100),
      makeFile("c.jpg", "image/jpeg", 100),
    ];
    await act(async () => {
      uploadFiles(input, files);
    });

    await waitFor(() => {
      expect(vi.mocked(extractInvoice)).toHaveBeenCalledTimes(3);
    });
    await waitFor(() => {
      const q = useCaptureStore.getState().queue;
      const extractedCount = q.filter((c) => c.status === "extracted").length;
      const withErr = q.filter((c) => c.extractionError).length;
      expect(extractedCount).toBe(2);
      expect(withErr).toBe(1);
    });
  });

  it("upload failure on one file does not block subsequent files", async () => {
    let call = 0;
    vi.mocked(uploadInvoice).mockImplementation(async () => {
      const idx = call++;
      if (idx === 0) {
        return { success: false, error: "Upload fehlgeschlagen." };
      }
      return {
        success: true,
        data: { invoiceId: `inv-${idx}`, filePath: "p" },
      };
    });
    vi.mocked(extractInvoice).mockResolvedValue({
      success: true,
      data: { status: "ready", overall: 0.9 },
    });

    render(<CameraCaptureShell />);
    await waitForFallback();

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const files = [
      makeFile("a.jpg", "image/jpeg", 100),
      makeFile("b.jpg", "image/jpeg", 100),
      makeFile("c.jpg", "image/jpeg", 100),
    ];
    await act(async () => {
      uploadFiles(input, files);
    });

    // File 0 returns {success:false} → retried 4× total; Files 1,2 succeed
    // first try and each trigger 1 extractInvoice call.
    await waitFor(
      () => {
        expect(vi.mocked(extractInvoice).mock.calls.length).toBe(2);
      },
      { timeout: 20000 },
    );
  }, 25000);
});
