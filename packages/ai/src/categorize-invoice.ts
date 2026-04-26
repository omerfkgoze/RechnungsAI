import { APICallError, generateObject } from "ai";
import { SKR03_CODES, SKR04_CODES, categorizationOutputSchema, type ActionResult } from "@rechnungsai/shared";
import { getExtractionModel } from "./provider.js";
import { buildCategorizationPrompt } from "./prompts/categorization.js";

const LOG = "[ai:categorize]";

export interface CategorizeInvoiceInput {
  supplierName: string | null;
  lineItemDescriptions: string[];
  vatRate: number | null;
  skrPlan: "skr03" | "skr04";
}

export interface CategorizeInvoiceOutput {
  skrCode: string;
  confidence: number;
  buSchluessel: number | null;
}

function isZodLikeError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: string }).name;
  if (name === "ZodError") return true;
  const issues = (err as { issues?: unknown }).issues;
  return Array.isArray(issues);
}

export async function categorizeInvoice(
  input: CategorizeInvoiceInput,
): Promise<ActionResult<CategorizeInvoiceOutput>> {
  const { supplierName, lineItemDescriptions, vatRate, skrPlan } = input;
  console.info(LOG, "start", { skrPlan, supplierName });

  const allowedCodes = skrPlan === "skr03" ? SKR03_CODES : SKR04_CODES;

  const userMessage = [
    supplierName ? `Lieferant: ${supplierName}` : "Lieferant: unbekannt",
    lineItemDescriptions.length > 0
      ? `Positionen:\n${lineItemDescriptions.slice(0, 3).map((d) => `- ${d}`).join("\n")}`
      : "Positionen: keine Angabe",
    vatRate !== null ? `USt-Satz: ${(vatRate * 100).toFixed(0)}%` : "USt-Satz: unbekannt",
  ].join("\n");

  let object: unknown;
  try {
    const result = await generateObject({
      model: getExtractionModel(),
      schema: categorizationOutputSchema,
      system: buildCategorizationPrompt(skrPlan),
      prompt: userMessage,
      temperature: 0,
      maxRetries: 1,
    });
    object = result.object;
  } catch (err) {
    if (err instanceof APICallError) {
      console.error(LOG, "api-error", { status: err.statusCode });
      return { success: false, error: "Kategorisierung fehlgeschlagen. Bitte erneut versuchen." };
    }
    if (isZodLikeError(err)) {
      console.error(LOG, "zod-error", err);
      return { success: false, error: "Kategorisierungsergebnis konnte nicht verarbeitet werden." };
    }
    console.error(LOG, "unexpected-error", err);
    return { success: false, error: "Kategorisierung fehlgeschlagen. Bitte erneut versuchen." };
  }

  const parsed = categorizationOutputSchema.safeParse(object);
  if (!parsed.success) {
    console.error(LOG, "parse-error", parsed.error);
    return { success: false, error: "Kategorisierungsergebnis konnte nicht verarbeitet werden." };
  }

  const { skrCode, confidence, buSchluessel } = parsed.data;

  if (!Object.prototype.hasOwnProperty.call(allowedCodes, skrCode)) {
    const fallbackCode = Object.keys(allowedCodes)[0]!;
    console.warn(LOG, "unknown-code-fallback", { skrCode, fallbackCode });
    return {
      success: true,
      data: { skrCode: fallbackCode, confidence: 0.1, buSchluessel },
    };
  }

  console.info(LOG, "done", { skrCode, confidence });
  return { success: true, data: { skrCode, confidence, buSchluessel } };
}
