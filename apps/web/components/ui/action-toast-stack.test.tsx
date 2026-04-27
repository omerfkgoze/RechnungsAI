import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ActionToastProvider, useActionToast } from "./action-toast-context";
import { ActionToastStack } from "./action-toast-stack";

function Harness({
  onShow,
}: {
  onShow: (api: ReturnType<typeof useActionToast>) => void;
}) {
  const api = useActionToast();
  return (
    <button type="button" onClick={() => onShow(api)}>
      trigger
    </button>
  );
}

function renderWithProvider(onShow: (api: ReturnType<typeof useActionToast>) => void) {
  return render(
    <ActionToastProvider>
      <Harness onShow={onShow} />
      <ActionToastStack />
    </ActionToastProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ActionToastStack", () => {
  it("appears via context showActionToast and renders the message", () => {
    let api!: ReturnType<typeof useActionToast>;
    renderWithProvider((a) => {
      api = a;
    });
    fireEvent.click(screen.getByText("trigger"));
    act(() => {
      api.showActionToast({
        kind: "approved",
        invoiceId: "inv-1",
        message: "Rechnung freigegeben.",
        undo: vi.fn(),
      });
    });
    expect(screen.getByTestId("action-toast-approved")).toBeDefined();
    expect(screen.getByText("Rechnung freigegeben.")).toBeDefined();
  });

  it("auto-dismisses after 5000ms", () => {
    let api!: ReturnType<typeof useActionToast>;
    renderWithProvider((a) => {
      api = a;
    });
    fireEvent.click(screen.getByText("trigger"));
    act(() => {
      api.showActionToast({
        kind: "approved",
        invoiceId: "inv-1",
        message: "Rechnung freigegeben.",
        undo: vi.fn(),
      });
    });
    expect(screen.queryByTestId("action-toast-approved")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(5001);
    });
    expect(screen.queryByTestId("action-toast-approved")).toBeNull();
  });

  it("Rückgängig button invokes the supplied undo callback and removes the toast", async () => {
    let api!: ReturnType<typeof useActionToast>;
    renderWithProvider((a) => {
      api = a;
    });
    const undo = vi.fn();
    fireEvent.click(screen.getByText("trigger"));
    act(() => {
      api.showActionToast({
        kind: "approved",
        invoiceId: "inv-1",
        message: "Rechnung freigegeben.",
        undo,
      });
    });
    const undoBtn = screen.getByRole("button", { name: /Rückgängig/ });
    await act(async () => {
      fireEvent.click(undoBtn);
    });
    expect(undo).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("action-toast-approved")).toBeNull();
  });

  it("max 3 stacked — 4th replaces oldest", () => {
    let api!: ReturnType<typeof useActionToast>;
    renderWithProvider((a) => {
      api = a;
    });
    fireEvent.click(screen.getByText("trigger"));
    act(() => {
      for (let i = 0; i < 4; i++) {
        api.showActionToast({
          kind: "approved",
          invoiceId: `inv-${i}`,
          message: `Toast ${i}`,
          undo: vi.fn(),
        });
      }
    });
    // Toast 0 should have been evicted.
    expect(screen.queryByText("Toast 0")).toBeNull();
    expect(screen.queryByText("Toast 1")).not.toBeNull();
    expect(screen.queryByText("Toast 2")).not.toBeNull();
    expect(screen.queryByText("Toast 3")).not.toBeNull();
    expect(screen.getAllByTestId("action-toast-approved").length).toBe(3);
  });

  it("per-invoice dedup — second toast for same invoice replaces the first", () => {
    let api!: ReturnType<typeof useActionToast>;
    renderWithProvider((a) => {
      api = a;
    });
    fireEvent.click(screen.getByText("trigger"));
    act(() => {
      api.showActionToast({
        kind: "approved",
        invoiceId: "inv-1",
        message: "First",
        undo: vi.fn(),
      });
      api.showActionToast({
        kind: "flagged",
        invoiceId: "inv-1",
        message: "Second",
        undo: vi.fn(),
      });
    });
    expect(screen.queryByText("First")).toBeNull();
    expect(screen.queryByText("Second")).not.toBeNull();
    // Only one toast should be visible total.
    expect(
      screen.queryAllByTestId(/action-toast-/).length,
    ).toBe(1);
  });
});
