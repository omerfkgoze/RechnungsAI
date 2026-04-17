"use server";

import {
  INVOICE_ACCEPTED_MIME,
  invoiceUploadInputSchema,
  type ActionResult,
  type InvoiceAcceptedMime,
} from "@rechnungsai/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { createServerClient } from "@/lib/supabase/server";
import { firstZodError } from "@/lib/zod-error";

const LOG_PREFIX = "[invoices:upload]";

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
