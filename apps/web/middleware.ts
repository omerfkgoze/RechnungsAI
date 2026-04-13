import { NextResponse, type NextRequest } from "next/server";
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
  return pathname === "/onboarding" || pathname.startsWith("/onboarding/");
}

export async function middleware(request: NextRequest) {
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

  // Authenticated gate: probe `onboarded_at` once per navigation. Single
  // scalar column lookup on the `users` PK, reusing the cookie-bound
  // supabase client returned by updateSession (no extra client).
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("onboarded_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    // DB probe failure is best-effort — don't lock users out on transient
    // errors. RLS still enforces data isolation on downstream queries.
    console.error("[middleware:onboarding-probe]", profileError);
    return response;
  }

  if (!profile) {
    // Signup trigger failed for this auth user — mirror the callback path.
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
