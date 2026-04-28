import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EditableField } from "./editable-field";

const correctFieldMock = vi.fn();
vi.mock("@/app/actions/invoices", () => ({
  correctInvoiceField: (...args: unknown[]) => correctFieldMock(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

const DEFAULT_PROPS = {
  invoiceId: "inv-1",
  fieldPath: "supplier_name",
  label: "Lieferant",
  value: "ACME GmbH",
  initialAiValue: "ACME GmbH",
  aiConfidence: 0.95,
  currencyCode: "EUR",
  inputKind: "text" as const,
  isExported: false,
  updatedAt: "2026-04-24T10:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EditableField", () => {
  it("renders in read-only mode initially and shows the value", () => {
    render(<EditableField {...DEFAULT_PROPS} />);
    expect(screen.getByText("ACME GmbH")).toBeDefined();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("enters edit mode on click and shows input pre-filled with current value", async () => {
    render(<EditableField {...DEFAULT_PROPS} />);
    const valueEl = screen.getByText("ACME GmbH");
    fireEvent.click(valueEl);
    const input = screen.getByRole("textbox");
    expect(input).toBeDefined();
    expect((input as HTMLInputElement).value).toBe("ACME GmbH");
  });

  it("Escape cancels edit and reverts to read-only without calling server", async () => {
    render(<EditableField {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByText("ACME GmbH"));
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(correctFieldMock).not.toHaveBeenCalled();
  });

  it("parses German-locale decimal 1.234,56 correctly via parseGermanDecimal", async () => {
    correctFieldMock.mockResolvedValueOnce({ success: true, data: { newConfidence: 1.0 } });
    render(<EditableField {...DEFAULT_PROPS} fieldPath="gross_total" label="Brutto" value={119} initialAiValue={119} inputKind="decimal" />);
    fireEvent.click(screen.getByText("119"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "1.234,56" } });
    fireEvent.click(screen.getByText("Übernehmen"));
    await waitFor(() => {
      expect(correctFieldMock).toHaveBeenCalledWith(expect.objectContaining({
        newValue: 1234.56,
        fieldPath: "gross_total",
      }));
    });
  });

  it("[AI-Wert wiederherstellen] restores the initial AI value locally", async () => {
    render(<EditableField {...DEFAULT_PROPS} value="Edited GmbH" initialAiValue="ACME GmbH" />);
    fireEvent.click(screen.getByText("Edited GmbH"));
    const input = screen.getByRole("textbox");
    expect((input as HTMLInputElement).value).toBe("Edited GmbH");
    fireEvent.click(screen.getByText("AI-Wert wiederherstellen"));
    expect((input as HTMLInputElement).value).toBe("ACME GmbH");
    expect(correctFieldMock).not.toHaveBeenCalled();
  });

  it("[Übernehmen] is disabled when input equals current saved value (unchanged)", async () => {
    render(<EditableField {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByText("ACME GmbH"));
    const submitBtn = screen.getByText("Übernehmen");
    expect(submitBtn.closest("button")?.disabled).toBe(true);
  });

  it("date field displays the ISO value as German format (TT.MM.JJJJ) when read-only", () => {
    render(
      <EditableField
        {...DEFAULT_PROPS}
        fieldPath="invoice_date"
        label="Rechnungsdatum"
        value="2026-04-22"
        initialAiValue="2026-04-22"
        inputKind="date"
      />,
    );
    expect(screen.getByText("22.04.2026")).toBeDefined();
  });

  it("date field accepts German-format input (TT.MM.JJJJ) and saves ISO value", async () => {
    correctFieldMock.mockResolvedValueOnce({ success: true, data: { newConfidence: 1.0 } });
    render(
      <EditableField
        {...DEFAULT_PROPS}
        fieldPath="invoice_date"
        label="Rechnungsdatum"
        value={null}
        initialAiValue={null}
        inputKind="date"
      />,
    );
    fireEvent.click(screen.getByText("—"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "15.03.2026" } });
    fireEvent.click(screen.getByText("Übernehmen"));
    await waitFor(() => {
      expect(correctFieldMock).toHaveBeenCalledWith(
        expect.objectContaining({
          newValue: "2026-03-15",
          fieldPath: "invoice_date",
        }),
      );
    });
  });

  it("date field active-masks: typing two digits immediately appends '.'", () => {
    render(
      <EditableField
        {...DEFAULT_PROPS}
        fieldPath="invoice_date"
        label="Rechnungsdatum"
        value={null}
        initialAiValue={null}
        inputKind="date"
      />,
    );
    fireEvent.click(screen.getByText("—"));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1" } });
    expect(input.value).toBe("1");
    fireEvent.change(input, { target: { value: "15" } });
    expect(input.value).toBe("15.");
    fireEvent.change(input, { target: { value: "15.0" } });
    expect(input.value).toBe("15.0");
    fireEvent.change(input, { target: { value: "15.03" } });
    expect(input.value).toBe("15.03.");
  });

  it("date field auto-masks as user types digits (15032026 → 15.03.2026)", () => {
    render(
      <EditableField
        {...DEFAULT_PROPS}
        fieldPath="invoice_date"
        label="Rechnungsdatum"
        value={null}
        initialAiValue={null}
        inputKind="date"
      />,
    );
    fireEvent.click(screen.getByText("—"));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "15032026" } });
    expect(input.value).toBe("15.03.2026");
  });

  it("date field shows inline 'darf nicht leer sein' when invoice_date is cleared", async () => {
    render(
      <EditableField
        {...DEFAULT_PROPS}
        fieldPath="invoice_date"
        label="Rechnungsdatum"
        value="2026-04-22"
        initialAiValue="2026-04-22"
        inputKind="date"
      />,
    );
    fireEvent.click(screen.getByText("22.04.2026"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByText("Übernehmen"));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("Dieses Feld darf nicht leer sein");
    });
    expect(correctFieldMock).not.toHaveBeenCalled();
  });

  it("date field rejects ambiguous MM/DD interpretation (15 cannot be a month)", async () => {
    render(
      <EditableField
        {...DEFAULT_PROPS}
        fieldPath="invoice_date"
        label="Rechnungsdatum"
        value="2026-04-22"
        initialAiValue="2026-04-22"
        inputKind="date"
      />,
    );
    fireEvent.click(screen.getByText("22.04.2026"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "03.15.2026" } });
    fireEvent.click(screen.getByText("Übernehmen"));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("Ungültiges Datum");
    });
    expect(correctFieldMock).not.toHaveBeenCalled();
  });

  it("shows inline validation error for invalid decimal amount without blocking typing", async () => {
    render(<EditableField {...DEFAULT_PROPS} fieldPath="net_total" label="Netto" value={100} initialAiValue={100} inputKind="decimal" />);
    fireEvent.click(screen.getByText("100"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.click(screen.getByText("Übernehmen"));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("Ungültiger Betrag");
    });
    expect(correctFieldMock).not.toHaveBeenCalled();
  });
});
