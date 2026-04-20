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

## Provider selection

Set `EXTRACTION_PROVIDER` in `.env.local` to choose the provider:

| `EXTRACTION_PROVIDER` | Use case | Model env var | Default model |
|---|---|---|---|
| `openai` (default) | Production | `OPENAI_EXTRACTION_MODEL` | `gpt-4o-mini` |
| `google` | Development (free tier) | `GOOGLE_EXTRACTION_MODEL` | `gemini-2.5-flash` |

For development with Gemini free tier:
```
EXTRACTION_PROVIDER=google
GOOGLE_GENERATIVE_AI_API_KEY=<your-free-tier-key>
```

For production with OpenAI (see ZDR section below):
```
EXTRACTION_PROVIDER=openai   # or omit — openai is the default
OPENAI_API_KEY=<zdr-enrolled-org-key>
```

Override the default model per provider with `OPENAI_EXTRACTION_MODEL` or
`GOOGLE_EXTRACTION_MODEL` (e.g., `gemini-2.0-flash-lite` for lower latency).

`getExtractionModel()` in `src/provider.ts` is the single swap point (NFR28).

## Tests

Tests mock `generateObject` from `ai` — we never hit live OpenAI from
the unit suite (cost + NFR13 leakage risk).
