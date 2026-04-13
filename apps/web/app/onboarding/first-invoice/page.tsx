import type { Metadata } from "next";
import { FirstInvoicePrompt } from "@/components/onboarding/first-invoice-prompt";
import { OnboardingStepper } from "@/components/onboarding/onboarding-stepper";

export const metadata: Metadata = {
  title: "Deine erste Rechnung – RechnungsAI",
};

export default function FirstInvoicePage() {
  return (
    <>
      <OnboardingStepper current="first-invoice" />
      <FirstInvoicePrompt />
    </>
  );
}
