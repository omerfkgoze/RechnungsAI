"use server";

import {
  INVOICE_ACCEPTED_MIME,
  invoiceUploadInputSchema,
  overallConfidence,
  statusFromOverallConfidence,
  type ActionResult,
  type InvoiceAcceptedMime,
} from "@rechnungsai/shared";
import { extractInvoice as aiExtractInvoice } from "@rechnungsai/ai";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { hashBuffer } from "@rechnungsai/gobd";
import { createServerClient } from "@/lib/supabase/server";
import { firstZodError } from "@/lib/zod-error";
import { logAuditEvent, invoiceIdSchema } from "./shared";
import {
  composeUpdatePayload,
  runStructuredExtraction,
  SKIPPED_VALIDATION,
  type StructuredExtractionResult,
  type ValidationDbFields,
} from "./validation-helpers";

const LOG_PREFIX = "[invoices:upload]";
const EXTRACT_LOG = "[invoices:extract]";

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

    const buffer = new Uint8Array(await file.arrayBuffer());

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
      .upload(filePath, buffer, {
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

    // Compute hash AFTER successful upload per spike Watch Point 4 — never write
    // a hash for an upload that did not land.
    const sha256 = hashBuffer(buffer);

    const { error: insertError } = await supabase
      .from("invoices")
      .insert({
        id: invoiceId,
        tenant_id: tenantId,
        status: "captured",
        file_path: filePath,
        file_type: mime,
        original_filename: parsed.data.originalFilename,
        sha256,
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

    await logAuditEvent(supabase, {
      tenantId,
      invoiceId,
      actorUserId: user.id,
      eventType: "upload",
      metadata: {
        file_type: mime,
        original_filename: parsed.data.originalFilename,
        size_bytes: file.size,
        sha256,
      },
    });

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

    const fileType = row.file_type;
    const isXml = fileType === "application/xml" || fileType === "text/xml";
    const isPdf = fileType === "application/pdf";

    // ─── Structured-extraction path: download bytes for XML / PDF ──────────
    let structured: StructuredExtractionResult | null = null;
    if (isXml || isPdf) {
      const { data: blob, error: dlErr } = await supabase.storage
        .from("invoices")
        .download(row.file_path);
      if (dlErr || !blob) {
        console.error(EXTRACT_LOG, "download-failed", dlErr);
        Sentry.captureException(dlErr ?? new Error("download-failed"), {
          tags: { module: "invoices", action: "extract" },
          extra: { invoiceId },
        });
        const msg = "Datei konnte momentan nicht geladen werden — bitte erneut versuchen.";
        const { error: dlRevertErr } = await supabase
          .from("invoices")
          .update({ status: "captured", extraction_error: msg })
          .eq("id", invoiceId);
        if (dlRevertErr) {
          console.error(EXTRACT_LOG, "dl-revert-failed", dlRevertErr);
          Sentry.captureException(dlRevertErr, { tags: { module: "invoices", action: "extract" }, extra: { invoiceId } });
        }
        flippedToProcessing = false;
        return { success: false, error: msg };
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      structured = await runStructuredExtraction(bytes, fileType);
    }

    // ─── XML branch — never calls AI (D10) ────────────────────────────────
    if (isXml) {
      if (!structured) {
        // Defensive: structured must be set in the XML branch.
        flippedToProcessing = false;
        return { success: false, error: "Interner Fehler bei der Verarbeitung." };
      }
      const v = structured.validationFields;
      if (v.validation_status === "unsupported") {
        const msg = "E-Rechnungsformat erkannt, aber nicht unterstützt. Validierung übersprungen.";
        const payload = composeUpdatePayload(
          {
            status: "review",
            invoice_data: null,
            extracted_at: new Date().toISOString(),
            extraction_error: msg,
          },
          v,
        );
        const { error: saveErr } = await supabase
          .from("invoices")
          .update(payload)
          .eq("id", invoiceId);
        if (saveErr) {
          console.error(EXTRACT_LOG, "save-failed", saveErr);
          Sentry.captureException(saveErr, { tags: { module: "invoices", action: "extract" }, extra: { invoiceId } });
          flippedToProcessing = false;
          return { success: false, error: "Extraktion konnte nicht gespeichert werden." };
        }
        flippedToProcessing = false;
        // Audit (best-effort) — F5 in spike §6.
        try {
          await logAuditEvent(supabase, {
            tenantId,
            invoiceId,
            actorUserId: user.id,
            eventType: "validation_failed",
            metadata: { profile: "unknown", reason: "unsupported", ruleSetVersion: v.validation_rule_set_version },
          });
        } catch (e) {
          console.error(EXTRACT_LOG, "audit-failed", e);
          Sentry.captureException(e, { tags: { module: "invoices", action: "validate" }, extra: { invoiceId } });
        }
        revalidatePath("/dashboard");
        revalidatePath(`/rechnungen/${invoiceId}`);
        return { success: true, data: { status: "review", overall: 0 } };
      }

      if (v.validation_status === "invalid" || !structured.invoiceData) {
        // F1: XML couldn't be projected to InvoiceData → rollback path.
        const msg = "XML konnte nicht gelesen werden — bitte Lieferant kontaktieren.";
        const { error: invErr } = await supabase
          .from("invoices")
          .update({ status: "captured", extraction_error: msg, ...v })
          .eq("id", invoiceId);
        if (invErr) {
          console.error(EXTRACT_LOG, "xml-invalid-save-failed", invErr);
          Sentry.captureException(invErr, { tags: { module: "invoices", action: "extract" }, extra: { invoiceId } });
        }
        flippedToProcessing = false;
        try {
          await logAuditEvent(supabase, {
            tenantId,
            invoiceId,
            actorUserId: user.id,
            eventType: "validation_failed",
            metadata: {
              profile: structured.report?.profile,
              customizationId: structured.report?.customizationId,
              violationCount: structured.report?.violations.length ?? 0,
              ruleSetVersion: v.validation_rule_set_version,
              durationMs: structured.report?.durationMs,
              usedSource: structured.usedSource,
            },
          });
        } catch (e) {
          console.error(EXTRACT_LOG, "audit-failed", e);
          Sentry.captureException(e, { tags: { module: "invoices", action: "validate" }, extra: { invoiceId } });
        }
        return { success: false, error: msg };
      }

      // Valid or warning — XML projection populates invoice_data, status='ready'.
      const payload = composeUpdatePayload(
        {
          status: "ready",
          invoice_data: structured.invoiceData,
          extracted_at: new Date().toISOString(),
          extraction_error: null,
        },
        v,
      );
      const { error: saveErr } = await supabase
        .from("invoices")
        .update(payload)
        .eq("id", invoiceId);
      if (saveErr) {
        console.error(EXTRACT_LOG, "save-failed", saveErr);
        Sentry.captureException(saveErr, { tags: { module: "invoices", action: "extract" }, extra: { invoiceId } });
        const msg = "Extraktion konnte nicht gespeichert werden.";
        await supabase.from("invoices").update({ status: "captured", extraction_error: msg }).eq("id", invoiceId);
        flippedToProcessing = false;
        return { success: false, error: msg };
      }
      flippedToProcessing = false;
      try {
        await logAuditEvent(supabase, {
          tenantId,
          invoiceId,
          actorUserId: user.id,
          eventType: v.validation_status === "valid" ? "validation_passed" : "validation_failed",
          metadata: {
            profile: structured.report?.profile,
            customizationId: structured.report?.customizationId,
            violationCount: structured.report?.violations.length ?? 0,
            ruleSetVersion: v.validation_rule_set_version,
            durationMs: structured.report?.durationMs,
            usedSource: structured.usedSource,
          },
        });
      } catch (e) {
        console.error(EXTRACT_LOG, "audit-failed", e);
        Sentry.captureException(e, { tags: { module: "invoices", action: "validate" }, extra: { invoiceId } });
      }
      revalidatePath("/dashboard");
      revalidatePath(`/rechnungen/${invoiceId}`);
      return { success: true, data: { status: "ready", overall: 1 } };
    }

    // ─── PDF branch — may short-circuit AI on valid ZUGFeRD ───────────────
    if (isPdf && structured && structured.usedSource === "xml" && structured.invoiceData) {
      // valid|warning ZUGFeRD — skip AI (D5).
      const v = structured.validationFields;
      const payload = composeUpdatePayload(
        {
          status: "ready",
          invoice_data: structured.invoiceData,
          extracted_at: new Date().toISOString(),
          extraction_error: null,
        },
        v,
      );
      const { error: saveErr } = await supabase
        .from("invoices")
        .update(payload)
        .eq("id", invoiceId);
      if (saveErr) {
        console.error(EXTRACT_LOG, "save-failed", saveErr);
        Sentry.captureException(saveErr, { tags: { module: "invoices", action: "extract" }, extra: { invoiceId } });
        const msg = "Extraktion konnte nicht gespeichert werden.";
        await supabase.from("invoices").update({ status: "captured", extraction_error: msg }).eq("id", invoiceId);
        flippedToProcessing = false;
        return { success: false, error: msg };
      }
      flippedToProcessing = false;
      try {
        await logAuditEvent(supabase, {
          tenantId,
          invoiceId,
          actorUserId: user.id,
          eventType: v.validation_status === "valid" ? "validation_passed" : "validation_failed",
          metadata: {
            profile: structured.report?.profile,
            customizationId: structured.report?.customizationId,
            violationCount: structured.report?.violations.length ?? 0,
            ruleSetVersion: v.validation_rule_set_version,
            durationMs: structured.report?.durationMs,
            usedSource: "xml",
          },
        });
      } catch (e) {
        console.error(EXTRACT_LOG, "audit-failed", e);
        Sentry.captureException(e, { tags: { module: "invoices", action: "validate" }, extra: { invoiceId } });
      }
      revalidatePath("/dashboard");
      revalidatePath(`/rechnungen/${invoiceId}`);
      return { success: true, data: { status: "ready", overall: 1 } };
    }

    // ─── AI path (image, PDF without zugferd, PDF with invalid zugferd) ────
    const validationFieldsForAi: ValidationDbFields = structured?.validationFields ?? SKIPPED_VALIDATION;

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

    const payload = composeUpdatePayload(
      {
        status: next,
        invoice_data: result.data,
        extracted_at: new Date().toISOString(),
        extraction_error: null,
      },
      validationFieldsForAi,
    );
    const { error: saveErr } = await supabase
      .from("invoices")
      .update(payload)
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

    // Validation audit — only emit when we actually validated (PDF with
    // invalid ZUGFeRD; AI fallback for the structured data shape). Image and
    // non-zugferd PDF paths have validation_status='skipped' and no audit.
    if (
      structured &&
      structured.report &&
      validationFieldsForAi.validation_status !== "skipped"
    ) {
      try {
        await logAuditEvent(supabase, {
          tenantId,
          invoiceId,
          actorUserId: user.id,
          eventType:
            validationFieldsForAi.validation_status === "valid"
              ? "validation_passed"
              : "validation_failed",
          metadata: {
            profile: structured.report.profile,
            customizationId: structured.report.customizationId,
            violationCount: structured.report.violations.length,
            ruleSetVersion: validationFieldsForAi.validation_rule_set_version,
            durationMs: structured.report.durationMs,
            usedSource: "ai",
          },
        });
      } catch (e) {
        console.error(EXTRACT_LOG, "audit-failed", e);
        Sentry.captureException(e, { tags: { module: "invoices", action: "validate" }, extra: { invoiceId } });
      }
    }

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
