import { z } from "zod";

export const PAGE_SIZE = 50;

// Validate as ISO date: correct format AND a real calendar date (e.g. rejects 2026-13-45).
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "invalid date" })
  .refine((s) => {
    const d = new Date(s + "T00:00:00Z");
    return !isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, { message: "invalid date" });

const amount = z.coerce.number().finite().min(0).max(1_000_000);

const fiscalYear4Digit = z.coerce.number().int().min(1900).max(9999);

export const archiveQuerySchema = z.object({
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  supplier: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().max(100))
    .optional(),
  minAmount: amount.optional(),
  maxAmount: amount.optional(),
  invoiceNumber: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().max(100))
    .optional(),
  fiscalYear: fiscalYear4Digit.optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export type ArchiveQueryBase = z.infer<typeof archiveQuerySchema>;
export type ArchiveQuery = ArchiveQueryBase & { page: number; pageSize: number };

type RawParams = Record<string, string | string[] | undefined>;

export function parseArchiveQuery(
  raw: RawParams | URLSearchParams | null | undefined,
): ArchiveQuery {
  if (!raw) return { page: 1, pageSize: PAGE_SIZE };

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

  const result: ArchiveQueryBase = {};
  const shape = archiveQuerySchema.shape;
  for (const key of Object.keys(flat) as (keyof typeof shape)[]) {
    const field = shape[key];
    if (!field) continue;
    const parsed = field.safeParse(flat[key]);
    if (parsed.success && parsed.data !== undefined && parsed.data !== "") {
      // @ts-expect-error — narrow per-key
      result[key] = parsed.data;
    }
  }

  // Cross-field sanity: contradictory ranges silently drop the upper bound.
  if (
    result.minAmount !== undefined &&
    result.maxAmount !== undefined &&
    result.minAmount > result.maxAmount
  ) {
    delete result.maxAmount;
  }
  if (result.dateFrom && result.dateTo && result.dateFrom > result.dateTo) {
    delete result.dateTo;
  }

  return { ...result, page: result.page ?? 1, pageSize: PAGE_SIZE };
}
