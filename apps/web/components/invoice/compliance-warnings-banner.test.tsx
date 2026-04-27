import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ComplianceWarning } from "@rechnungsai/shared";
import { ComplianceWarningsBanner } from "./compliance-warnings-banner";

const mockScrollIntoView = vi.fn();
const mockFocus = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  mockScrollIntoView.mockClear();
  mockFocus.mockClear();
});

function makeWarning(code: string, field: string, message: string): ComplianceWarning {
  return {
    id: code as ComplianceWarning["id"],
    severity: "amber",
    field,
    code: code as ComplianceWarning["code"],
    message,
  };
}

describe("ComplianceWarningsBanner", () => {
  it("(a) renders amber banner with warning messages when warnings are present", () => {
    const warnings = [
      makeWarning("missing_ust_id", "supplier_tax_id", "Die USt-IdNr fehlt auf dieser Rechnung. Bitte ergänzen oder den Lieferanten kontaktieren."),
      makeWarning("missing_invoice_number", "invoice_number", "Die Rechnungsnummer fehlt. Bitte ergänze sie aus dem Originalbeleg."),
    ];
    const { container } = render(<ComplianceWarningsBanner warnings={warnings} />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(container.querySelector(".bg-warning\\/10")).toBeTruthy();
    expect(screen.getByText("Diese Rechnung benötigt deine Aufmerksamkeit.")).toBeTruthy();
    expect(screen.getByText("Die USt-IdNr fehlt auf dieser Rechnung. Bitte ergänzen oder den Lieferanten kontaktieren.")).toBeTruthy();
    expect(screen.getByText("Die Rechnungsnummer fehlt. Bitte ergänze sie aus dem Originalbeleg.")).toBeTruthy();
  });

  it("(b) returns null (renders nothing) when warnings array is empty", () => {
    const { container } = render(<ComplianceWarningsBanner warnings={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("(c) Zum Feld springen calls scrollIntoView and focuses the element with matching id", () => {
    const warnings = [
      makeWarning("missing_ust_id", "supplier_tax_id", "Die USt-IdNr fehlt."),
    ];
    render(<ComplianceWarningsBanner warnings={warnings} />);

    const fakeEl = document.createElement("div");
    const fakeInput = document.createElement("input");
    fakeEl.appendChild(fakeInput);
    fakeEl.scrollIntoView = mockScrollIntoView;
    fakeInput.focus = mockFocus;

    vi.spyOn(document, "getElementById").mockImplementation((id: string) => {
      if (id === "field-supplier_tax_id") return fakeEl;
      return null;
    });

    const button = screen.getByRole("button", { name: "Zum Feld springen" });
    fireEvent.click(button);

    expect(mockScrollIntoView).toHaveBeenCalledWith({ block: "center" });
    expect(mockFocus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("(d) banner stays visible after re-render (persistent semantics)", () => {
    const warnings = [
      makeWarning("missing_gross_total", "gross_total", "Der Bruttobetrag fehlt."),
    ];
    const { rerender } = render(<ComplianceWarningsBanner warnings={warnings} />);
    expect(screen.getByRole("status")).toBeTruthy();
    rerender(<ComplianceWarningsBanner warnings={warnings} />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("Der Bruttobetrag fehlt.")).toBeTruthy();
  });
});
