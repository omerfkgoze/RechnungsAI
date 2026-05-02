"use client";

import * as Sentry from "@sentry/nextjs";
import { useState, useTransition } from "react";

type AuditExportButtonProps = {
  selectedIds: string[];
};

export function AuditExportButton({ selectedIds }: AuditExportButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const count = selectedIds.length;
  const disabled = count === 0 || count > 500 || isPending;

  const handleExport = () => {
    setErrorMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/archive/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceIds: selectedIds }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          const msg = body.error ?? "Export fehlgeschlagen. Bitte erneut versuchen.";
          setErrorMsg(msg);
          Sentry.captureMessage(`[audit-export] export failed: ${msg}`, { level: "error" });
          return;
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const disposition = res.headers.get("Content-Disposition") ?? "";
        const filenameMatch = /filename="([^"]+)"/.exec(disposition);
        const filename = filenameMatch?.[1] ?? "audit-export.zip";

        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Defer revoke so Safari/Chromium can complete the download before the blob URL is freed.
        setTimeout(() => URL.revokeObjectURL(url), 0);
      } catch (err) {
        const msg = "Unerwarteter Fehler beim Export.";
        setErrorMsg(msg);
        Sentry.captureException(err, { tags: { module: "gobd", action: "export_audit" } });
      }
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={handleExport}
        aria-label={
          count === 0
            ? "Keine Rechnungen ausgewählt"
            : count > 500
              ? "Maximal 500 Rechnungen pro Export"
              : `${count} Rechnung${count === 1 ? "" : "en"} exportieren`
        }
        className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-body-sm text-primary-foreground disabled:opacity-40"
      >
        {isPending ? "Wird exportiert…" : count > 0 ? `${count} exportieren` : "Exportieren"}
      </button>
      {errorMsg && (
        <p role="alert" className="text-caption text-destructive">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
