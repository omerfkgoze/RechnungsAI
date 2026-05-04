"use server";

import { type ActionResult } from "@rechnungsai/shared";
import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { verifyBuffer } from "@rechnungsai/gobd";
import { createServerClient } from "@/lib/supabase/server";
import { type ArchiveQuery, PAGE_SIZE } from "@/lib/archive-query";
import { logAuditEvent, invoiceIdSchema } from "./shared";
import { firstZodError } from "@/lib/zod-error";

const VERIFY_LOG = "[invoices:verify]";
const ARCHIVE_SEARCH_LOG = "[invoices:archive-search]";

export type VerifyArchiveResult =
  | { status: "verified"; sha256: string }
  | { status: "mismatch"; sha256: string }
  | { status: "legacy" };

export async function verifyInvoiceArchive(
  invoiceId: string,
): Promise<ActionResult<VerifyArchiveResult>> {
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
      console.error(VERIFY_LOG, "user-lookup-failed", userError);
      redirect(`/login?returnTo=/rechnungen/${invoiceId}`);
    }
    const tenantId = userRow.tenant_id;

    const { data: row, error: rowErr } = await supabase
      .from("invoices")
      .select("id, tenant_id, file_path, sha256")
      .eq("id", invoiceId)
      .eq("tenant_id", tenantId)
      .single();

    if (rowErr && rowErr.code !== "PGRST116") {
      console.error(VERIFY_LOG, "select-failed", rowErr);
      Sentry.captureException(rowErr, {
        tags: { module: "gobd", action: "verify" },
        extra: { invoiceId },
      });
      return { success: false, error: "Rechnung kann momentan nicht geladen werden." };
    }
    if (!row) {
      return { success: false, error: "Rechnung nicht gefunden." };
    }
    if (row.sha256 === null) {
      return { success: true, data: { status: "legacy" } };
    }

    const { data: blob, error: dlErr } = await supabase.storage
      .from("invoices")
      .download(row.file_path);
    if (dlErr || !blob) {
      console.error(VERIFY_LOG, "download-failed", dlErr);
      Sentry.captureException(dlErr ?? new Error("verify-download-failed"), {
        tags: { module: "gobd", action: "verify" },
        extra: { invoiceId },
      });
      return { success: false, error: "Dokument konnte nicht zur Prüfung geladen werden." };
    }

    const ok = verifyBuffer(new Uint8Array(await blob.arrayBuffer()), row.sha256);
    if (!ok) {
      await logAuditEvent(supabase, {
        tenantId,
        invoiceId,
        actorUserId: user.id,
        eventType: "hash_verify_mismatch",
        metadata: { stored_hash: row.sha256 },
      });
      Sentry.captureException(new Error("[gobd:archive] hash mismatch"), {
        tags: { module: "gobd", action: "verify" },
        extra: { invoiceId, storedHash: row.sha256 },
      });
      return { success: true, data: { status: "mismatch", sha256: row.sha256 } };
    }
    return { success: true, data: { status: "verified", sha256: row.sha256 } };
  } catch (err) {
    const digest =
      err && typeof err === "object" && "digest" in err
        ? (err as { digest?: unknown }).digest
        : undefined;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    console.error(VERIFY_LOG, err);
    Sentry.captureException(err, {
      tags: { module: "gobd", action: "verify" },
      extra: { invoiceId },
    });
    return { success: false, error: "Unerwarteter Fehler. Bitte erneut versuchen." };
  }
}

export type ArchiveRow = {
  id: string;
  status: string;
  file_type: string;
  original_filename: string;
  sha256: string | null;
  invoice_data: unknown;
  gross_total_value: number | null;
  supplier_name_value: string | null;
  invoice_number_value: string | null;
  invoice_date_value: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  skr_code: string | null;
};

export async function searchArchivedInvoices(
  input: ArchiveQuery,
): Promise<ActionResult<{ rows: ArchiveRow[]; total: number; page: number; pageSize: number }>> {
  // Defensive server-side validation: clamp page and pin pageSize regardless of
  // what the caller passed (action is publicly callable, parseArchiveQuery is client-only).
  const safePage = Number.isInteger(input.page) && input.page >= 1 ? input.page : 1;
  const safePageSize = PAGE_SIZE;
  input = { ...input, page: safePage, pageSize: safePageSize };

  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login?returnTo=/archiv");

    const { data: userRow } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();
    if (!userRow) redirect("/login?returnTo=/archiv");
    const tenantId = userRow.tenant_id;

    // Fiscal year resolution: explicit dateFrom/dateTo override fiscalYear (last-write-wins).
    let dateFrom = input.dateFrom ?? null;
    let dateTo = input.dateTo ?? null;
    if (input.fiscalYear && !dateFrom && !dateTo) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("fiscal_year_start_month")
        .eq("id", tenantId)
        .single();
      // Default month = 1 (January) if column is missing or null (DATEV settings not yet shipped).
      const startMonth: number = (tenant as { fiscal_year_start_month?: number | null } | null)?.fiscal_year_start_month ?? 1;
      const fy = input.fiscalYear;
      // start month = 1 → [fy-01-01, fy-12-31]
      // start month = 7 → [(fy-1)-07-01, fy-06-30] (fiscal year ending in `fy`)
      const fyStartYear = startMonth === 1 ? fy : fy - 1;
      dateFrom = `${fyStartYear}-${String(startMonth).padStart(2, "0")}-01`;
      const endMonth = startMonth === 1 ? 12 : startMonth - 1;
      const endYear = fy;
      const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
      dateTo = `${endYear}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    }

    let q = supabase
      .from("invoices")
      .select(
        "id, status, file_type, original_filename, sha256, invoice_data, gross_total_value, supplier_name_value, invoice_number_value, invoice_date_value, created_at, updated_at, approved_at, skr_code",
        { count: "exact" },
      )
      .eq("tenant_id", tenantId);

    if (dateFrom) q = q.gte("invoice_date_value", dateFrom);
    if (dateTo) q = q.lte("invoice_date_value", dateTo);

    if (input.supplier) {
      const escaped = input.supplier.replace(/[\\%_]/g, (c) => `\\${c}`);
      q = q.ilike("supplier_name_value", `%${escaped}%`);
    }
    if (input.invoiceNumber) {
      const escaped = input.invoiceNumber.replace(/[\\%_]/g, (c) => `\\${c}`);
      q = q.ilike("invoice_number_value", `%${escaped}%`);
    }
    if (input.minAmount !== undefined) q = q.gte("gross_total_value", input.minAmount);
    if (input.maxAmount !== undefined) q = q.lte("gross_total_value", input.maxAmount);

    const offset = (input.page - 1) * input.pageSize;
    q = q
      .order("invoice_date_value", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + input.pageSize - 1);

    const { data, count, error } = await q;
    if (error) {
      console.error(ARCHIVE_SEARCH_LOG, "query-failed", error);
      Sentry.captureException(error, { tags: { module: "gobd", action: "archive_search" } });
      return { success: false, error: "Archiv kann momentan nicht geladen werden." };
    }

    return {
      success: true,
      data: {
        rows: (data ?? []) as ArchiveRow[],
        total: count ?? 0,
        page: input.page,
        pageSize: input.pageSize,
      },
    };
  } catch (err) {
    const digest = (err as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw err;
    console.error(ARCHIVE_SEARCH_LOG, err);
    Sentry.captureException(err, { tags: { module: "gobd", action: "archive_search" } });
    return { success: false, error: "Unerwarteter Fehler. Bitte erneut versuchen." };
  }
}
