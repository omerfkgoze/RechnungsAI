import { createServerClient as createSSRClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@rechnungsai/shared";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";

export async function createServerClient() {
  const cookieStore = await cookies();

  return createSSRClient<Database>(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component; middleware refreshes the session.
          }
        },
      },
    },
  );
}
