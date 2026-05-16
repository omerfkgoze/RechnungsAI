"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateVerdok } from "@/app/actions/verdok";

type Existing = { id: string; generatedAt: string } | null;

type Props = {
  hasRequiredSettings: boolean;
  companySlug: string;
  existing: Existing;
};

type State =
  | { type: "idle" }
  | { type: "pending" }
  | { type: "ready"; id: string; generatedAt: string }
  | { type: "error"; message: string };

function formatDate(iso: string): string {
  // YYYY-MM-DD → DD.MM.YYYY (German users; AGENTS.md date convention).
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}.${m}.${y}` : iso.slice(0, 10);
}

export function VerdokSection({ hasRequiredSettings, companySlug, existing }: Props) {
  const [state, setState] = React.useState<State>(
    existing
      ? { type: "ready", id: existing.id, generatedAt: existing.generatedAt }
      : { type: "idle" },
  );
  const [isPending, startTransition] = React.useTransition();

  function run() {
    setState({ type: "pending" });
    startTransition(async () => {
      const result = await generateVerdok();
      if (!result.success) {
        setState({ type: "error", message: result.error });
        return;
      }
      setState({
        type: "ready",
        id: result.data.id,
        generatedAt: new Date().toISOString(),
      });
    });
  }

  return (
    <section className="mt-10 rounded-lg border border-border p-6">
      <div className="mb-1 flex items-center gap-2">
        <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-h2 font-semibold text-foreground">
          Verfahrensdokumentation
        </h2>
      </div>
      <p className="mb-5 text-body-sm text-muted-foreground">
        Die für das Finanzamt erforderliche GoBD-Dokumentation wird aus deinen
        Firmen- und DATEV-Einstellungen automatisch erstellt.
      </p>

      {!hasRequiredSettings && (
        <div className="flex flex-col gap-3">
          <p className="text-body-sm text-foreground">
            Für die Verfahrensdokumentation werden deine Firmendaten und
            DATEV-Einstellungen benötigt. Bitte vervollständige zuerst deine
            Einstellungen.
          </p>
          <div>
            <Button nativeButton={false} render={<Link href="/einstellungen" />}>
              Einstellungen vervollständigen
            </Button>
          </div>
        </div>
      )}

      {hasRequiredSettings && (
        <div className="flex flex-col gap-4">
          {state.type === "ready" && (
            <div className="flex items-start gap-2">
              <CheckCircle2
                className="mt-0.5 h-5 w-5 text-success"
                aria-hidden="true"
              />
              <p className="text-body-sm text-muted-foreground">
                Zuletzt erstellt am {formatDate(state.generatedAt)}
              </p>
            </div>
          )}

          {state.type === "error" && (
            <p role="alert" className="text-body-sm text-destructive">
              {state.message}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={run}
              disabled={isPending || state.type === "pending"}
              data-testid="verdok-generate"
            >
              {state.type === "ready"
                ? "Neu erstellen"
                : isPending || state.type === "pending"
                  ? "Wird erstellt..."
                  : "Verfahrensdokumentation erstellen"}
            </Button>

            {state.type === "ready" && (
              <Button
                nativeButton={false}
                variant="outline"
                render={
                  <a
                    href={`/api/verdok/${state.id}/pdf`}
                    download={`Verfahrensdokumentation_${companySlug}_${state.generatedAt.slice(0, 10)}.pdf`}
                    data-testid="verdok-download"
                  />
                }
              >
                <Download className="mr-1 h-4 w-4" aria-hidden="true" />
                Herunterladen
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
