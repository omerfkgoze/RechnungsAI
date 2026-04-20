import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

// NFR28: AI API provider abstraction layer must allow switching providers without user-facing changes.
// EXTRACTION_PROVIDER: "openai" (default, production) | "google" (free-tier Gemini, development)
// OPENAI_EXTRACTION_MODEL / GOOGLE_EXTRACTION_MODEL: override the default model per provider.
export function getExtractionModel(): LanguageModel {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  const provider = env?.EXTRACTION_PROVIDER ?? "openai";

  if (provider === "google") {
    const model = env?.GOOGLE_EXTRACTION_MODEL ?? "gemini-2.5-flash";
    return google(model);
  }

  const model = env?.OPENAI_EXTRACTION_MODEL ?? "gpt-4o-mini";
  return openai(model);
}
