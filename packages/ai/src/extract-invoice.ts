import { APICallError, generateObject, type ModelMessage } from "ai";
import {
  invoiceSchema,
  type ActionResult,
  type Invoice,
  type InvoiceAcceptedMime,
} from "@rechnungsai/shared";
import { getExtractionModel } from "./provider.js";
import { EXTRACTION_SYSTEM_PROMPT } from "./prompts/extraction.js";

export interface ExtractInvoiceInput {
  fileUrl: string;
  mimeType: InvoiceAcceptedMime;
  originalFilename: string;
}

const XML_MIMES: ReadonlyArray<InvoiceAcceptedMime> = [
  "text/xml",
  "application/xml",
];

function mapApiError(status: number | undefined): string {
  if (status === 401)
    return "Authentifizierung am KI-Provider fehlgeschlagen.";
  if (status === 429)
    return "KI-Provider überlastet. Bitte in einer Minute erneut versuchen.";
  if (status !== undefined && status >= 500)
    return "KI-Provider nicht erreichbar.";
  return "Extraktion fehlgeschlagen. Bitte erneut versuchen.";
}

function isZodLikeError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: string }).name;
  if (name === "ZodError") return true;
  const issues = (err as { issues?: unknown }).issues;
  return Array.isArray(issues);
}

function logAiError(err: unknown, extra?: Record<string, unknown>) {
  // Pure package — no Sentry dep. The Server Action caller captures the
  // returned ActionResult error into Sentry with tags { module, action }.
  console.error("[ai:extract] error", {
    message: err instanceof Error ? err.message : String(err),
    ...extra,
  });
}

export async function extractInvoice(
  input: ExtractInvoiceInput,
): Promise<ActionResult<Invoice>> {
  const { fileUrl, mimeType, originalFilename } = input;
  const start = Date.now();
  console.info("[ai:extract] start", {
    mimeType,
    filenameBytes: originalFilename.length,
  });

  let bytes: Uint8Array;
  try {
    const res = await fetch(fileUrl);
    if (!res.ok) {
      console.warn("[ai:extract] fetch-failed", { status: res.status });
      return { success: false, error: "Rechnung konnte nicht geladen werden." };
    }
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    logAiError(err);
    return { success: false, error: "Rechnung konnte nicht geladen werden." };
  }

  const isXml = (XML_MIMES as readonly string[]).includes(mimeType);

  const messages: ModelMessage[] = [
    {
      role: "user",
      content: isXml
        ? [
            {
              type: "text",
              text: new TextDecoder("utf-8").decode(bytes),
            },
          ]
        : [
            {
              type: "file",
              data: bytes,
              mediaType: mimeType,
              filename: originalFilename,
            },
          ],
    },
  ];

  let object: unknown;
  try {
    const result = await (
      generateObject as unknown as (args: {
        model: ReturnType<typeof getExtractionModel>;
        schema: unknown;
        system: string;
        messages: ModelMessage[];
        temperature: number;
        maxRetries: number;
        providerOptions: Record<string, Record<string, unknown>>;
      }) => Promise<{ object: unknown }>
    )({
      model: getExtractionModel(),
      schema: invoiceSchema,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages,
      temperature: 0,
      maxRetries: 1,
      providerOptions: { openai: { store: false } },
    });
    object = result.object;
  } catch (err) {
    if (err instanceof APICallError) {
      const msg = mapApiError(err.statusCode);
      logAiError(err, { status: err.statusCode });
      return { success: false, error: msg };
    }
    if (isZodLikeError(err)) {
      logAiError(err);
      return {
        success: false,
        error: "Rechnungsformat konnte nicht erkannt werden.",
      };
    }
    logAiError(err);
    return {
      success: false,
      error: "Extraktion fehlgeschlagen. Bitte erneut versuchen.",
    };
  }

  const parsed = (
    invoiceSchema as unknown as {
      safeParse: (x: unknown) =>
        | { success: true; data: Invoice }
        | { success: false; error: unknown };
    }
  ).safeParse(object);
  if (!parsed.success) {
    logAiError(parsed.error);
    return {
      success: false,
      error: "Rechnungsformat konnte nicht erkannt werden.",
    };
  }

  console.info("[ai:extract] done", { ms: Date.now() - start });
  return { success: true, data: parsed.data };
}
