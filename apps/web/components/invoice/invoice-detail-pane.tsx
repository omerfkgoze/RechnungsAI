import { confidenceLevel, overallConfidence, type Invoice, type InvoiceStatus } from "@rechnungsai/shared";
import { cn } from "@/lib/utils";
import { LABELS, FIELD_ORDER } from "@/lib/invoice-fields";
import { formatValue, formatEur } from "@/lib/format";
import { ConfidenceIndicator } from "./confidence-indicator";
import { EditableField, type InputKind } from "./editable-field";
import { DetailPaneExtractionBootstrap } from "./detail-pane-extraction-bootstrap";
import { SourceDocumentViewerWrapper } from "./source-document-viewer-wrapper";

type Props = {
  invoiceId: string;
  status: InvoiceStatus;
  invoice: Invoice | null;
  extractionError: string | null;
  updatedAt: string;
  isExported: boolean;
};

const BORDER_COLOR: Record<string, string> = {
  high: "border-l-confidence-high",
  medium: "border-l-confidence-medium",
  low: "border-l-confidence-low",
};

function inputKindFor(key: keyof Invoice): InputKind {
  if (key === "net_total" || key === "vat_total" || key === "gross_total") return "decimal";
  if (key === "invoice_date") return "date";
  if (key === "supplier_tax_id") return "taxid";
  if (key === "currency") return "currency-code";
  return "text";
}

function lineItemInputKind(field: string): InputKind {
  if (field === "unit_price" || field === "net_amount" || field === "vat_amount") return "decimal";
  if (field === "quantity" || field === "vat_rate") return "quantity";
  return "text";
}

export function InvoiceDetailPane({
  invoiceId,
  status,
  invoice,
  extractionError,
  updatedAt,
  isExported,
}: Props) {
  const overall = invoice ? overallConfidence(invoice) : 0;
  const level = confidenceLevel(overall);
  const borderClass = BORDER_COLOR[level] ?? "border-l-confidence-low";
  const currencyValue = invoice?.currency?.value ?? "EUR";

  const isProcessing = status === "captured" || status === "processing";

  return (
    <div className={cn("border-l-4 pl-4", borderClass)}>
      <DetailPaneExtractionBootstrap
        invoiceId={invoiceId}
        status={status}
        extractionError={extractionError}
      />

      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold leading-none">Rechnung</h1>
        {invoice && (
          <div className="shrink-0 self-center">
            <ConfidenceIndicator
              confidence={overall}
              variant="badge"
              fieldName="Gesamt"
              explanation={null}
            />
          </div>
        )}
      </div>

      {/* Exported banner shown regardless of whether invoice_data is present */}
      {isExported && (
        <div className="mb-4 rounded border border-muted bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          Exportierte Rechnungen können nicht mehr bearbeitet werden.
        </div>
      )}

      {isProcessing && !invoice ? (
        <section aria-busy aria-label="Extraktion läuft">
          <div className="space-y-2">
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
      ) : !invoice ? (
        <div className="text-sm text-muted-foreground">Keine Extraktionsdaten vorhanden.</div>
      ) : (
        <section>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr_auto]">
            {FIELD_ORDER.map((key, i) => {
              const field = invoice[key] as {
                value: unknown;
                confidence: number;
                reason: string | null;
              };
              const isAmberOrRed = confidenceLevel(field.confidence) !== "high";

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
                    {isExported ? (
                      <span>{formatValue(key, field.value, currencyValue)}</span>
                    ) : (
                      <EditableField
                        invoiceId={invoiceId}
                        fieldPath={String(key)}
                        label={LABELS[key as string] ?? String(key)}
                        value={field.value as string | number | null}
                        initialAiValue={field.value as string | number | null}
                        aiConfidence={field.confidence}
                        currencyCode={currencyValue}
                        inputKind={inputKindFor(key)}
                        isExported={isExported}
                        updatedAt={updatedAt}
                      />
                    )}
                    {field.reason && field.confidence < 0.95 ? (
                      <span className="mt-1 block text-caption text-muted-foreground">
                        {field.reason}
                      </span>
                    ) : null}
                  </dd>
                  <SourceDocumentViewerWrapper
                    invoiceId={invoiceId}
                    fieldLabel={LABELS[key as string] ?? String(key)}
                    aiValue={formatValue(key, field.value, currencyValue)}
                    isInteractive={isAmberOrRed}
                    confidence={field.confidence}
                    explanation={field.reason}
                  />
                </div>
              );
            })}
          </dl>

          {invoice.line_items.length > 0 && (
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
                      <th className="py-1 pr-2">USt-Satz</th>
                      <th className="py-1 pr-2">USt-Betrag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.line_items.map((li, idx) => (
                      <tr key={idx} className="border-t">
                        {(["description", "quantity", "unit_price", "net_amount", "vat_rate", "vat_amount"] as const).map((fieldKey) => {
                          const liField = li[fieldKey] as { value: string | number | null; confidence: number; reason: string | null };
                          return (
                            <td key={fieldKey} className="py-1 pr-2 align-top">
                              {isExported ? (
                                liField.value !== null
                                  ? (fieldKey === "unit_price" || fieldKey === "net_amount" || fieldKey === "vat_amount"
                                      ? formatEur(liField.value as number, currencyValue)
                                      : fieldKey === "vat_rate"
                                        ? `${liField.value}%`
                                        : String(liField.value))
                                  : "—"
                              ) : (
                                <EditableField
                                  invoiceId={invoiceId}
                                  fieldPath={`line_items.${idx}.${fieldKey}`}
                                  label={fieldKey}
                                  value={liField.value}
                                  initialAiValue={liField.value}
                                  aiConfidence={liField.confidence}
                                  currencyCode={currencyValue}
                                  inputKind={lineItemInputKind(fieldKey)}
                                  isExported={isExported}
                                  updatedAt={updatedAt}
                                />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
