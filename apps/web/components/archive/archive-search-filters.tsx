"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Draft = {
  supplier: string;
  invoiceNumber: string;
  minAmount: string;
  maxAmount: string;
};

export function ArchiveSearchFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paramString = searchParams?.toString() ?? "";

  const initial = useMemo<Draft>(() => {
    const sp = new URLSearchParams(paramString);
    return {
      supplier: sp.get("supplier") ?? "",
      invoiceNumber: sp.get("invoiceNumber") ?? "",
      minAmount: sp.get("minAmount") ?? "",
      maxAmount: sp.get("maxAmount") ?? "",
    };
  }, [paramString]);

  const [draft, setDraft] = useState<Draft>(initial);
  const lastWrittenRef = useRef(initial);

  // Sync external URL changes (reset button, deep-link) without clobbering mid-type input.
  useEffect(() => {
    const same =
      initial.supplier === lastWrittenRef.current.supplier &&
      initial.invoiceNumber === lastWrittenRef.current.invoiceNumber &&
      initial.minAmount === lastWrittenRef.current.minAmount &&
      initial.maxAmount === lastWrittenRef.current.maxAmount;
    if (!same) setDraft(initial);
  }, [initial]);

  const writeParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(paramString);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      // Reset page to 1 whenever filters change
      params.delete("page");
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [paramString, pathname, router],
  );

  // Debounced URL writer (300ms — mirrors invoice-list-filters.tsx)
  useEffect(() => {
    const id = setTimeout(() => {
      const sp = new URLSearchParams(paramString);
      const next: Record<string, string | null> = {};
      if ((sp.get("supplier") ?? "") !== draft.supplier) next.supplier = draft.supplier || null;
      if ((sp.get("invoiceNumber") ?? "") !== draft.invoiceNumber)
        next.invoiceNumber = draft.invoiceNumber || null;
      if ((sp.get("minAmount") ?? "") !== draft.minAmount) next.minAmount = draft.minAmount || null;
      if ((sp.get("maxAmount") ?? "") !== draft.maxAmount) next.maxAmount = draft.maxAmount || null;
      if (Object.keys(next).length > 0) {
        lastWrittenRef.current = { ...draft };
        writeParams(next);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [draft, paramString, writeParams]);

  const sp = new URLSearchParams(paramString);
  const currentFrom = sp.get("dateFrom") ?? "";
  const currentTo = sp.get("dateTo") ?? "";
  const currentFiscalYear = sp.get("fiscalYear") ?? "";

  const onReset = () => {
    const cleared: Draft = { supplier: "", invoiceNumber: "", minAmount: "", maxAmount: "" };
    lastWrittenRef.current = cleared;
    setDraft(cleared);
    router.replace(pathname, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="archiv-from">Von (Belegdatum)</Label>
          {/* Native date input — required for mobile keyboard compliance */}
          <input
            id="archiv-from"
            type="date"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={currentFrom}
            onChange={(e) => writeParams({ dateFrom: e.target.value || null })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="archiv-to">Bis (Belegdatum)</Label>
          <input
            id="archiv-to"
            type="date"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={currentTo}
            onChange={(e) => writeParams({ dateTo: e.target.value || null })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="archiv-fiscal-year">Geschäftsjahr</Label>
          <Input
            id="archiv-fiscal-year"
            type="number"
            min="1900"
            max="9999"
            placeholder="z. B. 2025"
            value={currentFiscalYear}
            onChange={(e) => writeParams({ fiscalYear: e.target.value || null })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="archiv-supplier">Lieferant</Label>
          <Input
            id="archiv-supplier"
            type="text"
            placeholder="Lieferant suchen…"
            value={draft.supplier}
            onChange={(e) => setDraft((d) => ({ ...d, supplier: e.target.value }))}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="archiv-invoice-number">Rechnungsnummer</Label>
          <Input
            id="archiv-invoice-number"
            type="text"
            placeholder="Rechnungsnummer suchen…"
            value={draft.invoiceNumber}
            onChange={(e) => setDraft((d) => ({ ...d, invoiceNumber: e.target.value }))}
          />
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
              onChange={(e) => setDraft((d) => ({ ...d, minAmount: e.target.value }))}
            />
            <span aria-hidden className="text-muted-foreground">–</span>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="bis"
              aria-label="Betrag bis"
              value={draft.maxAmount}
              onChange={(e) => setDraft((d) => ({ ...d, maxAmount: e.target.value }))}
            />
          </div>
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
