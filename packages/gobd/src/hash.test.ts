import { describe, expect, it } from "vitest";
import { hashBuffer, verifyBuffer } from "./hash.js";

// NIST FIPS 180-4 SHA-256 test vectors
const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const ABC_SHA256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

describe("hashBuffer", () => {
  it("matches NIST vector for empty input", () => {
    expect(hashBuffer(new Uint8Array(0))).toBe(EMPTY_SHA256);
  });

  it("matches NIST vector for 'abc'", () => {
    const buf = new TextEncoder().encode("abc");
    expect(hashBuffer(buf)).toBe(ABC_SHA256);
  });

  it("returns lowercase hex string of length 64", () => {
    const hash = hashBuffer(new TextEncoder().encode("test"));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different hashes for different inputs", () => {
    const h1 = hashBuffer(new TextEncoder().encode("invoice-A"));
    const h2 = hashBuffer(new TextEncoder().encode("invoice-B"));
    expect(h1).not.toBe(h2);
  });

  it("is deterministic — same input always yields same hash", () => {
    const buf = new TextEncoder().encode("rechnung-2026-001.pdf");
    expect(hashBuffer(buf)).toBe(hashBuffer(buf));
  });
});

describe("verifyBuffer", () => {
  it("returns true for matching hash", () => {
    const buf = new TextEncoder().encode("abc");
    expect(verifyBuffer(buf, ABC_SHA256)).toBe(true);
  });

  it("returns false when hash does not match", () => {
    const buf = new TextEncoder().encode("abc");
    expect(verifyBuffer(buf, EMPTY_SHA256)).toBe(false);
  });

  it("is case-insensitive on stored hash", () => {
    const buf = new TextEncoder().encode("abc");
    expect(verifyBuffer(buf, ABC_SHA256.toUpperCase())).toBe(true);
  });

  it("detects single-byte tampering", () => {
    const original = new TextEncoder().encode("original document content");
    const storedHash = hashBuffer(original);
    const tampered = new Uint8Array(original);
    tampered[0] = tampered[0] ^ 0xff;
    expect(verifyBuffer(tampered, storedHash)).toBe(false);
  });
});
