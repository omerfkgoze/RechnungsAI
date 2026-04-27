import {
  confidenceLevel,
  overallConfidence,
  type Invoice,
} from "@rechnungsai/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDateDe, formatEur } from "@/lib/format";
import {
  INVOICE_STATUS_LABEL_DE,
  type InvoiceStatus,
} from "@/lib/status-labels";
import { InvoiceListCardLink } from "./invoice-list-card-link";
import { InvoiceListCardSwipeWrapper } from "./invoice-list-card-swipe-wrapper";

export type InvoiceRow = {
  id: string;
  status: InvoiceStatus;
  invoice_data: Invoice | null;
  extraction_error: string | null;
  created_at: string;
  approved_at?: string | null;
  approved_by?: string | null;
  approval_method?: string | null;
};

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "ghost"
  | "link";

const STATUS_VARIANT: Record<InvoiceStatus, BadgeVariant> = {
  captured: "secondary",
  processing: "secondary",
  ready: "default",
  review: "destructive",
  exported: "outline",
};

function borderClass(row: InvoiceRow): string {
  if (row.status === "captured" && row.extraction_error) {
    return "border-l-destructive";
  }
  if (row.invoice_data === null) return "border-l-muted";
  const level = confidenceLevel(overallConfidence(row.invoice_data));
  if (level === "high") return "border-l-confidence-high";
  if (level === "medium") return "border-l-confidence-medium";
  return "border-l-confidence-low";
}

export function InvoiceListCard({ row, isSelected }: { row: InvoiceRow; isSelected?: boolean }) {
  const isPending =
    row.invoice_data === null &&
    (row.status === "captured" || row.status === "processing");
  const supplierRaw = row.invoice_data?.supplier_name?.value ?? null;
  const supplier = isPending
    ? "Wird verarbeitet…"
    : (supplierRaw ?? "Unbekannter Lieferant");
  const gross = row.invoice_data?.gross_total?.value ?? null;
  const currency = row.invoice_data?.currency?.value ?? "EUR";
  const grossLabel = isPending ? "" : formatEur(gross, currency);
  const dateLabel = formatDateDe(row.created_at);
  const statusLabel = INVOICE_STATUS_LABEL_DE[row.status];
  const showError = row.status === "captured" && !!row.extraction_error;

  const ariaSupplier = isPending ? "Wird verarbeitet" : supplier;
  const ariaGross = isPending ? "" : grossLabel;
  const ariaLabel = [ariaSupplier, ariaGross, statusLabel, dateLabel]
    .filter(Boolean)
    .join(", ");

  const pulse = isPending ? "animate-pulse motion-reduce:animate-none" : "";

  const linkClass = cn(
    "block rounded-lg border-l-4 bg-card px-4 py-3 ring-1 ring-foreground/10 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
    borderClass(row),
    isSelected && "bg-muted/40 ring-2 ring-primary/50",
  );

  const cardLink = (
    <InvoiceListCardLink invoiceId={row.id} ariaLabel={ariaLabel} className={linkClass}>
      <div className="flex items-center justify-between gap-3">
        <p className={cn("font-medium text-body truncate", pulse)}>
          {supplier}
        </p>
        <p className={cn("text-body tabular-nums shrink-0", pulse)}>
          {grossLabel || "—"}
        </p>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <Badge
          variant={STATUS_VARIANT[row.status]}
          className={
            row.status === "processing"
              ? "animate-pulse motion-reduce:animate-none"
              : undefined
          }
        >
          {statusLabel}
        </Badge>
        <span className="text-caption text-muted-foreground">{dateLabel}</span>
      </div>
      {showError ? (
        <p className="mt-1 text-caption text-destructive">
          KI-Extraktion fehlgeschlagen: {row.extraction_error}
        </p>
      ) : null}
    </InvoiceListCardLink>
  );

  return (
    <InvoiceListCardSwipeWrapper
      invoiceId={row.id}
      status={row.status}
      approvedAt={row.approved_at ?? null}
      approvedBy={row.approved_by ?? null}
      approvalMethod={row.approval_method ?? null}
    >
      {cardLink}
    </InvoiceListCardSwipeWrapper>
  );
}
