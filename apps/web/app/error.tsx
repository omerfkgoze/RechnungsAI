"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/empty-state";

export default function RootError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[layout:error]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <EmptyState
        title="Etwas ist schiefgelaufen"
        description="Bitte lade die Seite neu oder versuche es gleich noch einmal."
        action={
          <Button size="lg" onClick={() => unstable_retry()}>
            Erneut versuchen
          </Button>
        }
      />
    </div>
  );
}
