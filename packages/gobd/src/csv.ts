// GoBD-compliant CSV builder for audit export (Story 4.3).
// Format: UTF-8 with BOM, semicolon delimiter, RFC 4180 quoting, CRLF line endings.
// German Excel default: semicolon + BOM opens without manual import wizard.

const BOM = "﻿";
const DELIM = ";";
const EOL = "\r\n";

// Formula injection guard: prefix with ' when the field starts with =, +, -, @, \t, or \r.
// These prefixes trigger formula execution in Excel/LibreOffice when the CSV is opened.
const FORMULA_INJECTION_PREFIXES = new Set(["=", "+", "-", "@", "\t", "\r"]);

function escapeField(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (FORMULA_INJECTION_PREFIXES.has(s[0] ?? "")) {
    s = `'${s}`;
  }
  if (s.includes(DELIM) || s.includes('"') || s.includes("\r") || s.includes("\n") || s.includes(",")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatGermanAmount(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

export type SummaryRow = {
  id: string;
  supplier: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  gross_total: number | null;
  skr_code: string | null;
  bu_schluessel: number | null;
  status: string;
  approved_at: string | null;
  sha256: string | null;
  verification_status: "verified" | "mismatch" | "legacy" | "error";
};

export type AuditTrailRow = {
  id: string;
  invoice_id: string | null;
  actor_user_id: string;
  event_type: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  metadata: unknown;
  created_at: string;
};

export function buildSummaryCsv(rows: SummaryRow[]): string {
  const headers = [
    "Rechnungs-ID",
    "Lieferant",
    "Rechnungsnummer",
    "Belegdatum",
    "Bruttobetrag",
    "SKR-Konto",
    "BU-Schlüssel",
    "Status",
    "Genehmigt am",
    "SHA-256",
    "Verifikationsstatus",
  ];
  const lines = [BOM + headers.map(escapeField).join(DELIM)];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.supplier ?? "",
        r.invoice_number ?? "",
        r.invoice_date ?? "",
        formatGermanAmount(r.gross_total),
        r.skr_code ?? "",
        r.bu_schluessel !== null && r.bu_schluessel !== undefined
          ? String(r.bu_schluessel)
          : "",
        r.status,
        r.approved_at ?? "",
        r.sha256 ?? "",
        r.verification_status,
      ]
        .map(escapeField)
        .join(DELIM),
    );
  }
  return lines.join(EOL) + EOL;
}

// DSGVO data minimisation: only these metadata keys are audit-relevant and safe
// to include in the external-auditor CSV. PII fields (e.g., raw invoice_data,
// user email, IP addresses) are stripped before the file leaves the server.
const AUDIT_METADATA_WHITELIST = new Set([
  "confidence_score",
  "ai_model",
  "extraction_attempt",
  "batch_id",
  "previous_status",
  "flag_reason",
]);

export function filterAuditMetadata(raw: unknown): Record<string, unknown> | null {
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const filtered: Record<string, unknown> = {};
  for (const key of AUDIT_METADATA_WHITELIST) {
    if (key in obj) filtered[key] = obj[key];
  }
  return Object.keys(filtered).length > 0 ? filtered : null;
}

export function buildAuditTrailCsv(rows: AuditTrailRow[]): string {
  const headers = [
    "Audit-ID",
    "Rechnungs-ID",
    "Benutzer-ID",
    "Ereignistyp",
    "Feldname",
    "Alter Wert",
    "Neuer Wert",
    "Metadaten",
    "Erstellt am",
  ];
  const lines = [BOM + headers.map(escapeField).join(DELIM)];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.invoice_id ?? "",
        r.actor_user_id,
        r.event_type,
        r.field_name ?? "",
        r.old_value ?? "",
        r.new_value ?? "",
        (() => {
          const filtered = filterAuditMetadata(r.metadata);
          return filtered !== null ? JSON.stringify(filtered) : "";
        })(),
        r.created_at,
      ]
        .map(escapeField)
        .join(DELIM),
    );
  }
  return lines.join(EOL) + EOL;
}
