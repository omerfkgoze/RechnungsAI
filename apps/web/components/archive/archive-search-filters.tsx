"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  applyGermanDateMask,
  isoToGermanDateInput,
  parseGermanDate,
} from "@/lib/format";

type Draft = {
  supplier: string;
  invoiceNumber: string;
  minAmount: string;
  maxAmount: string;
  dateFrom: string; // German format TT.MM.JJJJ
  dateTo: string;   // German format TT.MM.JJJJ
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
      dateFrom: isoToGermanDateInput(sp.get("dateFrom") ?? ""),
      dateTo: isoToGermanDateInput(sp.get("dateTo") ?? ""),
    };
  }, [paramString]);

  const [draft, setDraft] = useState<Draft>(initial);
  const lastWrittenRef = useRef(initial);

  const [dateError, setDateError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);

  // Sync external URL changes (reset button, deep-link) without clobbering mid-type input.
  useEffect(() => {
    const same =
      initial.supplier === lastWrittenRef.current.supplier &&
      initial.invoiceNumber === lastWrittenRef.current.invoiceNumber &&
      initial.minAmount === lastWrittenRef.current.minAmount &&
      initial.maxAmount === lastWrittenRef.current.maxAmount &&
      initial.dateFrom === lastWrittenRef.current.dateFrom &&
      initial.dateTo === lastWrittenRef.current.dateTo;
    if (!same) {
      setDraft(initial);
      setDateError(null);
      setAmountError(null);
    }
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

  // Debounced URL writer for text/amount fields (300ms — mirrors invoice-list-filters.tsx)
  useEffect(() => {
    const id = setTimeout(() => {
      const sp = new URLSearchParams(paramString);
      const next: Record<string, string | null> = {};
      if ((sp.get("supplier") ?? "") !== draft.supplier) next.supplier = draft.supplier || null;
      if ((sp.get("invoiceNumber") ?? "") !== draft.invoiceNumber)
        next.invoiceNumber = draft.invoiceNumber || null;

      // Cross-field amount validation
      const minNum = draft.minAmount !== "" ? parseFloat(draft.minAmount) : NaN;
      const maxNum = draft.maxAmount !== "" ? parseFloat(draft.maxAmount) : NaN;
      if (!isNaN(minNum) && !isNaN(maxNum) && minNum > maxNum) {
        setAmountError("Maximalbetrag muss größer als Minimalbetrag sein");
      } else {
        setAmountError(null);
        if ((sp.get("minAmount") ?? "") !== draft.minAmount) next.minAmount = draft.minAmount || null;
        if ((sp.get("maxAmount") ?? "") !== draft.maxAmount) next.maxAmount = draft.maxAmount || null;
      }

      if (Object.keys(next).length > 0) {
        lastWrittenRef.current = { ...draft };
        writeParams(next);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [draft, paramString, writeParams]);

  const sp = new URLSearchParams(paramString);
  const currentFiscalYear = sp.get("fiscalYear") ?? "";

  // Date handlers: immediate write, German active-mask input, cross-field validation.
  const handleDateFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = applyGermanDateMask(e.target.value, draft.dateFrom);
    const next = { ...draft, dateFrom: masked };
    setDraft(next);

    const fromIso = parseGermanDate(masked);
    const toIso = draft.dateTo ? parseGermanDate(draft.dateTo) : null;

    if (fromIso && toIso && fromIso > toIso) {
      setDateError("Bis-Datum muss nach Von-Datum liegen");
      return;
    }
    setDateError(null);
    if (fromIso !== null || masked === "") {
      lastWrittenRef.current = { ...lastWrittenRef.current, dateFrom: masked };
      writeParams({ dateFrom: fromIso });
    }
  };

  const handleDateToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = applyGermanDateMask(e.target.value, draft.dateTo);
    const next = { ...draft, dateTo: masked };
    setDraft(next);

    const fromIso = draft.dateFrom ? parseGermanDate(draft.dateFrom) : null;
    const toIso = parseGermanDate(masked);

    if (fromIso && toIso && fromIso > toIso) {
      setDateError("Bis-Datum muss nach Von-Datum liegen");
      return;
    }
    setDateError(null);
    if (toIso !== null || masked === "") {
      lastWrittenRef.current = { ...lastWrittenRef.current, dateTo: masked };
      writeParams({ dateTo: toIso });
    }
  };

  const onReset = () => {
    const cleared: Draft = { supplier: "", invoiceNumber: "", minAmount: "", maxAmount: "", dateFrom: "", dateTo: "" };
    lastWrittenRef.current = cleared;
    setDraft(cleared);
    setDateError(null);
    setAmountError(null);
    router.replace(pathname, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="archiv-from">Von (Belegdatum)</Label>
          <input
            id="archiv-from"
            type="text"
            inputMode="numeric"
            maxLength={10}
            placeholder="TT.MM.JJJJ"
            aria-label="Von (Belegdatum)"
            aria-invalid={dateError !== null ? "true" : undefined}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={draft.dateFrom}
            onChange={handleDateFromChange}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="archiv-to">Bis (Belegdatum)</Label>
          <input
            id="archiv-to"
            type="text"
            inputMode="numeric"
            maxLength={10}
            placeholder="TT.MM.JJJJ"
            aria-label="Bis (Belegdatum)"
            aria-invalid={dateError !== null ? "true" : undefined}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={draft.dateTo}
            onChange={handleDateToChange}
          />
          {dateError && (
            <p role="alert" className="text-caption text-destructive">
              {dateError}
            </p>
          )}
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
          <div className="flex min-w-0 items-center gap-2">
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="von"
              aria-label="Betrag von"
              aria-invalid={amountError !== null ? "true" : undefined}
              value={draft.minAmount}
              onChange={(e) => setDraft((d) => ({ ...d, minAmount: e.target.value }))}
            />
            <span aria-hidden className="shrink-0 text-muted-foreground">–</span>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="bis"
              aria-label="Betrag bis"
              aria-invalid={amountError !== null ? "true" : undefined}
              value={draft.maxAmount}
              onChange={(e) => setDraft((d) => ({ ...d, maxAmount: e.target.value }))}
            />
          </div>
          {amountError && (
            <p role="alert" className="text-caption text-destructive">
              {amountError}
            </p>
          )}
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
