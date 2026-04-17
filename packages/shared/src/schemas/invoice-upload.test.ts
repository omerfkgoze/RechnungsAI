import { describe, it, expect } from "vitest";
import {
  INVOICE_ACCEPTED_MIME,
  INVOICE_STATUSES,
  MAX_IMAGE_JPEG_BYTES,
  MAX_INVOICE_FILE_BYTES,
  invoiceUploadInputSchema,
} from "./invoice-upload.js";

describe("invoice-upload constants", () => {
  it("INVOICE_STATUSES preserves load-bearing order", () => {
    expect(INVOICE_STATUSES).toEqual([
      "captured",
      "processing",
      "ready",
      "review",
      "exported",
    ]);
  });

  it("INVOICE_ACCEPTED_MIME includes all five supported types", () => {
    expect(INVOICE_ACCEPTED_MIME).toEqual([
      "image/jpeg",
      "image/png",
      "application/pdf",
      "text/xml",
      "application/xml",
    ]);
  });

  it("exports byte limits", () => {
    expect(MAX_INVOICE_FILE_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_IMAGE_JPEG_BYTES).toBe(2 * 1024 * 1024);
  });
});

describe("invoiceUploadInputSchema — happy path", () => {
  it("accepts a JPEG under 10 MB", () => {
    const result = invoiceUploadInputSchema.safeParse({
      originalFilename: "rechnung.jpg",
      fileType: "image/jpeg",
      sizeBytes: 500_000,
    });
    expect(result.success).toBe(true);
  });

  it("trims surrounding whitespace in filename", () => {
    const result = invoiceUploadInputSchema.safeParse({
      originalFilename: "  rechnung.pdf  ",
      fileType: "application/pdf",
      sizeBytes: 1_000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.originalFilename).toBe("rechnung.pdf");
    }
  });
});

describe("invoiceUploadInputSchema — rejection paths", () => {
  it("rejects empty filename with German message", () => {
    const result = invoiceUploadInputSchema.safeParse({
      originalFilename: "   ",
      fileType: "image/jpeg",
      sizeBytes: 100,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Dateiname ist ungültig.");
    }
  });

  it("rejects filename longer than 255 chars", () => {
    const result = invoiceUploadInputSchema.safeParse({
      originalFilename: "a".repeat(256),
      fileType: "image/jpeg",
      sizeBytes: 100,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Dateiname ist ungültig.");
    }
  });

  it("rejects unsupported mime type", () => {
    const result = invoiceUploadInputSchema.safeParse({
      originalFilename: "malware.exe",
      fileType: "application/x-msdownload",
      sizeBytes: 100,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Dieser Dateityp wird nicht unterstützt. Erlaubt: JPEG, PNG, PDF, XML.",
      );
    }
  });

  it("rejects zero-byte files", () => {
    const result = invoiceUploadInputSchema.safeParse({
      originalFilename: "empty.pdf",
      fileType: "application/pdf",
      sizeBytes: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Die Datei ist zu groß (max. 10 MB).",
      );
    }
  });

  it("rejects files over 10 MB", () => {
    const result = invoiceUploadInputSchema.safeParse({
      originalFilename: "huge.pdf",
      fileType: "application/pdf",
      sizeBytes: MAX_INVOICE_FILE_BYTES + 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Die Datei ist zu groß (max. 10 MB).",
      );
    }
  });

  it("accepts files at exactly 10 MB", () => {
    const result = invoiceUploadInputSchema.safeParse({
      originalFilename: "max.pdf",
      fileType: "application/pdf",
      sizeBytes: MAX_INVOICE_FILE_BYTES,
    });
    expect(result.success).toBe(true);
  });
});
