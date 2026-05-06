import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const prepareDatevExportMock = vi.fn();
vi.mock("@/app/actions/datev", () => ({
  prepareDatevExport: (...args: unknown[]) => prepareDatevExportMock(...args),
}));

import { DatevExportDialog } from "./datev-export-dialog";

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  readyCount: 7,
  tenantBeraterNr: "12345",
  tenantMandantenNr: "678",
  tenantCompanyName: "Müller GmbH",
};

describe("DatevExportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("(a) opens with readyCount-aware sub-line", () => {
    render(<DatevExportDialog {...baseProps} />);
    expect(screen.getByText("DATEV-Export")).toBeDefined();
    expect(screen.getByText("7 Rechnungen bereit für den Export")).toBeDefined();
  });

  it("(b) types 01052026 in Von — renders 01.05.2026", () => {
    render(<DatevExportDialog {...baseProps} />);
    const von = screen.getByLabelText("Von (Belegdatum)") as HTMLInputElement;
    fireEvent.change(von, { target: { value: "01052026" } });
    expect(von.value).toBe("01.05.2026");
  });

  it("(c) primary disabled when one date is incomplete", () => {
    render(<DatevExportDialog {...baseProps} />);
    const von = screen.getByLabelText("Von (Belegdatum)") as HTMLInputElement;
    fireEvent.change(von, { target: { value: "01.05" } });
    const submit = screen.getByTestId("datev-export-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("(d) missing-settings branch — German prompt + link to /einstellungen", async () => {
    prepareDatevExportMock.mockResolvedValueOnce({
      success: true,
      data: { missingSettings: true, missingFields: ["datev_berater_nr"] },
    });
    render(<DatevExportDialog {...baseProps} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("datev-export-submit"));
    });
    await waitFor(() => {
      expect(
        screen.getByText(/Berater- und Mandantennummer benötigt/),
      ).toBeDefined();
    });
    const link = screen.getByText("Zu den Einstellungen").closest("a")!;
    expect(link.getAttribute("href")).toContain("/einstellungen#datev");
  });

  it("(e) success branch — download anchor has correct href and download attr", async () => {
    prepareDatevExportMock.mockResolvedValueOnce({
      success: true,
      data: {
        missingSettings: false,
        exportId: "abc-123",
        rowCount: 5,
        skippedCount: 0,
        dateFrom: "20260501",
        dateTo: "20260506",
      },
    });
    render(<DatevExportDialog {...baseProps} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("datev-export-submit"));
    });
    await waitFor(() => {
      const anchor = screen.getByTestId("datev-export-download-anchor") as HTMLAnchorElement;
      expect(anchor.getAttribute("href")).toBe("/api/export/datev/abc-123");
      expect(anchor.getAttribute("download")).toBe("datev-export-20260501-20260506.csv");
    });
  });

  it("(f) error branch — destructive paragraph with role=alert", async () => {
    prepareDatevExportMock.mockResolvedValueOnce({
      success: false,
      error: "Im gewählten Zeitraum gibt es keine freigegebenen Rechnungen für den Export.",
    });
    render(<DatevExportDialog {...baseProps} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("datev-export-submit"));
    });
    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("freigegebenen Rechnungen");
    });
  });

  it("(g) mailto encodes umlaut tenant name", async () => {
    prepareDatevExportMock.mockResolvedValueOnce({
      success: true,
      data: {
        missingSettings: false,
        exportId: "abc-123",
        rowCount: 1,
        skippedCount: 0,
        dateFrom: "20260501",
        dateTo: "20260506",
      },
    });
    render(<DatevExportDialog {...baseProps} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("datev-export-submit"));
    });
    await waitFor(() => {
      const mailLink = screen.getByText("Per E-Mail an Steuerberater senden").closest("a")!;
      const href = mailLink.getAttribute("href")!;
      expect(href.startsWith("mailto:?")).toBe(true);
      expect(href).toContain(encodeURIComponent("Müller GmbH"));
    });
  });
});
