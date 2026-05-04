"use server";

import { type ActionResult } from "@rechnungsai/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { firstZodError } from "@/lib/zod-error";
import {
  logAuditEvent,
  invoiceIdSchema,
  invoiceStatusSchema,
  actionMethodSchema,
  approvalMethodSchema,
  blockedByStatusMessage,
  type InvoiceStatus,
} from "./shared";

const APPROVE_LOG = "[invoices:approve]";
const FLAG_LOG = "[invoices:flag]";
const UNDO_LOG = "[invoices:undo]";

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

    await logAuditEvent(supabase, {
      tenantId,
      invoiceId,
      actorUserId: user.id,
      eventType: "approve",
      metadata: {
        approval_method: method,
        previous_status: row.status,
      },
    });

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

    await logAuditEvent(supabase, {
      tenantId,
      invoiceId,
      actorUserId: user.id,
      eventType: "flag",
      metadata: {
        approval_method: method,
        previous_status: row.status,
      },
    });

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

    await logAuditEvent(supabase, {
      tenantId,
      invoiceId,
      actorUserId: user.id,
      eventType: expectedCurrentStatus === "ready" ? "undo_approve" : "undo_flag",
      metadata: {
        restored_status: snapshot.status,
        expected_current_status: expectedCurrentStatus,
        approval_method: snapshot.approval_method,
      },
    });

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
