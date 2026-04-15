"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Resolver } from "react-hook-form";
import {
  tenantSettingsSchema,
  type TenantSettingsInput,
} from "@rechnungsai/shared";
import { updateTenantSettings } from "@/app/actions/tenant";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const GERMAN_MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
] as const;

type Props = {
  defaultValues: TenantSettingsInput;
};

export function TenantSettingsForm({ defaultValues }: Props) {
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // zodResolver's inferred type does not line up with TenantSettingsInput because
  // the schema uses z.coerce.number() + transforms (input is string, output is
  // number/null). Cast to Resolver<TenantSettingsInput> once, explicitly — the
  // runtime behavior is correct and tested via the submit path.
  const form = useForm<TenantSettingsInput>({
    resolver: zodResolver(tenantSettingsSchema) as Resolver<TenantSettingsInput>,
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues,
  });

  const skrValue = form.watch("skr_plan");
  const isSubmitting = form.formState.isSubmitting;

  async function submit(values: TenantSettingsInput) {
    form.clearErrors("root");
    setSavedAt(null);
    const res = await updateTenantSettings(values);
    if (!res.success) {
      form.setError("root", { message: res.error });
      return;
    }
    // Re-seed the form with the schema-normalized values so subsequent edits
    // compare against what is actually persisted (uppercased tax_id,
    // whitespace-stripped VAT ID, trimmed company_name).
    const parsed = tenantSettingsSchema.safeParse(values);
    if (parsed.success) {
      form.reset(
        {
          company_name: parsed.data.company_name,
          skr_plan: parsed.data.skr_plan,
          company_address: parsed.data.company_address ?? "",
          tax_id: parsed.data.tax_id ?? "",
          steuerberater_name: parsed.data.steuerberater_name ?? "",
          datev_berater_nr: parsed.data.datev_berater_nr ?? "",
          datev_mandanten_nr: parsed.data.datev_mandanten_nr ?? "",
          datev_sachkontenlaenge: parsed.data.datev_sachkontenlaenge,
          datev_fiscal_year_start: parsed.data.datev_fiscal_year_start,
        },
        { keepDirty: false, keepErrors: false },
      );
    }
    setSavedAt(res.data.updatedAt);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-4">
        {/* Required section — always visible */}
        <FormField
          control={form.control}
          name="company_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Firmenname{" "}
                <span aria-hidden="true" className="text-muted-foreground">
                  *
                </span>
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="z. B. Mustermann GmbH"
                  autoComplete="organization"
                  maxLength={100}
                  aria-required="true"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="skr_plan"
          render={() => (
            <FormItem>
              <FormLabel>
                Kontenrahmen{" "}
                <span aria-hidden="true" className="text-muted-foreground">
                  *
                </span>
              </FormLabel>
              <div role="radiogroup" aria-label="Kontenrahmen" className="flex gap-2">
                {(["SKR03", "SKR04"] as const).map((value) => {
                  const pressed = skrValue === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={pressed}
                      onClick={() =>
                        form.setValue("skr_plan", value, {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2 text-body-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        pressed
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground hover:bg-muted",
                      )}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Accordion — optional fields */}
        <details className="rounded-lg border border-border">
          <summary className="cursor-pointer select-none rounded-lg px-4 py-3 text-body-sm font-medium text-foreground hover:bg-muted">
            Weitere Angaben
          </summary>
          <div className="flex flex-col gap-4 px-4 pb-4 pt-2">
            <FormField
              control={form.control}
              name="company_address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unternehmensadresse</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Musterstraße 1, 12345 Musterstadt"
                      maxLength={500}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tax_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>USt-IdNr.</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder="DE123456789"
                      maxLength={11}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="steuerberater_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Steuerberater (optional)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Vorname Nachname"
                      maxLength={100}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <h3 className="mt-2 text-body-sm font-semibold text-foreground">
              DATEV-Konfiguration
            </h3>

            <FormField
              control={form.control}
              name="datev_berater_nr"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Berater-Nr.</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder="z. B. 12345"
                      maxLength={7}
                      inputMode="numeric"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="datev_mandanten_nr"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mandanten-Nr.</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder="z. B. 67890"
                      maxLength={5}
                      inputMode="numeric"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="datev_sachkontenlaenge"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sachkontenlänge</FormLabel>
                  <FormControl>
                    <select
                      {...field}
                      value={String(field.value)}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-body-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {[4, 5, 6, 7, 8].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="datev_fiscal_year_start"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Geschäftsjahr-Beginn</FormLabel>
                  <FormControl>
                    <select
                      {...field}
                      value={String(field.value)}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-body-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {GERMAN_MONTHS.map((month, idx) => (
                        <option key={idx + 1} value={idx + 1}>
                          {month}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </details>

        {/* Root-level error */}
        {form.formState.errors.root?.message ? (
          <p className="text-destructive text-sm mt-2">
            {form.formState.errors.root.message}
          </p>
        ) : null}

        {/* Success feedback */}
        {savedAt && !form.formState.errors.root && (
          <p className="text-body-sm text-muted-foreground mt-1">
            Gespeichert · gerade eben
          </p>
        )}

        {/* Sticky submit button with iOS safe-area inset */}
        <div className="sticky bottom-0 w-full bg-background pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] md:static md:pt-0 md:pb-0">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full"
            size="lg"
          >
            {isSubmitting ? "Wird gespeichert…" : "Speichern"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
