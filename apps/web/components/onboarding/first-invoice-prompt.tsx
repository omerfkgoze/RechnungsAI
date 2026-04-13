import Link from "next/link";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FirstInvoicePrompt() {
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
        {/* TODO: Epic 2 Story 2.1 implements /capture — until then this link will 404 in dev; dashboard fallback is primary. */}
        <Button
          nativeButton={false}
          render={<Link href="/capture">Rechnung aufnehmen</Link>}
          size="lg"
          className="w-full"
        />
        <Button
          nativeButton={false}
          render={<Link href="/dashboard">Das mache ich später</Link>}
          variant="link"
          className="w-full"
        />
      </div>
    </section>
  );
}
