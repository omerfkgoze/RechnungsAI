"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { SwipeActionWrapper } from "@/components/invoice/swipe-action-wrapper";
import { useActionToast } from "@/components/ui/action-toast-context";
import {
  approveInvoice,
  flagInvoice,
  undoInvoiceAction,
} from "@/app/actions/invoices";
import type { InvoiceStatus } from "@/lib/status-labels";

type Props = {
  invoiceId: string;
  status: InvoiceStatus;
  approvedAt: string | null;
  approvedBy: string | null;
  approvalMethod: string | null;
  children: React.ReactNode;
};

export function InvoiceListCardSwipeWrapper({
  invoiceId,
  status,
  approvedAt,
  approvedBy,
  approvalMethod,
  children,
}: Props) {
  const router = useRouter();
  const { showActionToast } = useActionToast();

  const fireUndo = useCallback(
    async (
      snapshot: {
        status: InvoiceStatus;
        approved_at: string | null;
        approved_by: string | null;
        approval_method: string | null;
      },
      expectedCurrentStatus: InvoiceStatus,
    ) => {
      const result = await undoInvoiceAction({
        invoiceId,
        expectedCurrentStatus,
        snapshot,
      });
      if (result.success) router.refresh();
    },
    [invoiceId, router],
  );

  const onSwipeRight = useCallback(async () => {
    const snapshot = { status, approved_at: approvedAt, approved_by: approvedBy, approval_method: approvalMethod };
    const result = await approveInvoice({ invoiceId, method: "swipe" });
    if (!result.success) {
      console.warn("[invoice-list:approve]", result.error);
      return;
    }
    showActionToast({
      kind: "approved",
      invoiceId,
      message: "Rechnung freigegeben.",
      undo: () => fireUndo(snapshot, "ready"),
    });
    router.refresh();
  }, [approvalMethod, approvedAt, approvedBy, fireUndo, invoiceId, router, showActionToast, status]);

  const onSwipeLeft = useCallback(async () => {
    const snapshot = { status, approved_at: approvedAt, approved_by: approvedBy, approval_method: approvalMethod };
    const result = await flagInvoice({ invoiceId, method: "swipe" });
    if (!result.success) {
      console.warn("[invoice-list:flag]", result.error);
      return;
    }
    showActionToast({
      kind: "flagged",
      invoiceId,
      message: "Zur Prüfung markiert.",
      undo: () => fireUndo(snapshot, "review"),
    });
    router.refresh();
  }, [approvalMethod, approvedAt, approvedBy, fireUndo, invoiceId, router, showActionToast, status]);

  // Only ready/review rows participate in swipe; others render raw children.
  if (status !== "ready" && status !== "review") {
    return <>{children}</>;
  }

  return (
    <SwipeActionWrapper onSwipeRight={onSwipeRight} onSwipeLeft={onSwipeLeft}>
      {children}
    </SwipeActionWrapper>
  );
}
