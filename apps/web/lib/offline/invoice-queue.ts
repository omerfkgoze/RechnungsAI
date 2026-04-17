const DB_NAME = "rechnungsai-captures";
const DB_VERSION = 1;
const STORE = "captures";

export type QueueStatus = "pending" | "uploading" | "uploaded" | "failed";

export interface QueuedCapture {
  id: string;
  status: QueueStatus;
  blob: Blob;
  originalFilename: string;
  fileType: string;
  sizeBytes: number;
  createdAt: number;
  error?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb tx error"));
    tx.onabort = () => reject(tx.error ?? new Error("idb tx aborted"));
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb request error"));
  });
}

function genId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `cap_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function enqueueCapture(
  blob: Blob,
  metadata: {
    originalFilename: string;
    fileType: string;
    sizeBytes: number;
  },
): Promise<string> {
  const db = await openDb();
  const id = genId();
  const row: QueuedCapture = {
    id,
    status: "pending",
    blob,
    originalFilename: metadata.originalFilename,
    fileType: metadata.fileType,
    sizeBytes: metadata.sizeBytes,
    createdAt: Date.now(),
  };
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).add(row);
  await txDone(tx);
  db.close();
  return id;
}

export async function listPending(): Promise<QueuedCapture[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const store = tx.objectStore(STORE);
  const index = store.index("status");
  const rows = (await reqToPromise(
    index.getAll(IDBKeyRange.only("pending")),
  )) as QueuedCapture[];
  await txDone(tx);
  db.close();
  return rows;
}

export async function listAll(): Promise<QueuedCapture[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const rows = (await reqToPromise(
    tx.objectStore(STORE).getAll(),
  )) as QueuedCapture[];
  await txDone(tx);
  db.close();
  return rows;
}

async function updateStatus(
  id: string,
  patch: Partial<QueuedCapture>,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const existing = (await reqToPromise(store.get(id))) as
    | QueuedCapture
    | undefined;
  if (!existing) {
    await txDone(tx);
    db.close();
    return;
  }
  store.put({ ...existing, ...patch });
  await txDone(tx);
  db.close();
}

export async function markUploading(id: string): Promise<void> {
  await updateStatus(id, { status: "uploading" });
}

export async function markUploaded(id: string): Promise<void> {
  await updateStatus(id, { status: "uploaded", error: undefined });
}

export async function markFailed(id: string, error: string): Promise<void> {
  await updateStatus(id, { status: "failed", error });
}

export async function requeueFailed(): Promise<number> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const index = store.index("status");
  const rows = (await reqToPromise(
    index.getAll(IDBKeyRange.only("failed")),
  )) as QueuedCapture[];
  for (const row of rows) {
    store.put({ ...row, status: "pending", error: undefined });
  }
  await txDone(tx);
  db.close();
  return rows.length;
}

// Resets items stuck in "uploading" (e.g. after a crash mid-flight) back to
// "pending" so the next drainQueue pass picks them up.
export async function requeueUploading(): Promise<number> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const index = store.index("status");
  const rows = (await reqToPromise(
    index.getAll(IDBKeyRange.only("uploading")),
  )) as QueuedCapture[];
  for (const row of rows) {
    store.put({ ...row, status: "pending", error: undefined });
  }
  await txDone(tx);
  db.close();
  return rows.length;
}
