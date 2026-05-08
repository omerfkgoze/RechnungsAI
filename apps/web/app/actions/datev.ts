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

const LOG = "[datev:export]";
const ROW_CAP = 500;

const isoDate = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, {
    message: "Datum muss im Format JJJJ-MM-TT vorliegen.",
  });

const prepareDatevExportSchema = z
  .object({
    dateFrom: isoDate,
    dateTo: isoDate,
  })
  .refine((v) => v.dateFrom <= v.dateTo, {
    message: "Startdatum darf nicht nach dem Enddatum liegen.",
    path: ["dateFrom"],
  });

type PrepareDatevExportInput = z.infer<typeof prepareDatevExportSchema>;

type PrepareDatevExportData =
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
      truncated: boolean;
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

    // P5 — fetch one extra to detect truncation: if we get back ROW_CAP+1, we
    // know more invoices remain and should warn the user.
    const { data: invoiceRowsAll, error: invoiceErr } = await supabase
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
      .limit(ROW_CAP + 1);

    if (invoiceErr) {
      console.error(LOG, "invoice-fetch-failed", invoiceErr);
      Sentry.captureException(invoiceErr, {
        tags: { module: "datev", action: "prepare_export" },
        extra: { dateFrom, dateTo },
      });
      return { success: false, error: "Unerwarteter Fehler. Bitte erneut versuchen." };
    }

    const truncated = (invoiceRowsAll?.length ?? 0) > ROW_CAP;
    const invoiceRows = (invoiceRowsAll ?? []).slice(0, ROW_CAP);

    if (invoiceRows.length === 0) {
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

    const totalSkipped = built.skippedCount + preSkipped;
    const includedIds = usableRows.map((r) => r.id);

    // P1 + P2 — atomic insert + status flip + audit. If any included invoice
    // failed to flip ready→exported (concurrent flow already exported it),
    // the RPC raises P0001/concurrent_skip and the whole transaction rolls
    // back, so no orphan CSV row and no half-written audit trail.
    const { data: rpcRows, error: rpcErr } = await supabase.rpc(
      "commit_datev_export",
      {
        p_csv: built.csv,
        p_row_count: built.rowCount,
        p_skipped_count: totalSkipped,
        p_date_from: built.dateFrom,
        p_date_to: built.dateTo,
        p_invoice_ids: includedIds,
      },
    );

    if (rpcErr) {
      const code = (rpcErr as { code?: string }).code;
      const message = (rpcErr as { message?: string }).message ?? "";
      if (code === "P0001" && message.includes("concurrent_skip")) {
        console.warn(LOG, "concurrent-skip", { rpcErr });
        return {
          success: false,
          error:
            "Diese Rechnungen werden gerade von einem anderen Export verarbeitet. Bitte versuche es erneut.",
        };
      }
      console.error(LOG, "commit-failed", rpcErr);
      Sentry.captureException(rpcErr, {
        tags: { module: "datev", action: "prepare_export" },
        extra: { dateFrom, dateTo },
      });
      return { success: false, error: "Unerwarteter Fehler. Bitte erneut versuchen." };
    }

    const rpcResult = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    if (!rpcResult || !rpcResult.export_id) {
      console.error(LOG, "commit-empty-result", rpcRows);
      Sentry.captureException(new Error("commit_datev_export returned no rows"), {
        tags: { module: "datev", action: "prepare_export" },
        extra: { dateFrom, dateTo },
      });
      return { success: false, error: "Unerwarteter Fehler. Bitte erneut versuchen." };
    }

    if (buildMs > 8000) {
      console.warn(LOG, "slow", { ms: buildMs });
    }

    console.info(LOG, "done", {
      exportId: rpcResult.export_id,
      rowCount: rpcResult.transitioned_count,
      skippedCount: totalSkipped,
      truncated,
    });

    return {
      success: true,
      data: {
        missingSettings: false,
        exportId: rpcResult.export_id,
        rowCount: rpcResult.transitioned_count,
        skippedCount: totalSkipped,
        dateFrom: built.dateFrom,
        dateTo: built.dateTo,
        truncated,
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
