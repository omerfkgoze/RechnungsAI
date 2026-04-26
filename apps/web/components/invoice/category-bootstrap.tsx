"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { InvoiceStatus } from "@rechnungsai/shared";
import { categorizeInvoice } from "@/app/actions/invoices";

type Props = {
  invoiceId: string;
  skrCode: string | null;
  status: InvoiceStatus;
};

export function CategoryBootstrap({ invoiceId, skrCode, status }: Props) {
  const router = useRouter();
  const triggeredRef = useRef(false);

  const trigger = useCallback(() => {
    categorizeInvoice(invoiceId).then((result) => {
      if (result.success) {
        router.refresh();
      }
    });
  }, [invoiceId, router]);

  useEffect(() => {
    if (
      skrCode === null &&
      (status === "ready" || status === "review") &&
      !triggeredRef.current
    ) {
      triggeredRef.current = true;
      trigger();
    }
  }, [skrCode, status, trigger]);

  return null;
}
