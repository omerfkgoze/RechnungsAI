import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { buildAuditExportZip, buildSummaryCsv, buildAuditTrailCsv, filterAuditMetadata } from "@rechnungsai/gobd";
import { verifyBuffer } from "@rechnungsai/gobd";
import { createServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/app/actions/invoices";

type VerificationStatus = "verified" | "mismatch" | "legacy" | "error";

const isoDateOrNull = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
  .nullable()
  .optional();

const bodySchema = z.object({
  invoiceIds: z.array(z.string().uuid()).min(1).max(500),
  filters: z
    .object({
      dateFrom: isoDateOrNull,
      dateTo: isoDateOrNull,
      fiscalYear: z.number().int().min(1900).max(9999).nullable().optional(),
    })
    .optional(),
});

function extFromFileType(fileType: string): string {
  switch (fileType) {
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "application/pdf": return "pdf";
    case "text/xml":
    case "application/xml": return "xml";
    default: return "bin";
  }
}

function toTenantSlug(companyName: string): string {
  return companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function formatYYYYMMDD(d = new Date()): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

// Metadata keys included in audit-trail.csv are restricted to the DSGVO-safe whitelist
// defined in @rechnungsai/gobd csv.ts (filterAuditMetadata). PII fields are stripped.
const README_TXT = `GoBD-konformer Audit-Export
=============================

Dieses ZIP-Archiv wurde von RechnungsAI gemäß den GoBD-Anforderungen erstellt.

Inhalt:
  documents/      - Originaldokumente (unveränderter Originalzustand)
  summary.csv     - Rechnungsübersicht mit Verifikationsstatus
  audit-trail.csv - Änderungsprotokoll der ausgewählten Belege
                    (Metadaten-Felder: confidence_score, ai_model, extraction_attempt,
                     batch_id, previous_status, flag_reason)

Rechtliche Grundlage:
  §§ 238–241 HGB   - Buchführungspflicht und Unveränderbarkeit
  GoBD Tz. 100–107 - Maschinelle Auswertbarkeit (§ 147 Abs. 2 AO)
  § 147 AO         - Aufbewahrungspflicht (10 Jahre)

Aufbewahrungspflicht:
  Alle enthaltenen Dokumente unterliegen der gesetzlichen Aufbewahrungsfrist
  von mindestens 10 Jahren gemäß § 147 AO.
`;

export async function POST(request: Request): Promise<Response> {
  let supabase: Awaited<ReturnType<typeof createServerClient>>;
  try {
    supabase = await createServerClient();
  } catch (err) {
    Sentry.captureException(err, { tags: { module: "gobd", action: "export_audit" } });
    return Response.json({ error: "Interner Serverfehler." }, { status: 500 });
  }

  // Auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  // Resolve tenant
  const { data: userRow } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (!userRow) {
    return Response.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }
  const tenantId = userRow.tenant_id;

  // Parse and validate body
  let body: z.infer<typeof bodySchema>;
  try {
    const raw = await request.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Ungültige Anfrage.";
      return Response.json({ error: msg }, { status: 400 });
    }
    body = parsed.data;
  } catch {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const { invoiceIds, filters } = body;
  const requestedCount = invoiceIds.length;

  // Fetch invoices scoped to tenant + requested IDs (defense-in-depth: RLS is the second wall).
  // .order() ensures a deterministic ZIP byte sequence across repeated exports of the same IDs.
  const { data: invoiceRows, error: invoiceErr } = await supabase
    .from("invoices")
    .select(
      "id, file_path, file_type, sha256, original_filename, supplier_name_value, gross_total_value, invoice_number_value, invoice_date_value, status, skr_code, bu_schluessel, approved_at, approved_by, created_at",
    )
    .eq("tenant_id", tenantId)
    .in("id", invoiceIds)
    .order("invoice_date_value", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true });

  if (invoiceErr) {
    Sentry.captureException(invoiceErr, { tags: { module: "gobd", action: "export_audit" } });
    return Response.json({ error: "Fehler beim Laden der Rechnungen." }, { status: 500 });
  }

  const includedCount = (invoiceRows ?? []).length;
  const missingCount = requestedCount - includedCount;

  if (includedCount === 0) {
    return Response.json(
      { error: "Keine Rechnungen für den Audit-Export gefunden." },
      { status: 400 },
    );
  }

  // Fetch tenant info for filename
  const { data: tenant } = await supabase
    .from("tenants")
    .select("company_name")
    .eq("id", tenantId)
    .single();
  const tenantSlug = toTenantSlug(tenant?.company_name ?? "export");

  // Download + verify each invoice file
  type RowWithStatus = (typeof invoiceRows extends (infer T)[] ? T : never) & {
    verification_status: VerificationStatus;
    bytes: Uint8Array;
  };
  const rowsWithStatus: RowWithStatus[] = [];
  let mismatchCount = 0;

  for (const row of invoiceRows ?? []) {
    const { data: blob, error: dlErr } = await supabase.storage
      .from("invoices")
      .download(row.file_path);

    if (dlErr || !blob) {
      Sentry.captureException(dlErr ?? new Error("download failed"), {
        tags: { module: "gobd", action: "export_audit" },
        extra: { invoiceId: row.id },
      });
      const reason = dlErr?.message ?? "Storage download failed";
      const missingBytes = new TextEncoder().encode(
        `MISSING: ${row.id}\nReason: ${reason}\nThis file could not be retrieved from storage at export time.\n`,
      );
      rowsWithStatus.push({
        ...row,
        verification_status: "error",
        bytes: missingBytes,
        _isMissing: true,
      } as RowWithStatus & { _isMissing?: boolean });
      continue;
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    let verificationStatus: VerificationStatus;

    if (!row.sha256) {
      verificationStatus = "legacy";
    } else {
      const ok = verifyBuffer(bytes, row.sha256);
      if (ok) {
        verificationStatus = "verified";
      } else {
        verificationStatus = "mismatch";
        mismatchCount++;
        Sentry.captureException(new Error("[gobd:export] hash mismatch"), {
          tags: { module: "gobd", action: "export_audit" },
          extra: { invoiceId: row.id, storedHash: row.sha256 },
        });
      }
    }

    rowsWithStatus.push({ ...row, verification_status: verificationStatus, bytes } as RowWithStatus);
  }

  // Fetch audit logs for included invoices
  const includedIds = rowsWithStatus.map((r) => r.id);
  const { data: auditLogRows } = await supabase
    .from("audit_logs")
    .select("id, invoice_id, actor_user_id, event_type, field_name, old_value, new_value, metadata, created_at")
    .eq("tenant_id", tenantId)
    .in("invoice_id", includedIds)
    .order("invoice_id", { ascending: true })
    .order("created_at", { ascending: true });

  // Build ZIP entries
  const enc = new TextEncoder();
  const zipEntries: { path: string; bytes: Uint8Array }[] = [];

  // Document files — failed downloads become <id>.MISSING.txt so the auditor
  // knows the file was missing at export time rather than seeing a corrupt 0-byte file.
  for (const row of rowsWithStatus) {
    const isMissing = (row as RowWithStatus & { _isMissing?: boolean })._isMissing === true;
    const ext = isMissing ? "MISSING.txt" : extFromFileType(row.file_type ?? "");
    const filePath = `documents/${row.id}.${ext}`;
    zipEntries.push({ path: filePath, bytes: row.bytes });
  }

  // summary.csv
  const summaryRows = rowsWithStatus.map((r) => ({
    id: r.id,
    supplier: r.supplier_name_value ?? null,
    invoice_number: r.invoice_number_value ?? null,
    invoice_date: r.invoice_date_value ?? null,
    gross_total: r.gross_total_value ?? null,
    skr_code: r.skr_code ?? null,
    bu_schluessel: r.bu_schluessel ?? null,
    status: r.status ?? "",
    approved_at: r.approved_at ?? null,
    sha256: r.sha256 ?? null,
    verification_status: r.verification_status,
  }));
  zipEntries.push({ path: "summary.csv", bytes: enc.encode(buildSummaryCsv(summaryRows)) });

  // audit-trail.csv
  // Whitelist metadata to DSGVO-safe audit-relevant keys (filterAuditMetadata in @rechnungsai/gobd).
  const auditTrailRows = (auditLogRows ?? []).map((r) => ({
    id: r.id,
    invoice_id: r.invoice_id ?? null,
    actor_user_id: r.actor_user_id,
    event_type: r.event_type,
    field_name: r.field_name ?? null,
    old_value: r.old_value ?? null,
    new_value: r.new_value ?? null,
    metadata: filterAuditMetadata(r.metadata),
    created_at: r.created_at,
  }));
  zipEntries.push({ path: "audit-trail.csv", bytes: enc.encode(buildAuditTrailCsv(auditTrailRows)) });

  // README.txt
  zipEntries.push({ path: "README.txt", bytes: enc.encode(README_TXT) });

  // Build ZIP
  let zipBytes: Uint8Array;
  try {
    zipBytes = await buildAuditExportZip(zipEntries);
  } catch (err) {
    Sentry.captureException(err, { tags: { module: "gobd", action: "export_audit" } });
    return Response.json({ error: "ZIP-Erstellung fehlgeschlagen." }, { status: 500 });
  }

  // Audit log entry — BEFORE response is returned; wrapped in try/catch so a failed
  // audit insert does not prevent the ZIP from being delivered (GoBD-compliant non-fatal
  // per Story 4.2 contract), but the failure is surfaced via Sentry.
  try {
    await logAuditEvent(supabase, {
      tenantId,
      invoiceId: null,
      actorUserId: user.id,
      eventType: "export_audit",
      metadata: {
        invoice_count: includedCount,
        requested_count: requestedCount,
        missing_count: missingCount,
        mismatch_count: mismatchCount,
        format: "zip",
        filters: {
          dateFrom: filters?.dateFrom ?? null,
          dateTo: filters?.dateTo ?? null,
          fiscalYear: filters?.fiscalYear ?? null,
        },
      },
    });
  } catch (auditErr) {
    Sentry.captureException(auditErr, {
      tags: { module: "gobd", action: "export_audit_log_failed" },
      extra: { includedCount, requestedCount },
    });
  }

  const filename = `audit-export-${tenantSlug}-${formatYYYYMMDD()}.zip`;

  return new Response(zipBytes.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(zipBytes.byteLength),
    },
  });
}
