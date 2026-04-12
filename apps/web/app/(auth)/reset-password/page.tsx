import { ResetRequestForm } from "@/components/auth/reset-request-form";

export default function ResetPasswordPage() {
  return (
    <div className="grid gap-6">
      <div className="text-center">
        <h1 className="text-h2 text-foreground">Passwort zurücksetzen</h1>
        <p className="mt-2 text-body-sm text-muted-foreground">
          Wir schicken dir einen Link per E-Mail.
        </p>
      </div>
      <ResetRequestForm />
    </div>
  );
}
