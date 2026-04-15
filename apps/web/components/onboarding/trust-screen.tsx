"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Shield, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const PILLARS: Array<{
  icon: React.ReactNode;
  title: string;
}> = [
  {
    icon: <span aria-hidden="true">🇩🇪</span>,
    title: "Gehostet in Deutschland — Deine Daten verlassen niemals die EU.",
  },
  {
    icon: <ShieldCheck aria-hidden="true" className="size-5 text-primary" />,
    title: "GoBD-konform — Unveränderbare Archivierung für 10 Jahre.",
  },
  {
    icon: <Shield aria-hidden="true" className="size-5 text-primary" />,
    title: "DSGVO-konform — Datenschutz nach deutschem Recht.",
  },
  {
    icon: <Lock aria-hidden="true" className="size-5 text-primary" />,
    title: "Bank-Grade Encryption — AES-256 verschlüsselte Speicherung.",
  },
];

const DISCLAIMER_TEXT =
  "Die von der KI vorgeschlagenen Daten müssen überprüft werden. Die endgültige Verantwortung liegt beim Nutzer.";

// Session-scoped carry so the setup form can forward the user's consent to the
// server. The authoritative acceptance record is written by the
// `complete_onboarding` RPC, which raises `disclaimer_required` if the flag is
// false — so tampering with sessionStorage cannot forge consent.
export const DISCLAIMER_SESSION_KEY = "rechnungsai:ai_disclaimer_accepted";

export function TrustScreen() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);

  function onContinue() {
    try {
      sessionStorage.setItem(DISCLAIMER_SESSION_KEY, "1");
    } catch {
      // sessionStorage may be unavailable (private mode, SSR); non-fatal —
      // the setup form will detect the missing flag and redirect back here.
    }
    router.push("/onboarding/setup");
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="text-center">
        <h1 className="text-h1 font-semibold text-foreground">
          So schützen wir deine Daten
        </h1>
      </header>

      <ul role="list" className="flex flex-col gap-4">
        {PILLARS.map((pillar) => (
          <li
            key={pillar.title}
            className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
          >
            <span className="mt-0.5 flex size-6 items-center justify-center">
              {pillar.icon}
            </span>
            <p className="text-body text-foreground">{pillar.title}</p>
          </li>
        ))}
      </ul>

      <div
        id="ai-disclaimer-body"
        className="rounded-md border-l-4 border-warning bg-warning/10 p-3 text-body-sm text-foreground"
      >
        <strong className="block font-medium">Hinweis zur KI-Nutzung</strong>
        <p className="mt-1">{DISCLAIMER_TEXT}</p>
      </div>

      <label
        htmlFor="ai-disclaimer"
        className="flex items-start gap-3 text-body-sm text-foreground"
      >
        <input
          id="ai-disclaimer"
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          aria-describedby="ai-disclaimer-body"
          className="mt-1 size-4 rounded border-border text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <span>Ich habe den Hinweis gelesen und akzeptiere ihn.</span>
      </label>

      <div className="sticky bottom-0 w-full bg-background pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] md:static md:pt-0 md:pb-0">
        <Button
          type="button"
          onClick={onContinue}
          disabled={!accepted}
          aria-disabled={!accepted}
          title={
            accepted ? undefined : "Bitte bestätige zuerst den Hinweis."
          }
          className="w-full"
          size="lg"
        >
          Weiter
        </Button>
      </div>
    </section>
  );
}
