"use server";

import { type ActionResult } from "@rechnungsai/shared";
import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import {
  buildExtfV700,
  type DatevBookingRow,
  type DatevTenantConfig,
} from "@rechnungsai/datev";
import { createServerClient } from "@/lib/supabase/server";
import { firstZodError } from "@/lib/zod-error";
import { logAuditEvent } from "@/app/actions/invoices/shared";

const LOG = "[datev:export]";
const ROW_CAP = 500;

const isoDate = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, {
    message: "Datum muss im Format JJJJ-MM-TT vorliegen.",
  });

export const prepareDatevExportSchema = z
  .object({
    dateFrom: isoDate,
    dateTo: isoDate,
  })
  .refine((v) => v.dateFrom <= v.dateTo, {
    message: "Startdatum darf nicht nach dem Enddatum liegen.",
    path: ["dateFrom"],
  });

export type PrepareDatevExportInput = z.infer<typeof prepareDatevExportSchema>;

export type PrepareDatevExportData =
  | {
      missingSettings: true;
      missingFields: string[];
    }
  | {
      missingSettings: false;
      exportId: string;
      rowCount: number;
      skippedCount: number;
      dateFrom: string;
      dateTo: string;
    };

export async function prepareDatevExport(
  input: PrepareDatevExportInput,
): Promise<ActionResult<PrepareDatevExportData>> {
  const parsed = prepareDatevExportSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) };
  }
  const { dateFrom, dateTo } = parsed.data;

  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      redirect("/login?returnTo=/dashboard");
    }

    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();
    if (userError || !userRow) {
      console.error(LOG, "user-lookup-failed", userError);
      redirect("/login?returnTo=/dashboard");
    }
    const tenantId = userRow.tenant_id;

    const { data: tenantRow, error: tenantErr } = await supabase
      .from("tenants")
      .select(
        "company_name, skr_plan, datev_berater_nr, datev_mandanten_nr, datev_sachkontenlaenge, datev_fiscal_year_start, datev_default_kreditorenkonto",
      )
      .eq("id", tenantId)
      .single();
    if (tenantErr || !tenantRow) {
      console.error(LOG, "tenant-lookup-failed", tenantErr);
      Sentry.captureException(tenantErr ?? new Error("tenant lookup failed"), {
        tags: { module: "datev", action: "prepare_export" },
        extra: { dateFrom, dateTo },
      });
      return { success: false, error: "Unerwarteter Fehler. Bitte erneut versuchen." };
    }

    const missingFields: string[] = [];
    if (!tenantRow.datev_berater_nr) missingFields.push("datev_berater_nr");
    if (!tenantRow.datev_mandanten_nr) missingFields.push("datev_mandanten_nr");
    if (missingFields.length > 0) {
      return {
        success: true,
        data: { missingSettings: true, missingFields },
      };
    }

    const { data: invoiceRows, error: invoiceErr } = await supabase
      .from("invoices")
      .select(
        "id, gross_total_value, invoice_date_value, invoice_number_value, supplier_name_value, skr_code, bu_schluessel",
      )
      .eq("tenant_id", tenantId)
      .eq("status", "ready")
      .gte("invoice_date_value", dateFrom)
      .lte("invoice_date_value", dateTo)
      .order("invoice_date_value", { ascending: true })
      .order("id", { ascending: true })
      .limit(ROW_CAP);

    if (invoiceErr) {
      console.error(LOG, "invoice-fetch-failed", invoiceErr);
      Sentry.captureException(invoiceErr, {
        tags: { module: "datev", action: "prepare_export" },
        extra: { dateFrom, dateTo },
      });
      return { success: false, error: "Unerwarteter Fehler. Bitte erneut versuchen." };
    }

    if (!invoiceRows || invoiceRows.length === 0) {
      return {
        success: false,
        error: "Im gewählten Zeitraum gibt es keine freigegebenen Rechnungen für den Export.",
      };
    }

    // Defensive null-filter — DB constraints guarantee non-null on `ready`
    // rows but we count drift as skipped rather than crashing.
    const usableRows = invoiceRows.filter(
      (r) => r.gross_total_value != null && r.invoice_date_value != null,
    );
    const preSkipped = invoiceRows.length - usableRows.length;
    if (usableRows.length === 0) {
      return {
        success: false,
        error: "Im gewählten Zeitraum gibt es keine freigegebenen Rechnungen für den Export.",
      };
    }

    const tenantConfig: DatevTenantConfig = {
      beraterNr: tenantRow.datev_berater_nr!,
      mandantenNr: tenantRow.datev_mandanten_nr!,
      sachkontenlaenge: tenantRow.datev_sachkontenlaenge,
      fiscalYearStart: tenantRow.datev_fiscal_year_start,
      skrPlan: tenantRow.skr_plan === "SKR04" ? "SKR04" : "SKR03",
      defaultKreditorenkonto: tenantRow.datev_default_kreditorenkonto ?? null,
    };

    const bookingRows: DatevBookingRow[] = usableRows.map((r) => ({
      gross_total: r.gross_total_value!,
      invoice_date: r.invoice_date_value!,
      invoice_number: r.invoice_number_value,
      supplier: r.supplier_name_value,
      skr_code: r.skr_code,
      bu_schluessel: r.bu_schluessel,
    }));

    const t0 = Date.now();
    const built = buildExtfV700(tenantConfig, bookingRows);
    const buildMs = Date.now() - t0;

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { data: insertRow, error: insertErr } = await supabase
      .from("datev_exports")
      .insert({
        tenant_id: tenantId,
        created_by: user.id,
        csv: built.csv,
        row_count: built.rowCount,
        skipped_count: built.skippedCount + preSkipped,
        date_from: built.dateFrom,
        date_to: built.dateTo,
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (insertErr || !insertRow) {
      console.error(LOG, "insert-failed", insertErr);
      Sentry.captureException(insertErr ?? new Error("datev_exports insert failed"), {
        tags: { module: "datev", action: "prepare_export" },
        extra: { dateFrom, dateTo },
      });
      return { success: false, error: "Unerwarteter Fehler. Bitte erneut versuchen." };
    }

    const includedIds = usableRows.map((r) => r.id);
    const { data: transitionedRows, error: updateErr } = await supabase
      .from("invoices")
      .update({ status: "exported" })
      .eq("tenant_id", tenantId)
      .in("id", includedIds)
      .eq("status", "ready")
      .select("id");

    if (updateErr) {
      console.error(LOG, "status-update-failed", updateErr);
      Sentry.captureException(updateErr, {
        tags: { module: "datev", action: "prepare_export" },
        extra: { dateFrom, dateTo, exportId: insertRow.id },
      });
      return { success: false, error: "Unerwarteter Fehler. Bitte erneut versuchen." };
    }

    const transitionedIds = (transitionedRows ?? []).map((r) => r.id);
    if (transitionedIds.length !== built.rowCount) {
      console.warn(LOG, "concurrent-skip", {
        expected: built.rowCount,
        actual: transitionedIds.length,
      });
    }

    await logAuditEvent(supabase, {
      tenantId,
      invoiceId: null,
      actorUserId: user.id,
      eventType: "export_datev",
      metadata: {
        export_id: insertRow.id,
        row_count: transitionedIds.length,
        skipped_count: built.skippedCount + preSkipped,
        date_from: built.dateFrom,
        date_to: built.dateTo,
        format: "extf-v700",
        invoice_ids: transitionedIds,
      },
    });

    if (buildMs > 8000) {
      console.warn(LOG, "slow", { ms: buildMs });
    }

    console.info(LOG, "done", {
      exportId: insertRow.id,
      rowCount: transitionedIds.length,
      skippedCount: built.skippedCount + preSkipped,
    });

    return {
      success: true,
      data: {
        missingSettings: false,
        exportId: insertRow.id,
        rowCount: transitionedIds.length,
        skippedCount: built.skippedCount + preSkipped,
        dateFrom: built.dateFrom,
        dateTo: built.dateTo,
      },
    };
  } catch (err) {
    const digest =
      err && typeof err === "object" && "digest" in err
        ? (err as { digest?: unknown }).digest
        : undefined;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    console.error(LOG, err);
    Sentry.captureException(err, {
      tags: { module: "datev", action: "prepare_export" },
      extra: { dateFrom, dateTo },
    });
    return { success: false, error: "Unerwarteter Fehler. Bitte erneut versuchen." };
  }
}
