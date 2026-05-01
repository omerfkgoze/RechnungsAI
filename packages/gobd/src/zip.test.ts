import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildAuditExportZip } from "./zip.js";

// Parses a ZIP local file header from bytes at a given offset.
// Returns { signature, method, nameLength, compressedSize, uncompressedSize, nameOffset }.
function parseLFH(bytes: Uint8Array, offset: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
  return {
    signature: view.getUint32(0, true),
    method: view.getUint16(8, true),
    crc32: view.getUint32(14, true),
    compressedSize: view.getUint32(18, true),
    uncompressedSize: view.getUint32(22, true),
    nameLength: view.getUint16(26, true),
    extraLength: view.getUint16(28, true),
  };
}

function parseEOCD(bytes: Uint8Array) {
  // Scan backwards for EOCD signature
  for (let i = bytes.length - 22; i >= 0; i--) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + i);
    if (view.getUint32(0, true) === 0x06054b50) {
      return {
        signature: view.getUint32(0, true),
        totalEntries: view.getUint16(10, true),
        centralDirSize: view.getUint32(12, true),
        centralDirOffset: view.getUint32(16, true),
      };
    }
  }
  throw new Error("EOCD not found");
}

function parseCDFH(bytes: Uint8Array, offset: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
  return {
    signature: view.getUint32(0, true),
    localHeaderOffset: view.getUint32(42, true),
  };
}

describe("buildAuditExportZip", () => {
  it("throws when entries is empty", async () => {
    await expect(buildAuditExportZip([])).rejects.toThrow(
      "buildAuditExportZip: at least one entry required",
    );
  });

  it("single-entry ZIP has valid LFH signature and correct EOCD", async () => {
    const content = new TextEncoder().encode("hello world");
    const zip = await buildAuditExportZip([{ path: "test.txt", bytes: content }]);

    // Local File Header signature
    const lfh = parseLFH(zip, 0);
    expect(lfh.signature).toBe(0x04034b50);
    expect(lfh.method).toBe(0); // store-only
    expect(lfh.compressedSize).toBe(content.byteLength);
    expect(lfh.uncompressedSize).toBe(content.byteLength);

    // EOCD signature
    const eocd = parseEOCD(zip);
    expect(eocd.signature).toBe(0x06054b50);
    expect(eocd.totalEntries).toBe(1);

    // Central directory at the documented offset
    const cdfh = parseCDFH(zip, eocd.centralDirOffset);
    expect(cdfh.signature).toBe(0x02014b50);
    expect(cdfh.localHeaderOffset).toBe(0);
  });

  it("CRC32 in LFH matches node:zlib crc32 of the same bytes", async () => {
    const content = new TextEncoder().encode("RechnungsAI test");
    const zip = await buildAuditExportZip([{ path: "a.txt", bytes: content }]);

    const lfh = parseLFH(zip, 0);
    const expected = crc32(content) as unknown as number;
    expect(lfh.crc32).toBe(expected >>> 0);
  });

  it("preserves UTF-8 filenames with diacritics", async () => {
    const name = "Lieferant_ä.txt";
    const nameBytes = new TextEncoder().encode(name);
    const content = new Uint8Array([1, 2, 3]);
    const zip = await buildAuditExportZip([{ path: name, bytes: content }]);

    const lfh = parseLFH(zip, 0);
    expect(lfh.nameLength).toBe(nameBytes.length);

    // Name bytes immediately after the 30-byte LFH header
    const storedName = zip.slice(30, 30 + lfh.nameLength);
    expect(new TextDecoder().decode(storedName)).toBe(name);
  });

  it("EOCD central directory offset points past all local file data", async () => {
    const a = new TextEncoder().encode("file a");
    const b = new TextEncoder().encode("file bb");
    const zip = await buildAuditExportZip([
      { path: "a.txt", bytes: a },
      { path: "b.txt", bytes: b },
    ]);

    const eocd = parseEOCD(zip);
    expect(eocd.totalEntries).toBe(2);

    // Central dir must start after all local data
    const lfhA = parseLFH(zip, 0);
    const entryASize = 30 + lfhA.nameLength + lfhA.extraLength + lfhA.compressedSize;
    const lfhB = parseLFH(zip, entryASize);
    const entryBSize = 30 + lfhB.nameLength + lfhB.extraLength + lfhB.compressedSize;
    expect(eocd.centralDirOffset).toBe(entryASize + entryBSize);
  });
});
