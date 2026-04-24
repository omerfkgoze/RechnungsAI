"use client";

import { useState } from "react";
import { ConfidenceIndicator } from "./confidence-indicator";
import { SourceDocumentViewer } from "./source-document-viewer";

type Props = {
  invoiceId: string;
  fieldLabel: string;
  aiValue: string;
  isInteractive: boolean;
  confidence: number;
  explanation: string | null;
};

export function SourceDocumentViewerWrapper({
  invoiceId,
  fieldLabel,
  aiValue,
  isInteractive,
  confidence,
  explanation,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <ConfidenceIndicator
        confidence={confidence}
        variant="dot"
        fieldName={fieldLabel}
        explanation={explanation}
        onTap={isInteractive ? () => setOpen(true) : undefined}
      />
      {open && (
        <SourceDocumentViewer
          invoiceId={invoiceId}
          open={open}
          onOpenChange={setOpen}
          fieldLabel={fieldLabel}
          aiValue={aiValue}
        />
      )}
    </>
  );
}
