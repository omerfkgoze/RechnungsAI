import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SkrCategorySelect } from "./skr-category-select";

const updateSKRMock = vi.fn();
vi.mock("@/app/actions/invoices", () => ({
  updateInvoiceSKR: (...args: unknown[]) => updateSKRMock(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const DEFAULT_PROPS = {
  invoiceId: "inv-1",
  skrCode: "4230",
  skrConfidence: 0.88,
  supplierName: "ACME GmbH",
  skrPlan: "skr03" as const,
  recentCodes: [] as string[],
  isExported: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SkrCategorySelect", () => {
  it("renders AI-suggested code with ConfidenceIndicator", () => {
    render(<SkrCategorySelect {...DEFAULT_PROPS} />);
    expect(screen.getByText(/4230/)).toBeDefined();
    expect(screen.getByText(/Bürobedarf/)).toBeDefined();
    expect(screen.getByLabelText(/SKR-Konto/)).toBeDefined();
  });

  it("opens dropdown and shows full code list on trigger click", async () => {
    render(<SkrCategorySelect {...DEFAULT_PROPS} />);
    const trigger = screen.getByRole("button", { name: /4230/ });
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).toBeDefined();
    expect(screen.getAllByRole("option").length).toBeGreaterThan(5);
  });

  it("typing '3400' in search input filters list to matching result", () => {
    render(<SkrCategorySelect {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: /4230/ }));
    const input = screen.getByPlaceholderText("Suchen...");
    fireEvent.change(input, { target: { value: "3400" } });
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]?.textContent).toContain("3400");
  });

  it("selecting new code calls updateInvoiceSKR and shows learning message", async () => {
    updateSKRMock.mockResolvedValueOnce({ success: true, data: { buSchluessel: 9 } });
    render(<SkrCategorySelect {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: /4230/ }));
    const option3400 = screen
      .getAllByRole("option")
      .find((o) => o.textContent?.includes("3400"))!;
    await act(async () => {
      fireEvent.click(option3400.querySelector("button")!);
    });
    expect(updateSKRMock).toHaveBeenCalledWith({
      invoiceId: "inv-1",
      newSkrCode: "3400",
      supplierName: "ACME GmbH",
    });
    expect(screen.getByRole("status")).toBeDefined();
    expect(screen.getByRole("status").textContent).toContain("ACME GmbH");

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("isExported=true renders as plain text without dropdown trigger", () => {
    render(<SkrCategorySelect {...DEFAULT_PROPS} isExported={true} />);
    expect(screen.getByText(/4230 — Bürobedarf/)).toBeDefined();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("renders skeleton when skrCode is null", () => {
    const { container } = render(<SkrCategorySelect {...DEFAULT_PROPS} skrCode={null} skrConfidence={null} />);
    expect(container.querySelector(".animate-pulse")).toBeDefined();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
