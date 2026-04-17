import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APICallError } from "ai";
import type { Invoice } from "@rechnungsai/shared";

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return { ...actual, generateObject: vi.fn() };
});

vi.mock("./provider.js", () => ({
  getExtractionModel: () => ({ modelId: "mock-model" }),
}));

const { generateObject } = await import("ai");
const mockedGenerateObject = vi.mocked(generateObject);

import { extractInvoice } from "./extract-invoice.js";

function field<T>(value: T, confidence: number, reason: string | null = null) {
  return { value, confidence, reason };
}

function mockInvoice(): Invoice {
  return {
    invoice_number: field("R-2024-001", 0.99),
    invoice_date: field("2024-03-15", 0.99),
    supplier_name: field("ACME GmbH", 0.99),
    supplier_address: field("Musterweg 1", 0.99),
    supplier_tax_id: field("DE123456789", 0.99),
    recipient_name: field("Muster AG", 0.99),
    recipient_address: field("Beispielstr. 2", 0.99),
    line_items: [],
    net_total: field(100, 0.99),
    vat_total: field(19, 0.99),
    gross_total: field(119, 0.99),
    currency: field("EUR", 0.99),
    payment_terms: field(null, 0.99),
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("extractInvoice", () => {
  it("returns success with parsed invoice on happy path", async () => {
    mockedGenerateObject.mockResolvedValueOnce({
      object: mockInvoice(),
    } as unknown as Awaited<ReturnType<typeof generateObject>>);

    const result = await extractInvoice({
      fileUrl: "https://signed.example/invoice.pdf",
      mimeType: "application/pdf",
      originalFilename: "invoice.pdf",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.supplier_name.value).toBe("ACME GmbH");
    }
  });

  it("maps 429 APICallError to German überlastet message", async () => {
    const err = new APICallError({
      message: "rate limited",
      url: "x",
      requestBodyValues: {},
      statusCode: 429,
    });
    mockedGenerateObject.mockRejectedValueOnce(err);

    const result = await extractInvoice({
      fileUrl: "https://signed.example/invoice.pdf",
      mimeType: "application/pdf",
      originalFilename: "x.pdf",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("überlastet");
  });

  it("maps 401 APICallError to Authentifizierung message", async () => {
    const err = new APICallError({
      message: "unauthorized",
      url: "x",
      requestBodyValues: {},
      statusCode: 401,
    });
    mockedGenerateObject.mockRejectedValueOnce(err);

    const result = await extractInvoice({
      fileUrl: "https://signed.example/invoice.pdf",
      mimeType: "application/pdf",
      originalFilename: "x.pdf",
    });

    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error).toContain("Authentifizierung");
  });

  it("maps schema-parse failure to Rechnungsformat message", async () => {
    mockedGenerateObject.mockResolvedValueOnce({
      object: { not: "valid" },
    } as unknown as Awaited<ReturnType<typeof generateObject>>);

    const result = await extractInvoice({
      fileUrl: "https://signed.example/invoice.pdf",
      mimeType: "application/pdf",
      originalFilename: "x.pdf",
    });

    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error).toBe(
        "Rechnungsformat konnte nicht erkannt werden.",
      );
  });

  it("returns Rechnung konnte nicht geladen werden when fetch non-ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        arrayBuffer: async () => new ArrayBuffer(0),
      }),
    );

    const result = await extractInvoice({
      fileUrl: "https://signed.example/invoice.pdf",
      mimeType: "application/pdf",
      originalFilename: "x.pdf",
    });

    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error).toBe("Rechnung konnte nicht geladen werden.");
  });
});
