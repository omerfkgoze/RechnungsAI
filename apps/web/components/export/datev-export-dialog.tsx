"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { applyGermanDateMask, isoToGermanDateInput, parseGermanDate } from "@/lib/format";
import { buildSteuerberaterMailto } from "@/lib/datev-export";
import { prepareDatevExport } from "@/app/actions/datev";

const PROGRESS_STEPS = [
  "Wird validiert...",
  "Wird formatiert...",
  "Wird zusammengestellt...",
] as const;

type DialogState =
  | { type: "idle" }
  | { type: "pending"; step: number }
  | { type: "missing-settings"; missingFields: string[] }
  | {
      type: "success";
      exportId: string;
      rowCount: number;
      skippedCount: number;
      dateFromIso: string;
      dateToIso: string;
      dateFromCompact: string;
      dateToCompact: string;
    }
  | { type: "error"; message: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean, didSucceed: boolean) => void;
  readyCount: number;
  tenantBeraterNr: string | null;
  tenantMandantenNr: string | null;
  tenantCompanyName: string;
};

function firstOfMonthIso(today: Date): string {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function todayIso(today: Date): string {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function DatevExportDialog({
  open,
  onOpenChange,
  readyCount,
  tenantBeraterNr,
  tenantMandantenNr,
  tenantCompanyName,
}: Props) {
  const today = React.useMemo(() => new Date(), []);
  const initialFromIso = React.useMemo(() => firstOfMonthIso(today), [today]);
  const initialToIso = React.useMemo(() => todayIso(today), [today]);

  const [fromInput, setFromInput] = React.useState(() => isoToGermanDateInput(initialFromIso));
  const [toInput, setToInput] = React.useState(() => isoToGermanDateInput(initialToIso));
  const [state, setState] = React.useState<DialogState>({ type: "idle" });
  const [isPending, startTransition] = React.useTransition();
  const didSucceedRef = React.useRef(false);
  const anchorRef = React.useRef<HTMLAnchorElement | null>(null);

  // Reset on close
  React.useEffect(() => {
    if (!open) {
      setState({ type: "idle" });
      setFromInput(isoToGermanDateInput(initialFromIso));
      setToInput(isoToGermanDateInput(initialToIso));
      didSucceedRef.current = false;
    }
  }, [open, initialFromIso, initialToIso]);

  const fromIso = parseGermanDate(fromInput);
  const toIso = parseGermanDate(toInput);
  const datesValid = fromIso !== null && toIso !== null;

  function handleFromChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFromInput((prev) => applyGermanDateMask(e.target.value, prev));
  }
  function handleToChange(e: React.ChangeEvent<HTMLInputElement>) {
    setToInput((prev) => applyGermanDateMask(e.target.value, prev));
  }

  function runExport() {
    if (!datesValid) return;
    setState({ type: "pending", step: 0 });
    const t1 = setTimeout(() => {
      setState((s) => (s.type === "pending" ? { type: "pending", step: 1 } : s));
    }, 200);
    const t2 = setTimeout(() => {
      setState((s) => (s.type === "pending" ? { type: "pending", step: 2 } : s));
    }, 400);
    const startMs = Date.now();
    startTransition(async () => {
      const result = await prepareDatevExport({ dateFrom: fromIso!, dateTo: toIso! });
      clearTimeout(t1);
      clearTimeout(t2);
      const elapsed = Date.now() - startMs;
      if (elapsed > 8000) {
        console.warn("[datev:export] slow", { ms: elapsed });
      }
      if (!result.success) {
        setState({ type: "error", message: result.error });
        return;
      }
      if (result.data.missingSettings) {
        setState({ type: "missing-settings", missingFields: result.data.missingFields });
        return;
      }
      didSucceedRef.current = true;
      setState({
        type: "success",
        exportId: result.data.exportId,
        rowCount: result.data.rowCount,
        skippedCount: result.data.skippedCount,
        dateFromIso: fromIso!,
        dateToIso: toIso!,
        dateFromCompact: result.data.dateFrom,
        dateToCompact: result.data.dateTo,
      });
    });
  }

  const mailtoUrl = React.useMemo(() => {
    if (state.type !== "success") return "";
    return buildSteuerberaterMailto({
      dateFromIso: state.dateFromIso,
      dateToIso: state.dateToIso,
      tenantCompanyName,
    });
  }, [state, tenantCompanyName]);

  const subline =
    readyCount === 1
      ? "1 Rechnung bereit für den Export"
      : `${readyCount} Rechnungen bereit für den Export`;

  function handleDownloadClick() {
    anchorRef.current?.click();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => onOpenChange(next, didSucceedRef.current)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>DATEV-Export</DialogTitle>
          <DialogDescription>{subline}</DialogDescription>
        </DialogHeader>

        {(state.type === "idle" || state.type === "error") && (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="datev-from">Von</Label>
                <input
                  id="datev-from"
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="TT.MM.JJJJ"
                  aria-label="Von (Belegdatum)"
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={fromInput}
                  onChange={handleFromChange}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="datev-to">Bis</Label>
                <input
                  id="datev-to"
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="TT.MM.JJJJ"
                  aria-label="Bis (Belegdatum)"
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={toInput}
                  onChange={handleToChange}
                />
              </div>
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-caption text-muted-foreground">
              <dt>Format</dt>
              <dd>DATEV EXTF</dd>
              <dt>Berater-Nr.</dt>
              <dd>{tenantBeraterNr ?? "—"}</dd>
              <dt>Mandanten-Nr.</dt>
              <dd>{tenantMandantenNr ?? "—"}</dd>
            </dl>

            {state.type === "error" && (
              <p role="alert" className="text-body-sm text-destructive">
                {state.message}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false, didSucceedRef.current)}
              >
                Abbrechen
              </Button>
              <Button
                type="button"
                onClick={runExport}
                disabled={!datesValid || isPending}
                data-testid="datev-export-submit"
              >
                Export erstellen
              </Button>
            </DialogFooter>
          </div>
        )}

        {state.type === "pending" && (
          <div role="status" aria-live="polite" className="py-6 text-center">
            <p className="text-body-sm">{PROGRESS_STEPS[state.step]}</p>
          </div>
        )}

        {state.type === "missing-settings" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" aria-hidden="true" />
              <p className="text-body-sm">
                Für den DATEV-Export werden noch deine Berater- und Mandantennummer benötigt.
              </p>
            </div>
            <DialogFooter>
              <Button nativeButton={false} render={<Link href="/einstellungen#datev" />}>
                Zu den Einstellungen
              </Button>
            </DialogFooter>
          </div>
        )}

        {state.type === "success" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <p className="text-body font-medium">Export bereit</p>
                <p className="text-body-sm text-muted-foreground">
                  {`${state.rowCount} von ${state.rowCount + state.skippedCount} Rechnung${
                    state.rowCount + state.skippedCount === 1 ? "" : "en"
                  } exportiert`}
                  {state.skippedCount > 0 ? ` — ${state.skippedCount} übersprungen` : ""}
                </p>
              </div>
            </div>

            <a
              ref={anchorRef}
              className="hidden"
              href={`/api/export/datev/${state.exportId}`}
              download={`datev-export-${state.dateFromCompact}-${state.dateToCompact}.csv`}
              data-testid="datev-export-download-anchor"
              aria-hidden="true"
            >
              Download
            </a>

            <DialogFooter>
              <Button nativeButton={false} variant="outline" render={<a href={mailtoUrl} />}>
                Per E-Mail an Steuerberater senden
              </Button>
              <Button type="button" onClick={handleDownloadClick}>
                <Download className="mr-1 h-4 w-4" aria-hidden="true" />
                Herunterladen
              </Button>
            </DialogFooter>
            <p className="text-caption text-muted-foreground">
              Hänge die heruntergeladene Datei in deinem E-Mail-Programm an.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
