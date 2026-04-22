import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PipelineHeader, aggregateStageCounts } from "./pipeline-header";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dashboard",
}));

describe("aggregateStageCounts", () => {
  it("folds review into ready bucket", () => {
    const out = aggregateStageCounts([
      { status: "captured", count: 2 },
      { status: "processing", count: 1 },
      { status: "ready", count: 3 },
      { status: "review", count: 4 },
      { status: "exported", count: 5 },
    ]);
    expect(out).toEqual({
      captured: 2,
      processing: 1,
      ready: 7,
      exported: 5,
    });
  });
});

describe("PipelineHeader", () => {
  const base = { captured: 2, processing: 1, ready: 3, exported: 4 } as const;

  it("renders all 4 stages in enum order", () => {
    render(<PipelineHeader stageCounts={base} activeStage={null} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(4);
    expect(buttons[0]).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Erfasst"),
    );
    expect(buttons[1]).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Verarbeitung"),
    );
    expect(buttons[2]).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Bereit"),
    );
    expect(buttons[3]).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Exportiert"),
    );
  });

  it("applies bold + subtle-pulse to Bereit count when > 0", () => {
    render(<PipelineHeader stageCounts={base} activeStage={null} />);
    const readyCount = screen.getByTestId("stage-count-ready");
    expect(readyCount.className).toContain("font-bold");
    expect(readyCount.className).toContain("subtle-pulse");
  });

  it("does NOT apply pulse when Bereit count is 0", () => {
    render(
      <PipelineHeader
        stageCounts={{ ...base, ready: 0 }}
        activeStage={null}
      />,
    );
    const readyCount = screen.getByTestId("stage-count-ready");
    expect(readyCount.className).not.toContain("subtle-pulse");
  });

  it("applies animate-pulse shimmer to Verarbeitung when > 0", () => {
    render(<PipelineHeader stageCounts={base} activeStage={null} />);
    const p = screen.getByTestId("stage-count-processing");
    expect(p.className).toContain("animate-pulse");
  });

  it("dims all counts when every stage is zero", () => {
    render(
      <PipelineHeader
        stageCounts={{ captured: 0, processing: 0, ready: 0, exported: 0 }}
        activeStage={null}
      />,
    );
    for (const stage of ["captured", "processing", "ready", "exported"] as const) {
      const el = screen.getByTestId(`stage-count-${stage}`);
      expect(el.className).toContain("text-muted-foreground");
    }
  });

  it("sets aria-current=true on the active stage only", () => {
    render(<PipelineHeader stageCounts={base} activeStage="ready" />);
    const buttons = screen.getAllByRole("button");
    const current = buttons.filter(
      (b) => b.getAttribute("aria-current") === "true",
    );
    expect(current).toHaveLength(1);
    expect(current[0]?.getAttribute("aria-label")).toContain("Bereit");
  });

  it("renders both mobile-short and desktop-full label spans", () => {
    const { container } = render(
      <PipelineHeader stageCounts={base} activeStage={null} />,
    );
    expect(container.textContent).toContain("Erf.");
    expect(container.textContent).toContain("Erfasst");
    expect(container.textContent).toContain("Verarb.");
    expect(container.textContent).toContain("Export.");
  });
});
