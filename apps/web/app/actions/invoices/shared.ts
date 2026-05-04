import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { createServerClient } from "@/lib/supabase/server";

const AUDIT_LOG = "[invoices:audit]";

export type AuditEventType =
  | "upload"
  | "field_edit"
  | "categorize"
  | "approve"
  | "flag"
  | "undo_approve"
  | "undo_flag"
  | "export_datev"
  | "export_audit"
  | "hash_verify_mismatch";

export async function logAuditEvent(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  params: {
    tenantId: string;
    invoiceId: string | null;
    actorUserId: string;
    eventType: AuditEventType;
    fieldName?: string | null;
    oldValue?: string | null;
    newValue?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("audit_logs").insert({
    tenant_id: params.tenantId,
    invoice_id: params.invoiceId,
    actor_user_id: params.actorUserId,
    event_type: params.eventType,
    field_name: params.fieldName ?? null,
    old_value: params.oldValue ?? null,
    new_value: params.newValue ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata: (params.metadata ?? {}) as any,
  });
  if (error) {
    console.error(AUDIT_LOG, "insert-failed", error);
    Sentry.captureException(
      new Error((error as { message?: string }).message ?? "audit insert failed"),
      {
        tags: { module: "gobd", action: "audit" },
        extra: { eventType: params.eventType, invoiceId: params.invoiceId, originalError: error },
      },
    );
  }
}

export const invoiceIdSchema = z.guid({ message: "Ungültige Rechnungs-ID." });

export type InvoiceStatus =
  | "captured"
  | "processing"
  | "ready"
  | "review"
  | "exported";

export const invoiceStatusSchema = z.enum([
  "captured",
  "processing",
  "ready",
  "review",
  "exported",
]);

// P5: separate schema — approve/flag accept only user-initiated methods;
// undo_revert is reserved for the undo action's snapshot restoration path.
export const actionMethodSchema = z.enum(["swipe", "button", "keyboard"]);
export const approvalMethodSchema = z.enum(["swipe", "button", "keyboard", "undo_revert"]);

export function blockedByStatusMessage(status: InvoiceStatus): string | null {
  if (status === "captured" || status === "processing") {
    return "Die Extraktion ist noch nicht abgeschlossen.";
  }
  if (status === "exported") {
    return "Exportierte Rechnungen können nicht mehr bearbeitet werden.";
  }
  return null;
}
