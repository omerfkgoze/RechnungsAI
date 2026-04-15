import type { Metadata } from "next";
import { SKR_PLANS, type SkrPlan } from "@rechnungsai/shared";
import { createServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/layout/empty-state";
import { TenantSettingsForm } from "@/components/settings/tenant-settings-form";

export const metadata: Metadata = {
  title: "Einstellungen – RechnungsAI",
};

export default async function EinstellungenPage() {
  const supabase = await createServerClient();

  const { data: tenant, error } = await supabase
    .from("tenants")
    .select(
      "company_name, company_address, tax_id, skr_plan, steuerberater_name, datev_berater_nr, datev_mandanten_nr, datev_sachkontenlaenge, datev_fiscal_year_start",
    )
    .single();

  if (error || !tenant) {
    console.error("[settings:load]", error);
    return (
      <EmptyState
        title="Einstellungen nicht verfügbar"
        description="Die Einstellungen konnten nicht geladen werden. Bitte lade die Seite neu."
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6">
        <h1 className="text-h1 font-semibold text-foreground">Einstellungen</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Verwalte deine Unternehmensdaten und DATEV-Konfiguration.
        </p>
      </header>
      <TenantSettingsForm
        defaultValues={{
          company_name: tenant.company_name ?? "",
          company_address: tenant.company_address ?? "",
          tax_id: tenant.tax_id ?? "",
          skr_plan: (SKR_PLANS as readonly string[]).includes(tenant.skr_plan)
            ? (tenant.skr_plan as SkrPlan)
            : "SKR03",
          steuerberater_name: tenant.steuerberater_name ?? "",
          datev_berater_nr: tenant.datev_berater_nr ?? "",
          datev_mandanten_nr: tenant.datev_mandanten_nr ?? "",
          datev_sachkontenlaenge: tenant.datev_sachkontenlaenge ?? 4,
          datev_fiscal_year_start: tenant.datev_fiscal_year_start ?? 1,
        }}
      />
    </div>
  );
}
