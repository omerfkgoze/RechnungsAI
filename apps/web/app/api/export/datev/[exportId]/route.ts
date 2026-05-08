import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { toTenantSlug } from "@/app/api/_helpers/filename";

const LOG = "[datev:download]";

const exportIdSchema = z.string().uuid({ message: "Ungültige Export-ID." });

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ exportId: string }> },
): Promise<Response> {
  const { exportId } = await ctx.params;

  const idParse = exportIdSchema.safeParse(exportId);
  if (!idParse.success) {
    return Response.json({ error: "Ungültige Export-ID." }, { status: 400 });
  }

  let supabase: Awaited<ReturnType<typeof createServerClient>>;
  try {
    supabase = await createServerClient();
  } catch (err) {
    Sentry.captureException(err, { tags: { module: "datev", action: "download_export" } });
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

  // P11 — let the DB decide expiry against `now()`. Avoids Node/DB clock-skew
  // and keeps the freshness check authoritative on the database side.
  const nowIso = new Date().toISOString();
  const { data: row, error: rowErr } = await supabase
    .from("datev_exports")
    .select("id, tenant_id, csv, date_from, date_to, expires_at")
    .eq("id", exportId)
    .eq("tenant_id", tenantId)
    .gt("expires_at", nowIso)
    .maybeSingle();

  if (rowErr) {
    console.error(LOG, "select-failed", rowErr);
    Sentry.captureException(rowErr, {
      tags: { module: "datev", action: "download_export" },
      extra: { exportId },
    });
    return Response.json({ error: "Interner Serverfehler." }, { status: 500 });
  }

  if (!row) {
    // 410 if the row exists but has expired; 404 if it never existed or is
    // owned by another tenant. The second query is cheap and only runs when
    // the freshness query came up empty, so the happy path stays single-query.
    const { data: stale } = await supabase
      .from("datev_exports")
      .select("id")
      .eq("id", exportId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (stale) {
      return Response.json(
        { error: "Dieser Export-Link ist abgelaufen. Bitte starte den Export erneut." },
        { status: 410 },
      );
    }
    return Response.json({ error: "Export nicht gefunden." }, { status: 404 });
  }

  // P9 — surface tenant lookup errors instead of silently falling back to
  // "datev-export-export-…" filename.
  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .select("company_name")
    .eq("id", tenantId)
    .single();
  if (tenantErr || !tenant) {
    console.error(LOG, "tenant-lookup-failed", tenantErr);
    Sentry.captureException(tenantErr ?? new Error("tenant lookup failed"), {
      tags: { module: "datev", action: "download_export" },
      extra: { exportId },
    });
    return Response.json({ error: "Interner Serverfehler." }, { status: 500 });
  }
  const tenantSlug = toTenantSlug(tenant.company_name) || "export";

  const filename = `datev-export-${tenantSlug}-${row.date_from}-${row.date_to}.csv`;
  const bytes = new TextEncoder().encode(row.csv);

  // P15 — pass `bytes` directly; the Response constructor accepts Uint8Array
  // and respects the view's byteLength, so a future buffer-slice refactor
  // can't desync the body from Content-Length.
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bytes.byteLength),
      // P8 — financial CSV: never cache, never share via proxies/disk cache.
      "Cache-Control": "private, no-store",
      Pragma: "no-cache",
    },
  });
}
