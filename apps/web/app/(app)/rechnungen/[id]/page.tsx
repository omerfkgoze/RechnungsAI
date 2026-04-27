import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { Invoice } from "@rechnungsai/shared";
import { createServerClient } from "@/lib/supabase/server";
import { AiDisclaimer } from "@/components/ai/ai-disclaimer";
import { InvoiceDetailPane } from "@/components/invoice/invoice-detail-pane";

export const metadata: Metadata = { title: "Rechnung – RechnungsAI" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?returnTo=/rechnungen/${id}`);
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (!userRow) {
    redirect(`/login?returnTo=/rechnungen/${id}`);
  }
  const tenantId = userRow.tenant_id;

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, status, file_path, file_type, original_filename, invoice_data, extraction_error, extracted_at, created_at, updated_at, skr_code, bu_schluessel, categorization_confidence, approved_at, approved_by, approval_method",
    )
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (!invoice) {
    notFound();
  }

  const invoiceData = invoice.invoice_data as Invoice | null;
  const supplierName = invoiceData?.supplier_name?.value ?? null;

  const [tenantResult, recentCodesResult] = await Promise.all([
    supabase.from("tenants").select("skr_plan").eq("id", tenantId).single(),
    supplierName
      ? supabase
          .from("categorization_corrections")
          .select("corrected_code")
          .eq("tenant_id", tenantId)
          .eq("supplier_name", supplierName)
          .order("created_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] as Array<{ corrected_code: string }> }),
  ]);

  const skrPlan = tenantResult.data?.skr_plan ?? "skr03";

  const seenCodes = new Set<string>();
  const recentSkrCodes: string[] = [];
  for (const row of (recentCodesResult.data ?? [])) {
    const code = (row as { corrected_code: string }).corrected_code;
    if (!seenCodes.has(code)) {
      seenCodes.add(code);
      recentSkrCodes.push(code);
    }
    if (recentSkrCodes.length >= 3) break;
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <AiDisclaimer className="mb-4" />
      <InvoiceDetailPane
        invoiceId={invoice.id}
        status={invoice.status}
        invoice={invoiceData}
        extractionError={invoice.extraction_error}
        updatedAt={invoice.updated_at}
        isExported={invoice.status === "exported"}
        skrCode={invoice.skr_code ?? null}
        buSchluessel={invoice.bu_schluessel ?? null}
        categorizationConfidence={invoice.categorization_confidence ?? null}
        skrPlan={skrPlan}
        recentSkrCodes={recentSkrCodes}
        approvedAt={invoice.approved_at ?? null}
        approvedBy={invoice.approved_by ?? null}
        approvalMethod={invoice.approval_method ?? null}
      />
    </main>
  );
}
