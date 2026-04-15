"use server";

import {
  tenantSettingsSchema,
  type ActionResult,
  type TenantSettingsInput,
} from "@rechnungsai/shared";
import { revalidatePath } from "next/cache";
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
      return { success: false, error: "Bitte melde dich erneut an." };
    }

    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (userError || !userRow) {
      console.error("[settings:update]", userError);
      return { success: false, error: "Bitte melde dich erneut an." };
    }

    const { data: tenantRow, error: tenantError } = await supabase
      .from("tenants")
      .update({ ...parsed.data })
      .eq("id", userRow.tenant_id)
      .select("updated_at")
      .single();

    if (tenantError) {
      console.error("[settings:update]", tenantError);
      // TODO: @sentry/nextjs wiring — Epic 1 retrospective
      if (tenantError.code === "23514") {
        return {
          success: false,
          error: "Ungültige Eingabe. Bitte überprüfe deine Daten.",
        };
      }
      if (tenantError.code === "42501") {
        return { success: false, error: "Bitte melde dich erneut an." };
      }
      return {
        success: false,
        error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
      };
    }

    revalidatePath("/einstellungen");
    return { success: true, data: { updatedAt: tenantRow.updated_at } };
  } catch (err) {
    console.error("[settings:update]", err);
    // TODO: @sentry/nextjs wiring — Epic 1 retrospective
    return {
      success: false,
      error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    };
  }
}
