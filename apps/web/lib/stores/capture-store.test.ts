import { beforeEach, describe, expect, it } from "vitest";
import {
  selectExtractedCount,
  selectExtractingCount,
  selectFailedCount,
  selectPendingCount,
  selectUploadedCount,
  useCaptureStore,
  type QueuedCapture,
} from "./capture-store";

function make(id: string, overrides: Partial<QueuedCapture> = {}): QueuedCapture {
  return {
    id,
    status: "queued",
    originalFilename: `${id}.jpg`,
    fileType: "image/jpeg",
    sizeBytes: 100,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("useCaptureStore", () => {
  beforeEach(() => {
    // Reset to initial state between tests (store is module-scoped).
    useCaptureStore.getState().reset();
    useCaptureStore.setState({ redirectAfterUpload: false });
  });

  it("redirectAfterUpload defaults to false (Story 2.3 flip)", () => {
    expect(useCaptureStore.getState().redirectAfterUpload).toBe(false);
  });

  it("addToQueue preserves insertion order across rapid successive calls", () => {
    const { addToQueue } = useCaptureStore.getState();
    for (let i = 0; i < 10; i++) addToQueue(make(`e${i}`));
    const ids = useCaptureStore.getState().queue.map((c) => c.id);
    expect(ids).toEqual([
      "e0", "e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8", "e9",
    ]);
  });

  it("markExtracting only flips matching id from 'uploaded' → 'extracting'", () => {
    const { addToQueue, markExtracting } = useCaptureStore.getState();
    addToQueue(make("a", { status: "uploaded" }));
    addToQueue(make("b", { status: "uploaded" }));
    addToQueue(make("c", { status: "queued" }));
    markExtracting("a");
    const q = useCaptureStore.getState().queue;
    expect(q.find((c) => c.id === "a")?.status).toBe("extracting");
    expect(q.find((c) => c.id === "b")?.status).toBe("uploaded");
    // Guard: 'queued' must NOT be promoted to extracting.
    markExtracting("c");
    expect(
      useCaptureStore.getState().queue.find((c) => c.id === "c")?.status,
    ).toBe("queued");
  });

  it("markExtracted preserves invoiceId and writes verdict", () => {
    const { addToQueue, markExtracting, markExtracted } =
      useCaptureStore.getState();
    addToQueue(make("a", { status: "uploaded", invoiceId: "inv-1" }));
    markExtracting("a");
    markExtracted("a", "ready");
    const entry = useCaptureStore.getState().queue.find((c) => c.id === "a");
    expect(entry?.status).toBe("extracted");
    expect(entry?.invoiceId).toBe("inv-1");
    expect(entry?.extractionVerdict).toBe("ready");
  });

  it("markExtractionFailed keeps status='uploaded' and sets extractionError", () => {
    const { addToQueue, markExtracting, markExtractionFailed } =
      useCaptureStore.getState();
    addToQueue(make("a", { status: "uploaded", invoiceId: "inv-1" }));
    markExtracting("a");
    markExtractionFailed("a", "KI-Dienst nicht erreichbar.");
    const entry = useCaptureStore.getState().queue.find((c) => c.id === "a");
    expect(entry?.status).toBe("uploaded");
    expect(entry?.extractionError).toBe("KI-Dienst nicht erreichbar.");
    expect(entry?.invoiceId).toBe("inv-1");
  });

  it("selectors count mixed queues correctly", () => {
    const { addToQueue, markUploading, markUploaded, markFailed } =
      useCaptureStore.getState();
    addToQueue(make("a"));
    addToQueue(make("b"));
    addToQueue(make("c"));
    addToQueue(make("d"));
    addToQueue(make("e"));
    markUploading("a"); // uploading
    markUploaded("b", "inv-b");
    markFailed("c", "boom");
    markUploaded("d", "inv-d");
    useCaptureStore.getState().markExtracting("d");
    useCaptureStore.getState().markExtracted("d", "review");
    markUploaded("e", "inv-e");
    useCaptureStore.getState().markExtracting("e");

    const s = useCaptureStore.getState();
    // Capture-terminal counts (uploaded|extracting|extracted): b, d, e → 3
    expect(selectUploadedCount(s)).toBe(3);
    // Pending: a (uploading)
    expect(selectPendingCount(s)).toBe(1);
    expect(selectFailedCount(s)).toBe(1);
    expect(selectExtractingCount(s)).toBe(1); // e
    expect(selectExtractedCount(s)).toBe(1); // d
  });

  it("setRedirectAfterUpload toggles the flag without other side effects", () => {
    useCaptureStore.getState().addToQueue(make("a"));
    useCaptureStore.getState().setRedirectAfterUpload(true);
    expect(useCaptureStore.getState().redirectAfterUpload).toBe(true);
    expect(useCaptureStore.getState().queue).toHaveLength(1);
    useCaptureStore.getState().setRedirectAfterUpload(false);
    expect(useCaptureStore.getState().redirectAfterUpload).toBe(false);
  });
});
