import type { Metadata } from "next";
import { SKR_PLANS, type SkrPlan } from "@rechnungsai/shared";
import { createServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/layout/empty-state";
import { TenantSettingsForm } from "@/components/settings/tenant-settings-form";
import { VerdokSection } from "@/components/settings/verdok-section";
import { toTenantSlug } from "@/app/api/_helpers/filename";

export const metadata: Metadata = {
  title: "Einstellungen – RechnungsAI",
};

export default async function EinstellungenPage() {
  const supabase = await createServerClient();

  const { data: tenant, error } = await supabase
    .from("tenants")
    .select(
      "id, company_name, company_address, tax_id, skr_plan, steuerberater_name, steuerberater_email, datev_berater_nr, datev_mandanten_nr, datev_sachkontenlaenge, datev_fiscal_year_start, datev_default_kreditorenkonto",
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

  // AC7 mandatory fields — render the document only when all are present.
  // Must mirror the server-side guard in generateVerdok() (incl. the DATEV
  // numeric validity checks) so the UI never offers a button that the
  // Server Action would reject.
  const hasRequiredSettings = Boolean(
    tenant.company_name?.trim() &&
      tenant.company_address?.trim() &&
      tenant.tax_id?.trim() &&
      tenant.datev_berater_nr?.trim() &&
      tenant.datev_mandanten_nr?.trim() &&
      typeof tenant.datev_sachkontenlaenge === "number" &&
      typeof tenant.datev_fiscal_year_start === "number" &&
      tenant.datev_fiscal_year_start >= 1 &&
      tenant.datev_fiscal_year_start <= 12,
  );
  const companySlug = toTenantSlug(tenant.company_name ?? "") || "unternehmen";

  // Explicit tenant scoping in addition to RLS — matches the download Route
  // Handler's "never trust RLS alone" defense-in-depth posture.
  const { data: verdokRow } = await supabase
    .from("verfahrensdokumentation")
    .select("id, generated_at")
    .eq("tenant_id", tenant.id)
    .maybeSingle();

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
          steuerberater_email: tenant.steuerberater_email ?? "",
          datev_berater_nr: tenant.datev_berater_nr ?? "",
          datev_mandanten_nr: tenant.datev_mandanten_nr ?? "",
          datev_sachkontenlaenge: tenant.datev_sachkontenlaenge ?? 4,
          datev_fiscal_year_start: tenant.datev_fiscal_year_start ?? 1,
          datev_default_kreditorenkonto: tenant.datev_default_kreditorenkonto ?? "",
        }}
      />
      <VerdokSection
        hasRequiredSettings={hasRequiredSettings}
        companySlug={companySlug}
        existing={
          verdokRow
            ? { id: verdokRow.id, generatedAt: verdokRow.generated_at }
            : null
        }
      />
    </div>
  );
}
