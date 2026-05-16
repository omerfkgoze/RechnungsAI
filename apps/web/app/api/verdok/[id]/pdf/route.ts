import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { toTenantSlug } from "@/app/api/_helpers/filename";
import { logAuditEvent } from "@/app/actions/invoices/shared";

export const dynamic = "force-dynamic";
// Never Edge — the stored PDF is streamed through the Node.js runtime and the
// audit helper uses the Node Supabase client (spike P1, F-2).
export const runtime = "nodejs";

const LOG = "[verdok:download]";

const idSchema = z.string().uuid({ message: "Ungültige Dokument-ID." });

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;

  const idParse = idSchema.safeParse(id);
  if (!idParse.success) {
    return Response.json({ error: "Ungültige Dokument-ID." }, { status: 400 });
  }

  let supabase: Awaited<ReturnType<typeof createServerClient>>;
  try {
    supabase = await createServerClient();
  } catch (err) {
    Sentry.captureException(err, { tags: { module: "verdok", action: "download" } });
    return Response.json({ error: "Interner Serverfehler." }, { status: 500 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (!userRow) {
    return Response.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }
  const tenantId = userRow.tenant_id;

  // F-8 — tenant isolation: filter by BOTH id and the caller's tenant_id.
  // Never trust the [id] path param alone. RLS is a second gate; this is the
  // first. A foreign id resolves to 0 rows → 404 (no existence leak).
  const { data: row, error: rowErr } = await supabase
    .from("verfahrensdokumentation")
    .select("id, pdf_storage_path, generated_at")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (rowErr) {
    console.error(LOG, "select-failed", rowErr);
    Sentry.captureException(rowErr, {
      tags: { module: "verdok", action: "download" },
      extra: { id },
    });
    return Response.json({ error: "Interner Serverfehler." }, { status: 500 });
  }
  if (!row) {
    return Response.json({ error: "Dokument nicht gefunden." }, { status: 404 });
  }

  const { data: blob, error: dlErr } = await supabase.storage
    .from("verfahrensdokumentation")
    .download(row.pdf_storage_path);
  if (dlErr || !blob) {
    console.error(LOG, "storage-download-failed", dlErr);
    Sentry.captureException(dlErr ?? new Error("verdok storage download failed"), {
      tags: { module: "verdok", action: "download" },
      extra: { id },
    });
    return Response.json({ error: "Interner Serverfehler." }, { status: 500 });
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());

  const { data: tenant } = await supabase
    .from("tenants")
    .select("company_name")
    .eq("id", tenantId)
    .single();
  const slug = toTenantSlug(tenant?.company_name ?? "") || "unternehmen";
  const datePart = row.generated_at.slice(0, 10);
  const filename = `Verfahrensdokumentation_${slug}_${datePart}.pdf`;

  // F-10 — download audit is best-effort: it must never block or fail the
  // binary response. logAuditEvent already swallows its own errors (Sentry),
  // and we additionally wrap the call so a thrown error can't escape.
  try {
    await logAuditEvent(supabase, {
      tenantId,
      invoiceId: null,
      actorUserId: user.id,
      eventType: "verdok_generated",
      metadata: { action: "download", verdok_id: id },
    });
  } catch (auditErr) {
    Sentry.captureException(auditErr, {
      tags: { module: "verdok", action: "download_audit" },
    });
  }

  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, no-store",
      Pragma: "no-cache",
    },
  });
}
