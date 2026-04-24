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
