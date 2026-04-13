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

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
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

  return response;
}

// Explicit static-asset / infra allowlist. The previous `.*\..*` terminator
// silently disabled the middleware on any path containing a dot (e.g.
// `/kunden/mueller.de`), which would let a dotted tenant slug bypass auth.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts/|images/|assets/|api/webhooks/|robots.txt|sitemap.xml).*)",
  ],
};
