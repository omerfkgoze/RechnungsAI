/** Stored alongside every invoice record once it is archived. */
export type GoeBDArchiveRecord = {
  invoiceId: string;
  storagePath: string;
  sha256: string;
  archivedAt: string; // ISO 8601
};

/** Outcome of a post-retrieval integrity check. */
export type GoeBDVerifyResult =
  | { ok: true }
  | { ok: false; reason: "hash_mismatch" | "not_archived" };
