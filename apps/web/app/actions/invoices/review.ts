"use server";

import {
  CORRECTABLE_FIELD_PATHS,
  mapBuSchluessel,
  SKR03_CODES,
  SKR04_CODES,
  type ActionResult,
} from "@rechnungsai/shared";
import { categorizeInvoice as aiCategorizeInvoice } from "@rechnungsai/ai";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { createServerClient } from "@/lib/supabase/server";
import { firstZodError } from "@/lib/zod-error";
import { logAuditEvent, invoiceIdSchema } from "./shared";
import { z } from "zod";

const CORRECT_LOG = "[invoices:correct_field]";
const SIGN_URL_LOG = "[invoices:sign_url]";
const CATEGORIZE_LOG = "[invoices:categorize]";
const UPDATE_SKR_LOG = "[invoices:update_skr]";

const skrCodeSchema = z.string().min(1).max(10);

export async function correctInvoiceField(input: {
  invoiceId: string;
  fieldPath: string;
  newValue: string | number | null;
  priorUpdatedAt: string;
  isRestoreToAi?: boolean;
  aiConfidence?: number;
}): Promise<ActionResult<{ newConfidence: number }>> {
  const { invoiceId, fieldPath, newValue, priorUpdatedAt, isRestoreToAi, aiConfidence } = input;

  const idParse = invoiceIdSchema.safeParse(invoiceId);
  if (!idParse.success) {
    return { success: false, error: firstZodError(idParse.error) };
  }

  if (!(CORRECTABLE_FIELD_PATHS as readonly string[]).includes(fieldPath)) {
    return { success: false, error: "Ungültiges Feld." };
  }

  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      redirect(`/login?returnTo=/rechnungen/${invoiceId}`);
    }

    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();
    if (userError || !userRow) {
      console.error(CORRECT_LOG, "user-lookup-failed", userError);
      redirect(`/login?returnTo=/rechnungen/${invoiceId}`);
    }
    const tenantId = userRow.tenant_id;

    const { data: row, error: rowErr } = await supabase
      .from("invoices")
      .select("id, tenant_id, status, invoice_data, updated_at")
      .eq("id", invoiceId)
      .eq("tenant_id", tenantId)
      .single();

    if (rowErr && rowErr.code !== "PGRST116") {
      console.error(CORRECT_LOG, "select-failed", rowErr);
      Sentry.captureException(rowErr, {
        tags: { module: "invoices", action: "correct_field" },
        extra: { invoiceId },
      });
      return { success: false, error: "Rechnung kann momentan nicht geladen werden." };
    }
    if (!row || row.tenant_id !== tenantId) {
      return { success: false, error: "Rechnung nicht gefunden." };
    }

    if (row.status === "exported") {
      return {
        success: false,
        error: "Exportierte Rechnungen können nicht mehr bearbeitet werden.",
      };
    }

    if (row.updated_at !== priorUpdatedAt) {
      return {
        success: false,
        error: "Rechnung wurde zwischenzeitlich geändert. Bitte Seite neu laden.",
      };
    }

    const invoiceData = row.invoice_data as Record<string, unknown> | null;
    if (!invoiceData) {
      return { success: false, error: "Keine Extraktionsdaten vorhanden." };
    }

    // Deep-clone and apply the correction at the given path.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated: any = structuredClone(invoiceData);
    const newConfidence = isRestoreToAi ? (aiConfidence ?? 1.0) : 1.0;
    const reason = isRestoreToAi ? "Nutzer hat AI-Wert wiederhergestellt" : "Vom Nutzer korrigiert";

    const pathParts = fieldPath.split(".");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cursor: any = updated;
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i]!;
      if (part === "line_items" && i + 1 < pathParts.length) {
        const idx = Number(pathParts[i + 1]);
        if (!Number.isNaN(idx) && Array.isArray(cursor.line_items)) {
          cursor = cursor.line_items[idx];
          i++; // skip index part
        } else {
          return { success: false, error: "Ungültiges Feld." };
        }
      } else {
        cursor = cursor[part];
        if (cursor === null || cursor === undefined) {
          console.error(CORRECT_LOG, "path-traversal-null", { fieldPath, part });
          return { success: false, error: "Ungültiges Feld." };
        }
      }
    }
    const lastKey = pathParts[pathParts.length - 1]!;
    const previousValue = cursor[lastKey] ? structuredClone(cursor[lastKey]) : null;
    cursor[lastKey] = { value: newValue, confidence: newConfidence, reason };

    // Optimistic concurrency: only update if updated_at hasn't changed.
    const { data: updateData, error: updateErr } = await supabase
      .from("invoices")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ invoice_data: updated as any, updated_at: new Date().toISOString() })
      .eq("id", invoiceId)
      .eq("updated_at", priorUpdatedAt)
      .select("id")
      .maybeSingle();

    if (updateErr) {
      console.error(CORRECT_LOG, "update-failed", updateErr);
      Sentry.captureException(updateErr, {
        tags: { module: "invoices", action: "correct_field" },
        extra: { invoiceId },
      });
      return { success: false, error: "Rechnung kann momentan nicht gespeichert werden." };
    }
    if (!updateData) {
      return {
        success: false,
        error: "Rechnung wurde zwischenzeitlich geändert. Bitte Seite neu laden.",
      };
    }

    // Insert audit row — failure here is non-fatal (user's correction already landed).
    const supplierName = (invoiceData as Record<string, { value?: string | null }>).supplier_name?.value ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const correctedValue: any = cursor[lastKey];
    const { error: auditErr } = await supabase.from("invoice_field_corrections").insert({
      tenant_id: tenantId,
      invoice_id: invoiceId,
      supplier_name: supplierName,
      field_path: fieldPath,
      previous_value: previousValue,
      corrected_value: correctedValue,
      corrected_to_ai: isRestoreToAi ?? false,
    });
    if (auditErr) {
      console.error(CORRECT_LOG, "audit-insert-failed", auditErr);
      Sentry.captureException(auditErr, {
        tags: { module: "invoices", action: "correct_field" },
        extra: { invoiceId, fieldPath },
      });
    }

    await logAuditEvent(supabase, {
      tenantId,
      invoiceId,
      actorUserId: user.id,
      eventType: "field_edit",
      fieldName: fieldPath,
      oldValue: previousValue !== null ? JSON.stringify(previousValue) : null,
      newValue: JSON.stringify(correctedValue),
      metadata: {
        corrected_to_ai: isRestoreToAi ?? false,
        supplier_name: supplierName,
        confidence_at_edit: newConfidence,
      },
    });

    revalidatePath("/dashboard");
    revalidatePath(`/rechnungen/${invoiceId}`);
    return { success: true, data: { newConfidence } };
  } catch (err) {
    const digest =
      err && typeof err === "object" && "digest" in err
        ? (err as { digest?: unknown }).digest
        : undefined;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    console.error(CORRECT_LOG, err);
    Sentry.captureException(err, {
      tags: { module: "invoices", action: "correct_field" },
      extra: { invoiceId },
    });
    return { success: false, error: "Unerwarteter Fehler. Bitte erneut versuchen." };
  }
}

export async function getInvoiceSignedUrl(
  invoiceId: string,
): Promise<ActionResult<{ url: string; fileType: string; sha256: string | null }>> {
  const idParse = invoiceIdSchema.safeParse(invoiceId);
  if (!idParse.success) {
    return { success: false, error: firstZodError(idParse.error) };
  }

  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      redirect(`/login?returnTo=/rechnungen/${invoiceId}`);
    }

    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();
    if (userError || !userRow) {
      console.error(SIGN_URL_LOG, "user-lookup-failed", userError);
      redirect(`/login?returnTo=/rechnungen/${invoiceId}`);
    }
    const tenantId = userRow.tenant_id;

    const { data: row, error: rowErr } = await supabase
      .from("invoices")
      .select("id, tenant_id, file_path, file_type, sha256")
      .eq("id", invoiceId)
      .eq("tenant_id", tenantId)
      .single();

    if (rowErr && rowErr.code !== "PGRST116") {
      console.error(SIGN_URL_LOG, "select-failed", rowErr);
      Sentry.captureException(rowErr, {
        tags: { module: "invoices", action: "sign_url" },
        extra: { invoiceId },
      });
      return { success: false, error: "Rechnung kann momentan nicht geladen werden." };
    }
    if (!row || row.tenant_id !== tenantId) {
      return { success: false, error: "Rechnung nicht gefunden." };
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from("invoices")
      .createSignedUrl(row.file_path, 60);

    if (signErr || !signed?.signedUrl) {
      console.error(SIGN_URL_LOG, "sign-failed", signErr);
      Sentry.captureException(signErr ?? new Error("sign-url-failed"), {
        tags: { module: "invoices", action: "sign_url" },
        extra: { invoiceId },
      });
      return { success: false, error: "Dokument-URL konnte nicht erzeugt werden." };
    }

    return { success: true, data: { url: signed.signedUrl, fileType: row.file_type, sha256: row.sha256 ?? null } };
  } catch (err) {
    const digest =
      err && typeof err === "object" && "digest" in err
        ? (err as { digest?: unknown }).digest
        : undefined;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    console.error(SIGN_URL_LOG, err);
    Sentry.captureException(err, {
      tags: { module: "invoices", action: "sign_url" },
      extra: { invoiceId },
    });
    return { success: false, error: "Unerwarteter Fehler. Bitte erneut versuchen." };
  }
}

export async function categorizeInvoice(
  invoiceId: string,
): Promise<ActionResult<{ skrCode: string; confidence: number; buSchluessel: number | null }>> {
  const idParse = invoiceIdSchema.safeParse(invoiceId);
  if (!idParse.success) {
    return { success: false, error: firstZodError(idParse.error) };
  }

  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      redirect(`/login?returnTo=/rechnungen/${invoiceId}`);
    }

    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();
    if (userError || !userRow) {
      console.error(CATEGORIZE_LOG, "user-lookup-failed", userError);
      redirect(`/login?returnTo=/rechnungen/${invoiceId}`);
    }
    const tenantId = userRow.tenant_id;

    const { data: row, error: rowErr } = await supabase
      .from("invoices")
      .select("id, tenant_id, status, invoice_data, skr_code")
      .eq("id", invoiceId)
      .eq("tenant_id", tenantId)
      .single();

    if (rowErr && rowErr.code !== "PGRST116") {
      console.error(CATEGORIZE_LOG, "select-failed", rowErr);
      Sentry.captureException(rowErr, {
        tags: { module: "invoices", action: "categorize" },
        extra: { invoiceId },
      });
      return { success: false, error: "Rechnung kann momentan nicht geladen werden." };
    }
    if (!row || row.tenant_id !== tenantId) {
      return { success: false, error: "Rechnung nicht gefunden." };
    }

    const validStatuses = ["ready", "review"] as const;
    if (!(validStatuses as readonly string[]).includes(row.status)) {
      return { success: false, error: "Kategorisierung ist erst nach der Extraktion möglich." };
    }

    // Idempotency: skip categorization if a code already exists. Prevents
    // bootstrap loops, second-tab re-fires, and overwriting user corrections.
    if (row.skr_code !== null) {
      console.info(CATEGORIZE_LOG, "skip-already-categorized", { invoiceId, skrCode: row.skr_code });
      return { success: true, data: { skrCode: row.skr_code, confidence: 0, buSchluessel: 0 } };
    }

    if (!row.invoice_data) {
      return { success: false, error: "Keine Extraktionsdaten vorhanden." };
    }

    const { data: tenantRow, error: tenantErr } = await supabase
      .from("tenants")
      .select("skr_plan")
      .eq("id", tenantId)
      .single();
    if (tenantErr || !tenantRow) {
      console.error(CATEGORIZE_LOG, "tenant-lookup-failed", tenantErr);
      return { success: false, error: "Mandantendaten konnten nicht geladen werden." };
    }

    const skrPlan: "skr03" | "skr04" =
      tenantRow.skr_plan === "skr04" ? "skr04" : "skr03";

    const invoiceData = row.invoice_data as {
      line_items?: Array<{
        description?: { value: string | null };
        vat_rate?: { value: number | null };
      }>;
      supplier_name?: { value: string | null };
    };

    const supplierName = invoiceData.supplier_name?.value ?? null;
    const lineItemDescriptions = (invoiceData.line_items ?? [])
      .slice(0, 3)
      .map((li) => li.description?.value ?? "")
      .filter(Boolean) as string[];

    // Prefer the first non-zero taxable rate (handles the common case of
    // shipping/discount lines at 0% preceding a 19% product line). Fall back
    // to first non-null (which may be 0 for genuinely tax-free invoices).
    const lineVatRates = (invoiceData.line_items ?? [])
      .map((li) => li.vat_rate?.value)
      .filter((v): v is number => typeof v === "number");
    const firstNonZero = lineVatRates.find((v) => v > 0);
    const firstAny = lineVatRates.find((v) => v !== null && v !== undefined);
    const rawVatRate = firstNonZero ?? firstAny ?? null;
    const vatRate =
      typeof rawVatRate === "number" && Number.isFinite(rawVatRate) && rawVatRate >= 0
        ? rawVatRate
        : null;

    const aiResult = await aiCategorizeInvoice({
      supplierName,
      lineItemDescriptions,
      vatRate,
      skrPlan,
    });

    if (!aiResult.success) {
      Sentry.captureException(new Error(`${CATEGORIZE_LOG} ${aiResult.error}`), {
        tags: { module: "invoices", action: "categorize" },
        extra: { invoiceId },
      });
      return { success: false, error: aiResult.error };
    }

    const { skrCode, confidence, buSchluessel: aibuSchluessel } = aiResult.data;
    const standardBu = mapBuSchluessel(vatRate);
    const buSchluessel = aibuSchluessel !== null ? aibuSchluessel : standardBu;

    const { error: saveErr } = await supabase
      .from("invoices")
      .update({
        skr_code: skrCode,
        bu_schluessel: buSchluessel,
        categorization_confidence: confidence,
      })
      .eq("id", invoiceId);

    if (saveErr) {
      console.error(CATEGORIZE_LOG, "save-failed", saveErr);
      Sentry.captureException(saveErr, {
        tags: { module: "invoices", action: "categorize" },
        extra: { invoiceId },
      });
      return { success: false, error: "Kategorisierung konnte nicht gespeichert werden." };
    }

    await logAuditEvent(supabase, {
      tenantId,
      invoiceId,
      actorUserId: user.id,
      eventType: "categorize",
      fieldName: "skr_code",
      oldValue: null,
      newValue: skrCode,
      metadata: {
        source: "ai",
        confidence,
        bu_schluessel: buSchluessel,
        supplier_name: supplierName,
      },
    });

    revalidatePath("/dashboard");
    revalidatePath(`/rechnungen/${invoiceId}`);
    console.info(CATEGORIZE_LOG, "done", { invoiceId, skrCode, confidence });
    return { success: true, data: { skrCode, confidence, buSchluessel } };
  } catch (err) {
    const digest =
      err && typeof err === "object" && "digest" in err
        ? (err as { digest?: unknown }).digest
        : undefined;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    console.error(CATEGORIZE_LOG, err);
    Sentry.captureException(err, {
      tags: { module: "invoices", action: "categorize" },
      extra: { invoiceId },
    });
    return { success: false, error: "Kategorisierung fehlgeschlagen. Bitte erneut versuchen." };
  }
}

export async function updateInvoiceSKR(input: {
  invoiceId: string;
  newSkrCode: string;
  supplierName: string | null;
}): Promise<ActionResult<{ buSchluessel: number | null }>> {
  const { invoiceId, newSkrCode, supplierName } = input;

  const idParse = invoiceIdSchema.safeParse(invoiceId);
  if (!idParse.success) {
    return { success: false, error: firstZodError(idParse.error) };
  }

  const codeParse = skrCodeSchema.safeParse(newSkrCode);
  if (!codeParse.success) {
    return { success: false, error: "Ungültiger SKR-Kontocode." };
  }

  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      redirect(`/login?returnTo=/rechnungen/${invoiceId}`);
    }

    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();
    if (userError || !userRow) {
      console.error(UPDATE_SKR_LOG, "user-lookup-failed", userError);
      redirect(`/login?returnTo=/rechnungen/${invoiceId}`);
    }
    const tenantId = userRow.tenant_id;

    const { data: row, error: rowErr } = await supabase
      .from("invoices")
      .select("id, tenant_id, status, invoice_data, skr_code, bu_schluessel")
      .eq("id", invoiceId)
      .eq("tenant_id", tenantId)
      .single();

    if (rowErr && rowErr.code !== "PGRST116") {
      console.error(UPDATE_SKR_LOG, "select-failed", rowErr);
      Sentry.captureException(rowErr, {
        tags: { module: "invoices", action: "update_skr" },
        extra: { invoiceId },
      });
      return { success: false, error: "Rechnung kann momentan nicht geladen werden." };
    }
    if (!row || row.tenant_id !== tenantId) {
      return { success: false, error: "Rechnung nicht gefunden." };
    }

    if (row.status === "exported") {
      return {
        success: false,
        error: "Exportierte Rechnungen können nicht mehr bearbeitet werden.",
      };
    }

    // Validate newSkrCode against the tenant's plan — defends against client
    // tampering and stale UI on plan switch.
    const { data: tenantRow, error: tenantErr } = await supabase
      .from("tenants")
      .select("skr_plan")
      .eq("id", tenantId)
      .single();
    if (tenantErr || !tenantRow) {
      console.error(UPDATE_SKR_LOG, "tenant-lookup-failed", tenantErr);
      return { success: false, error: "Mandantendaten konnten nicht geladen werden." };
    }
    const skrPlan: "skr03" | "skr04" =
      tenantRow.skr_plan === "skr04" ? "skr04" : "skr03";
    const allowedCodes = skrPlan === "skr03" ? SKR03_CODES : SKR04_CODES;
    if (!Object.prototype.hasOwnProperty.call(allowedCodes, newSkrCode)) {
      return { success: false, error: "Ungültiger SKR-Kontocode für diesen Kontenrahmen." };
    }

    const invoiceData = row.invoice_data as {
      line_items?: Array<{ vat_rate?: { value: number | null } }>;
    } | null;

    const lineVatRates = (invoiceData?.line_items ?? [])
      .map((li) => li.vat_rate?.value)
      .filter((v): v is number => typeof v === "number");
    const firstNonZero = lineVatRates.find((v) => v > 0);
    const firstAny = lineVatRates.find((v) => v !== null && v !== undefined);
    const rawVatRate = firstNonZero ?? firstAny ?? null;
    const vatRate =
      typeof rawVatRate === "number" && Number.isFinite(rawVatRate) && rawVatRate >= 0
        ? rawVatRate
        : null;
    // Preserve AI-detected special cases (44 reverse-charge, 93 intra-EU).
    // AC#4: deterministic mapping merged with AI special-case detection.
    // Without this, a user override on a reverse-charge invoice silently
    // resets BU 44 → 9 and breaks UStVA reporting.
    const SPECIAL_BU = new Set([44, 93]);
    const standardBu = mapBuSchluessel(vatRate);
    const buSchluessel =
      row.bu_schluessel !== null && SPECIAL_BU.has(row.bu_schluessel)
        ? row.bu_schluessel
        : standardBu;

    const { error: updateErr } = await supabase
      .from("invoices")
      .update({
        skr_code: newSkrCode,
        bu_schluessel: buSchluessel,
        categorization_confidence: 1.0,
      })
      .eq("id", invoiceId);

    if (updateErr) {
      console.error(UPDATE_SKR_LOG, "update-failed", updateErr);
      Sentry.captureException(updateErr, {
        tags: { module: "invoices", action: "update_skr" },
        extra: { invoiceId },
      });
      return { success: false, error: "SKR-Konto konnte nicht gespeichert werden." };
    }

    const { error: correctionErr } = await supabase
      .from("categorization_corrections")
      .insert({
        tenant_id: tenantId,
        invoice_id: invoiceId,
        original_code: row.skr_code ?? "",
        corrected_code: newSkrCode,
        supplier_name: supplierName,
      });

    if (correctionErr) {
      console.error(UPDATE_SKR_LOG, "correction-insert-failed", correctionErr);
      Sentry.captureException(correctionErr, {
        tags: { module: "invoices", action: "update_skr" },
        extra: { invoiceId },
      });
    }

    await logAuditEvent(supabase, {
      tenantId,
      invoiceId,
      actorUserId: user.id,
      eventType: "categorize",
      fieldName: "skr_code",
      oldValue: row.skr_code ?? null,
      newValue: newSkrCode,
      metadata: {
        source: "user",
        bu_schluessel: buSchluessel,
        supplier_name: supplierName,
      },
    });

    revalidatePath("/dashboard");
    revalidatePath(`/rechnungen/${invoiceId}`);
    console.info(UPDATE_SKR_LOG, "done", { invoiceId, newSkrCode, buSchluessel });
    return { success: true, data: { buSchluessel } };
  } catch (err) {
    const digest =
      err && typeof err === "object" && "digest" in err
        ? (err as { digest?: unknown }).digest
        : undefined;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    console.error(UPDATE_SKR_LOG, err);
    Sentry.captureException(err, {
      tags: { module: "invoices", action: "update_skr" },
      extra: { invoiceId },
    });
    return { success: false, error: "Unerwarteter Fehler. Bitte erneut versuchen." };
  }
}
