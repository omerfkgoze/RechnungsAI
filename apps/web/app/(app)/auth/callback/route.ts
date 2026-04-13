import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// Reject protocol-relative (`//host`) and backslash-tricks (`/\host`) —
// these are parsed as absolute URLs by browsers and would let an attacker
// use the `next` param to redirect off-origin.
function isSafeInternalPath(path: string | null): path is string {
  if (!path) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//") || path.startsWith("/\\")) return false;
  return true;
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
    const { data: profile } = await supabase
      .from("users")
      .select("onboarded_at")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.onboarded_at === null) {
      destination = "/onboarding/trust";
    }
  }

  return NextResponse.redirect(new URL(destination, origin));
}
