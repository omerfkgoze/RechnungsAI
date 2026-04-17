import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

// One-line provider swap: replace with anthropic('claude-...') to switch providers.
// NFR28: AI API provider abstraction layer must allow switching between Claude and OpenAI
// without user-facing changes.
// Model is env-configurable so ops can swap without a code change.
// Default: gpt-4o-mini — widest OpenAI project access, supports vision + PDF.
export function getExtractionModel(): LanguageModel {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  const model = env?.OPENAI_EXTRACTION_MODEL ?? "gpt-4o-mini";
  return openai(model);
}
