import { generateObject } from "ai";
import type { ActionResult } from "@rechnungsai/shared";
import { getExtractionModel } from "./provider.js";

// Placeholder — Story 2.2 will define this schema in @rechnungsai/shared
// and expand this function with the full invoice extraction logic.
export interface ExtractedInvoice {
  invoice_number: string | null;
  invoice_date: string | null;
  supplier_name: string | null;
}

const extractedInvoiceSchema = {
  // Story 2.2: replace with full Zod schema from @rechnungsai/shared
} as const;

export async function extractInvoice(
  _documentContent: string,
): Promise<ActionResult<ExtractedInvoice>> {
  // Story 2.2: implement full extraction with generateObject() + Zod schema + confidence scores.
  // Zero-retention endpoint required (NFR13): use provider options to disable training on user data.
  void generateObject; // referenced here to validate the import resolves correctly
  void getExtractionModel; // same
  void extractedInvoiceSchema;

  return {
    success: false,
    error: "[ai:extract] Not yet implemented — pending Story 2.2.",
  };
}
