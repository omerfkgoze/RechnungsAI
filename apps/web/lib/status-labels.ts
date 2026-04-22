// Single source of truth for the German status labels used by the dashboard
// pipeline header, invoice list card badges, and filter select. Keep in sync
// with supabase/migrations/20260417100000_invoices_table.sql invoice_status enum.

import type { Database } from "@rechnungsai/shared";

export type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];

export const INVOICE_STATUS_LABEL_DE: Record<InvoiceStatus, string> = {
  captured: "Erfasst",
  processing: "Verarbeitung",
  ready: "Bereit",
  review: "Zur Prüfung",
  exported: "Exportiert",
};

// PipelineHeader collapses `review` into the "Bereit" actionable bucket —
// both statuses need user attention, and the UX wireframe shows one button.
// Filters still expose all 5 statuses separately (finer granularity is
// useful when narrowing the list).
export type PipelineStage = "captured" | "processing" | "ready" | "exported";

export const PIPELINE_STAGES: readonly PipelineStage[] = [
  "captured",
  "processing",
  "ready",
  "exported",
];

export const PIPELINE_STAGE_LABEL_DE: Record<PipelineStage, string> = {
  captured: "Erfasst",
  processing: "Verarbeitung",
  ready: "Bereit",
  exported: "Exportiert",
};

export const PIPELINE_STAGE_LABEL_SHORT_DE: Record<PipelineStage, string> = {
  captured: "Erf.",
  processing: "Verarb.",
  ready: "Bereit",
  exported: "Export.",
};

// WhatsApp-style indicators per AC #1.
export const PIPELINE_STAGE_INDICATOR: Record<PipelineStage, string> = {
  captured: "○",
  processing: "◐",
  ready: "●",
  exported: "✓",
};
