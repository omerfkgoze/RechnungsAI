import { ResetUpdateForm } from "@/components/auth/reset-update-form";

export default function ResetPasswordUpdatePage() {
  return (
    <div className="grid gap-6">
      <div className="text-center">
        <h1 className="text-h2 text-foreground">Neues Passwort setzen</h1>
      </div>
      <ResetUpdateForm />
    </div>
  );
}
