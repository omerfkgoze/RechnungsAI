"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { correctInvoiceField } from "@/app/actions/invoices";
import { parseGermanDecimal } from "@/lib/format";

export type InputKind =
  | "text"
  | "decimal"
  | "date"
  | "quantity"
  | "taxid"
  | "currency-code";

type Props = {
  invoiceId: string;
  fieldPath: string;
  label: string;
  value: string | number | null;
  initialAiValue: string | number | null;
  aiConfidence: number;
  currencyCode?: string | null;
  inputKind: InputKind;
  isExported: boolean;
  updatedAt: string;
};

function toInputString(value: string | number | null, inputKind: InputKind): string {
  if (value === null || value === undefined) return "";
  if (inputKind === "decimal" || inputKind === "quantity") return String(value);
  return String(value);
}

function parseInput(raw: string, inputKind: InputKind): { ok: true; value: string | number | null } | { ok: false; error: string } {
  if (raw.trim() === "") return { ok: true, value: null };
  if (inputKind === "decimal") {
    const n = parseGermanDecimal(raw);
    if (n === null) return { ok: false, error: "Ungültiger Betrag — bitte im Format 1.234,56 oder 1234.56." };
    return { ok: true, value: n };
  }
  if (inputKind === "quantity") {
    const n = Number(raw);
    if (!Number.isFinite(n)) return { ok: false, error: "Ungültige Menge." };
    return { ok: true, value: n };
  }
  if (inputKind === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: false, error: "Ungültiges Datum — bitte YYYY-MM-DD." };
    return { ok: true, value: raw };
  }
  if (inputKind === "taxid") {
    // Warn but allow — non-standard IDs are valid for some suppliers.
    return { ok: true, value: raw };
  }
  return { ok: true, value: raw };
}

export function EditableField({
  invoiceId,
  fieldPath,
  label,
  value,
  initialAiValue,
  aiConfidence,
  currencyCode,
  inputKind,
  isExported,
  updatedAt,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(toInputString(value, inputKind));
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentValue = toInputString(value, inputKind);
  const aiValueStr = toInputString(initialAiValue, inputKind);

  function openEdit() {
    if (isExported) return;
    setInputValue(currentValue);
    setInlineError(null);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function cancelEdit() {
    setEditing(false);
    setInlineError(null);
    setInputValue(currentValue);
  }

  function restoreAiValue() {
    setInputValue(aiValueStr);
    setInlineError(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleSubmit(isRestore = false) {
    const rawInput = isRestore ? aiValueStr : inputValue;
    const parsed = parseInput(rawInput, inputKind);
    if (!parsed.ok) {
      setInlineError(parsed.error);
      return;
    }

    // Required fields: invoice_number and gross_total.
    if ((fieldPath === "invoice_number" || fieldPath === "gross_total") && parsed.value === null) {
      setInlineError("Dieses Feld darf nicht leer sein.");
      return;
    }

    setInlineError(null);
    startTransition(async () => {
      const result = await correctInvoiceField({
        invoiceId,
        fieldPath,
        newValue: parsed.value,
        priorUpdatedAt: updatedAt,
        isRestoreToAi: isRestore,
        aiConfidence,
      });

      if (!result.success) {
        setInlineError(result.error);
        return;
      }

      setEditing(false);
      setShowSuccess(true);
      setSavedMessage("Gespeichert.");
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        setShowSuccess(false);
        setSavedMessage(null);
      }, 2000);
    });
  }

  const isUnchangedFromAi = inputValue === aiValueStr && value !== initialAiValue;
  const isUnchangedFromCurrent = inputValue === currentValue;

  if (isExported && editing) {
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 group relative">
        <span
          className="text-sm cursor-pointer hover:underline focus:outline-none"
          role="button"
          tabIndex={0}
          aria-label={`${label} bearbeiten`}
          onClick={openEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") openEdit();
          }}
        >
          {String(value ?? "—")}
        </span>
        {showSuccess && (
          <span
            className="inline-flex items-center text-confidence-high animate-in fade-in-0 duration-200"
            aria-live="polite"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden />
          </span>
        )}
        {savedMessage && (
          <span className="text-caption text-muted-foreground animate-in fade-in-0 duration-200">
            {savedMessage}
          </span>
        )}
      </div>
    );
  }

  const currencyPrefix =
    inputKind === "decimal"
      ? (currencyCode === "EUR" || !currencyCode ? "€" : currencyCode) + " "
      : undefined;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {currencyPrefix && (
          <span className="text-sm text-muted-foreground shrink-0">{currencyPrefix}</span>
        )}
        <Input
          ref={inputRef}
          type={inputKind === "date" ? "date" : inputKind === "quantity" ? "number" : "text"}
          inputMode={inputKind === "decimal" ? "decimal" : undefined}
          step={inputKind === "quantity" ? "any" : undefined}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            if (inlineError) {
              const parsed = parseInput(e.target.value, inputKind);
              if (parsed.ok) setInlineError(null);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={inputKind === "taxid" ? "DE123456789" : undefined}
          aria-label={label}
          aria-invalid={!!inlineError}
          className="h-8 text-sm"
          disabled={isPending}
        />
      </div>

      {inlineError && (
        <p className="text-caption text-destructive" role="alert">
          {inlineError}
        </p>
      )}

      <div className="flex items-center gap-2 mt-1">
        <Button
          variant="default"
          size="sm"
          className="bg-confidence-high hover:bg-confidence-high/90 text-white h-7 text-xs"
          onClick={() => handleSubmit(false)}
          disabled={isPending || isUnchangedFromCurrent}
          aria-disabled={isPending || isUnchangedFromCurrent}
        >
          Übernehmen
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={restoreAiValue}
          disabled={isPending || inputValue === aiValueStr}
          aria-disabled={isPending || inputValue === aiValueStr}
        >
          AI-Wert wiederherstellen
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={cancelEdit}
          disabled={isPending}
        >
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
