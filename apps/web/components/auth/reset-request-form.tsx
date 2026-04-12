"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  resetRequestSchema,
  type ResetRequestInput,
} from "@rechnungsai/shared";
import { requestPasswordReset } from "@/app/actions/auth";
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

export function ResetRequestForm() {
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<ResetRequestInput>({
    resolver: zodResolver(resetRequestSchema),
    mode: "onBlur",
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ResetRequestInput) {
    await requestPasswordReset(values);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="grid gap-4 rounded-xl border border-border bg-card p-6 text-center">
        <h2 className="text-h3 text-foreground">E-Mail prüfen</h2>
        <p className="text-body-sm text-muted-foreground">
          Falls ein Konto mit dieser E-Mail existiert, haben wir dir einen Link
          geschickt.
        </p>
        <Link
          href="/login"
          className="text-body-sm text-primary hover:underline"
        >
          Zurück zur Anmeldung
        </Link>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid gap-5"
        noValidate
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                E-Mail <span className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="du@firma.de"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          size="lg"
          className="sticky bottom-0 w-full"
          disabled={form.formState.isSubmitting}
        >
          Reset-Link senden
        </Button>

        <p className="text-center text-body-sm text-muted-foreground">
          <Link href="/login" className="text-primary hover:underline">
            Zurück zur Anmeldung
          </Link>
        </p>
      </form>
    </Form>
  );
}
