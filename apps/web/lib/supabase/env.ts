import { z } from "zod";

// Validate Supabase env vars once at module boot so missing/typo'd config
// fails loud at startup instead of as cryptic `TypeError: Cannot read
// properties of undefined` deep inside the Supabase SDK.
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string({ error: "NEXT_PUBLIC_SUPABASE_URL is required" })
    .url({ message: "NEXT_PUBLIC_SUPABASE_URL must be a valid URL" }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string({ error: "NEXT_PUBLIC_SUPABASE_ANON_KEY is required" })
    .min(1, { message: "NEXT_PUBLIC_SUPABASE_ANON_KEY is required" }),
});

const parsed = schema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
  throw new Error(`[supabase env] invalid configuration — ${issues}`);
}

export const SUPABASE_URL = parsed.data.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY = parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY;
