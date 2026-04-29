"use client";

import { useEffect, useRef, useState } from "react";
import { verifyInvoiceArchive } from "@/app/actions/invoices";

type Props = {
  invoiceId: string;
  sha256: string | null;
};

type Status = "idle" | "pending" | "verified" | "mismatch" | "error";

export function ArchiveIntegrityBadge({ invoiceId, sha256 }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const triggered = useRef(false);

  useEffect(() => {
    if (sha256 === null) return;
    if (triggered.current) return;
    triggered.current = true;
    setStatus("pending");
    verifyInvoiceArchive(invoiceId).then((result) => {
      if (!result.success) {
        setStatus("error");
        return;
      }
      if (result.data.status === "verified") setStatus("verified");
      else if (result.data.status === "mismatch") setStatus("mismatch");
      else setStatus("idle");
    });
  }, [invoiceId, sha256]);

  const shortHash = sha256 ? `SHA-256: …${sha256.slice(-8)}` : null;

  if (sha256 === null) {
    return (
      <span className="text-xs font-mono text-muted-foreground">
        Archiv-Hash nicht verfügbar (Legacy-Upload)
      </span>
    );
  }

  if (status === "pending") {
    return (
      <span className="text-xs font-mono text-primary flex items-center gap-1">
        <svg
          className="animate-spin h-3 w-3"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Integrität wird geprüft…
      </span>
    );
  }

  if (status === "verified") {
    return (
      <span className="text-xs font-mono flex items-center gap-1 bg-success/10 text-success px-2 py-0.5 rounded">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <polyline points="9 12 11 14 15 10" />
        </svg>
        {shortHash} · Archiv unverändert
      </span>
    );
  }

  if (status === "mismatch") {
    return (
      <span className="text-xs font-mono flex items-center gap-1 bg-warning/10 text-warning px-2 py-0.5 rounded">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        {shortHash} · Archiv-Integrität gestört — bitte Support kontaktieren
      </span>
    );
  }

  if (status === "error") {
    return (
      <span className="text-xs font-mono text-destructive">
        Prüfung fehlgeschlagen
      </span>
    );
  }

  return null;
}
