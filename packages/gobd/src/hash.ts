import { createHash } from "node:crypto";

/**
 * Computes a SHA-256 hex digest of a binary buffer.
 * Used to seal documents at archive time per GoBD §239 Abs. 3.
 */
export function hashBuffer(buffer: Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Verifies a buffer against a previously stored SHA-256 hex digest.
 * Returns false if the document has been altered since archiving.
 */
export function verifyBuffer(buffer: Uint8Array, storedHash: string): boolean {
  return hashBuffer(buffer) === storedHash.toLowerCase();
}
