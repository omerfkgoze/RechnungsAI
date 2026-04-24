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

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, status, file_path, file_type, original_filename, invoice_data, extraction_error, extracted_at, created_at, updated_at",
    )
    .eq("id", id)
    .single();

  if (!invoice) {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <AiDisclaimer className="mb-4" />
      <InvoiceDetailPane
        invoiceId={invoice.id}
        status={invoice.status}
        invoice={(invoice.invoice_data as unknown as Invoice | null) ?? null}
        extractionError={invoice.extraction_error}
        updatedAt={invoice.updated_at}
        isExported={invoice.status === "exported"}
      />
    </main>
  );
}
