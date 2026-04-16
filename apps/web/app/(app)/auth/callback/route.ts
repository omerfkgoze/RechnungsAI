import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// Reject protocol-relative (`//host`) and backslash-tricks (`/\host`) —
// these are parsed as absolute URLs by browsers and would let an attacker
// use the `next` param to redirect off-origin.
function isSafeInternalPath(path: string | null): path is string {
  if (!path) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//") || path.startsWith("/\\")) return false;
  return true;
}

// Retry helper: the handle_new_user trigger is synchronous in PostgreSQL, but
// PgBouncer in transaction mode can cause a brief read-after-write gap where a
// new connection doesn't yet see the just-committed row. Retry up to 3 times
// with linear backoff (150 / 300 / 450ms) before treating the missing row as a
// genuine trigger failure.
async function fetchProfileWithRetry(
  supabase: SupabaseClient,
  userId: string,
  maxAttempts = 3,
): Promise<{ onboarded_at: string | null } | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data } = await supabase
      .from("users")
      .select("onboarded_at")
      .eq("id", userId)
      .maybeSingle();
    if (data) return data;
    if (attempt < maxAttempts - 1) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, 150 * (attempt + 1)),
      );
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", origin));
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth:callback]", error);
    return NextResponse.redirect(new URL("/login?error=oauth_failed", origin));
  }

  if (isSafeInternalPath(nextParam)) {
    return NextResponse.redirect(new URL(nextParam, origin));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let destination = "/dashboard";
  if (user) {
    // `onboarded_at IS NULL` is the authoritative signal that the user has not
    // completed the Story-1.4 trust/onboarding flow. The earlier heuristic
    // (compare company_name to email local-part) broke once we switched the
    // signup trigger's default `company_name` to a generic placeholder.
    const profile = await fetchProfileWithRetry(supabase, user.id);

    if (!profile) {
      // No `public.users` row — the signup trigger failed (e.g., constraint
      // violation). Surface this distinctly rather than routing into the
      // onboarding flow, which would then fail under RLS with no row to read.
      console.error(
        "[auth:callback] missing users row for authenticated user",
        { userId: user.id },
      );
      return NextResponse.redirect(
        new URL("/login?error=account_setup_failed", origin),
      );
    }
    if (profile.onboarded_at === null) {
      destination = "/onboarding/trust";
    }
  }

  return NextResponse.redirect(new URL(destination, origin));
}
