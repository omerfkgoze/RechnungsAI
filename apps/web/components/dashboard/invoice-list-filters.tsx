"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { applyGermanDateMask, isoToGermanDateInput, parseGermanDate } from "@/lib/format";

type Draft = {
  supplier: string;
  minAmount: string;
  maxAmount: string;
};

export function InvoiceListFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const paramString = searchParams?.toString() ?? "";

  const initial = useMemo<Draft>(() => {
    const sp = new URLSearchParams(paramString);
    return {
      supplier: sp.get("supplier") ?? "",
      minAmount: sp.get("minAmount") ?? "",
      maxAmount: sp.get("maxAmount") ?? "",
    };
  }, [paramString]);

  const [draft, setDraft] = useState<Draft>(initial);

  // Track the value we last wrote to the URL so that the initial→draft sync
  // effect only runs when the URL changed from outside this component (e.g.
  // Reset button or deep-link), not when it echoes back a write we just made.
  // This fixes mid-type clobber where 300ms flush overwrites in-flight input.
  const lastWrittenRef = useRef(initial);
  useEffect(() => {
    const sameAsLastWrite =
      initial.supplier === lastWrittenRef.current.supplier &&
      initial.minAmount === lastWrittenRef.current.minAmount &&
      initial.maxAmount === lastWrittenRef.current.maxAmount;
    if (!sameAsLastWrite) setDraft(initial);
  }, [initial]);

  const writeParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(paramString);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [paramString, pathname, router],
  );

  useEffect(() => {
    const id = setTimeout(() => {
      const sp = new URLSearchParams(paramString);
      const next: Record<string, string | null> = {};
      if ((sp.get("supplier") ?? "") !== draft.supplier) {
        next.supplier = draft.supplier || null;
      }
      if ((sp.get("minAmount") ?? "") !== draft.minAmount) {
        next.minAmount = draft.minAmount || null;
      }
      if ((sp.get("maxAmount") ?? "") !== draft.maxAmount) {
        next.maxAmount = draft.maxAmount || null;
      }
      if (Object.keys(next).length > 0) {
        lastWrittenRef.current = { ...draft };
        writeParams(next);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [draft, paramString, writeParams]);

  const currentStatus = new URLSearchParams(paramString).get("status") ?? "all";
  const currentSort =
    new URLSearchParams(paramString).get("sort") ?? "confidence";

  // Date draft state — German format (TT.MM.JJJJ), synced from URL ISO params.
  const [draftDateFrom, setDraftDateFrom] = useState(
    () => isoToGermanDateInput(new URLSearchParams(paramString).get("from") ?? ""),
  );
  const [draftDateTo, setDraftDateTo] = useState(
    () => isoToGermanDateInput(new URLSearchParams(paramString).get("to") ?? ""),
  );

  // Sync date drafts when URL changes externally (reset, deep-link).
  const prevParamStringRef = useRef(paramString);
  useEffect(() => {
    if (paramString === prevParamStringRef.current) return;
    prevParamStringRef.current = paramString;
    const sp = new URLSearchParams(paramString);
    setDraftDateFrom(isoToGermanDateInput(sp.get("from") ?? ""));
    setDraftDateTo(isoToGermanDateInput(sp.get("to") ?? ""));
  }, [paramString]);

  const onReset = () => {
    const cleared: Draft = { supplier: "", minAmount: "", maxAmount: "" };
    lastWrittenRef.current = cleared;
    setDraft(cleared);
    router.replace(pathname, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-status">Status</Label>
          <select
            id="filter-status"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={currentStatus}
            onChange={(e) =>
              writeParams({
                status: e.target.value === "all" ? null : e.target.value,
              })
            }
          >
            <option value="all">Alle</option>
            <option value="captured">Erfasst</option>
            <option value="processing">Verarbeitung</option>
            <option value="ready">Bereit</option>
            <option value="review">Zur Prüfung</option>
            <option value="exported">Exportiert</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-supplier">Lieferant suchen</Label>
          <Input
            id="filter-supplier"
            type="text"
            placeholder="Lieferant suchen…"
            value={draft.supplier}
            onChange={(e) =>
              setDraft((d) => ({ ...d, supplier: e.target.value }))
            }
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-sort">Sortieren nach</Label>
          <select
            id="filter-sort"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={currentSort}
            onChange={(e) =>
              writeParams({
                sort: e.target.value === "confidence" ? null : e.target.value,
              })
            }
          >
            <option value="confidence">Empfohlen (Prüfung zuerst)</option>
            <option value="date_desc">Datum (neueste)</option>
            <option value="date_asc">Datum (älteste)</option>
            <option value="amount_desc">Betrag (höchste)</option>
            <option value="amount_asc">Betrag (niedrigste)</option>
            <option value="supplier_asc">Lieferant (A–Z)</option>
            <option value="status">Status</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label>Betrag von / bis (EUR)</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="von"
              aria-label="Betrag von"
              value={draft.minAmount}
              onChange={(e) =>
                setDraft((d) => ({ ...d, minAmount: e.target.value }))
              }
            />
            <span aria-hidden className="text-muted-foreground">
              –
            </span>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="bis"
              aria-label="Betrag bis"
              value={draft.maxAmount}
              onChange={(e) =>
                setDraft((d) => ({ ...d, maxAmount: e.target.value }))
              }
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-from">Von</Label>
          <input
            id="filter-from"
            type="text"
            inputMode="numeric"
            maxLength={10}
            placeholder="TT.MM.JJJJ"
            aria-label="Von"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={draftDateFrom}
            onChange={(e) => {
              const masked = applyGermanDateMask(e.target.value, draftDateFrom);
              setDraftDateFrom(masked);
              const iso = parseGermanDate(masked);
              if (iso !== null || masked === "") writeParams({ from: iso });
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-to">Bis</Label>
          <input
            id="filter-to"
            type="text"
            inputMode="numeric"
            maxLength={10}
            placeholder="TT.MM.JJJJ"
            aria-label="Bis"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={draftDateTo}
            onChange={(e) => {
              const masked = applyGermanDateMask(e.target.value, draftDateTo);
              setDraftDateTo(masked);
              const iso = parseGermanDate(masked);
              if (iso !== null || masked === "") writeParams({ to: iso });
            }}
          />
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={onReset}
          className="text-caption text-primary underline-offset-4 hover:underline"
        >
          Filter zurücksetzen
        </button>
      </div>
    </div>
  );
}
