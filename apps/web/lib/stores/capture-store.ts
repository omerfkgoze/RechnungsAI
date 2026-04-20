"use client";

import { create } from "zustand";

export type CaptureStatus =
  | "queued"
  | "uploading"
  | "uploaded"
  | "failed"
  | "extracting"
  | "extracted";

export interface QueuedCapture {
  id: string;
  status: CaptureStatus;
  originalFilename: string;
  fileType: string;
  sizeBytes: number;
  createdAt: number;
  error?: string;
  invoiceId?: string;
  extractionError?: string;
  extractionVerdict?: "ready" | "review";
}

interface CaptureState {
  queue: QueuedCapture[];
  redirectAfterUpload: boolean;
  addToQueue: (capture: QueuedCapture) => void;
  markUploading: (id: string) => void;
  markUploaded: (id: string, invoiceId: string) => void;
  markFailed: (id: string, error: string) => void;
  markExtracting: (id: string) => void;
  markExtracted: (id: string, verdict: "ready" | "review") => void;
  markExtractionFailed: (id: string, error: string) => void;
  setRedirectAfterUpload: (v: boolean) => void;
  reset: () => void;
}

export const useCaptureStore = create<CaptureState>((set) => ({
  queue: [],
  // Story 2.3: flipped from true → false. Batch capture keeps the camera open
  // between captures; single-capture opt-in remains available via
  // setRedirectAfterUpload(true) for future deep-link / share-target flows.
  redirectAfterUpload: false,
  addToQueue: (capture) =>
    set((state) => ({ queue: [...state.queue, capture] })),
  markUploading: (id) =>
    set((state) => ({
      queue: state.queue.map((c) =>
        c.id === id ? { ...c, status: "uploading" } : c,
      ),
    })),
  markUploaded: (id, invoiceId) =>
    set((state) => ({
      queue: state.queue.map((c) =>
        c.id === id ? { ...c, status: "uploaded", invoiceId } : c,
      ),
    })),
  markFailed: (id, error) =>
    set((state) => ({
      queue: state.queue.map((c) =>
        c.id === id ? { ...c, status: "failed", error } : c,
      ),
    })),
  markExtracting: (id) =>
    set((state) => ({
      queue: state.queue.map((c) =>
        c.id === id && c.status === "uploaded"
          ? { ...c, status: "extracting" }
          : c,
      ),
    })),
  markExtracted: (id, verdict) =>
    set((state) => ({
      queue: state.queue.map((c) =>
        c.id === id
          ? { ...c, status: "extracted", extractionVerdict: verdict }
          : c,
      ),
    })),
  // Extraction failure does NOT roll back capture: the invoice row is already
  // persisted. Revert status to 'uploaded' (capture terminal state) and record
  // the error. Epic 3 dashboard will surface retry UI.
  markExtractionFailed: (id, error) =>
    set((state) => ({
      queue: state.queue.map((c) =>
        c.id === id
          ? { ...c, status: "uploaded", extractionError: error }
          : c,
      ),
    })),
  setRedirectAfterUpload: (v) => set({ redirectAfterUpload: v }),
  reset: () => set({ queue: [] }),
}));

// Counts capture-terminal entries (anything that has reached storage).
export const selectUploadedCount = (s: CaptureState) =>
  s.queue.filter(
    (c) =>
      c.status === "uploaded" ||
      c.status === "extracting" ||
      c.status === "extracted",
  ).length;
export const selectPendingCount = (s: CaptureState) =>
  s.queue.filter((c) => c.status === "queued" || c.status === "uploading")
    .length;
export const selectFailedCount = (s: CaptureState) =>
  s.queue.filter((c) => c.status === "failed").length;
export const selectExtractingCount = (s: CaptureState) =>
  s.queue.filter((c) => c.status === "extracting").length;
export const selectExtractedCount = (s: CaptureState) =>
  s.queue.filter((c) => c.status === "extracted").length;
