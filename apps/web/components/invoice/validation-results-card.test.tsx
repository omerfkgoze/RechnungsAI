import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { ValidationViolation } from "@rechnungsai/validation";

const revalidateMock = vi.fn();
const requestCorrectionMock = vi.fn();
vi.mock("@/app/actions/invoices/review", () => ({
  revalidateInvoice: (...a: unknown[]) => revalidateMock(...a),
  requestCorrection: (...a: unknown[]) => requestCorrectionMock(...a),
}));

import { ValidationResultsCard } from "./validation-results-card";

const baseViolation = (over: Partial<ValidationViolation> = {}): ValidationViolation => ({
  ruleId: "BR-01",
  category: "BR",
  severity: "error",
  citation: "EN 16931",
  message: "Pflichtfeld BT-1 (Rechnungsnummer) fehlt.",
  ...over,
});

const baseProps = {
  invoiceId: "11111111-1111-1111-1111-111111111111",
  errors: [] as ValidationViolation[],
  ruleSetVersion: "kosit-2.5.0" as string | null,
  validatedAt: "2026-05-15T10:00:00.000Z" as string | null,
  correctionRequestedAt: null as string | null,
  supplierEmail: "lieferant@beispiel.de" as string | null,
  supplierName: "Acme GmbH" as string | null,
  invoiceNumber: "R-001" as string | null,
  invoiceDateIso: "2026-05-12" as string | null,
  tenantCompanyName: "Müller GmbH",
};

beforeEach(() => {
  vi.clearAllMocks();
  revalidateMock.mockResolvedValue({ success: true, data: { status: "valid", violationCount: 0 } });
  requestCorrectionMock.mockResolvedValue({
    success: true,
    data: { correctionRequestedAt: "2026-05-15T10:00:00.000Z" },
  });
});

describe("ValidationResultsCard — render per status", () => {
  it("status='skipped' renders nothing", () => {
    const { container } = render(<ValidationResultsCard {...baseProps} status="skipped" />);
    expect(container.firstChild).toBeNull();
  });

  it("status='pending' renders a busy skeleton", () => {
    render(<ValidationResultsCard {...baseProps} status="pending" />);
    const card = screen.getByTestId("validation-card");
    expect(card.getAttribute("data-status")).toBe("pending");
    expect(card.getAttribute("aria-busy")).toBe("true");
  });

  it("status='valid' renders green konform pill", () => {
    render(<ValidationResultsCard {...baseProps} status="valid" />);
    expect(screen.getByText("EN 16931 konform")).toBeTruthy();
    expect(screen.getByTestId("validation-card").getAttribute("data-status")).toBe("valid");
  });

  it("status='warning' shows N Hinweis(e) summary and correction button", () => {
    render(
      <ValidationResultsCard
        {...baseProps}
        status="warning"
        errors={[baseViolation({ severity: "warning", message: "Hinweis A", ruleId: "BR-W-1" })]}
      />,
    );
    expect(screen.getByText("Validierung mit Hinweisen")).toBeTruthy();
    expect(screen.getByText("1 Hinweis(e) gefunden")).toBeTruthy();
    expect(screen.getByText("Lieferant kontaktieren")).toBeTruthy();
  });

  it("status='invalid' shows fatal/error count + Korrektur anfordern button", () => {
    render(
      <ValidationResultsCard
        {...baseProps}
        status="invalid"
        errors={[
          baseViolation({ severity: "error", ruleId: "BR-E-1" }),
          baseViolation({ severity: "warning", ruleId: "BR-W-1", message: "w" }),
        ]}
      />,
    );
    expect(screen.getByText("Validierungsfehler")).toBeTruthy();
    expect(screen.getByText("1 Fehler, 1 Hinweis(e) gefunden")).toBeTruthy();
    expect(screen.getByText("Korrektur anfordern")).toBeTruthy();
  });

  it("status='unsupported' shows the konformes Format Anfordern button (no revalidate)", () => {
    render(<ValidationResultsCard {...baseProps} status="unsupported" />);
    expect(screen.getByText("E-Rechnungsformat nicht unterstützt")).toBeTruthy();
    expect(screen.getByText("Konformes Format anfordern")).toBeTruthy();
    expect(screen.queryByText("Neu validieren")).toBeNull();
  });

  it("renders stale-rule-set banner + Neu validieren button only when version is older", () => {
    render(
      <ValidationResultsCard
        {...baseProps}
        status="invalid"
        ruleSetVersion="kosit-2.4.0"
        errors={[baseViolation()]}
      />,
    );
    expect(screen.getByText("Regelwerk wurde aktualisiert. Bitte neu validieren.")).toBeTruthy();
    expect(screen.getByText("Neu validieren")).toBeTruthy();
  });

  it("hides Neu validieren when rule set is current", () => {
    render(
      <ValidationResultsCard
        {...baseProps}
        status="invalid"
        ruleSetVersion="kosit-2.5.0"
        errors={[baseViolation()]}
      />,
    );
    expect(screen.queryByText("Neu validieren")).toBeNull();
  });

  it("renders last-request caption when correction_requested_at is set", () => {
    render(
      <ValidationResultsCard
        {...baseProps}
        status="invalid"
        errors={[baseViolation()]}
        correctionRequestedAt="2026-05-15T10:00:00.000Z"
      />,
    );
    expect(screen.getByText(/Letzte Anfrage:/)).toBeTruthy();
  });
});

describe("CorrectionEmailButton interactions", () => {
  it("renders an <a href='mailto:…'> link wired to the helper output", () => {
    render(
      <ValidationResultsCard
        {...baseProps}
        status="invalid"
        errors={[baseViolation()]}
      />,
    );
    const link = screen.getByText("Korrektur anfordern").closest("a");
    expect(link).toBeTruthy();
    expect(link?.getAttribute("href")?.startsWith("mailto:lieferant@beispiel.de")).toBe(true);
  });

  it("clicking calls requestCorrection with violation count", async () => {
    render(
      <ValidationResultsCard
        {...baseProps}
        status="invalid"
        errors={[baseViolation(), baseViolation({ ruleId: "BR-02" })]}
      />,
    );
    const link = screen.getByText("Korrektur anfordern").closest("a")!;
    await act(async () => {
      fireEvent.click(link);
    });
    expect(requestCorrectionMock).toHaveBeenCalledWith(
      baseProps.invoiceId,
      { violationCount: 2 },
    );
  });

  it("Server Action failure surfaces a non-blocking warning", async () => {
    requestCorrectionMock.mockResolvedValueOnce({
      success: false,
      error: "Korrekturanfrage konnte nicht gespeichert werden.",
    });
    render(
      <ValidationResultsCard
        {...baseProps}
        status="invalid"
        errors={[baseViolation()]}
      />,
    );
    const link = screen.getByText("Korrektur anfordern").closest("a")!;
    await act(async () => {
      fireEvent.click(link);
    });
    expect(
      screen.getByText(/Korrekturanfrage konnte nicht protokolliert/),
    ).toBeTruthy();
  });
});

describe("RevalidateButton interactions", () => {
  it("clicking calls revalidateInvoice and surfaces success message", async () => {
    render(
      <ValidationResultsCard
        {...baseProps}
        status="invalid"
        ruleSetVersion="kosit-2.4.0"
        errors={[baseViolation()]}
      />,
    );
    const btn = screen.getByText("Neu validieren").closest("button")!;
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(revalidateMock).toHaveBeenCalledWith(baseProps.invoiceId);
    expect(screen.getByText("Validierung aktualisiert.")).toBeTruthy();
  });
});
