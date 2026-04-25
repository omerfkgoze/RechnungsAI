"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getInvoiceSignedUrl } from "@/app/actions/invoices";

const XML_SIZE_LIMIT = 50 * 1024; // 50 KB

type Props = {
  invoiceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fieldLabel?: string;
  aiValue?: string | null;
  correctedValue?: string | null;
};

type UrlState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; url: string; fileType: string; fetchedAt: number }
  | { status: "error"; message: string };

function DocBody({ url, fileType }: { url: string; fileType: string }) {
  const [xmlContent, setXmlContent] = useState<string | null>(null);
  const [xmlTruncated, setXmlTruncated] = useState(false);

  useEffect(() => {
    if (!fileType.includes("xml")) return;
    fetch(url)
      .then((r) => r.text())
      .then((text) => {
        if (text.length > XML_SIZE_LIMIT) {
          setXmlTruncated(true);
          setXmlContent(text.slice(0, XML_SIZE_LIMIT));
        } else {
          setXmlContent(text);
        }
      })
      .catch(() => setXmlContent(null));
  }, [url, fileType]);

  if (fileType.startsWith("image/")) {
    return (
      <div className="flex-1 overflow-auto" style={{ touchAction: "manipulation" }}>
        <img
          src={url}
          alt="Quelldokument"
          className="max-w-full h-auto"
        />
      </div>
    );
  }

  if (fileType === "application/pdf") {
    return (
      <div className="flex-1 overflow-hidden">
        <object
          data={url}
          type="application/pdf"
          className="h-[80vh] w-full"
        >
          <a href={url} download className="text-primary underline text-sm">
            PDF herunterladen
          </a>
        </object>
      </div>
    );
  }

  if (fileType.includes("xml")) {
    if (xmlContent === null) {
      return <p className="text-sm text-muted-foreground">XML wird geladen…</p>;
    }
    return (
      <div className="flex-1 overflow-auto">
        {xmlTruncated && (
          <p className="mb-2 text-xs text-warning">
            Vorschau zu groß — nur die ersten 50 KB werden angezeigt.{" "}
            <a href={url} download className="underline">
              Datei herunterladen
            </a>
          </p>
        )}
        <pre className="text-xs whitespace-pre-wrap break-all">{xmlContent}</pre>
      </div>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      Dokumentvorschau nicht verfügbar.{" "}
      <a href={url} download className="text-primary underline">
        Herunterladen
      </a>
    </p>
  );
}

export function SourceDocumentViewer({
  invoiceId,
  open,
  onOpenChange,
  fieldLabel,
  aiValue,
  correctedValue,
}: Props) {
  const [urlState, setUrlState] = useState<UrlState>({ status: "idle" });
  const openedOnce = useRef(false);
  // Dynamically set sheet side: bottom on mobile, right on md+ (≥768px).
  const [side, setSide] = useState<"bottom" | "right">("bottom");

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setSide(mq.matches ? "right" : "bottom");
    const handler = (e: MediaQueryListEvent) => setSide(e.matches ? "right" : "bottom");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (openedOnce.current) {
      // Re-use cached URL if still within TTL (55 s).
      if (urlState.status === "ready" && Date.now() - urlState.fetchedAt < 55_000) return;
    }
    openedOnce.current = true;
    setUrlState({ status: "loading" });
    getInvoiceSignedUrl(invoiceId).then((result) => {
      if (result.success) {
        setUrlState({
          status: "ready",
          url: result.data.url,
          fileType: result.data.fileType,
          fetchedAt: Date.now(),
        });
      } else {
        setUrlState({ status: "error", message: result.error });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* showCloseButton={false}: we render our own close button in the header */}
      <SheetContent
        side={side}
        showCloseButton={false}
        className="flex flex-col overflow-hidden p-0 max-h-[90vh] data-[side=right]:max-h-none"
      >
        <SheetHeader className="px-4 pt-4 pb-2 border-b shrink-0 flex-row items-center justify-between">
          <SheetTitle>Quelldokument</SheetTitle>
          <button
            type="button"
            aria-label="Schließen"
            onClick={() => onOpenChange(false)}
            className="rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            ✕
          </button>
        </SheetHeader>

        <div className="flex-1 overflow-auto px-4 py-4 flex flex-col gap-4">
          {urlState.status === "loading" && (
            <p className="text-sm text-muted-foreground">Wird geladen…</p>
          )}
          {urlState.status === "error" && (
            <p className="text-sm text-destructive">{urlState.message}</p>
          )}
          {urlState.status === "ready" && (
            <DocBody url={urlState.url} fileType={urlState.fileType} />
          )}

          {(fieldLabel || aiValue || correctedValue) && (
            <dl className="grid grid-cols-[auto_1fr] gap-2 text-sm border-t pt-3 shrink-0">
              {fieldLabel && (
                <>
                  <dt className="text-muted-foreground">Feld</dt>
                  <dd>{fieldLabel}</dd>
                </>
              )}
              {aiValue !== undefined && (
                <>
                  <dt className="text-muted-foreground">KI-Wert</dt>
                  <dd>{aiValue ?? "—"}</dd>
                </>
              )}
              {correctedValue !== undefined && (
                <>
                  <dt className="text-muted-foreground">Korrigierter Wert</dt>
                  <dd>{correctedValue ?? "—"}</dd>
                </>
              )}
            </dl>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
