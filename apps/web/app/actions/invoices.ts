"use server";

import {
  CORRECTABLE_FIELD_PATHS,
  INVOICE_ACCEPTED_MIME,
  invoiceUploadInputSchema,
  mapBuSchluessel,
  SKR03_CODES,
  SKR04_CODES,
  overallConfidence,
  statusFromOverallConfidence,
  type ActionResult,
  type InvoiceAcceptedMime,
} from "@rechnungsai/shared";
import { z } from "zod";
import { categorizeInvoice as aiCategorizeInvoice, extractInvoice as aiExtractInvoice } from "@rechnungsai/ai";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { createServerClient } from "@/lib/supabase/server";
import { firstZodError } from "@/lib/zod-error";

const LOG_PREFIX = "[invoices:upload]";
const EXTRACT_LOG = "[invoices:extract]";

const invoiceIdSchema = z.guid({ message: "Ungültige Rechnungs-ID." });

function inferMimeFromFilename(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".xml")) return "application/xml";
  return null;
}

function extFromMime(mime: InvoiceAcceptedMime): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "application/pdf":
      return "pdf";
    case "text/xml":
    case "application/xml":
      return "xml";
  }
}

export async function uploadInvoice(
  formData: FormData,
): Promise<ActionResult<{ invoiceId: string; filePath: string }>> {
  try {
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { success: false, error: "Keine Datei gefunden." };
    }

    const rawType = file.type && file.type.length > 0 ? file.type : null;
    const fileType =
      rawType && (INVOICE_ACCEPTED_MIME as readonly string[]).includes(rawType)
        ? rawType
        : (inferMimeFromFilename(file.name) ?? rawType ?? "");

    const parsed = invoiceUploadInputSchema.safeParse({
      originalFilename: file.name,
      fileType,
      sizeBytes: file.size,
    });
    if (!parsed.success) {
      return { success: false, error: firstZodError(parsed.error) };
    }

    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      redirect("/login?returnTo=/erfassen");
    }

    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();
    if (userError || !userRow) {
      console.error(LOG_PREFIX, userError);
      redirect("/login?returnTo=/erfassen");
    }

    const tenantId = userRow.tenant_id;
    const invoiceId = globalThis.crypto.randomUUID();
    const mime = parsed.data.fileType as InvoiceAcceptedMime;
    const ext = extFromMime(mime);
    const filePath = `${tenantId}/${invoiceId}.${ext}`;

    const { error: storageError } = await supabase.storage
      .from("invoices")
      .upload(filePath, file, {
        contentType: mime,
        upsert: false,
      });
    if (storageError) {
      console.error(LOG_PREFIX, storageError);
      Sentry.captureException(storageError, {
        tags: { module: "invoices", action: "upload" },
      });
      const statusCode = (
        storageError as unknown as { statusCode?: string | number }
      ).statusCode;
      if (String(statusCode) === "409") {
        return {
          success: false,
          error: "Diese Datei existiert bereits. Bitte erneut aufnehmen.",
        };
      }
      return {
        success: false,
        error: "Upload fehlgeschlagen. Bitte versuche es erneut.",
      };
    }

    const { error: insertError } = await supabase
      .from("invoices")
      .insert({
        id: invoiceId,
        tenant_id: tenantId,
        status: "captured",
        file_path: filePath,
        file_type: mime,
        original_filename: parsed.data.originalFilename,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error(LOG_PREFIX, insertError);
      Sentry.captureException(insertError, {
        tags: { module: "invoices", action: "upload" },
      });
      // Compensating cleanup — best-effort; we still surface a German error.
      const { error: removeError } = await supabase.storage
        .from("invoices")
        .remove([filePath]);
      if (removeError) {
        console.error(LOG_PREFIX, "compensating-remove-failed", removeError);
      }
      if (insertError.code === "42501") {
        redirect("/login?returnTo=/erfassen");
      }
      if (insertError.code === "23514") {
        return {
          success: false,
          error: "Ungültige Datei. Bitte überprüfe dein Dokument.",
        };
      }
      return {
        success: false,
        error: "Upload fehlgeschlagen. Bitte versuche es erneut.",
      };
    }

    revalidatePath("/dashboard");
    return { success: true, data: { invoiceId, filePath } };
  } catch (err) {
    const digest =
      err && typeof err === "object" && "digest" in err
        ? (err as { digest?: unknown }).digest
        : undefined;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    console.error(LOG_PREFIX, err);
    Sentry.captureException(err, {
      tags: { module: "invoices", action: "upload" },
    });
    return {
      success: false,
      error: "Upload fehlgeschlagen. Bitte versuche es erneut.",
    };
  }
}

export async function extractInvoice(
  invoiceId: string,
): Promise<ActionResult<{ status: "ready" | "review"; overall: number }>> {
  const idParse = invoiceIdSchema.safeParse(invoiceId);
  if (!idParse.success) {
    return { success: false, error: firstZodError(idParse.error) };
  }

  let flippedToProcessing = false;
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
      console.error(EXTRACT_LOG, userError);
      redirect(`/login?returnTo=/rechnungen/${invoiceId}`);
    }
    const tenantId = userRow.tenant_id;

    const { data: row, error: rowErr } = await supabase
      .from("invoices")
      .select(
        "id, tenant_id, status, file_path, file_type, original_filename, extraction_attempts",
      )
      .eq("id", invoiceId)
      .single();

    if (rowErr && rowErr.code !== "PGRST116") {
      console.error(EXTRACT_LOG, "select-failed", rowErr);
      Sentry.captureException(rowErr, {
        tags: { module: "invoices", action: "extract" },
        extra: { invoiceId },
      });
      return { success: false, error: "Rechnung kann momentan nicht verarbeitet werden." };
    }
    if (!row || row.tenant_id !== tenantId) {
      return { success: false, error: "Rechnung nicht gefunden." };
    }

    if (row.status === "ready" || row.status === "exported") {
      console.info(EXTRACT_LOG, "already-done", { invoiceId, status: row.status });
      return {
        success: true,
        data: { status: "ready", overall: 1 },
      };
    }
    if (row.status === "processing") {
      return {
        success: false,
        error: "Extraktion läuft bereits. Bitte einen Moment warten.",
      };
    }

    // TD4 (Story 3.1 / Epic 2 retro): cap runaway retries. DB CHECK constraint
    // is the backstop; this early-return delivers the user-facing German
    // message before we flip to 'processing'. Also persist the message to
    // `extraction_error` so the dashboard card renders the retry-cap state
    // instead of an eternal "Wird verarbeitet…" shimmer.
    if ((row.extraction_attempts ?? 0) >= 5) {
      const capMsg =
        "Maximale Anzahl der Versuche erreicht. Bitte überprüfe das Dokument manuell.";
      if (row.status === "captured") {
        const { error: stampErr } = await supabase
          .from("invoices")
          .update({ extraction_error: capMsg })
          .eq("id", invoiceId)
          .eq("status", "captured");
        if (stampErr) {
          console.error(EXTRACT_LOG, "cap-stamp-failed", stampErr);
        }
      }
      return { success: false, error: capMsg };
    }

    // Optimistic lock: only flip if status is still 'captured'. Prevents TOCTOU
    // race when two concurrent calls both read 'captured' before either writes.
    const { data: flipped, error: flipErr } = await supabase
      .from("invoices")
      .update({
        status: "processing",
        extraction_attempts: (row.extraction_attempts ?? 0) + 1,
        extraction_error: null,
      })
      .eq("id", invoiceId)
      .eq("status", "captured")
      .select("id")
      .maybeSingle(); // maybeSingle: returns { data: null, error: null } for 0 rows instead of PGRST116
    if (flipErr) {
      console.error(EXTRACT_LOG, "flip-processing-failed", flipErr);
      Sentry.captureException(flipErr, {
        tags: { module: "invoices", action: "extract" },
        extra: { invoiceId },
      });
      return {
        success: false,
        error: "Rechnung kann momentan nicht verarbeitet werden.",
      };
    }
    if (!flipped) {
      // 0 rows affected: status was not 'captured' — concurrent call or already extracted
      return {
        success: false,
        error: "Extraktion läuft bereits. Bitte einen Moment warten.",
      };
    }
    flippedToProcessing = true;

    if (!(INVOICE_ACCEPTED_MIME as readonly string[]).includes(row.file_type)) {
      const msg = "Ungültiger Dateityp. Rechnung kann nicht verarbeitet werden.";
      const { error: typeRevertErr } = await supabase
        .from("invoices")
        .update({ status: "captured", extraction_error: msg })
        .eq("id", invoiceId);
      if (typeRevertErr) {
        console.error(EXTRACT_LOG, "type-revert-failed", typeRevertErr);
        Sentry.captureException(typeRevertErr, { tags: { module: "invoices", action: "extract" }, extra: { invoiceId } });
      }
      flippedToProcessing = false;
      return { success: false, error: msg };
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from("invoices")
      .createSignedUrl(row.file_path, 60);
    if (signErr || !signed?.signedUrl) {
      console.error(EXTRACT_LOG, "sign-url-failed", signErr);
      Sentry.captureException(signErr ?? new Error("sign-url-failed"), {
        tags: { module: "invoices", action: "extract" },
        extra: { invoiceId },
      });
      const msg = "Rechnung kann momentan nicht verarbeitet werden.";
      const { error: signRevertErr } = await supabase
        .from("invoices")
        .update({ status: "captured", extraction_error: msg })
        .eq("id", invoiceId);
      if (signRevertErr) {
        console.error(EXTRACT_LOG, "sign-revert-failed", signRevertErr);
        Sentry.captureException(signRevertErr, { tags: { module: "invoices", action: "extract" }, extra: { invoiceId } });
      }
      flippedToProcessing = false;
      return { success: false, error: msg };
    }

    const result = await aiExtractInvoice({
      fileUrl: signed.signedUrl,
      mimeType: row.file_type as InvoiceAcceptedMime,
      originalFilename: row.original_filename,
    });

    if (!result.success) {
      const { error: aiRevertErr } = await supabase
        .from("invoices")
        .update({ status: "captured", extraction_error: result.error })
        .eq("id", invoiceId);
      if (aiRevertErr) {
        console.error(EXTRACT_LOG, "ai-revert-failed", aiRevertErr);
        Sentry.captureException(aiRevertErr, { tags: { module: "invoices", action: "extract" }, extra: { invoiceId } });
      }
      flippedToProcessing = false;
      Sentry.captureException(new Error(`${EXTRACT_LOG} ${result.error}`), {
        tags: { module: "invoices", action: "extract" },
        extra: { invoiceId },
      });
      return { success: false, error: result.error };
    }

    const overall = overallConfidence(result.data);
    const next = statusFromOverallConfidence(overall);

    const { error: saveErr } = await supabase
      .from("invoices")
      .update({
        invoice_data: result.data,
        status: next,
        extracted_at: new Date().toISOString(),
        extraction_error: null,
      })
      .eq("id", invoiceId);
    if (saveErr) {
      console.error(EXTRACT_LOG, "save-failed", saveErr);
      Sentry.captureException(saveErr, {
        tags: { module: "invoices", action: "extract" },
        extra: { invoiceId },
      });
      const msg = "Extraktion konnte nicht gespeichert werden.";
      const { error: saveRevertErr } = await supabase
        .from("invoices")
        .update({ status: "captured", extraction_error: msg })
        .eq("id", invoiceId);
      if (saveRevertErr) {
        console.error(EXTRACT_LOG, "save-revert-failed", saveRevertErr);
        Sentry.captureException(saveRevertErr, { tags: { module: "invoices", action: "extract" }, extra: { invoiceId } });
      }
      flippedToProcessing = false;
      return { success: false, error: msg };
    }
    flippedToProcessing = false;

    revalidatePath("/dashboard");
    revalidatePath(`/rechnungen/${invoiceId}`);
    console.info(EXTRACT_LOG, "done", { invoiceId, status: next, overall });
    return { success: true, data: { status: next, overall } };
  } catch (err) {
    const digest =
      err && typeof err === "object" && "digest" in err
        ? (err as { digest?: unknown }).digest
        : undefined;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    console.error(EXTRACT_LOG, err);
    Sentry.captureException(err, {
      tags: { module: "invoices", action: "extract" },
      extra: { invoiceId },
    });
    // If we already flipped to 'processing', revert so the row is never orphaned.
    if (flippedToProcessing) {
      const revertMsg = "Extraktion fehlgeschlagen. Bitte erneut versuchen.";
      const { error: catchRevertErr } = await createServerClient()
        .then((sb) =>
          sb.from("invoices")
            .update({ status: "captured", extraction_error: revertMsg })
            .eq("id", invoiceId),
        )
        .catch((e) => ({ error: e }));
      if (catchRevertErr) {
        console.error(EXTRACT_LOG, "catch-revert-failed", catchRevertErr);
        Sentry.captureException(catchRevertErr, { tags: { module: "invoices", action: "extract" }, extra: { invoiceId } });
      }
    }
    return {
      success: false,
      error: "Extraktion fehlgeschlagen. Bitte erneut versuchen.",
    };
  }
}

const CORRECT_LOG = "[invoices:correct_field]";
const SIGN_URL_LOG = "[invoices:sign_url]";

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
): Promise<ActionResult<{ url: string; fileType: string }>> {
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
      .select("id, tenant_id, file_path, file_type")
      .eq("id", invoiceId)
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

    return { success: true, data: { url: signed.signedUrl, fileType: row.file_type } };
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

const CATEGORIZE_LOG = "[invoices:categorize]";
const UPDATE_SKR_LOG = "[invoices:update_skr]";

const skrCodeSchema = z.string().min(1).max(10);

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

const APPROVE_LOG = "[invoices:approve]";
const FLAG_LOG = "[invoices:flag]";
const UNDO_LOG = "[invoices:undo]";

// P5: separate schema — approve/flag accept only user-initiated methods;
// undo_revert is reserved for the undo action's snapshot restoration path.
const actionMethodSchema = z.enum(["swipe", "button", "keyboard"]);
const approvalMethodSchema = z.enum(["swipe", "button", "keyboard", "undo_revert"]);

type InvoiceStatus =
  | "captured"
  | "processing"
  | "ready"
  | "review"
  | "exported";

const invoiceStatusSchema = z.enum([
  "captured",
  "processing",
  "ready",
  "review",
  "exported",
]);

function blockedByStatusMessage(status: InvoiceStatus): string | null {
  if (status === "captured" || status === "processing") {
    return "Die Extraktion ist noch nicht abgeschlossen.";
  }
  if (status === "exported") {
    return "Exportierte Rechnungen können nicht mehr bearbeitet werden.";
  }
  return null;
}

export async function approveInvoice(input: {
  invoiceId: string;
  method: "swipe" | "button" | "keyboard";
}): Promise<ActionResult<{ status: InvoiceStatus }>> {
  const { invoiceId, method } = input;

  const idParse = invoiceIdSchema.safeParse(invoiceId);
  if (!idParse.success) {
    return { success: false, error: firstZodError(idParse.error) };
  }
  const methodParse = actionMethodSchema.safeParse(method);
  if (!methodParse.success) {
    return { success: false, error: "Ungültige Aktion." };
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
      console.error(APPROVE_LOG, "user-lookup-failed", userError);
      redirect(`/login?returnTo=/rechnungen/${invoiceId}`);
    }
    const tenantId = userRow.tenant_id;

    const { data: row, error: rowErr } = await supabase
      .from("invoices")
      .select("id, tenant_id, status")
      .eq("id", invoiceId)
      .eq("tenant_id", tenantId)
      .single();
    if (rowErr && rowErr.code !== "PGRST116") {
      console.error(APPROVE_LOG, "select-failed", rowErr);
      Sentry.captureException(rowErr, {
        tags: { module: "invoices", action: "approve" },
        extra: { invoiceId },
      });
      return { success: false, error: "Rechnung kann momentan nicht geladen werden." };
    }
    if (!row || row.tenant_id !== tenantId) {
      return { success: false, error: "Rechnung nicht gefunden." };
    }

    const blocked = blockedByStatusMessage(row.status as InvoiceStatus);
    if (blocked) {
      return { success: false, error: blocked };
    }

    // review → ready: flips and stamps approval columns.
    // ready → ready: idempotent re-stamp (cheap, atomic — preferred over branchy "skip").
    const { data: updated, error: updateErr } = await supabase
      .from("invoices")
      .update({
        status: "ready",
        approved_at: new Date().toISOString(),
        approved_by: user.id,
        approval_method: method,
      })
      .eq("id", invoiceId)
      .eq("status", row.status)
      .select("id, status")
      .maybeSingle();

    if (updateErr) {
      console.error(APPROVE_LOG, "update-failed", updateErr);
      Sentry.captureException(updateErr, {
        tags: { module: "invoices", action: "approve" },
        extra: { invoiceId },
      });
      return { success: false, error: "Rechnung konnte nicht freigegeben werden." };
    }
    if (!updated) {
      // 0 rows affected: status changed concurrently
      return {
        success: false,
        error: "Rechnung wurde zwischenzeitlich geändert. Bitte Seite neu laden.",
      };
    }

    revalidatePath("/dashboard");
    revalidatePath(`/rechnungen/${invoiceId}`);
    console.info(APPROVE_LOG, "done", { invoiceId, method });
    return { success: true, data: { status: "ready" } };
  } catch (err) {
    const digest =
      err && typeof err === "object" && "digest" in err
        ? (err as { digest?: unknown }).digest
        : undefined;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    console.error(APPROVE_LOG, err);
    Sentry.captureException(err, {
      tags: { module: "invoices", action: "approve" },
      extra: { invoiceId },
    });
    return { success: false, error: "Unerwarteter Fehler. Bitte erneut versuchen." };
  }
}

export async function flagInvoice(input: {
  invoiceId: string;
  method: "swipe" | "button" | "keyboard";
}): Promise<ActionResult<{ status: InvoiceStatus }>> {
  const { invoiceId, method } = input;

  const idParse = invoiceIdSchema.safeParse(invoiceId);
  if (!idParse.success) {
    return { success: false, error: firstZodError(idParse.error) };
  }
  const methodParse = actionMethodSchema.safeParse(method);
  if (!methodParse.success) {
    return { success: false, error: "Ungültige Aktion." };
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
      console.error(FLAG_LOG, "user-lookup-failed", userError);
      redirect(`/login?returnTo=/rechnungen/${invoiceId}`);
    }
    const tenantId = userRow.tenant_id;

    const { data: row, error: rowErr } = await supabase
      .from("invoices")
      .select("id, tenant_id, status")
      .eq("id", invoiceId)
      .eq("tenant_id", tenantId)
      .single();
    if (rowErr && rowErr.code !== "PGRST116") {
      console.error(FLAG_LOG, "select-failed", rowErr);
      Sentry.captureException(rowErr, {
        tags: { module: "invoices", action: "flag" },
        extra: { invoiceId },
      });
      return { success: false, error: "Rechnung kann momentan nicht geladen werden." };
    }
    if (!row || row.tenant_id !== tenantId) {
      return { success: false, error: "Rechnung nicht gefunden." };
    }

    const blocked = blockedByStatusMessage(row.status as InvoiceStatus);
    if (blocked) {
      return { success: false, error: blocked };
    }

    // ready → review: flip + clear approval columns.
    // review → review: idempotent — skip the UPDATE entirely so we don't churn updated_at.
    if (row.status === "review") {
      return { success: true, data: { status: "review" } };
    }

    const { data: updated, error: updateErr } = await supabase
      .from("invoices")
      .update({
        status: "review",
        approved_at: null,
        approved_by: null,
        approval_method: null,
      })
      .eq("id", invoiceId)
      .eq("status", "ready")
      .select("id, status")
      .maybeSingle();

    if (updateErr) {
      console.error(FLAG_LOG, "update-failed", updateErr);
      Sentry.captureException(updateErr, {
        tags: { module: "invoices", action: "flag" },
        extra: { invoiceId },
      });
      return { success: false, error: "Rechnung konnte nicht zur Prüfung markiert werden." };
    }
    if (!updated) {
      return {
        success: false,
        error: "Rechnung wurde zwischenzeitlich geändert. Bitte Seite neu laden.",
      };
    }

    revalidatePath("/dashboard");
    revalidatePath(`/rechnungen/${invoiceId}`);
    console.info(FLAG_LOG, "done", { invoiceId, method });
    return { success: true, data: { status: "review" } };
  } catch (err) {
    const digest =
      err && typeof err === "object" && "digest" in err
        ? (err as { digest?: unknown }).digest
        : undefined;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    console.error(FLAG_LOG, err);
    Sentry.captureException(err, {
      tags: { module: "invoices", action: "flag" },
      extra: { invoiceId },
    });
    return { success: false, error: "Unerwarteter Fehler. Bitte erneut versuchen." };
  }
}

export async function undoInvoiceAction(input: {
  invoiceId: string;
  expectedCurrentStatus: InvoiceStatus;
  snapshot: {
    status: InvoiceStatus;
    approved_at: string | null;
    approved_by: string | null;
    approval_method: string | null;
  };
}): Promise<ActionResult<{ status: InvoiceStatus }>> {
  const { invoiceId, expectedCurrentStatus, snapshot } = input;

  const idParse = invoiceIdSchema.safeParse(invoiceId);
  if (!idParse.success) {
    return { success: false, error: firstZodError(idParse.error) };
  }
  const statusParse = invoiceStatusSchema.safeParse(expectedCurrentStatus);
  const snapStatusParse = invoiceStatusSchema.safeParse(snapshot.status);
  if (!statusParse.success || !snapStatusParse.success) {
    return { success: false, error: "Ungültiger Rechnungsstatus." };
  }

  // P1: Validate snapshot fields — these come from the client and will be
  // written verbatim to the DB, so each must be checked server-side.
  if (snapshot.approved_by !== null) {
    const byParse = z.guid({ message: "Ungültige Snapshot-Daten." }).safeParse(snapshot.approved_by);
    if (!byParse.success) {
      return { success: false, error: "Ungültige Snapshot-Daten." };
    }
  }
  if (snapshot.approved_at !== null && isNaN(new Date(snapshot.approved_at).getTime())) {
    return { success: false, error: "Ungültige Snapshot-Daten." };
  }
  if (snapshot.approval_method !== null) {
    const snapMethodParse = approvalMethodSchema.safeParse(snapshot.approval_method);
    if (!snapMethodParse.success) {
      return { success: false, error: "Ungültige Snapshot-Daten." };
    }
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
      console.error(UNDO_LOG, "user-lookup-failed", userError);
      redirect(`/login?returnTo=/rechnungen/${invoiceId}`);
    }
    const tenantId = userRow.tenant_id;

    const { data: row, error: rowErr } = await supabase
      .from("invoices")
      .select("id, tenant_id, status")
      .eq("id", invoiceId)
      .eq("tenant_id", tenantId)
      .single();
    if (rowErr && rowErr.code !== "PGRST116") {
      console.error(UNDO_LOG, "select-failed", rowErr);
      Sentry.captureException(rowErr, {
        tags: { module: "invoices", action: "undo" },
        extra: { invoiceId },
      });
      return { success: false, error: "Rechnung kann momentan nicht geladen werden." };
    }
    if (!row || row.tenant_id !== tenantId) {
      return { success: false, error: "Rechnung nicht gefunden." };
    }

    // P2: Block undo into terminal/immutable states. A malicious client could
    // forge snapshot.status = "exported" to bypass GoBD immutability.
    const snapBlocked = blockedByStatusMessage(snapshot.status as InvoiceStatus);
    if (snapBlocked) {
      return { success: false, error: snapBlocked };
    }

    // Concurrency guard: only undo if the row is still in the post-action
    // state we expect. Prevents clobbering a third-party concurrent change.
    // P4: tenant_id added to WHERE for defense-in-depth (spec triple guard).
    const { data: updated, error: updateErr } = await supabase
      .from("invoices")
      .update({
        status: snapshot.status,
        approved_at: snapshot.approved_at,
        approved_by: snapshot.approved_by,
        approval_method: snapshot.approval_method,
      })
      .eq("id", invoiceId)
      .eq("tenant_id", tenantId)
      .eq("status", expectedCurrentStatus)
      .select("id, status")
      .maybeSingle();

    if (updateErr) {
      console.error(UNDO_LOG, "update-failed", updateErr);
      Sentry.captureException(updateErr, {
        tags: { module: "invoices", action: "undo" },
        extra: { invoiceId },
      });
      return { success: false, error: "Rückgängig fehlgeschlagen. Bitte Seite neu laden." };
    }
    if (!updated) {
      return {
        success: false,
        error: "Rechnung wurde zwischenzeitlich geändert. Rückgängig nicht möglich.",
      };
    }

    revalidatePath("/dashboard");
    revalidatePath(`/rechnungen/${invoiceId}`);
    console.info(UNDO_LOG, "done", { invoiceId, restoredStatus: snapshot.status });
    return { success: true, data: { status: snapshot.status } };
  } catch (err) {
    const digest =
      err && typeof err === "object" && "digest" in err
        ? (err as { digest?: unknown }).digest
        : undefined;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    console.error(UNDO_LOG, err);
    Sentry.captureException(err, {
      tags: { module: "invoices", action: "undo" },
      extra: { invoiceId },
    });
    return { success: false, error: "Unerwarteter Fehler. Bitte erneut versuchen." };
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
