import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { DashboardKeyboardShortcuts } from "./dashboard-keyboard-shortcuts";

const mockPush = vi.fn();
const mockApproveInvoice = vi.fn().mockResolvedValue({ success: true });
const mockShowActionToast = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/app/actions/invoices", () => ({
  approveInvoice: mockApproveInvoice,
  undoInvoiceAction: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/components/ui/action-toast-context", () => ({
  useActionToast: () => ({ showActionToast: mockShowActionToast }),
}));

function fireKey(key: string, options: Partial<KeyboardEventInit> = {}) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...options }));
  });
}

function addInvoiceRow(id: string): HTMLElement {
  const el = document.createElement("a");
  el.setAttribute("data-invoice-id", id);
  el.setAttribute("href", `/rechnungen/${id}`);
  document.body.appendChild(el);
  return el;
}

function clearInvoiceRows() {
  document.querySelectorAll("[data-invoice-id]").forEach((el) => el.remove());
}

function addInvoiceActionsHeader(): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-invoice-actions-header", "true");
  document.body.appendChild(el);
  return el;
}

vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
  matches: query === "(min-width: 1024px)",
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

describe("DashboardKeyboardShortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearInvoiceRows();
    document.querySelectorAll("[data-invoice-actions-header]").forEach((el) => el.remove());
    document.querySelectorAll("[data-export-cta]").forEach((el) => el.remove());
  });

  afterEach(() => {
    clearInvoiceRows();
    document.querySelectorAll("[data-invoice-actions-header]").forEach((el) => el.remove());
    document.querySelectorAll("[data-export-cta]").forEach((el) => el.remove());
  });

  it("ArrowDown selects the first invoice row on first press", () => {
    addInvoiceRow("invoice-1");
    addInvoiceRow("invoice-2");
    render(<DashboardKeyboardShortcuts />);

    fireKey("ArrowDown");

    const first = document.querySelector("[data-invoice-id='invoice-1']");
    expect(first?.getAttribute("data-keyboard-selected")).toBe("true");
  });

  it("ArrowUp from no selection wraps to select the last row", () => {
    addInvoiceRow("invoice-1");
    addInvoiceRow("invoice-2");
    addInvoiceRow("invoice-3");
    render(<DashboardKeyboardShortcuts />);

    fireKey("ArrowUp");

    const last = document.querySelector("[data-invoice-id='invoice-3']");
    expect(last?.getAttribute("data-keyboard-selected")).toBe("true");
  });

  it("Enter calls router.push with ?selected=<id> when a row is selected", () => {
    addInvoiceRow("invoice-abc");
    render(<DashboardKeyboardShortcuts />);

    fireKey("ArrowDown");
    fireKey("Enter");

    expect(mockPush).toHaveBeenCalledWith("?selected=invoice-abc", { scroll: false });
  });

  it("A is ignored by DashboardKeyboardShortcuts when invoice-actions-header is in DOM (detail pane wins)", () => {
    addInvoiceActionsHeader();
    render(<DashboardKeyboardShortcuts />);

    fireKey("a");

    // DashboardKeyboardShortcuts should early-return; approveInvoice not called from this component
    expect(mockApproveInvoice).not.toHaveBeenCalled();
  });

  it("E clicks the [data-export-cta] element when present", () => {
    const exportEl = document.createElement("button");
    exportEl.setAttribute("data-export-cta", "true");
    const clickFn = vi.fn();
    exportEl.addEventListener("click", clickFn);
    document.body.appendChild(exportEl);

    render(<DashboardKeyboardShortcuts />);

    fireKey("e");

    expect(clickFn).toHaveBeenCalledTimes(1);
    exportEl.remove();
  });

  it("ignores keydown when an input element is focused", () => {
    addInvoiceRow("invoice-1");
    addInvoiceRow("invoice-2");
    render(<DashboardKeyboardShortcuts />);

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    fireKey("ArrowDown");

    const first = document.querySelector("[data-invoice-id='invoice-1']");
    expect(first?.getAttribute("data-keyboard-selected")).toBeNull();
    input.remove();
  });
});
