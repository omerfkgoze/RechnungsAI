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
});
