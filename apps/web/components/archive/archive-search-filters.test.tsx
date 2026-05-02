import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const replaceMock = vi.fn();
let searchParamsValue = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/archiv",
  useSearchParams: () => searchParamsValue,
}));

import { ArchiveSearchFilters } from "./archive-search-filters";

beforeEach(() => {
  replaceMock.mockReset();
  searchParamsValue = new URLSearchParams();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ArchiveSearchFilters", () => {
  it("supplier filter debounces URL update by 300ms", () => {
    render(<ArchiveSearchFilters />);
    const input = screen.getByLabelText("Lieferant");
    fireEvent.change(input, { target: { value: "Muster GmbH" } });
    expect(replaceMock).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(300); });
    expect(replaceMock).toHaveBeenCalledOnce();
    const call = (replaceMock.mock.calls[0]?.[0] ?? "") as string;
    expect(call).toContain("supplier=Muster+GmbH");
  });

  it("reset button clears all query params — navigates to plain /archiv", () => {
    searchParamsValue = new URLSearchParams({ supplier: "X", fiscalYear: "2025" });
    render(<ArchiveSearchFilters />);
    fireEvent.click(screen.getByText("Filter zurücksetzen"));
    expect(replaceMock).toHaveBeenCalledWith("/archiv", { scroll: false });
  });

  it("fiscal year input immediately writes to URL without 300ms debounce", () => {
    render(<ArchiveSearchFilters />);
    const input = screen.getByLabelText(/Geschäftsjahr/i);
    fireEvent.change(input, { target: { value: "2025" } });
    // No timer advance needed — fiscalYear uses direct writeParams
    expect(replaceMock).toHaveBeenCalledOnce();
    const call = (replaceMock.mock.calls[0]?.[0] ?? "") as string;
    expect(call).toContain("fiscalYear=2025");
  });

  // Patch 11: fiscalYear and dateFrom can coexist — setting fiscalYear does not clear dateFrom.
  it("fiscalYear param coexists with dateFrom in URL — override-only-when-absent semantics", () => {
    searchParamsValue = new URLSearchParams({ dateFrom: "2025-01-01" });
    render(<ArchiveSearchFilters />);
    const fiscal = screen.getByLabelText(/Geschäftsjahr/i);
    fireEvent.change(fiscal, { target: { value: "2025" } });
    const call = (replaceMock.mock.calls[0]?.[0] ?? "") as string;
    // Both params must survive in the URL so the server can apply override-only-when-absent logic.
    expect(call).toContain("dateFrom=2025-01-01");
    expect(call).toContain("fiscalYear=2025");
  });

  // Patch 20: German active-mask date input converts to ISO on write.
  it("valid German date (TT.MM.JJJJ) converts to ISO and writes to URL immediately", () => {
    render(<ArchiveSearchFilters />);
    const from = screen.getByLabelText("Von (Belegdatum)");
    fireEvent.change(from, { target: { value: "31.12.2025" } });
    expect(replaceMock).toHaveBeenCalledOnce();
    const call = (replaceMock.mock.calls[0]?.[0] ?? "") as string;
    expect(call).toContain("dateFrom=2025-12-31");
  });

  it("partial German date (incomplete) does not write to URL", () => {
    render(<ArchiveSearchFilters />);
    const from = screen.getByLabelText("Von (Belegdatum)");
    fireEvent.change(from, { target: { value: "15.03" } });
    // Not a complete date (only 6 chars), parseGermanDate returns null → no write
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("logically-invalid German date (99.99.9999) does not write to URL", () => {
    render(<ArchiveSearchFilters />);
    const from = screen.getByLabelText("Von (Belegdatum)");
    fireEvent.change(from, { target: { value: "99.99.9999" } });
    // parseGermanDate rejects month 99 → no write
    expect(replaceMock).not.toHaveBeenCalled();
  });

  // Patch 23: Filter contradiction hard-validation.
  it("dateFrom > dateTo shows German error message and blocks URL write", () => {
    render(<ArchiveSearchFilters />);
    const from = screen.getByLabelText("Von (Belegdatum)");
    const to = screen.getByLabelText("Bis (Belegdatum)");
    // Set dateFrom first (valid, writes to URL)
    fireEvent.change(from, { target: { value: "31.12.2025" } });
    replaceMock.mockReset();
    // Set dateTo to a date earlier than dateFrom
    fireEvent.change(to, { target: { value: "01.01.2025" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Bis-Datum muss nach Von-Datum liegen");
    // URL must NOT have been updated for the invalid dateTo
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("minAmount > maxAmount shows German error message and blocks URL write for amounts", () => {
    render(<ArchiveSearchFilters />);
    const min = screen.getByLabelText("Betrag von");
    const max = screen.getByLabelText("Betrag bis");
    fireEvent.change(min, { target: { value: "500" } });
    fireEvent.change(max, { target: { value: "100" } });
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByRole("alert")).toHaveTextContent("Maximalbetrag muss größer als Minimalbetrag sein");
    // Neither amount param should appear in URL when contradictory
    const calls = replaceMock.mock.calls.map((c) => c[0] as string);
    expect(calls.every((c) => !c.includes("minAmount") && !c.includes("maxAmount"))).toBe(true);
  });
});
