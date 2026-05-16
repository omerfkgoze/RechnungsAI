import { BU_SCHLUESSEL_LABELS, confidenceLevel, overallConfidence, runComplianceChecks, type Invoice, type InvoiceStatus } from "@rechnungsai/shared";
import type { ValidationViolation } from "@rechnungsai/validation";
import { cn } from "@/lib/utils";
import { LABELS, FIELD_ORDER } from "@/lib/invoice-fields";
import { formatValue, formatEur } from "@/lib/format";
import { ConfidenceIndicator } from "./confidence-indicator";
import { EditableField, type InputKind } from "./editable-field";
import { DetailPaneExtractionBootstrap } from "./detail-pane-extraction-bootstrap";
import { SourceDocumentViewerWrapper } from "./source-document-viewer-wrapper";
import { CategoryBootstrap } from "./category-bootstrap";
import { SkrCategorySelect } from "./skr-category-select";
import { InvoiceActionsHeader } from "./invoice-actions-header";
import { ComplianceWarningsBanner } from "./compliance-warnings-banner";
import { ValidationResultsCard, type ValidationCardStatus } from "./validation-results-card";

// `validation_status` is typed `string | null` from the regenerated DB types.
// Guard the cast so a value outside the union (schema drift / a future status
// added server-side) does NOT fall through into the warning/invalid render and
// silently mislabel the invoice — the card is suppressed instead.
const KNOWN_VALIDATION_STATUSES = new Set<string>([
  "pending",
  "valid",
  "warning",
  "invalid",
  "unsupported",
  "skipped",
]);

type Props = {
  invoiceId: string;
  status: InvoiceStatus;
  invoice: Invoice | null;
  extractionError: string | null;
  updatedAt: string;
  isExported: boolean;
  skrCode?: string | null;
  buSchluessel?: number | null;
  categorizationConfidence?: number | null;
  skrPlan?: string;
  recentSkrCodes?: string[];
  approvedAt?: string | null;
  approvedBy?: string | null;
  approvalMethod?: string | null;
  validationStatus?: string | null;
  validationErrors?: ValidationViolation[];
  validationRuleSetVersion?: string | null;
  validatedAt?: string | null;
  correctionRequestedAt?: string | null;
  tenantCompanyName?: string;
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
  skrCode = null,
  buSchluessel = null,
  categorizationConfidence = null,
  skrPlan = "skr03",
  recentSkrCodes = [],
  approvedAt = null,
  approvedBy = null,
  approvalMethod = null,
  validationStatus = null,
  validationErrors = [],
  validationRuleSetVersion = null,
  validatedAt = null,
  correctionRequestedAt = null,
  tenantCompanyName = "[Firmenname]",
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
      {invoice !== null && (
        <CategoryBootstrap
          invoiceId={invoiceId}
          skrCode={skrCode}
          status={status}
        />
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold leading-none">Rechnung</h1>
          {invoice && (
            <ConfidenceIndicator
              confidence={overall}
              variant="badge"
              fieldName="Gesamt"
              explanation={null}
            />
          )}
        </div>
        <InvoiceActionsHeader
          invoiceId={invoiceId}
          status={status}
          isExported={isExported}
          approvedAt={approvedAt}
          approvedBy={approvedBy}
          approvalMethod={approvalMethod}
        />
      </div>

      {!isExported &&
      validationStatus &&
      KNOWN_VALIDATION_STATUSES.has(validationStatus) ? (
        // Render even when `invoice` is null: validation runs before extraction
        // projects, and an XML can validate to `invalid` while
        // `projectToInvoiceData` returns null (forcing AI fallback that may
        // also fail). The card is the user's primary signal of *what's wrong*,
        // so it must surface independently of extraction success.
        <ValidationResultsCard
          invoiceId={invoiceId}
          status={validationStatus as ValidationCardStatus}
          errors={validationErrors}
          ruleSetVersion={validationRuleSetVersion}
          validatedAt={validatedAt}
          correctionRequestedAt={correctionRequestedAt}
          supplierEmail={invoice?.supplier_email?.value ?? null}
          supplierName={invoice?.supplier_name?.value ?? null}
          invoiceNumber={invoice?.invoice_number?.value ?? null}
          invoiceDateIso={invoice?.invoice_date?.value ?? null}
          tenantCompanyName={tenantCompanyName}
        />
      ) : null}

      {invoice && !isExported && (
        <ComplianceWarningsBanner warnings={runComplianceChecks(invoice)} />
      )}

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
              // Legacy rows whose jsonb predates a schema field (e.g. supplier_email
              // before Story 6.2) lack the key entirely. Fall back to a zero-
              // confidence null envelope so the read path mirrors the schema's
              // makeField default without re-parsing every row.
              const field = (invoice[key] as {
                value: unknown;
                confidence: number;
                reason: string | null;
              } | undefined) ?? { value: null, confidence: 0, reason: null };
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
              {(() => {
                const LI_FIELDS = [
                  { key: "description", label: "Beschreibung" },
                  { key: "quantity", label: "Menge" },
                  { key: "unit_price", label: "Einzel" },
                  { key: "net_amount", label: "Netto" },
                  { key: "vat_rate", label: "USt-Satz" },
                  { key: "vat_amount", label: "USt-Betrag" },
                ] as const;
                type LiKey = (typeof LI_FIELDS)[number]["key"];
                const renderReadOnly = (key: LiKey, value: string | number | null) => {
                  if (value === null) return "—";
                  if (key === "unit_price" || key === "net_amount" || key === "vat_amount") {
                    return formatEur(value as number, currencyValue);
                  }
                  if (key === "vat_rate") return `${value}%`;
                  return String(value);
                };
                return (
                  <>
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-muted-foreground">
                            {LI_FIELDS.map((f) => (
                              <th key={f.key} className="py-1 pr-2">{f.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {invoice.line_items.map((li, idx) => (
                            <tr key={idx} className="border-t">
                              {LI_FIELDS.map(({ key, label }) => {
                                const liField = li[key] as { value: string | number | null; confidence: number; reason: string | null };
                                return (
                                  <td key={key} className="py-1 pr-2 align-top">
                                    {isExported ? (
                                      renderReadOnly(key, liField.value)
                                    ) : (
                                      <EditableField
                                        invoiceId={invoiceId}
                                        fieldPath={`line_items.${idx}.${key}`}
                                        label={label}
                                        value={liField.value}
                                        initialAiValue={liField.value}
                                        aiConfidence={liField.confidence}
                                        currencyCode={currencyValue}
                                        inputKind={lineItemInputKind(key)}
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

                    <ul className="block sm:hidden space-y-3" data-testid="line-items-cards">
                      {invoice.line_items.map((li, idx) => (
                        <li
                          key={idx}
                          className="rounded-md border bg-card p-3 space-y-2"
                          data-testid={`line-item-card-${idx}`}
                        >
                          {LI_FIELDS.map(({ key, label }) => {
                            const liField = li[key] as { value: string | number | null; confidence: number; reason: string | null };
                            return (
                              <div key={key} className="space-y-1">
                                <div className="text-caption text-muted-foreground">{label}</div>
                                <div className="text-sm min-w-0 break-words">
                                  {isExported ? (
                                    renderReadOnly(key, liField.value)
                                  ) : (
                                    <EditableField
                                      invoiceId={invoiceId}
                                      fieldPath={`line_items.${idx}.${key}`}
                                      label={label}
                                      value={liField.value}
                                      initialAiValue={liField.value}
                                      aiConfidence={liField.confidence}
                                      currencyCode={currencyValue}
                                      inputKind={lineItemInputKind(key)}
                                      isExported={isExported}
                                      updatedAt={updatedAt}
                                    />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </li>
                      ))}
                    </ul>
                  </>
                );
              })()}
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr] border-t pt-4">
            <dt className="text-sm text-muted-foreground self-start pt-1">SKR-Konto</dt>
            <dd className="text-sm">
              <SkrCategorySelect
                invoiceId={invoiceId}
                skrCode={skrCode}
                skrConfidence={categorizationConfidence}
                supplierName={invoice.supplier_name?.value ?? null}
                skrPlan={skrPlan === "skr04" ? "skr04" : "skr03"}
                recentCodes={recentSkrCodes}
                isExported={isExported}
              />
            </dd>
            <dt className="text-sm text-muted-foreground">BU-Schlüssel</dt>
            <dd className="text-sm">
              {buSchluessel !== null
                ? `${buSchluessel} (${BU_SCHLUESSEL_LABELS[buSchluessel] ?? "Unbekannt"})`
                : "—"}
            </dd>
          </div>
        </section>
      )}
    </div>
  );
}
