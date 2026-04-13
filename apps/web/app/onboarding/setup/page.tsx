import type { Metadata } from "next";
import { OnboardingStepper } from "@/components/onboarding/onboarding-stepper";
import { SetupForm } from "@/components/onboarding/setup-form";

export const metadata: Metadata = {
  title: "Dein Unternehmen einrichten – RechnungsAI",
};

export default function SetupPage() {
  return (
    <>
      <OnboardingStepper current="setup" />
      <SetupForm />
    </>
  );
}
