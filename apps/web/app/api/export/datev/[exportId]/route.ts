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

  const { data: row, error: rowErr } = await supabase
    .from("datev_exports")
    .select("id, tenant_id, csv, date_from, date_to, expires_at")
    .eq("id", exportId)
    .eq("tenant_id", tenantId)
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
    return Response.json({ error: "Export nicht gefunden." }, { status: 404 });
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return Response.json(
      { error: "Dieser Export-Link ist abgelaufen. Bitte starte den Export erneut." },
      { status: 410 },
    );
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("company_name")
    .eq("id", tenantId)
    .single();
  const tenantSlug = toTenantSlug(tenant?.company_name ?? "export");

  const filename = `datev-export-${tenantSlug}-${row.date_from}-${row.date_to}.csv`;
  const bytes = new TextEncoder().encode(row.csv);

  return new Response(bytes.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bytes.byteLength),
    },
  });
}
