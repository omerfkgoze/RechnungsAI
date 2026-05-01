import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { buildAuditExportZip, buildSummaryCsv, buildAuditTrailCsv } from "@rechnungsai/gobd";
import { verifyBuffer } from "@rechnungsai/gobd";
import { createServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/app/actions/invoices";

type VerificationStatus = "verified" | "mismatch" | "legacy" | "error";

const bodySchema = z.object({
  invoiceIds: z.array(z.string().uuid()).min(1).max(500),
  filters: z
    .object({
      dateFrom: z.string().nullable().optional(),
      dateTo: z.string().nullable().optional(),
      fiscalYear: z.number().nullable().optional(),
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

const README_TXT = `GoBD-konformer Audit-Export
=============================

Dieses ZIP-Archiv wurde von RechnungsAI gemaess den GoBD-Anforderungen erstellt.

Inhalt:
  documents/      - Originaldokumente (unveraenderter Originalzustand)
  summary.csv     - Rechnungsuebersicht mit Verifikationsstatus
  audit-trail.csv - Vollstaendiges Aenderungsprotokoll

Rechtliche Grundlage:
  §§ 238-241 HGB  - Buchfuehrungspflicht und Unveraenderbarkeit
  GoBD Tz. 100-107 - Maschinelle Auswertbarkeit (§ 147 Abs. 2 AO)
  § 147 AO        - Aufbewahrungspflicht (10 Jahre)

Aufbewahrungspflicht:
  Alle enthaltenen Dokumente unterliegen der gesetzlichen Aufbewahrungsfrist
  von mindestens 10 Jahren gemaeß § 147 AO.
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

  // Fetch invoices scoped to tenant + requested IDs (defense-in-depth: RLS is the second wall)
  const { data: invoiceRows, error: invoiceErr } = await supabase
    .from("invoices")
    .select(
      "id, file_path, file_type, sha256, original_filename, supplier_name_value, gross_total_value, invoice_number_value, invoice_date_value, status, skr_code, bu_schluessel, approved_at",
    )
    .eq("tenant_id", tenantId)
    .in("id", invoiceIds);

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
      rowsWithStatus.push({
        ...row,
        verification_status: "error",
        bytes: new Uint8Array(),
      } as RowWithStatus);
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

  // Document files
  for (const row of rowsWithStatus) {
    const ext = extFromFileType(row.file_type ?? "");
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
  const auditTrailRows = (auditLogRows ?? []).map((r) => ({
    id: r.id,
    invoice_id: r.invoice_id ?? null,
    actor_user_id: r.actor_user_id,
    event_type: r.event_type,
    field_name: r.field_name ?? null,
    old_value: r.old_value ?? null,
    new_value: r.new_value ?? null,
    metadata: r.metadata,
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

  // Audit log entry — BEFORE response is returned; non-fatal on failure (per Story 4.2 contract)
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
