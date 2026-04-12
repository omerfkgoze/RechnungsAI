"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@rechnungsai/shared";
import { signInWithPassword } from "@/app/actions/auth";
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
import { GoogleOAuthButton } from "@/components/auth/google-oauth-button";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: "onBlur",
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginInput) {
    form.clearErrors("root");
    const res = await signInWithPassword(values);
    if (!res.success) {
      form.setError("root", { message: res.error });
      return;
    }
    const target = next && next.startsWith("/") ? next : "/dashboard";
    router.push(target);
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
              <div className="flex items-center justify-between">
                <FormLabel>
                  Passwort <span className="text-destructive">*</span>
                </FormLabel>
                <Link
                  href="/reset-password"
                  className="text-body-sm text-primary hover:underline"
                >
                  Passwort vergessen?
                </Link>
              </div>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="current-password"
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
          Anmelden
        </Button>

        <div className="relative my-2 text-center text-body-sm text-muted-foreground">
          <span className="bg-background px-2">oder</span>
          <div className="absolute inset-x-0 top-1/2 -z-10 h-px bg-border" />
        </div>

        <GoogleOAuthButton />

        <p className="text-center text-body-sm text-muted-foreground">
          Noch kein Konto?{" "}
          <Link href="/signup" className="text-primary hover:underline">
            Registrieren
          </Link>
        </p>
      </form>
    </Form>
  );
}
