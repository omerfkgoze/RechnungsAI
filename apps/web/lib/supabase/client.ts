import { createBrowserClient as createSSRBrowserClient } from "@supabase/ssr";
import type { Database } from "@rechnungsai/shared";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";

type BrowserClient = ReturnType<typeof createSSRBrowserClient<Database>>;

// Memoize the browser client — creating a fresh Supabase client per call
// allocates a new auth state machine and subscriber chain, which caused
// duplicate auth listeners and wasted memory in Client Components that
// re-render frequently. The anon key + URL are stable at runtime, so one
// singleton is correct.
let browserClient: BrowserClient | undefined;

export function createBrowserClient(): BrowserClient {
  if (browserClient) return browserClient;
  browserClient = createSSRBrowserClient<Database>(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
  );
  return browserClient;
}
