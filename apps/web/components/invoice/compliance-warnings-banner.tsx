"use client";

import type { ComplianceWarning } from "@rechnungsai/shared";

type Props = {
  warnings: ComplianceWarning[];
};

export function ComplianceWarningsBanner({ warnings }: Props) {
  if (warnings.length === 0) return null;

  function jumpToField(field: string) {
    const el = document.getElementById(`field-${field}`);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    const input = el.querySelector<HTMLElement>("input, textarea, [role='button']");
    if (input) {
      input.focus({ preventScroll: true });
    } else {
      (el as HTMLElement).focus?.({ preventScroll: true });
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-4"
    >
      <p className="text-body font-semibold text-foreground mb-3">
        Diese Rechnung benötigt deine Aufmerksamkeit.
      </p>
      <ul className="flex flex-col gap-2">
        {warnings.map((w) => (
          <li key={w.code} className="flex flex-col gap-1">
            <span className="text-body-sm text-foreground">{w.message}</span>
            <button
              type="button"
              onClick={() => jumpToField(w.field)}
              className="self-start text-body-sm text-muted-foreground hover:text-foreground underline"
            >
              Zum Feld springen
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
