"use client";

import { create } from "zustand";

export type CaptureStatus = "queued" | "uploading" | "uploaded" | "failed";

export interface QueuedCapture {
  id: string;
  status: CaptureStatus;
  originalFilename: string;
  fileType: string;
  sizeBytes: number;
  createdAt: number;
  error?: string;
  invoiceId?: string;
}

interface CaptureState {
  queue: QueuedCapture[];
  redirectAfterUpload: boolean;
  addToQueue: (capture: QueuedCapture) => void;
  markUploading: (id: string) => void;
  markUploaded: (id: string, invoiceId: string) => void;
  markFailed: (id: string, error: string) => void;
  setRedirectAfterUpload: (v: boolean) => void;
  reset: () => void;
}

export const useCaptureStore = create<CaptureState>((set) => ({
  queue: [],
  redirectAfterUpload: true,
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
  setRedirectAfterUpload: (v) => set({ redirectAfterUpload: v }),
  reset: () => set({ queue: [] }),
}));

export const selectUploadedCount = (s: CaptureState) =>
  s.queue.filter((c) => c.status === "uploaded").length;
export const selectPendingCount = (s: CaptureState) =>
  s.queue.filter((c) => c.status === "queued" || c.status === "uploading")
    .length;
export const selectFailedCount = (s: CaptureState) =>
  s.queue.filter((c) => c.status === "failed").length;
