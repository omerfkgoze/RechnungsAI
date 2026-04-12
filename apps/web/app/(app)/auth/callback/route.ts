import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

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

  if (nextParam && nextParam.startsWith("/")) {
    return NextResponse.redirect(new URL(nextParam, origin));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let destination = "/dashboard";
  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("tenant_id, tenants!inner(company_name)")
      .eq("id", user.id)
      .maybeSingle();

    const companyName = (
      profile as { tenants?: { company_name?: string } } | null
    )?.tenants?.company_name;
    const emailLocalPart = user.email?.split("@")[0];
    const isPlaceholder =
      !companyName || companyName === emailLocalPart;
    if (isPlaceholder) {
      destination = "/onboarding/trust";
    }
  }

  return NextResponse.redirect(new URL(destination, origin));
}
