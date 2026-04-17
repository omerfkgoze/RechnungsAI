# @rechnungsai/ai

Provider-agnostic AI layer for invoice extraction.

## Zero-Data-Retention (NFR13)

Production usage MUST run against an OpenAI organization enrolled in
[Zero Data Retention](https://platform.openai.com/docs/models/how-we-use-your-data).
The `OPENAI_API_KEY` configured for the deployed Server Action environment
MUST belong to such an organization. ZDR is enforced at the organization
level; it is not a per-request flag.

`extractInvoice` additionally passes `providerOptions.openai.store = false`
as a defensive layer so the OpenAI Chat-Completions endpoint does not
persist the completion on their side. This is belt-and-braces — it does
NOT substitute for ZDR enrollment.

## Default model

`src/provider.ts` defaults to `gpt-4o-mini` for broad project access and
lower cost. Override via the `OPENAI_EXTRACTION_MODEL` environment variable for
higher-fidelity needs (e.g., set `OPENAI_EXTRACTION_MODEL=gpt-4o` in `.env.local`
when processing low-resolution or handwritten invoices).

## Provider swap

`getExtractionModel()` in `src/provider.ts` is the single swap point.
Replace `openai("gpt-4o-mini")` with `anthropic("claude-...")` to change
providers without touching call sites (NFR28).

## Tests

Tests mock `generateObject` from `ai` — we never hit live OpenAI from
the unit suite (cost + NFR13 leakage risk).
