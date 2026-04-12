"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  loginSchema,
  resetRequestSchema,
  resetUpdateSchema,
  signupSchema,
  type ActionResult,
  type LoginInput,
  type ResetRequestInput,
  type ResetUpdateInput,
  type SignupInput,
} from "@rechnungsai/shared";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

function firstZodError(error: z.ZodError): string {
  return (
    error.issues[0]?.message ??
    "Die Eingaben sind ungültig. Bitte prüfe das Formular."
  );
}

function mapSupabaseError(code: string | undefined, fallback: string): string {
  switch (code) {
    case "invalid_credentials":
    case "invalid_grant":
      return "E-Mail oder Passwort ist falsch.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Zu viele Versuche. Bitte warte einen Moment und versuche es erneut.";
    case "weak_password":
      return "Passwort ist zu schwach.";
    case "user_already_exists":
    case "email_exists":
      return "Ein Konto mit dieser E-Mail existiert bereits.";
    case "email_not_confirmed":
      return "Bitte bestätige zuerst deine E-Mail.";
    default:
      return fallback;
  }
}

async function getSiteUrl(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function signUpWithPassword(
  input: SignupInput,
): Promise<ActionResult<{ needsEmailConfirmation: boolean }>> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) };
  }

  try {
    const supabase = await createServerClient();
    const siteUrl = await getSiteUrl();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { emailRedirectTo: `${siteUrl}/auth/callback` },
    });

    if (error) {
      console.error("[auth:signup]", error);
      return {
        success: false,
        error: mapSupabaseError(
          error.code,
          "Registrierung fehlgeschlagen. Bitte versuche es erneut.",
        ),
      };
    }

    const needsEmailConfirmation = !data.session;
    return { success: true, data: { needsEmailConfirmation } };
  } catch (err) {
    console.error("[auth:signup]", err);
    return {
      success: false,
      error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    };
  }
}

export async function signInWithPassword(
  input: LoginInput,
): Promise<ActionResult<{ ok: true }>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) };
  }

  try {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error) {
      console.error("[auth:login]", error);
      return {
        success: false,
        error: mapSupabaseError(
          error.code,
          "E-Mail oder Passwort ist falsch.",
        ),
      };
    }

    return { success: true, data: { ok: true } };
  } catch (err) {
    console.error("[auth:login]", err);
    return {
      success: false,
      error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    };
  }
}

export async function requestPasswordReset(
  input: ResetRequestInput,
): Promise<ActionResult<{ ok: true }>> {
  const parsed = resetRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) };
  }

  try {
    const supabase = await createServerClient();
    const siteUrl = await getSiteUrl();
    const { error } = await supabase.auth.resetPasswordForEmail(
      parsed.data.email,
      {
        redirectTo: `${siteUrl}/auth/callback?next=/reset-password/update`,
      },
    );

    if (error) {
      console.error("[auth:reset-request]", error);
    }
  } catch (err) {
    console.error("[auth:reset-request]", err);
  }

  return { success: true, data: { ok: true } };
}

export async function updatePasswordAfterRecovery(
  input: ResetUpdateInput,
): Promise<ActionResult<{ ok: true }>> {
  const parsed = resetUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) };
  }

  try {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });

    if (error) {
      console.error("[auth:reset-update]", error);
      return {
        success: false,
        error: mapSupabaseError(
          error.code,
          "Passwort konnte nicht aktualisiert werden. Bitte versuche es erneut.",
        ),
      };
    }

    return { success: true, data: { ok: true } };
  } catch (err) {
    console.error("[auth:reset-update]", err);
    return {
      success: false,
      error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    };
  }
}

export async function signOut(): Promise<void> {
  try {
    const supabase = await createServerClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch (err) {
    console.error("[auth:signout]", err);
  }
  redirect("/login");
}
