import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  enqueueCapture,
  listAll,
  listPending,
  markFailed,
  markUploaded,
  markUploading,
  requeueFailed,
} from "./invoice-queue";

async function clearDb() {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase("rechnungsai-captures");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

describe("invoice-queue", () => {
  beforeEach(async () => {
    await clearDb();
  });

  const meta = {
    originalFilename: "rechnung.jpg",
    fileType: "image/jpeg",
    sizeBytes: 500,
  };
  const blob = () => new Blob(["payload"], { type: "image/jpeg" });

  it("enqueueCapture persists a pending row with generated id", async () => {
    const id = await enqueueCapture(blob(), meta);
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
    const all = await listAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.status).toBe("pending");
    expect(all[0]?.originalFilename).toBe("rechnung.jpg");
  });

  it("listPending returns only pending rows", async () => {
    const id1 = await enqueueCapture(blob(), meta);
    await enqueueCapture(blob(), meta);
    await markUploaded(id1);
    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.status).toBe("pending");
  });

  it("markUploading transitions status", async () => {
    const id = await enqueueCapture(blob(), meta);
    await markUploading(id);
    const all = await listAll();
    expect(all[0]?.status).toBe("uploading");
  });

  it("markUploaded clears error and sets status", async () => {
    const id = await enqueueCapture(blob(), meta);
    await markFailed(id, "network");
    await markUploaded(id);
    const all = await listAll();
    expect(all[0]?.status).toBe("uploaded");
    expect(all[0]?.error).toBeUndefined();
  });

  it("markFailed stores error message", async () => {
    const id = await enqueueCapture(blob(), meta);
    await markFailed(id, "Upload fehlgeschlagen.");
    const all = await listAll();
    expect(all[0]?.status).toBe("failed");
    expect(all[0]?.error).toBe("Upload fehlgeschlagen.");
  });

  it("requeueFailed moves failed rows back to pending", async () => {
    const id = await enqueueCapture(blob(), meta);
    await markFailed(id, "network");
    const count = await requeueFailed();
    expect(count).toBe(1);
    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.error).toBeUndefined();
  });

  it("markUploaded on missing id is a no-op", async () => {
    await expect(markUploaded("nonexistent")).resolves.toBeUndefined();
  });
});
