"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  overallConfidence,
  type Invoice,
  type InvoiceStatus,
} from "@rechnungsai/shared";
import { ConfidenceIndicator } from "./confidence-indicator";
import { extractInvoice } from "@/app/actions/invoices";

type InitialInvoice = {
  id: string;
  status: InvoiceStatus;
  file_path: string;
  file_type: string;
  original_filename: string;
  invoice_data: Invoice | null;
  extraction_error: string | null;
  extracted_at: string | null;
  created_at: string;
};

type Props = { initialInvoice: InitialInvoice };

const LABELS: Record<string, string> = {
  invoice_number: "Rechnungsnummer",
  invoice_date: "Rechnungsdatum",
  supplier_name: "Lieferant",
  supplier_address: "Lieferanten-Adresse",
  supplier_tax_id: "USt-IdNr.",
  recipient_name: "Empfänger",
  recipient_address: "Empfänger-Adresse",
  net_total: "Netto",
  vat_total: "USt.",
  gross_total: "Brutto",
  currency: "Währung",
  payment_terms: "Zahlungsbedingungen",
};

const FIELD_ORDER: Array<keyof Invoice> = [
  "invoice_number",
  "invoice_date",
  "supplier_name",
  "supplier_address",
  "supplier_tax_id",
  "recipient_name",
  "recipient_address",
  "net_total",
  "vat_total",
  "gross_total",
  "currency",
  "payment_terms",
];

function formatValue(key: keyof Invoice, value: unknown, currency?: string) {
  if (value === null || value === undefined) return "—";
  if (
    key === "net_total" ||
    key === "vat_total" ||
    key === "gross_total"
  ) {
    try {
      return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: currency || "EUR",
      }).format(Number(value));
    } catch {
      return String(value);
    }
  }
  if (key === "invoice_date" && typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      try {
        return new Intl.DateTimeFormat("de-DE").format(new Date(value));
      } catch {
        return value;
      }
    }
  }
  return String(value);
}

export function ExtractionResultsClient({ initialInvoice }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(
    initialInvoice.extraction_error,
  );
  const [triggered, setTriggered] = useState(false);

  const invoice = initialInvoice.invoice_data;
  const status = initialInvoice.status;

  const trigger = useMemo(
    () => () => {
      setError(null);
      startTransition(async () => {
        const result = await extractInvoice(initialInvoice.id);
        if (!result.success) {
          setError(result.error);
          return;
        }
        router.refresh();
      });
    },
    [initialInvoice.id, router],
  );

  useEffect(() => {
    if (status === "captured" && !triggered && !error) {
      setTriggered(true);
      trigger();
    }
  }, [status, triggered, error, trigger]);

  if ((status === "captured" || status === "processing") && !invoice) {
    return (
      <section aria-busy={isPending || status === "processing"}>
        {error ? (
          <div className="mb-4 rounded border border-destructive bg-destructive/10 p-3 text-destructive text-sm">
            Extraktion fehlgeschlagen — {error}.{" "}
            <button
              type="button"
              onClick={trigger}
              className="underline font-medium"
            >
              Erneut versuchen
            </button>
          </div>
        ) : null}
        <div className="space-y-2" aria-label="Extraktion läuft">
          {FIELD_ORDER.map((key, i) => (
            <div
              key={String(key)}
              className="flex items-center gap-3 field-reveal"
              style={{ ["--i" as unknown as string]: i } as React.CSSProperties}
            >
              <div className="h-3 w-32 animate-pulse rounded bg-muted" />
              <div className="h-3 w-48 animate-pulse rounded bg-muted/70" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!invoice) {
    return (
      <div className="text-sm text-muted-foreground">
        Keine Extraktionsdaten vorhanden.
      </div>
    );
  }

  const overall = overallConfidence(invoice);
  const currencyValue = invoice.currency.value ?? "EUR";

  return (
    <section>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Rechnung</h1>
        <ConfidenceIndicator
          confidence={overall}
          variant="badge"
          fieldName="Gesamt"
          explanation={null}
        />
      </div>

      {error ? (
        <div className="mb-4 rounded border border-destructive bg-destructive/10 p-3 text-destructive text-sm">
          Extraktion fehlgeschlagen — {error}.{" "}
          <button
            type="button"
            onClick={trigger}
            className="underline font-medium"
          >
            Erneut versuchen
          </button>
        </div>
      ) : null}

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr_auto]">
        {FIELD_ORDER.map((key, i) => {
          const field = invoice[key] as {
            value: unknown;
            confidence: number;
            reason: string | null;
          };
          return (
            <div
              key={String(key)}
              className="contents field-reveal"
              style={{ ["--i" as unknown as string]: i } as React.CSSProperties}
            >
              <dt className="text-sm text-muted-foreground">
                {LABELS[key as string] ?? String(key)}
              </dt>
              <dd className="text-sm">
                {formatValue(key, field.value, currencyValue)}
                {field.reason && field.confidence < 0.95 ? (
                  <span className="mt-1 block text-caption text-muted-foreground">
                    {field.reason}
                  </span>
                ) : null}
              </dd>
              <ConfidenceIndicator
                confidence={field.confidence}
                variant="dot"
                fieldName={LABELS[key as string] ?? String(key)}
                explanation={field.reason}
                onTap={() => {
                  console.info("[invoices:capture] source-view TBD");
                  alert("Quelldokument-Ansicht kommt in Kürze.");
                }}
              />
            </div>
          );
        })}
      </dl>

      {invoice.line_items.length > 0 ? (
        <div className="mt-6">
          <h2 className="mb-2 text-base font-semibold">Positionen</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-2">Beschreibung</th>
                  <th className="py-1 pr-2">Menge</th>
                  <th className="py-1 pr-2">Einzel</th>
                  <th className="py-1 pr-2">Netto</th>
                  <th className="py-1 pr-2">USt.</th>
                </tr>
              </thead>
              <tbody>
                {invoice.line_items.map((li, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="py-1 pr-2">{li.description.value ?? "—"}</td>
                    <td className="py-1 pr-2">{li.quantity.value ?? "—"}</td>
                    <td className="py-1 pr-2">
                      {li.unit_price.value !== null
                        ? formatValue("net_total", li.unit_price.value, currencyValue)
                        : "—"}
                    </td>
                    <td className="py-1 pr-2">
                      {li.net_amount.value !== null
                        ? formatValue("net_total", li.net_amount.value, currencyValue)
                        : "—"}
                    </td>
                    <td className="py-1 pr-2">
                      {li.vat_amount.value !== null
                        ? formatValue("net_total", li.vat_amount.value, currencyValue)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
