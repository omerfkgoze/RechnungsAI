import type { Metadata } from "next";
import { OnboardingStepper } from "@/components/onboarding/onboarding-stepper";
import { TrustScreen } from "@/components/onboarding/trust-screen";

export const metadata: Metadata = {
  title: "So schützen wir deine Daten – RechnungsAI",
};

export default function TrustPage() {
  return (
    <>
      <OnboardingStepper current="trust" />
      <TrustScreen />
    </>
  );
}
