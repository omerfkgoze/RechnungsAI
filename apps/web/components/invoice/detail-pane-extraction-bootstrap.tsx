"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { InvoiceStatus } from "@rechnungsai/shared";
import { extractInvoice } from "@/app/actions/invoices";

type Props = {
  invoiceId: string;
  status: InvoiceStatus;
  extractionError: string | null;
};

export function DetailPaneExtractionBootstrap({ invoiceId, status, extractionError }: Props) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(extractionError);
  const triggeredRef = useRef(false);

  const trigger = useCallback(() => {
    setError(null);
    setIsPending(true);
    extractInvoice(invoiceId).then((result) => {
      setIsPending(false);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }, [invoiceId, router]);

  useEffect(() => {
    if (error && !extractionError) setError(null);
  }, [extractionError, error]);

  useEffect(() => {
    if (status === "captured" && !triggeredRef.current && !error) {
      triggeredRef.current = true;
      trigger();
    }
  }, [status, error, trigger]);

  if (!error && !isPending) return null;

  return (
    <div aria-busy={isPending}>
      {error ? (
        <div className="mb-4 rounded border border-destructive bg-destructive/10 p-3 text-destructive text-sm">
          Extraktion fehlgeschlagen — {error}.{" "}
          <button
            type="button"
            onClick={trigger}
            disabled={isPending}
            className="underline font-medium disabled:opacity-50"
          >
            Erneut versuchen
          </button>
        </div>
      ) : null}
    </div>
  );
}
