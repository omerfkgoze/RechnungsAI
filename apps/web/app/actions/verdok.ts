"use server";

import { createElement } from "react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { renderToBuffer } from "@react-pdf/renderer";
import {
  assembleVerdokData,
  computeVerdokConfigHash,
  type VerdokSoftwareInfo,
  type VerdokTenantInput,
} from "@rechnungsai/gobd";
import type { ActionResult } from "@rechnungsai/shared";
import { createServerClient } from "@/lib/supabase/server";
import { registerFonts } from "@/lib/pdf/fonts";
import { VerdokTemplate } from "@/lib/pdf/verdok-template";
import { logAuditEvent } from "@/app/actions/invoices/shared";

const LOG = "[verdok:generate]";

// Module-level — never inside the action body. Registering fonts in the
// request path races with renderToBuffer and yields garbled glyphs
// (spike P1, F-3). registerFonts() is idempotent.
registerFonts();

const APP_NAME = "RechnungsAI";
// apps/web package.json version. Passed in (not read from disk) so
// packages/gobd stays pure (Dev Notes / spike P1).
const APP_VERSION = "0.1.0";

/**
 * Mirrors packages/ai getExtractionModel() env resolution as a human-readable
 * label, without importing packages/ai (keeps the import graph clean — gobd
 * and this action never depend on the AI SDK).
 */
function resolveAiInfo(): { provider: string; model: string } {
  const env = process.env;
  const provider = env.EXTRACTION_PROVIDER ?? "openai";
  if (provider === "google") {
    return { provider: "Google", model: env.GOOGLE_EXTRACTION_MODEL ?? "gemini-2.5-flash" };
  }
  return { provider: "OpenAI", model: env.OPENAI_EXTRACTION_MODEL ?? "gpt-4o-mini" };
}

const INCOMPLETE_SETTINGS_MESSAGE =
  "Für die Verfahrensdokumentation werden deine Firmendaten und " +
  "DATEV-Einstellungen benötigt. Bitte vervollständige zuerst deine " +
  "Einstellungen.";

export type GenerateVerdokResult = ActionResult<{
  id: string;
  /** true → AC7 guard tripped; UI shows the settings-link message. */
  missingSettings?: boolean;
}>;

export async function generateVerdok(): Promise<GenerateVerdokResult> {
  let supabase: Awaited<ReturnType<typeof createServerClient>>;
  try {
    supabase = await createServerClient();
  } catch (err) {
    Sentry.captureException(err, { tags: { module: "verdok", action: "generate" } });
    return { success: false, error: "Interner Serverfehler." };
  }

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
    console.error(LOG, "user-lookup-failed", userError);
    redirect("/login?returnTo=/einstellungen");
  }
  const tenantId = userRow.tenant_id;

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select(
      "company_name, company_address, tax_id, skr_plan, datev_berater_nr, datev_mandanten_nr, datev_sachkontenlaenge, datev_fiscal_year_start, datev_default_kreditorenkonto, steuerberater_name",
    )
    .eq("id", tenantId)
    .single();
  if (tenantError || !tenant) {
    console.error(LOG, "tenant-lookup-failed", tenantError);
    Sentry.captureException(tenantError ?? new Error("tenant lookup failed"), {
      tags: { module: "verdok", action: "generate" },
    });
    return { success: false, error: "Interner Serverfehler." };
  }

  // AC7 / F-9 — render only when the mandatory GoBD fields are present.
  // Guard runs BEFORE assembly/render so no half-filled PDF is ever produced.
  const required = [
    tenant.company_name,
    tenant.company_address,
    tenant.tax_id,
    tenant.datev_berater_nr,
    tenant.datev_mandanten_nr,
  ];
  if (required.some((v) => !v || String(v).trim() === "")) {
    return { success: false, error: INCOMPLETE_SETTINGS_MESSAGE };
  }

  const hashInput: VerdokTenantInput = {
    company_name: tenant.company_name ?? null,
    company_address: tenant.company_address ?? null,
    tax_id: tenant.tax_id ?? null,
    skr_plan: tenant.skr_plan,
    datev_berater_nr: tenant.datev_berater_nr ?? null,
    datev_mandanten_nr: tenant.datev_mandanten_nr ?? null,
    datev_sachkontenlaenge: tenant.datev_sachkontenlaenge,
    datev_fiscal_year_start: tenant.datev_fiscal_year_start,
    datev_default_kreditorenkonto: tenant.datev_default_kreditorenkonto ?? null,
    steuerberater_name: tenant.steuerberater_name ?? null,
  };

  const ai = resolveAiInfo();
  const software: VerdokSoftwareInfo = {
    appName: APP_NAME,
    appVersion: APP_VERSION,
    aiProvider: ai.provider,
    aiModel: ai.model,
  };

  // Single ISO timestamp for storage path AND the DB generated_at column —
  // keeps the file name and the row in lockstep (D-1).
  const generatedAtIso = new Date().toISOString();
  const data = assembleVerdokData(hashInput, software, generatedAtIso);

  let pdf: Buffer;
  try {
    // createElement (not JSX) keeps this a .ts Server Action; the cast bridges
    // the generic element type to renderToBuffer's DocumentProps parameter.
    const element = createElement(VerdokTemplate, { data }) as Parameters<
      typeof renderToBuffer
    >[0];
    pdf = await renderToBuffer(element);
  } catch (err) {
    console.error(LOG, "render-failed", err);
    Sentry.captureException(err, { tags: { module: "verdok", action: "render" } });
    return { success: false, error: "Das PDF konnte nicht erstellt werden." };
  }

  const storagePath = `${tenantId}/verdok-${generatedAtIso}.pdf`;

  // F-5 — upload FIRST. If it fails we return early and never write the DB
  // row, so pdf_storage_path can never point at a non-existent object.
  const { error: uploadError } = await supabase.storage
    .from("verfahrensdokumentation")
    .upload(storagePath, pdf, { contentType: "application/pdf", upsert: false });
  if (uploadError) {
    console.error(LOG, "upload-failed", uploadError);
    Sentry.captureException(uploadError, {
      tags: { module: "verdok", action: "upload" },
    });
    return { success: false, error: "Das PDF konnte nicht gespeichert werden." };
  }

  const configHash = await computeVerdokConfigHash(hashInput);

  // UPSERT on tenant_id. D-1: generated_at is set EXPLICITLY on every
  // regeneration — without it the DB default only applies on first insert and
  // the timestamp goes stale on subsequent updates (Story 7.2 widget bug).
  const { data: row, error: upsertError } = await supabase
    .from("verfahrensdokumentation")
    .upsert(
      {
        tenant_id: tenantId,
        config_hash: configHash,
        pdf_storage_path: storagePath,
        generated_by: user.id,
        generated_at: generatedAtIso,
      },
      { onConflict: "tenant_id" },
    )
    .select("id")
    .single();
  if (upsertError || !row) {
    console.error(LOG, "upsert-failed", upsertError);
    Sentry.captureException(upsertError ?? new Error("verdok upsert failed"), {
      tags: { module: "verdok", action: "upsert" },
    });
    return { success: false, error: "Interner Serverfehler." };
  }

  await logAuditEvent(supabase, {
    tenantId,
    invoiceId: null,
    actorUserId: user.id,
    eventType: "verdok_generated",
    metadata: { config_hash: configHash },
  });

  revalidatePath("/einstellungen");
  return { success: true, data: { id: row.id } };
}
