import { afterEach, describe, expect, it, vi } from "vitest";
import { APICallError } from "ai";

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return { ...actual, generateObject: vi.fn() };
});

vi.mock("./provider.js", () => ({
  getExtractionModel: () => ({ modelId: "mock-model" }),
}));

const { generateObject } = await import("ai");
const mockedGenerateObject = vi.mocked(generateObject);

import { categorizeInvoice } from "./categorize-invoice.js";

afterEach(() => {
  vi.clearAllMocks();
});

const defaultInput = {
  supplierName: "ACME GmbH",
  lineItemDescriptions: ["Bürobedarf", "Papier"],
  vatRate: 0.19,
  skrPlan: "skr03" as const,
};

describe("categorizeInvoice", () => {
  it("happy path returns skrCode, confidence, and buSchluessel", async () => {
    mockedGenerateObject.mockResolvedValueOnce({
      object: { skrCode: "4230", confidence: 0.92, buSchluessel: null },
    } as unknown as Awaited<ReturnType<typeof generateObject>>);

    const result = await categorizeInvoice(defaultInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skrCode).toBe("4230");
      expect(result.data.confidence).toBe(0.92);
      expect(result.data.buSchluessel).toBeNull();
    }
  });

  it("API error returns ActionResult error", async () => {
    const err = new APICallError({
      message: "rate limited",
      url: "x",
      requestBodyValues: {},
      statusCode: 429,
    });
    mockedGenerateObject.mockRejectedValueOnce(err);

    const result = await categorizeInvoice(defaultInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("fehlgeschlagen");
    }
  });

  it("Zod parse error handled gracefully returns error", async () => {
    mockedGenerateObject.mockResolvedValueOnce({
      object: { skrCode: 1234, confidence: "not-a-number", buSchluessel: "bad" },
    } as unknown as Awaited<ReturnType<typeof generateObject>>);

    const result = await categorizeInvoice(defaultInput);
    expect(result.success).toBe(false);
  });

  it("skrCode constrained to SKR03 set when skrPlan is skr03 — unknown code falls back", async () => {
    mockedGenerateObject.mockResolvedValueOnce({
      object: { skrCode: "9999", confidence: 0.8, buSchluessel: null },
    } as unknown as Awaited<ReturnType<typeof generateObject>>);

    const result = await categorizeInvoice({ ...defaultInput, skrPlan: "skr03" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skrCode).not.toBe("9999");
      expect(result.data.confidence).toBe(0.1);
    }
  });

  it("returns buSchluessel 44 when AI detects reverse charge", async () => {
    mockedGenerateObject.mockResolvedValueOnce({
      object: { skrCode: "3500", confidence: 0.85, buSchluessel: 44 },
    } as unknown as Awaited<ReturnType<typeof generateObject>>);

    const result = await categorizeInvoice({ ...defaultInput, supplierName: "EU Supplier Ltd" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.buSchluessel).toBe(44);
    }
  });
});
