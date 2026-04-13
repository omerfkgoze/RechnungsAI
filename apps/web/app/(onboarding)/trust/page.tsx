import Link from "next/link";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";

export default function TrustPage() {
  return (
    <EmptyState
      title="Willkommen bei RechnungsAI"
      description="Die Vertrauens-Einführung folgt in Story 1.4."
      action={
        <Button render={<Link href="/dashboard">Weiter</Link>} />
      }
    />
  );
}
