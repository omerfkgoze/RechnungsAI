"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  onboardingSetupSchema,
  type OnboardingSetupInput,
} from "@rechnungsai/shared";
import { completeOnboarding } from "@/app/actions/onboarding";
import { DISCLAIMER_SESSION_KEY } from "./trust-screen";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function SetupForm() {
  const router = useRouter();
  const [disclaimerAccepted, setDisclaimerAccepted] = useState<boolean | null>(
    null,
  );
  const [isSkipping, setIsSkipping] = useState(false);

  useEffect(() => {
    try {
      setDisclaimerAccepted(
        sessionStorage.getItem(DISCLAIMER_SESSION_KEY) === "1",
      );
    } catch {
      setDisclaimerAccepted(false);
    }
  }, []);

  const form = useForm<OnboardingSetupInput>({
    resolver: zodResolver(onboardingSetupSchema) as unknown as import(
      "react-hook-form"
    ).Resolver<OnboardingSetupInput>,
    mode: "onBlur",
    defaultValues: {
      disclaimer_accepted: true,
      company_name: "",
      skr_plan: "SKR03",
      steuerberater_name: "",
    },
  });

  const skrValue = form.watch("skr_plan");
  const isSubmitting = form.formState.isSubmitting || isSkipping;

  // If the user landed here without going through the Trust Screen, bounce
  // back — they must tick the disclaimer. The RPC enforces this server-side
  // too; this is the UX path.
  useEffect(() => {
    if (disclaimerAccepted === false) {
      router.replace("/onboarding/trust");
    }
  }, [disclaimerAccepted, router]);

  async function submit(values: OnboardingSetupInput) {
    form.clearErrors("root");
    try {
      const res = await completeOnboarding({
        ...values,
        disclaimer_accepted: true,
      });
      if (!res.success) {
        form.setError("root", { message: res.error });
        return;
      }
      router.push(res.data.redirectTo);
    } catch (err) {
      console.error("[onboarding:setup-form]", err);
      form.setError("root", {
        message: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
      });
    }
  }

  async function skip() {
    if (isSubmitting) return;
    setIsSkipping(true);
    form.clearErrors("root");
    try {
      // Preserve whatever the user already typed rather than silently
      // overwriting with a placeholder.
      const typed = form.getValues("company_name").trim();
      const res = await completeOnboarding({
        disclaimer_accepted: true,
        company_name: typed.length >= 2 ? typed : "Mein Unternehmen",
        skr_plan: form.getValues("skr_plan") ?? "SKR03",
        steuerberater_name: "",
      });
      if (!res.success) {
        form.setError("root", { message: res.error });
        return;
      }
      router.push(res.data.redirectTo);
    } catch (err) {
      console.error("[onboarding:setup-form:skip]", err);
      form.setError("root", {
        message: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
      });
    } finally {
      setIsSkipping(false);
    }
  }

  // Avoid rendering the form while we're still hydrating the disclaimer flag.
  if (disclaimerAccepted === null) {
    return null;
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="text-center">
        <h1 className="text-h1 font-semibold text-foreground">
          Dein Unternehmen
        </h1>
        <p className="mt-2 text-body-sm text-muted-foreground">
          Nur drei Angaben — den Rest kannst du später ergänzen.
        </p>
      </header>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="company_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Firmenname <span aria-hidden="true" className="text-muted-foreground">*</span>
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
                  Kontenrahmen <span aria-hidden="true" className="text-muted-foreground">*</span>
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
                <FormDescription>
                  Nicht sicher? SKR03 ist der gängige Standard für kleine Betriebe.
                </FormDescription>
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
                    placeholder="Vorname Nachname"
                    autoComplete="name"
                    maxLength={100}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {form.formState.errors.root?.message ? (
            <p className="text-body-sm text-destructive mt-2">
              {form.formState.errors.root.message}
            </p>
          ) : null}

          <div className="sticky bottom-0 w-full bg-background pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] md:static md:pt-0 md:pb-0">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full"
              size="lg"
            >
              {isSubmitting ? "Wird gespeichert…" : "Weiter"}
            </Button>
            <button
              type="button"
              onClick={skip}
              disabled={isSubmitting}
              className="mt-3 block w-full text-center text-body-sm text-primary underline-offset-4 hover:underline disabled:opacity-50"
            >
              Später ergänzen
            </button>
          </div>
        </form>
      </Form>
    </section>
  );
}
