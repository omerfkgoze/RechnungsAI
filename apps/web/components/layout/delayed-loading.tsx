"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type DelayedLoadingProps = {
  children: React.ReactNode;
};

export function DelayedLoading({ children }: DelayedLoadingProps) {
  const router = useRouter();
  const [showDelay, setShowDelay] = useState(false);
  const [showRetry, setShowRetry] = useState(false);

  useEffect(() => {
    const delayTimer = setTimeout(() => setShowDelay(true), 5000);
    const retryTimer = setTimeout(() => setShowRetry(true), 15000);
    return () => {
      clearTimeout(delayTimer);
      clearTimeout(retryTimer);
    };
  }, []);

  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="flex flex-col gap-4"
    >
      {children}
      {showDelay && (
        <p className="text-center text-body-sm text-muted-foreground">
          Dauert etwas länger...
        </p>
      )}
      {showRetry && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.refresh()}
          >
            Nochmal versuchen
          </Button>
        </div>
      )}
    </div>
  );
}
