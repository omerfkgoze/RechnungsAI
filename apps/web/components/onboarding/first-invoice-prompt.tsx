"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { completeFirstInvoiceStep } from "@/app/actions/onboarding";
import { Button } from "@/components/ui/button";

export function FirstInvoicePrompt() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function ack(next: "/erfassen" | "/dashboard") {
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const res = await completeFirstInvoiceStep(next);
      if (!res.success) {
        setError(res.error);
        return;
      }
      router.push(res.data.redirectTo);
    });
  }

  return (
    <section className="flex min-h-[80vh] flex-col items-center justify-center gap-6 text-center">
      <Camera aria-hidden="true" className="size-24 text-primary" />
      <h1 className="text-h1 font-semibold text-foreground">
        Fotografiere jetzt deine erste Rechnung!
      </h1>
      <p className="text-body text-muted-foreground">
        Richte deine Kamera auf eine Rechnung — der Rest geht in wenigen Sekunden.
      </p>

      <div className="flex w-full flex-col gap-3">
        <Button
          type="button"
          onClick={() => ack("/erfassen")}
          disabled={isPending}
          size="lg"
          className="w-full"
        >
          Rechnung aufnehmen
        </Button>
        <Button
          type="button"
          onClick={() => ack("/dashboard")}
          disabled={isPending}
          variant="link"
          className="w-full"
        >
          Das mache ich später
        </Button>
        {error ? (
          <p className="text-body-sm text-destructive mt-1">{error}</p>
        ) : null}
      </div>
    </section>
  );
}
