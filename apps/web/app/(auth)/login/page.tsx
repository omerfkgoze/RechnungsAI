import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="grid gap-6">
      <div className="text-center">
        <h1 className="text-h2 text-foreground">Willkommen zurück</h1>
      </div>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
