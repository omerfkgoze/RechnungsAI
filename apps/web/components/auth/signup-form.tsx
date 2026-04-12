"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signupSchema, type SignupInput } from "@rechnungsai/shared";
import { signUpWithPassword } from "@/app/actions/auth";
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
import { GoogleOAuthButton } from "@/components/auth/google-oauth-button";

export function SignupForm() {
  const router = useRouter();
  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    mode: "onBlur",
    defaultValues: { email: "", password: "", passwordConfirm: "" },
  });

  async function onSubmit(values: SignupInput) {
    form.clearErrors("root");
    const res = await signUpWithPassword(values);
    if (!res.success) {
      form.setError("root", { message: res.error });
      return;
    }
    router.push("/onboarding/trust");
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
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Passwort <span className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="new-password"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Mindestens 8 Zeichen, davon eine Zahl.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="passwordConfirm"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Passwort bestätigen <span className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="new-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {form.formState.errors.root?.message && (
          <p className="text-destructive text-sm">
            {form.formState.errors.root.message}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          className="sticky bottom-0 w-full"
          disabled={form.formState.isSubmitting}
        >
          Konto erstellen
        </Button>

        <div className="relative my-2 text-center text-body-sm text-muted-foreground">
          <span className="bg-background px-2">oder</span>
          <div className="absolute inset-x-0 top-1/2 -z-10 h-px bg-border" />
        </div>

        <GoogleOAuthButton />

        <p className="text-center text-body-sm text-muted-foreground">
          Du hast schon ein Konto?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Anmelden
          </Link>
        </p>
      </form>
    </Form>
  );
}
