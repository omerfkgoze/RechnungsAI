import stringify from "json-stringify-deterministic";

/**
 * The exactly-10 `tenants` columns that constitute the GoBD
 * Verfahrensdokumentation content (spike P2, Decision 1).
 *
 * `steuerberater_email` is deliberately excluded — it is contact info, not
 * GoBD document content (Epic 8.3 scope).
 *
 * Every nullable field is typed `string | null` (never `undefined`):
 * `JSON.stringify(undefined)` omits the key, which would cause a silent
 * hash drift. The type enforces the `?? null` invariant at compile time.
 */
export type VerdokHashInput = {
  company_name: string | null;
  company_address: string | null;
  tax_id: string | null;
  skr_plan: string;
  datev_berater_nr: string | null;
  datev_mandanten_nr: string | null;
  datev_sachkontenlaenge: number;
  datev_fiscal_year_start: number;
  datev_default_kreditorenkonto: string | null;
  steuerberater_name: string | null;
};

/**
 * Deterministic SHA-256 over the canonicalized JSON of exactly the 10 fields
 * in {@link VerdokHashInput}. Returns 64-char lowercase hex.
 *
 * Application-layer (not DB-side `pgcrypto`): `jsonb::text` in PostgreSQL has
 * non-deterministic key ordering. `json-stringify-deterministic` sorts keys
 * so reordered input objects yield an identical hash — consistent with the
 * `invoices.sha256` precedent computed here in `@rechnungsai/gobd`.
 *
 * Critical invariant: every nullable field is coerced via `?? null`. Drift
 * here silently breaks Story 7.2's "Aktualisierung verfügbar" detection.
 */
export async function computeVerdokConfigHash(
  input: VerdokHashInput,
): Promise<string> {
  const canonical = stringify({
    company_address: input.company_address ?? null,
    company_name: input.company_name ?? null,
    datev_berater_nr: input.datev_berater_nr ?? null,
    datev_default_kreditorenkonto: input.datev_default_kreditorenkonto ?? null,
    datev_fiscal_year_start: input.datev_fiscal_year_start,
    datev_mandanten_nr: input.datev_mandanten_nr ?? null,
    datev_sachkontenlaenge: input.datev_sachkontenlaenge,
    skr_plan: input.skr_plan,
    steuerberater_name: input.steuerberater_name ?? null,
    tax_id: input.tax_id ?? null,
  });
  const data = new TextEncoder().encode(canonical);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
