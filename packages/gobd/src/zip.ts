import { crc32 } from "node:zlib";

export type ZipEntry = { path: string; bytes: Uint8Array };

function dosTime(d = new Date()): { time: number; date: number } {
  const time =
    ((d.getHours() & 0x1f) << 11) |
    ((d.getMinutes() & 0x3f) << 5) |
    (Math.floor(d.getSeconds() / 2) & 0x1f);
  const date =
    (((d.getFullYear() - 1980) & 0x7f) << 9) |
    (((d.getMonth() + 1) & 0x0f) << 5) |
    (d.getDate() & 0x1f);
  return { time, date };
}

// Store-only ZIP writer (compression method 0x0000).
// Originals are already compressed (JPEG/PDF); store-only saves ~120 LOC of
// DEFLATE plumbing and is read identically by Steuerberater tooling.
// CRC32 via Node ≥22 zlib.crc32 (synchronous, returns number).
export async function buildAuditExportZip(entries: ZipEntry[]): Promise<Uint8Array> {
  if (entries.length === 0) {
    throw new Error("buildAuditExportZip: at least one entry required");
  }

  const enc = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let localOffset = 0;
  const { time, date } = dosTime();

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.path);
    const checksum = crc32(entry.bytes) as unknown as number;
    const size = entry.bytes.byteLength;

    // Local File Header (30 bytes + name)
    // Signature: 0x04034b50; version needed: 20; flag bit 11 = UTF-8 names; method: 0 = store
    const lfh = new Uint8Array(30 + nameBytes.length);
    const lfhView = new DataView(lfh.buffer);
    lfhView.setUint32(0, 0x04034b50, true);
    lfhView.setUint16(4, 20, true);         // version needed
    lfhView.setUint16(6, 0x0800, true);     // general purpose flag: UTF-8 names
    lfhView.setUint16(8, 0, true);          // compression method: 0 = store
    lfhView.setUint16(10, time, true);
    lfhView.setUint16(12, date, true);
    lfhView.setUint32(14, checksum, true);
    lfhView.setUint32(18, size, true);      // compressed size (= uncompressed for store)
    lfhView.setUint32(22, size, true);      // uncompressed size
    lfhView.setUint16(26, nameBytes.length, true);
    lfhView.setUint16(28, 0, true);         // extra field length
    lfh.set(nameBytes, 30);
    localChunks.push(lfh, entry.bytes);

    // Central Directory File Header (46 bytes + name)
    const cdfh = new Uint8Array(46 + nameBytes.length);
    const cdfhView = new DataView(cdfh.buffer);
    cdfhView.setUint32(0, 0x02014b50, true); // signature
    cdfhView.setUint16(4, 20, true);          // version made by
    cdfhView.setUint16(6, 20, true);          // version needed
    cdfhView.setUint16(8, 0x0800, true);      // general purpose flag
    cdfhView.setUint16(10, 0, true);          // compression method
    cdfhView.setUint16(12, time, true);
    cdfhView.setUint16(14, date, true);
    cdfhView.setUint32(16, checksum, true);
    cdfhView.setUint32(20, size, true);       // compressed size
    cdfhView.setUint32(24, size, true);       // uncompressed size
    cdfhView.setUint16(28, nameBytes.length, true);
    cdfhView.setUint16(30, 0, true);          // extra field length
    cdfhView.setUint16(32, 0, true);          // file comment length
    cdfhView.setUint16(34, 0, true);          // disk number start
    cdfhView.setUint16(36, 0, true);          // internal file attributes
    cdfhView.setUint32(38, 0, true);          // external file attributes
    cdfhView.setUint32(42, localOffset, true); // relative offset of local file header
    cdfh.set(nameBytes, 46);
    centralChunks.push(cdfh);

    localOffset += lfh.byteLength + size;
  }

  const centralStart = localOffset;
  const centralSize = centralChunks.reduce((s, c) => s + c.byteLength, 0);

  // End of Central Directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);        // signature
  eocdView.setUint16(4, 0, true);                  // disk number
  eocdView.setUint16(6, 0, true);                  // disk with central dir
  eocdView.setUint16(8, entries.length, true);     // entries on this disk
  eocdView.setUint16(10, entries.length, true);    // total entries
  eocdView.setUint32(12, centralSize, true);       // central dir size
  eocdView.setUint32(16, centralStart, true);      // central dir offset
  eocdView.setUint16(20, 0, true);                 // comment length

  const totalSize = localOffset + centralSize + eocd.byteLength;
  const out = new Uint8Array(totalSize);
  let pos = 0;
  for (const chunk of localChunks) { out.set(chunk, pos); pos += chunk.byteLength; }
  for (const chunk of centralChunks) { out.set(chunk, pos); pos += chunk.byteLength; }
  out.set(eocd, pos);
  return out;
}
