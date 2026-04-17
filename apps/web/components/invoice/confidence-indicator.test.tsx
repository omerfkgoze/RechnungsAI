import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfidenceIndicator } from "./confidence-indicator";

describe("ConfidenceIndicator", () => {
  it("renders aria-label in German with field name and percent", () => {
    render(
      <ConfidenceIndicator
        confidence={0.95}
        variant="dot"
        fieldName="Lieferant"
        explanation={null}
      />,
    );
    expect(
      screen.getByLabelText("Lieferant: Konfidenz 95%, hoch"),
    ).toBeInTheDocument();
  });

  it("returns 'mittel' just below high threshold (0.94)", () => {
    render(
      <ConfidenceIndicator
        confidence={0.94}
        variant="dot"
        fieldName="X"
        explanation={null}
      />,
    );
    expect(
      screen.getByLabelText("X: Konfidenz 94%, mittel"),
    ).toBeInTheDocument();
  });

  it("returns 'niedrig' below medium threshold (0.5)", () => {
    render(
      <ConfidenceIndicator
        confidence={0.5}
        variant="bar"
        fieldName="Total"
        explanation={null}
      />,
    );
    expect(
      screen.getByLabelText("Total: Konfidenz 50%, niedrig"),
    ).toBeInTheDocument();
  });

  it("renders as a button when onTap is provided and fires click", () => {
    const onTap = vi.fn();
    render(
      <ConfidenceIndicator
        confidence={0.8}
        variant="badge"
        fieldName="Betrag"
        explanation="Unscharf"
        onTap={onTap}
      />,
    );
    const btn = screen.getByRole("button");
    btn.click();
    expect(onTap).toHaveBeenCalledOnce();
  });

  it("renders explanation text under value for amber/red levels only", () => {
    const { rerender } = render(
      <ConfidenceIndicator
        confidence={0.6}
        variant="dot"
        fieldName="X"
        explanation="Unscharfes Bild"
      />,
    );
    expect(screen.getByText("Unscharfes Bild")).toBeInTheDocument();

    rerender(
      <ConfidenceIndicator
        confidence={0.99}
        variant="dot"
        fieldName="X"
        explanation="irrelevant"
      />,
    );
    expect(screen.queryByText("irrelevant")).not.toBeInTheDocument();
  });

  it("renders the badge variant with percent text", () => {
    render(
      <ConfidenceIndicator
        confidence={0.72}
        variant="badge"
        fieldName="Gesamt"
        explanation={null}
      />,
    );
    expect(screen.getByText("72%")).toBeInTheDocument();
  });
});
