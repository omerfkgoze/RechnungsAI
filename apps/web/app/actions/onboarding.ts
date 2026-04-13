"use server";

import {
  onboardingSetupSchema,
  type ActionResult,
  type OnboardingSetupInput,
} from "@rechnungsai/shared";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

function firstZodError(error: z.ZodError): string {
  return (
    error.issues[0]?.message ??
    "Ungültige Eingabe. Bitte überprüfe deine Daten."
  );
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
      p_company_name: parsed.data.company_name,
      p_skr_plan: parsed.data.skr_plan,
      p_steuerberater_name: parsed.data.steuerberater_name ?? "",
    });

    if (error) {
      console.error("[onboarding:complete]", error);
      // 42501 = insufficient_privilege → re-auth. 23514 = check_violation →
      // generic validation. Anything else → opaque German fallback.
      if (error.code === "42501") {
        return { success: false, error: "Bitte melde dich erneut an." };
      }
      if (error.code === "23514") {
        return {
          success: false,
          error: "Ungültige Eingabe. Bitte überprüfe deine Daten.",
        };
      }
      return {
        success: false,
        error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
      };
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
