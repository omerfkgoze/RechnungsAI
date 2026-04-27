import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, act } from "@testing-library/react";
import { SessionSummary } from "./session-summary";

const FIRST_SESSION_KEY = "rai_session_seen";

const BASE_PROPS = {
  invoiceCount: 5,
  readyCount: 0,
  errorCount: 0,
  streakWeeks: 0,
  sessionStartMs: Date.now() - 60_000,
};

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
});

function rerenderWithReviewDrop(reviewCounts: number[], extra: Partial<typeof BASE_PROPS> = {}) {
  // Need to seed first session as "seen" to avoid FirstSession variant
  window.sessionStorage.setItem(FIRST_SESSION_KEY, "1");
  const { rerender } = render(
    <SessionSummary {...BASE_PROPS} {...extra} reviewCount={reviewCounts[0]!} />,
  );
  for (let i = 1; i < reviewCounts.length; i++) {
    act(() => {
      rerender(<SessionSummary {...BASE_PROPS} {...extra} reviewCount={reviewCounts[i]!} />);
    });
  }
}

describe("SessionSummary", () => {
  it("renders Perfect variant when errorCount=0 and review queue clears", () => {
    rerenderWithReviewDrop([2, 0]);
    const card = screen.getByTestId("session-summary");
    expect(card.getAttribute("data-variant")).toBe("Perfect");
    expect(screen.getByText(/Perfekte Session/)).toBeDefined();
  });

  it("renders WithCorrections when errorCount > 0", () => {
    rerenderWithReviewDrop([1, 0], { errorCount: 3 });
    const card = screen.getByTestId("session-summary");
    expect(card.getAttribute("data-variant")).toBe("WithCorrections");
  });

  it("renders ExportPrompt when readyCount >= 10", () => {
    rerenderWithReviewDrop([1, 0], { readyCount: 12 });
    const card = screen.getByTestId("session-summary");
    expect(card.getAttribute("data-variant")).toBe("ExportPrompt");
  });

  it("renders FirstSession when sessionStorage is empty", () => {
    // Don't seed — first session
    const { rerender } = render(
      <SessionSummary {...BASE_PROPS} reviewCount={2} />,
    );
    act(() => {
      rerender(<SessionSummary {...BASE_PROPS} reviewCount={0} />);
    });
    const card = screen.getByTestId("session-summary");
    expect(card.getAttribute("data-variant")).toBe("FirstSession");
  });

  it("dismiss button hides summary and writes sessionStorage flag", () => {
    rerenderWithReviewDrop([1, 0]);
    expect(screen.queryByTestId("session-summary")).not.toBeNull();
    fireEvent.click(screen.getByTestId("session-summary-dismiss"));
    expect(screen.queryByTestId("session-summary")).toBeNull();
    expect(window.sessionStorage.getItem(FIRST_SESSION_KEY)).toBe("1");
  });
});
