"use server";

import {
  onboardingSetupSchema,
  type ActionResult,
  type OnboardingSetupInput,
} from "@rechnungsai/shared";
import { createServerClient } from "@/lib/supabase/server";
import { firstZodError } from "@/lib/zod-error";

function mapRpcError(error: { code?: string; message?: string }): string {
  if (error.code === "42501") {
    return "Bitte melde dich erneut an.";
  }
  if (error.code === "23514") {
    return "Ungültige Eingabe. Bitte überprüfe deine Daten.";
  }
  if (error.code === "P0001") {
    if (error.message?.includes("disclaimer_required")) {
      return "Bitte bestätige zuerst den Hinweis zur KI-Nutzung auf der vorherigen Seite.";
    }
    if (error.message?.includes("already_completed")) {
      return "Das Onboarding wurde bereits abgeschlossen.";
    }
  }
  return "Etwas ist schiefgelaufen. Bitte versuche es erneut.";
}

export async function completeOnboarding(
  input: OnboardingSetupInput,
): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = onboardingSetupSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) };
  }

  try {
    const supabase = await createServerClient();
    const { error } = await supabase.rpc("complete_onboarding", {
      p_disclaimer_accepted: parsed.data.disclaimer_accepted,
      p_company_name: parsed.data.company_name,
      p_skr_plan: parsed.data.skr_plan,
      p_steuerberater_name: parsed.data.steuerberater_name ?? "",
    });

    if (error) {
      console.error("[onboarding:complete]", error);
      return { success: false, error: mapRpcError(error) };
    }

    return {
      success: true,
      data: { redirectTo: "/onboarding/first-invoice" },
    };
  } catch (err) {
    console.error("[onboarding:complete]", err);
    return {
      success: false,
      error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    };
  }
}

export async function completeFirstInvoiceStep(
  nextPath: "/capture" | "/dashboard",
): Promise<ActionResult<{ redirectTo: string }>> {
  try {
    const supabase = await createServerClient();
    const { error } = await supabase.rpc("complete_first_invoice_step");

    if (error) {
      console.error("[onboarding:first-invoice]", error);
      return { success: false, error: mapRpcError(error) };
    }

    return { success: true, data: { redirectTo: nextPath } };
  } catch (err) {
    console.error("[onboarding:first-invoice]", err);
    return {
      success: false,
      error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    };
  }
}
