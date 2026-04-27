"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InvoiceStatus } from "@rechnungsai/shared";
import { Button } from "@/components/ui/button";
import { useActionToast } from "@/components/ui/action-toast-context";
import {
  approveInvoice,
  flagInvoice,
  undoInvoiceAction,
} from "@/app/actions/invoices";
import { SourceDocumentViewer } from "./source-document-viewer";

type Props = {
  invoiceId: string;
  status: InvoiceStatus;
  isExported: boolean;
  approvedAt: string | null;
  approvedBy: string | null;
  approvalMethod: string | null;
};

const APPROVE_LABEL = "Freigeben";
const FLAG_LABEL = "Flaggen";
const VIEW_DOC_LABEL = "Beleg ansehen";

export function InvoiceActionsHeader({
  invoiceId,
  status,
  isExported,
  approvedAt,
  approvedBy,
  approvalMethod,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [viewerOpen, setViewerOpen] = useState(false);
  const { showActionToast } = useActionToast();
  const router = useRouter();

  const isProcessing = status === "captured" || status === "processing";
  const disabled = pending || isExported || isProcessing;

  const captureSnapshot = useCallback(
    () => ({
      status,
      approved_at: approvedAt,
      approved_by: approvedBy,
      approval_method: approvalMethod,
    }),
    [status, approvedAt, approvedBy, approvalMethod],
  );

  const fireUndo = useCallback(
    async (
      snapshot: ReturnType<typeof captureSnapshot>,
      expectedCurrentStatus: InvoiceStatus,
    ) => {
      const result = await undoInvoiceAction({
        invoiceId,
        expectedCurrentStatus,
        snapshot,
      });
      if (result.success) {
        router.refresh();
      } else {
        console.warn("[invoice-actions:undo]", result.error);
      }
    },
    [invoiceId, router],
  );

  const onApprove = useCallback(
    (method: "button" | "keyboard") => {
      const snapshot = captureSnapshot();
      startTransition(async () => {
        const result = await approveInvoice({ invoiceId, method });
        if (!result.success) {
          console.warn("[invoice-actions:approve]", result.error);
          return;
        }
        showActionToast({
          kind: "approved",
          invoiceId,
          message: "Rechnung freigegeben.",
          undo: () => fireUndo(snapshot, "ready"),
        });
        router.refresh();
      });
    },
    [captureSnapshot, fireUndo, invoiceId, router, showActionToast],
  );

  const onFlag = useCallback(
    (method: "button" | "keyboard") => {
      const snapshot = captureSnapshot();
      startTransition(async () => {
        const result = await flagInvoice({ invoiceId, method });
        if (!result.success) {
          console.warn("[invoice-actions:flag]", result.error);
          return;
        }
        showActionToast({
          kind: "flagged",
          invoiceId,
          message: "Zur Prüfung markiert.",
          undo: () => fireUndo(snapshot, "review"),
        });
        router.refresh();
      });
    },
    [captureSnapshot, fireUndo, invoiceId, router, showActionToast],
  );

  // UX-DR16: keyboard shortcut 'A' triggers approve when no input is focused.
  // Scoped to whenever this component is mounted (invoice detail pane visible).
  useEffect(() => {
    if (disabled) return;
    function handler(e: KeyboardEvent) {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() !== "a") return;
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        (active instanceof HTMLElement && active.contentEditable === "true")
      ) {
        return;
      }
      e.preventDefault();
      onApprove("keyboard");
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [disabled, onApprove]);

  return (
    <div
      data-testid="invoice-actions-header"
      data-invoice-actions-header="true"
      className="flex flex-wrap items-center gap-2"
    >
      <Button
        type="button"
        variant="default"
        size="sm"
        disabled={disabled}
        onClick={() => onApprove("button")}
        aria-label={APPROVE_LABEL}
        data-testid="invoice-approve-button"
      >
        {APPROVE_LABEL}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onFlag("button")}
        aria-label={FLAG_LABEL}
        data-testid="invoice-flag-button"
      >
        {FLAG_LABEL}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => setViewerOpen(true)}
        aria-label={VIEW_DOC_LABEL}
        data-testid="invoice-view-document-button"
      >
        📄 {VIEW_DOC_LABEL}
      </Button>
      {viewerOpen && (
        <SourceDocumentViewer
          invoiceId={invoiceId}
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          fieldLabel="Quelldokument"
          aiValue={null}
        />
      )}
    </div>
  );
}
