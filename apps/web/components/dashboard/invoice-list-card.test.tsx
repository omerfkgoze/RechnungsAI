import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Invoice } from "@rechnungsai/shared";
import { ActionToastProvider } from "@/components/ui/action-toast-context";
import { InvoiceListCard, type InvoiceRow } from "./invoice-list-card";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/app/actions/invoices", () => ({
  approveInvoice: vi.fn(),
  flagInvoice: vi.fn(),
  undoInvoiceAction: vi.fn(),
}));

function renderWithProvider(ui: React.ReactElement) {
  return render(<ActionToastProvider>{ui}</ActionToastProvider>);
}

function field<T>(value: T, confidence: number) {
  return { value, confidence, reason: null };
}

function makeInvoice(confidence = 0.99): Invoice {
  return {
    invoice_number: field("R-1", confidence),
    invoice_date: field("2026-04-01", confidence),
    supplier_name: field("ACME GmbH", confidence),
    supplier_address: field(null, confidence),
    supplier_tax_id: field(null, confidence),
    recipient_name: field(null, confidence),
    recipient_address: field(null, confidence),
    line_items: [],
    net_total: field(100, confidence),
    vat_total: field(19, confidence),
    gross_total: field(119, confidence),
    currency: field("EUR", confidence),
    payment_terms: field(null, confidence),
  };
}

const baseRow: InvoiceRow = {
  id: "00000000-0000-0000-0000-0000000000aa",
  status: "ready",
  invoice_data: makeInvoice(0.99),
  extraction_error: null,
  created_at: "2026-04-22T08:00:00Z",
};

describe("InvoiceListCard", () => {
  it("applies green border for high-confidence extraction", () => {
    const { container } = renderWithProvider(<InvoiceListCard row={baseRow} />);
    expect(container.querySelector("a")?.className ?? "").toContain(
      "border-l-confidence-high",
    );
  });

  it("applies amber border for medium confidence", () => {
    const { container } = renderWithProvider(
      <InvoiceListCard
        row={{ ...baseRow, status: "review", invoice_data: makeInvoice(0.8) }}
      />,
    );
    expect(container.querySelector("a")?.className ?? "").toContain(
      "border-l-confidence-medium",
    );
  });

  it("applies red border for low confidence", () => {
    const { container } = renderWithProvider(
      <InvoiceListCard
        row={{ ...baseRow, status: "review", invoice_data: makeInvoice(0.3) }}
      />,
    );
    expect(container.querySelector("a")?.className ?? "").toContain(
      "border-l-confidence-low",
    );
  });

  it("applies destructive border when captured and extraction_error is set", () => {
    const { container } = renderWithProvider(
      <InvoiceListCard
        row={{
          ...baseRow,
          status: "captured",
          invoice_data: null,
          extraction_error: "Rate limit",
        }}
      />,
    );
    expect(container.querySelector("a")?.className ?? "").toContain(
      "border-l-destructive",
    );
    expect(
      screen.getByText(/KI-Extraktion fehlgeschlagen: Rate limit/),
    ).toBeInTheDocument();
  });

  it("renders 'Wird verarbeitet…' shimmer when invoice_data is null and status is captured/processing", () => {
    renderWithProvider(
      <InvoiceListCard
        row={{
          ...baseRow,
          status: "processing",
          invoice_data: null,
          extraction_error: null,
        }}
      />,
    );
    expect(screen.getByText("Wird verarbeitet…")).toBeInTheDocument();
  });

  it("falls back to 'Unbekannter Lieferant' when supplier_name is null but data exists", () => {
    const inv = makeInvoice(0.99);
    inv.supplier_name = field(null, 0.5);
    renderWithProvider(
      <InvoiceListCard
        row={{ ...baseRow, invoice_data: inv }}
      />,
    );
    expect(screen.getByText("Unbekannter Lieferant")).toBeInTheDocument();
  });

  it("links to /rechnungen/{id}", () => {
    const { container } = renderWithProvider(<InvoiceListCard row={baseRow} />);
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      `/rechnungen/${baseRow.id}`,
    );
  });

  it("composes aria-label from supplier, amount, status, and date", () => {
    renderWithProvider(<InvoiceListCard row={baseRow} />);
    const link = screen.getByRole("link");
    const label = link.getAttribute("aria-label") ?? "";
    expect(label).toContain("ACME GmbH");
    expect(label).toContain("Bereit");
    expect(label).toContain("22.04.2026");
    expect(label).toMatch(/119,00/);
  });
});
