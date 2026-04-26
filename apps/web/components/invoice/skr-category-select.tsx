"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { BU_SCHLUESSEL_LABELS, SKR03_CODES, SKR04_CODES, confidenceLevel } from "@rechnungsai/shared";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfidenceIndicator } from "./confidence-indicator";
import { updateInvoiceSKR } from "@/app/actions/invoices";

type Props = {
  invoiceId: string;
  skrCode: string | null;
  skrConfidence: number | null;
  supplierName: string | null;
  skrPlan: "skr03" | "skr04";
  recentCodes: string[];
  isExported: boolean;
};

const LEARNING_MESSAGE_MS = 3000;

function getLabel(skrPlan: "skr03" | "skr04", code: string): string {
  const codes = skrPlan === "skr03" ? SKR03_CODES : SKR04_CODES;
  if (Object.prototype.hasOwnProperty.call(codes, code)) {
    return codes[code]!;
  }
  return "Unbekannter Kontocode";
}

function buildOptionList(
  skrPlan: "skr03" | "skr04",
  recentCodes: string[],
  filter: string,
): Array<{ code: string; label: string; isRecent: boolean }> {
  const codes = skrPlan === "skr03" ? SKR03_CODES : SKR04_CODES;
  const lower = filter.toLowerCase();

  // Use hasOwnProperty to avoid Object.prototype keys ("toString", "constructor")
  // sneaking into the recent list when corrections data is corrupted/migrated.
  const validRecent = recentCodes
    .slice(0, 3)
    .filter((c) => Object.prototype.hasOwnProperty.call(codes, c));
  const recentSet = new Set(validRecent);
  const recent = validRecent.map((c) => ({ code: c, label: codes[c]!, isRecent: true }));

  const rest = Object.entries(codes)
    .filter(([c]) => !recentSet.has(c))
    .map(([c, l]) => ({ code: c, label: l, isRecent: false }));

  const all = [...recent, ...rest];

  if (!filter) return all;
  return all.filter(
    ({ code, label }) =>
      code.toLowerCase().includes(lower) || label.toLowerCase().includes(lower),
  );
}

export function SkrCategorySelect({
  invoiceId,
  skrCode,
  skrConfidence,
  supplierName,
  skrPlan,
  recentCodes,
  isExported,
}: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [learningMsg, setLearningMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFilter("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  if (skrCode === null) {
    return <Skeleton className="h-6 w-40" />;
  }

  const currentLabel = getLabel(skrPlan, skrCode);
  const confidence = skrConfidence ?? 0;

  if (isExported) {
    return (
      <span className="text-sm">
        {skrCode} — {currentLabel}
      </span>
    );
  }

  function handleSelect(newCode: string) {
    if (newCode === skrCode) {
      setOpen(false);
      setFilter("");
      return;
    }
    startTransition(async () => {
      const result = await updateInvoiceSKR({ invoiceId, newSkrCode: newCode, supplierName });
      setOpen(false);
      setFilter("");
      if (result.success) {
        const msg =
          supplierName
            ? `Bei der nächsten Rechnung von ${supplierName} weiß ich Bescheid.`
            : "Verstanden — ich merke mir das.";
        setLearningMsg(msg);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setLearningMsg(null), LEARNING_MESSAGE_MS);
      }
    });
  }

  const options = buildOptionList(skrPlan, recentCodes, filter);

  return (
    <div ref={containerRef} className="relative inline-block w-full max-w-xs">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={isPending}
        onClick={() => {
          setOpen((o) => !o);
          setFilter("");
        }}
        className="flex items-center gap-2 rounded border border-input bg-background px-2 py-1 text-sm hover:bg-muted disabled:opacity-50"
      >
        <span>
          {skrCode} — {currentLabel}
        </span>
        <ConfidenceIndicator
          confidence={confidence}
          variant="dot"
          fieldName="SKR-Konto"
          explanation={null}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="SKR-Kontoauswahl"
          className="absolute z-50 mt-1 w-full min-w-[240px] rounded-md border border-border bg-background shadow-md"
        >
          <div className="p-2">
            <input
              type="text"
              placeholder="Suchen..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-7 w-full rounded border border-input bg-transparent px-2 text-sm outline-none focus:border-ring"
              autoFocus
            />
          </div>
          <ul className="max-h-48 overflow-y-auto py-1" role="group">
            {options.length === 0 ? (
              <li className="px-3 py-1 text-sm text-muted-foreground">Kein Ergebnis</li>
            ) : (
              options.map(({ code, label, isRecent }) => (
                <li key={code} role="option" aria-selected={code === skrCode}>
                  <button
                    type="button"
                    onClick={() => handleSelect(code)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted",
                      code === skrCode && "font-medium",
                    )}
                  >
                    <span>
                      {code} — {label}
                    </span>
                    {isRecent && (
                      <span className="ml-auto text-xs text-muted-foreground">Zuletzt</span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {learningMsg && (
        <p
          className="mt-1 max-w-xs break-words text-xs text-muted-foreground line-clamp-2"
          role="status"
        >
          {learningMsg}
        </p>
      )}
    </div>
  );
}
