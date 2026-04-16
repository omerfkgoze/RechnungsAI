"use server";

import {
  tenantSettingsSchema,
  type ActionResult,
  type TenantSettingsInput,
} from "@rechnungsai/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { createServerClient } from "@/lib/supabase/server";
import { firstZodError } from "@/lib/zod-error";

export async function updateTenantSettings(
  input: TenantSettingsInput,
): Promise<ActionResult<{ updatedAt: string }>> {
  const parsed = tenantSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) };
  }

  try {
    const supabase = await createServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      redirect("/login?returnTo=/einstellungen");
    }

    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (userError || !userRow) {
      console.error("[settings:update]", userError);
      redirect("/login?returnTo=/einstellungen");
    }

    const { data: tenantRow, error: tenantError } = await supabase
      .from("tenants")
      .update({ ...parsed.data })
      .eq("id", userRow.tenant_id)
      .select("updated_at")
      .single();

    if (tenantError) {
      console.error("[settings:update]", tenantError);
      Sentry.captureException(tenantError, { tags: { action: "settings:update" } });
      if (tenantError.code === "23514") {
        return {
          success: false,
          error: "Ungültige Eingabe. Bitte überprüfe deine Daten.",
        };
      }
      if (tenantError.code === "42501") {
        redirect("/login?returnTo=/einstellungen");
      }
      return {
        success: false,
        error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
      };
    }

    revalidatePath("/einstellungen");
    return { success: true, data: { updatedAt: tenantRow.updated_at } };
  } catch (err) {
    // Re-throw Next.js redirect signals (they use a `digest` starting with "NEXT_REDIRECT").
    const digest =
      err && typeof err === "object" && "digest" in err
        ? (err as { digest?: unknown }).digest
        : undefined;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    console.error("[settings:update]", err);
    Sentry.captureException(err, { tags: { action: "settings:update" } });
    return {
      success: false,
      error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    };
  }
}
