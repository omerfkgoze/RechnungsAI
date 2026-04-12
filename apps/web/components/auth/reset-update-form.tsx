"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  resetUpdateSchema,
  type ResetUpdateInput,
} from "@rechnungsai/shared";
import { updatePasswordAfterRecovery } from "@/app/actions/auth";
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

export function ResetUpdateForm() {
  const router = useRouter();
  const form = useForm<ResetUpdateInput>({
    resolver: zodResolver(resetUpdateSchema),
    mode: "onBlur",
    defaultValues: { password: "", passwordConfirm: "" },
  });

  async function onSubmit(values: ResetUpdateInput) {
    form.clearErrors("root");
    const res = await updatePasswordAfterRecovery(values);
    if (!res.success) {
      form.setError("root", { message: res.error });
      return;
    }
    router.push("/dashboard");
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
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Neues Passwort <span className="text-destructive">*</span>
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
          Passwort speichern
        </Button>
      </form>
    </Form>
  );
}
