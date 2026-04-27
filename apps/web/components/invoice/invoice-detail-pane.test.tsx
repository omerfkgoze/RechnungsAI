import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Invoice } from "@rechnungsai/shared";
import { ActionToastProvider } from "@/components/ui/action-toast-context";
import { InvoiceDetailPane } from "./invoice-detail-pane";

function renderInProvider(ui: React.ReactElement) {
  return render(<ActionToastProvider>{ui}</ActionToastProvider>);
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/app/actions/invoices", () => ({
  extractInvoice: vi.fn().mockResolvedValue({ success: true, data: { status: "ready", overall: 0.99 } }),
  categorizeInvoice: vi.fn().mockResolvedValue({ success: true, data: { skrCode: "4230", confidence: 0.88, buSchluessel: null } }),
  correctInvoiceField: vi.fn(),
  getInvoiceSignedUrl: vi.fn(),
  updateInvoiceSKR: vi.fn(),
  approveInvoice: vi.fn().mockResolvedValue({ success: true, data: { status: "ready" } }),
  flagInvoice: vi.fn().mockResolvedValue({ success: true, data: { status: "review" } }),
  undoInvoiceAction: vi.fn().mockResolvedValue({ success: true, data: { status: "review" } }),
}));

function field<T>(value: T, confidence = 0.99) {
  return { value, confidence, reason: null };
}

function makeInvoice(confidence = 0.99): Invoice {
  return {
    invoice_number: field("R-001", confidence),
    invoice_date: field("2026-04-22", confidence),
    supplier_name: field("ACME GmbH", confidence),
    supplier_address: field("Musterstraße 1", confidence),
    supplier_tax_id: field("DE123456789", confidence),
    recipient_name: field("Muster AG", confidence),
    recipient_address: field("Hauptstraße 5", confidence),
    line_items: [],
    net_total: field(100, confidence),
    vat_total: field(19, confidence),
    gross_total: field(119, confidence),
    currency: field("EUR", confidence),
    payment_terms: field("30 Tage netto", confidence),
  };
}

const DEFAULT_PROPS = {
  invoiceId: "inv-1",
  status: "ready" as const,
  extractionError: null,
  updatedAt: "2026-04-24T10:00:00Z",
  isExported: false,
};

describe("InvoiceDetailPane", () => {
  it("renders all 12 top-level fields in order", () => {
    renderInProvider(<InvoiceDetailPane {...DEFAULT_PROPS} invoice={makeInvoice()} />);
    expect(screen.getByText("Rechnungsnummer")).toBeDefined();
    expect(screen.getByText("Rechnungsdatum")).toBeDefined();
    expect(screen.getByText("Brutto")).toBeDefined();
    expect(screen.getByText("Zahlungsbedingungen")).toBeDefined();
  });

  it("renders left border class based on confidence tier (high → confidence-high)", () => {
    const { container } = renderInProvider(<InvoiceDetailPane {...DEFAULT_PROPS} invoice={makeInvoice(0.99)} />);
    const borderedEl = container.querySelector(".border-l-confidence-high");
    expect(borderedEl).not.toBeNull();
  });

  it("renders em-dash for NULL field values", () => {
    const invoice = makeInvoice();
    invoice.payment_terms = field(null, 0.99);
    renderInProvider(<InvoiceDetailPane {...DEFAULT_PROPS} invoice={invoice} />);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });

  it("renders skeleton placeholders when status is captured/processing and invoice is null", () => {
    const { container } = renderInProvider(
      <InvoiceDetailPane {...DEFAULT_PROPS} status="processing" invoice={null} />,
    );
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows exported banner and no editable fields when isExported=true", () => {
    renderInProvider(<InvoiceDetailPane {...DEFAULT_PROPS} invoice={makeInvoice()} isExported />);
    expect(screen.getByText(/Exportierte Rechnungen/)).toBeDefined();
  });

  it("renders Freigeben/Flaggen/Beleg ansehen header buttons for ready invoices", () => {
    renderInProvider(
      <InvoiceDetailPane {...DEFAULT_PROPS} invoice={makeInvoice()} status="ready" />,
    );
    expect(screen.getByTestId("invoice-approve-button")).toBeDefined();
    expect(screen.getByTestId("invoice-flag-button")).toBeDefined();
    expect(screen.getByTestId("invoice-view-document-button")).toBeDefined();
  });

  it("disables approve and flag buttons when isExported=true", () => {
    renderInProvider(
      <InvoiceDetailPane {...DEFAULT_PROPS} invoice={makeInvoice()} status="exported" isExported />,
    );
    const approve = screen.getByTestId("invoice-approve-button") as HTMLButtonElement;
    const flag = screen.getByTestId("invoice-flag-button") as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(flag.disabled).toBe(true);
  });
});
