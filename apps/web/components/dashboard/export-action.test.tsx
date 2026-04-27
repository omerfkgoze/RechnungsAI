import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ExportAction } from "./export-action";

// 2026-04-15 — middle of the month (not last 5 days)
const MID_MONTH = new Date("2026-04-15T12:00:00Z");
// 2026-04-29 — within last 5 days of April (daysLeft=1)
const MONTH_END = new Date("2026-04-29T12:00:00Z");
// 2026-04-30 — last day of April (daysLeft=0)
const LAST_DAY = new Date("2026-04-30T12:00:00Z");

describe("ExportAction", () => {
  it("Dormant variant when readyCount=0", () => {
    render(<ExportAction readyCount={0} now={MID_MONTH} />);
    const el = screen.getByTestId("export-action");
    expect(el.getAttribute("data-variant")).toBe("Dormant");
  });

  it("Available variant when readyCount is 1–9", () => {
    render(<ExportAction readyCount={5} now={MID_MONTH} />);
    const el = screen.getByTestId("export-action");
    expect(el.getAttribute("data-variant")).toBe("Available");
  });

  it("Prominent variant when readyCount >= 10", () => {
    render(<ExportAction readyCount={12} now={MID_MONTH} />);
    const el = screen.getByTestId("export-action");
    expect(el.getAttribute("data-variant")).toBe("Prominent");
  });

  it("MonthEndUrgent variant during last 5 days of month with readyCount > 0", () => {
    render(<ExportAction readyCount={3} now={MONTH_END} />);
    const el = screen.getByTestId("export-action");
    expect(el.getAttribute("data-variant")).toBe("MonthEndUrgent");
  });

  it("MonthEndUrgent text shows 'heute' on last day of month", () => {
    render(<ExportAction readyCount={3} now={LAST_DAY} />);
    expect(screen.getByText(/Monat endet heute/)).toBeTruthy();
  });

  it("onExport callback fires with readyCount when button clicked", () => {
    const onExport = vi.fn();
    render(<ExportAction readyCount={5} now={MID_MONTH} onExport={onExport} />);
    fireEvent.click(screen.getByTestId("export-action-button"));
    expect(onExport).toHaveBeenCalledOnce();
  });
});
