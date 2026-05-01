"use client";

import { useTransition } from "react";

type AuditExportButtonProps = {
  selectedIds: string[];
};

export function AuditExportButton({ selectedIds }: AuditExportButtonProps) {
  const [isPending, startTransition] = useTransition();

  const count = selectedIds.length;
  const disabled = count === 0 || count > 500 || isPending;

  const handleExport = () => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/archive/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceIds: selectedIds }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          console.error("[audit-export] export failed", body.error);
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
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error("[audit-export] unexpected error", err);
      }
    });
  };

  return (
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
  );
}
