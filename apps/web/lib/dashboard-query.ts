import { z } from "zod";

// Zod schema for dashboard URL query params. Unknown / malformed values are
// silently dropped so the dashboard always renders (graceful degradation per
// NFR21). Bounds match the filter UI: amount 0–1_000_000, supplier ≤100 chars.

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "invalid date" });

const amount = z.coerce
  .number()
  .finite()
  .min(0)
  .max(1_000_000);

const STATUS_VALUES = [
  "all",
  "captured",
  "processing",
  "ready",
  "review",
  "exported",
] as const;

const SORT_VALUES = [
  "confidence",
  "date_desc",
  "date_asc",
  "amount_desc",
  "amount_asc",
  "supplier_asc",
  "status",
] as const;

export const DEFAULT_SORT: (typeof SORT_VALUES)[number] = "confidence";

export const dashboardQuerySchema = z.object({
  status: z.enum(STATUS_VALUES).optional(),
  supplier: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().max(100))
    .optional(),
  minAmount: amount.optional(),
  maxAmount: amount.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sort: z.enum(SORT_VALUES).optional(),
  // `review` is not a pipeline stage (folds into "Bereit"). Accept it as an
  // alias at the URL layer and remap to `ready` so shared bookmarks don't
  // silently no-op.
  stage: z
    .enum(["captured", "processing", "ready", "review", "exported"])
    .transform((s) => (s === "review" ? ("ready" as const) : s))
    .optional(),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

type RawParams = Record<string, string | string[] | undefined>;

// Accept Next.js 16 searchParams (resolved awaited object) OR URLSearchParams
// (client hook). Coerces to a flat string map, discards array values, then
// runs the permissive zod parse. Anything invalid is dropped silently — the
// dashboard stays interactive even when a user hand-edits the URL.
export function parseDashboardQuery(
  raw: RawParams | URLSearchParams | null | undefined,
): DashboardQuery {
  if (!raw) return {};

  const flat: Record<string, string> = {};
  if (raw instanceof URLSearchParams) {
    raw.forEach((v, k) => {
      if (v !== "") flat[k] = v;
    });
  } else {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string" && v.length > 0) flat[k] = v;
      else if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string")
        flat[k] = v[0];
    }
  }

  // Per-field best-effort parse: a single bad field must not invalidate the rest.
  const result: DashboardQuery = {};
  const shape = dashboardQuerySchema.shape;
  for (const key of Object.keys(flat) as (keyof typeof shape)[]) {
    const field = shape[key];
    if (!field) continue;
    const parsed = field.safeParse(flat[key]);
    if (parsed.success && parsed.data !== undefined && parsed.data !== "") {
      // @ts-expect-error — narrow per-key.
      result[key] = parsed.data;
    }
  }

  // Cross-field sanity: contradictory ranges produce a silent empty list,
  // which looks like missing data. Drop the narrower bound so at least the
  // filter UI stays usable. (A UX error banner is a future enhancement.)
  if (
    result.minAmount !== undefined &&
    result.maxAmount !== undefined &&
    result.minAmount > result.maxAmount
  ) {
    delete result.maxAmount;
  }
  if (result.from && result.to && result.from > result.to) {
    delete result.to;
  }

  return result;
}
