import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <div className="grid gap-6">
      <div className="text-center">
        <h1 className="text-h2 text-foreground">Konto erstellen</h1>
        <p className="mt-2 text-body-sm text-muted-foreground">
          Starte kostenlos. Keine Kreditkarte nötig.
        </p>
      </div>
      <SignupForm />
    </div>
  );
}
