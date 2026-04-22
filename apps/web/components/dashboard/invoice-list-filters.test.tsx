import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const replaceMock = vi.fn();
let searchParamsValue = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  useSearchParams: () => searchParamsValue,
  usePathname: () => "/dashboard",
}));

import { InvoiceListFilters } from "./invoice-list-filters";

beforeEach(() => {
  replaceMock.mockReset();
  searchParamsValue = new URLSearchParams();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("InvoiceListFilters", () => {
  it("debounces supplier text updates by 300ms before writing to URL", () => {
    render(<InvoiceListFilters />);
    const input = screen.getByLabelText("Lieferant suchen");
    fireEvent.change(input, { target: { value: "ACME" } });
    expect(replaceMock).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(replaceMock).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(replaceMock).toHaveBeenCalledOnce();
    const call = (replaceMock.mock.calls[0]?.[0] ?? "") as string;
    expect(call).toContain("supplier=ACME");
  });

  it("commits status select change immediately (no debounce)", () => {
    render(<InvoiceListFilters />);
    const select = screen.getByLabelText("Status");
    fireEvent.change(select, { target: { value: "ready" } });
    expect(replaceMock).toHaveBeenCalledOnce();
    const call = (replaceMock.mock.calls[0]?.[0] ?? "") as string;
    expect(call).toContain("status=ready");
  });

  it("reset button navigates to plain /dashboard", () => {
    searchParamsValue = new URLSearchParams({ status: "ready", supplier: "X" });
    render(<InvoiceListFilters />);
    fireEvent.click(screen.getByText("Filter zurücksetzen"));
    expect(replaceMock).toHaveBeenCalledWith("/dashboard", { scroll: false });
  });

  it("date inputs commit 'from' and 'to' params on change", () => {
    render(<InvoiceListFilters />);
    const from = screen.getByLabelText("Von");
    fireEvent.change(from, { target: { value: "2026-04-01" } });
    const to = screen.getByLabelText("Bis");
    fireEvent.change(to, { target: { value: "2026-04-30" } });
    const calls = replaceMock.mock.calls.map((c) => c[0] as string);
    expect(calls.some((c) => c.includes("from=2026-04-01"))).toBe(true);
    expect(calls.some((c) => c.includes("to=2026-04-30"))).toBe(true);
  });

  it("sort select writes 'sort' param for non-default values", () => {
    render(<InvoiceListFilters />);
    const sort = screen.getByLabelText("Sortieren nach");
    fireEvent.change(sort, { target: { value: "amount_desc" } });
    expect(replaceMock).toHaveBeenCalledOnce();
    const call = (replaceMock.mock.calls[0]?.[0] ?? "") as string;
    expect(call).toContain("sort=amount_desc");
  });
});
