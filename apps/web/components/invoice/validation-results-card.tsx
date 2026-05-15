"use client";

import { useMemo, useState, useTransition, type ReactElement } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Mail,
  RefreshCw,
} from "lucide-react";
import { RULE_SET_VERSION, type ValidationViolation } from "@rechnungsai/validation";
import type { ActionResult } from "@rechnungsai/shared";
import { Button } from "@/components/ui/button";
import { requestCorrection, revalidateInvoice } from "@/app/actions/invoices/review";
import {
  buildCorrectionMailto,
  type CorrectionViolation,
} from "@/lib/correction-email";

export type ValidationCardStatus =
  | "pending"
  | "valid"
  | "warning"
  | "invalid"
  | "unsupported"
  | "skipped";

type Props = {
  invoiceId: string;
  status: ValidationCardStatus;
  errors: ValidationViolation[];
  ruleSetVersion: string | null;
  validatedAt: string | null;
  correctionRequestedAt: string | null;
  supplierEmail: string | null;
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceDateIso: string | null;
  tenantCompanyName: string;
};

// Comparison is string equality (AC #19): the package's RULE_SET_VERSION is
// bumped manually so a real semver comparator is overkill at v1.
function isRuleSetStale(rowVersion: string | null): boolean {
  return rowVersion !== null && rowVersion !== RULE_SET_VERSION;
}

function germanRuleSummary(ruleId: string, message: string): string {
  if (message && message.trim().length > 0) return message;
  return `Regel ${ruleId} nicht erfüllt.`;
}

function severityIcon(severity: string): ReactElement {
  if (severity === "warning") {
    return <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" aria-hidden />;
  }
  return <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" aria-hidden />;
}

function formatRequestedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function countBySeverity(errors: ValidationViolation[]): {
  fatal: number;
  error: number;
  warning: number;
} {
  let fatal = 0;
  let error = 0;
  let warning = 0;
  for (const v of errors) {
    if (v.severity === "fatal") fatal++;
    else if (v.severity === "warning") warning++;
    else error++;
  }
  return { fatal, error, warning };
}

function RevalidateButton({ invoiceId }: { invoiceId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const handleClick = () => {
    startTransition(async () => {
      try {
        const result = await revalidateInvoice(invoiceId);
        if (result.success) {
          setMessage({ kind: "ok", text: "Validierung aktualisiert." });
          setTimeout(() => setMessage(null), 3000);
        } else {
          setMessage({ kind: "err", text: result.error });
          setTimeout(() => setMessage(null), 6000);
        }
      } catch {
        setMessage({ kind: "err", text: "Validierung fehlgeschlagen." });
        setTimeout(() => setMessage(null), 6000);
      }
    });
  };

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={pending}
        aria-busy={pending}
      >
        <RefreshCw className={`mr-1 h-4 w-4 ${pending ? "animate-spin" : ""}`} aria-hidden />
        Neu validieren
      </Button>
      {message ? (
        <p
          role="status"
          aria-live="polite"
          className={`text-caption ${message.kind === "ok" ? "text-success" : "text-destructive"}`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

type CorrectionEmailButtonProps = {
  invoiceId: string;
  status: ValidationCardStatus;
  violations: ValidationViolation[];
  supplierEmail: string | null;
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceDateIso: string | null;
  tenantCompanyName: string;
};

function CorrectionEmailButton({
  invoiceId,
  status,
  violations,
  supplierEmail,
  supplierName,
  invoiceNumber,
  invoiceDateIso,
  tenantCompanyName,
}: CorrectionEmailButtonProps) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);

  const mailtoUrl = useMemo(
    () =>
      buildCorrectionMailto({
        supplierEmail,
        invoiceNumber,
        invoiceDateIso,
        supplierName,
        violations: violations.map<CorrectionViolation>((v) => ({
          ruleId: v.ruleId,
          severity: v.severity,
          message: v.message,
        })),
        tenantCompanyName,
      }),
    [supplierEmail, invoiceNumber, invoiceDateIso, supplierName, violations, tenantCompanyName],
  );

  const label =
    status === "warning"
      ? "Lieferant kontaktieren"
      : status === "unsupported"
        ? "Konformes Format anfordern"
        : "Korrektur anfordern";

  const variant: "default" | "outline" = status === "warning" ? "outline" : "default";

  const handleClick = () => {
    startTransition(async () => {
      try {
        const result: ActionResult<{ correctionRequestedAt: string }> =
          await requestCorrection(invoiceId, { violationCount: violations.length });
        if (result.success) {
          const name = supplierName ?? "Lieferant";
          setMessage({ kind: "ok", text: `Korrekturanfrage an ${name} gesendet` });
          setTimeout(() => setMessage(null), 3000);
        } else {
          setMessage({
            kind: "warn",
            text: "Korrekturanfrage konnte nicht protokolliert werden. Die E-Mail wurde dennoch geöffnet.",
          });
          setTimeout(() => setMessage(null), 6000);
        }
      } catch {
        setMessage({
          kind: "warn",
          text: "Korrekturanfrage konnte nicht protokolliert werden. Die E-Mail wurde dennoch geöffnet.",
        });
        setTimeout(() => setMessage(null), 6000);
      }
    });
  };

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button
        nativeButton={false}
        variant={variant}
        size="sm"
        onClick={handleClick}
        disabled={pending}
        aria-busy={pending}
        render={<a href={mailtoUrl} />}
      >
        <Mail className="mr-1 h-4 w-4" aria-hidden />
        {label}
      </Button>
      {message ? (
        <p
          role="status"
          aria-live="polite"
          className={`text-caption ${message.kind === "ok" ? "text-success" : "text-warning"}`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

function ViolationList({ errors }: { errors: ValidationViolation[] }) {
  if (errors.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Validierung fehlgeschlagen, aber keine spezifischen Fehler protokolliert.
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {errors.map((v, idx) => (
        <li key={`${v.ruleId}-${idx}`} className="flex items-start gap-2">
          {severityIcon(v.severity)}
          <div>
            <span className="text-sm font-medium">
              {germanRuleSummary(v.ruleId, v.message)}
            </span>
            <span className="ml-2 text-caption text-muted-foreground">
              {v.ruleId}
              {v.location?.bt ? ` · ${v.location.bt}` : ""}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ValidationResultsCard(props: Props) {
  const {
    invoiceId,
    status,
    errors,
    ruleSetVersion,
    validatedAt: _validatedAt,
    correctionRequestedAt,
    supplierEmail,
    supplierName,
    invoiceNumber,
    invoiceDateIso,
    tenantCompanyName,
  } = props;
  void _validatedAt;

  if (status === "skipped") return null;

  if (status === "pending") {
    return (
      <section
        aria-busy
        aria-label="Validierung läuft"
        className="mb-4 rounded-lg border bg-muted/20 p-3"
        data-testid="validation-card"
        data-status="pending"
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
          Validierung läuft…
        </div>
      </section>
    );
  }

  if (status === "valid") {
    return (
      <section
        className="mb-4 inline-flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-3 py-1"
        data-testid="validation-card"
        data-status="valid"
      >
        <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
        <span className="text-sm font-medium text-success">EN 16931 konform</span>
      </section>
    );
  }

  if (status === "unsupported") {
    return (
      <section
        className="mb-4 rounded-lg border bg-muted/30 p-4"
        data-testid="validation-card"
        data-status="unsupported"
      >
        <h2 className="mb-1 text-base font-semibold">E-Rechnungsformat nicht unterstützt</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          E-Rechnungsformat erkannt, aber nicht unterstützt.
        </p>
        <div className="flex flex-wrap gap-2">
          <CorrectionEmailButton
            invoiceId={invoiceId}
            status="unsupported"
            violations={errors}
            supplierEmail={supplierEmail}
            supplierName={supplierName}
            invoiceNumber={invoiceNumber}
            invoiceDateIso={invoiceDateIso}
            tenantCompanyName={tenantCompanyName}
          />
        </div>
        {correctionRequestedAt ? (
          <p className="mt-2 text-caption text-muted-foreground">
            Letzte Anfrage: {formatRequestedAt(correctionRequestedAt)}
          </p>
        ) : null}
      </section>
    );
  }

  const counts = countBySeverity(errors);
  const isInvalid = status === "invalid";
  const containerCls = isInvalid
    ? "mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
    : "mb-4 rounded-lg border border-warning/40 bg-warning/10 p-4";
  const headerCls = isInvalid ? "text-destructive" : "text-warning";
  const header = isInvalid ? "Validierungsfehler" : "Validierung mit Hinweisen";
  const summaryText = isInvalid
    ? `${counts.fatal + counts.error} Fehler, ${counts.warning} Hinweis(e) gefunden`
    : `${counts.warning} Hinweis(e) gefunden`;

  const stale = isRuleSetStale(ruleSetVersion);

  return (
    <section
      className={containerCls}
      data-testid="validation-card"
      data-status={status}
      role="status"
      aria-live="polite"
    >
      <h2 className={`mb-1 text-base font-semibold ${headerCls}`}>{header}</h2>
      <p className="mb-3 text-sm text-muted-foreground">{summaryText}</p>

      {stale ? (
        <p className="mb-3 rounded border border-muted bg-muted/20 px-2 py-1 text-caption text-muted-foreground">
          Regelwerk wurde aktualisiert. Bitte neu validieren.
        </p>
      ) : null}

      <details open={isInvalid} className="mb-3">
        <summary className="cursor-pointer text-sm font-medium">
          Verstöße anzeigen ({errors.length})
        </summary>
        <div className="mt-2">
          <ViolationList errors={errors} />
        </div>
      </details>

      <div className="flex flex-wrap gap-2">
        {stale ? <RevalidateButton invoiceId={invoiceId} /> : null}
        <CorrectionEmailButton
          invoiceId={invoiceId}
          status={status}
          violations={errors}
          supplierEmail={supplierEmail}
          supplierName={supplierName}
          invoiceNumber={invoiceNumber}
          invoiceDateIso={invoiceDateIso}
          tenantCompanyName={tenantCompanyName}
        />
      </div>

      {correctionRequestedAt ? (
        <p className="mt-2 text-caption text-muted-foreground">
          Letzte Anfrage: {formatRequestedAt(correctionRequestedAt)}
        </p>
      ) : null}
    </section>
  );
}
