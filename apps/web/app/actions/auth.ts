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
    case "email_not_confirmed":
      return "Bitte bestätige zuerst deine E-Mail.";
    default:
      return fallback;
  }
}

async function getSiteUrl(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  // Vercel preview/build envs expose VERCEL_URL (host only, no scheme).
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;
  if (process.env.VERCEL_ENV === "production") {
    throw new Error(
      "[auth] NEXT_PUBLIC_SITE_URL must be set in production to prevent host-header injection on auth redirects.",
    );
  }
  // Dev-only fallback: trust the `host` header (not x-forwarded-*, which are attacker-controlled at the edge).
  const hdrs = await headers();
  const host = hdrs.get("host") ?? "127.0.0.1:3000";
  return `http://${host}`;
}

function decodeAmr(accessToken: string): Array<{ method?: string }> | null {
  try {
    const payloadSegment = accessToken.split(".")[1];
    if (!payloadSegment) return null;
    // base64url → base64 + restore "=" padding so Buffer decoder doesn't
    // silently truncate trailing bytes on payloads whose length isn't %4 == 0.
    const swapped = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = swapped + "=".repeat((4 - (swapped.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(json) as { amr?: Array<{ method?: string }> };
    return parsed.amr ?? null;
  } catch {
    return null;
  }
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
      // Enumeration protection: treat "email already exists" as a generic
      // "check your inbox" path so attackers cannot probe which emails are registered.
      if (error.code === "user_already_exists" || error.code === "email_exists") {
        // Always claim "we sent a confirmation" regardless of project config.
        // With email confirmations off in Supabase, real new signups will
        // include `data.session !== null` and short-circuit below; this
        // duplicate-email path never reaches that check, so we deliberately
        // return `needsEmailConfirmation: true` to keep the response shape
        // identical to a fresh signup-needs-confirmation case (enumeration
        // protection — attackers cannot tell registered vs unregistered).
        return { success: true, data: { needsEmailConfirmation: true } };
      }
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
      // Enumeration protection: UI response stays generic, but we log at error
      // severity so rate-limit / config failures are visible in observability
      // (Sentry wiring lands with the telemetry story; prefix kept stable).
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

    // Gate the update on a recovery-grade session — a normal authenticated
    // session must NOT be allowed to change the password via this action.
    // Use getUser() (server-verified) rather than getSession() (cookie-only) so
    // we never trust unverified JWT claims on the SSR side.
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return {
        success: false,
        error:
          "Der Link ist abgelaufen. Bitte fordere einen neuen Reset-Link an.",
      };
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      return {
        success: false,
        error:
          "Der Link ist abgelaufen. Bitte fordere einen neuen Reset-Link an.",
      };
    }
    const amr = decodeAmr(session.access_token);
    const isRecoverySession =
      amr?.some((entry) => entry.method === "recovery") ?? false;
    if (!isRecoverySession) {
      console.error(
        "[auth:reset-update] non-recovery session attempted password update",
      );
      return {
        success: false,
        error:
          "Dieser Link ist nicht mehr gültig. Bitte fordere einen neuen Reset-Link an.",
      };
    }

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

/**
 * Sign the user out on THIS device only (`scope: "local"`) and redirect to /login.
 *
 * Decision D2 (review 2026-04-13): we intentionally keep `scope: "local"` rather
 * than `"global"`. Global sign-out revokes every refresh token across all of the
 * user's devices, which is disruptive when the common case is "I'm stepping away
 * from this laptop." Users who need a global wipe will get that from the
 * Settings / Security screen in Story 1.5.
 *
 * On failure, returns `ActionResult<void>` so the caller can surface an error;
 * on success, redirect() throws a `NEXT_REDIRECT` signal and never returns.
 */
export async function signOut(): Promise<ActionResult<void>> {
  try {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      console.error("[auth:signout]", error);
      return {
        success: false,
        error: "Abmelden fehlgeschlagen. Bitte versuche es erneut.",
      };
    }
  } catch (err) {
    console.error("[auth:signout]", err);
    return {
      success: false,
      error: "Abmelden fehlgeschlagen. Bitte versuche es erneut.",
    };
  }
  redirect("/login");
}
