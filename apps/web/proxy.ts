import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { updateSession } from "@/lib/supabase/middleware";

const AUTH_ROUTES = ["/login", "/signup", "/reset-password"];
const PUBLIC_EXACT = new Set(["/", "/auth/callback"]);

function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function isPublic(pathname: string) {
  // Exact match only — `startsWith("/auth/callback")` would falsely match
  // `/auth/callbackfoo` and bypass auth.
  return PUBLIC_EXACT.has(pathname);
}

function isOnboardingRoute(pathname: string) {
  return pathname.startsWith("/onboarding/");
}

// Same PgBouncer read-after-write retry as in auth/callback/route.ts.
// Middleware fires on the first request after signup before the trigger's row
// is visible on a fresh pooled connection. Two attempts (one retry after 150ms)
// cover the typical pooler lag without adding perceptible latency on normal requests.
async function fetchProfileWithRetry(
  supabase: SupabaseClient,
  userId: string,
  maxAttempts = 2,
): Promise<{ onboarded_at: string | null } | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await supabase
      .from("users")
      .select("onboarded_at")
      .eq("id", userId)
      .maybeSingle();
    if (error) return null;
    if (data) return data;
    if (attempt < maxAttempts - 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 150));
    }
  }
  return null;
}

export async function proxy(request: NextRequest) {
  const { response, user, supabase } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (isPublic(pathname)) {
    return response;
  }

  if (isAuthRoute(pathname)) {
    if (user) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return response;
  }

  if (!user) {
    const next = encodeURIComponent(pathname + search);
    return NextResponse.redirect(
      new URL(`/login?next=${next}`, request.url),
    );
  }

  // Normalize bare `/onboarding` to the trust-screen entry point so it doesn't
  // 404 for non-onboarded users who typed the URL directly.
  if (pathname === "/onboarding") {
    return NextResponse.redirect(
      new URL("/onboarding/trust", request.url),
    );
  }

  // Authenticated gate: probe `onboarded_at` once per navigation. Single
  // scalar column lookup on the `users` PK, reusing the cookie-bound
  // supabase client returned by updateSession (no extra client).
  const profile = await fetchProfileWithRetry(supabase, user.id);

  if (!profile) {
    // Row missing after retries: either a genuine trigger failure or a
    // persistent DB error. Fail closed — redirect to a safe recovery path.
    // The retry covers the PgBouncer read-after-write race window so this
    // branch is only reached for real failures, not transient pool lag.
    console.error("[proxy:onboarding-probe] missing users row", {
      userId: user.id,
    });
    return NextResponse.redirect(
      new URL("/login?error=account_setup_failed", request.url),
    );
  }

  if (profile.onboarded_at === null && !isOnboardingRoute(pathname)) {
    return NextResponse.redirect(
      new URL("/onboarding/trust", request.url),
    );
  }

  if (profile.onboarded_at !== null && isOnboardingRoute(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

// Explicit static-asset / infra allowlist. The previous `.*\..*` terminator
// silently disabled the middleware on any path containing a dot (e.g.
// `/kunden/mueller.de`), which would let a dotted tenant slug bypass auth.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts/|images/|assets/|api/webhooks/|\\.well-known/|robots.txt|sitemap.xml|manifest.webmanifest|apple-touch-icon.*\\.png|sw\\.js|og-image\\.png).*)",
  ],
};
