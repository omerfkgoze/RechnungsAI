import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

// One-line provider swap: replace with anthropic('claude-...') to switch providers.
// NFR28: AI API provider abstraction layer must allow switching between Claude and OpenAI
// without user-facing changes.
export function getExtractionModel(): LanguageModel {
  return openai("gpt-4o");
}
