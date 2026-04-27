import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SwipeActionWrapper } from "./swipe-action-wrapper";

function setReducedMotion(reduced: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reduced : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function getWrapper(): HTMLElement {
  return screen.getByTestId("swipe-action-wrapper");
}

function pointerEvent(type: string, clientX: number, clientY = 0) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clientX", { value: clientX, configurable: true });
  Object.defineProperty(event, "clientY", { value: clientY, configurable: true });
  Object.defineProperty(event, "pointerId", { value: 1, configurable: true });
  Object.defineProperty(event, "pointerType", { value: "touch", configurable: true });
  Object.defineProperty(event, "button", { value: 0, configurable: true });
  return event;
}

beforeEach(() => {
  setReducedMotion(false);
  // jsdom doesn't implement offsetWidth — patch a fixed value so threshold math is deterministic.
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    value: 320,
  });
  // navigator.vibrate is undefined in jsdom — provide a spyable stub.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (navigator as any).vibrate = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SwipeActionWrapper", () => {
  it("below 20px movement does not commit a swipe — handlers are not called", () => {
    const onRight = vi.fn();
    const onLeft = vi.fn();
    render(
      <SwipeActionWrapper onSwipeRight={onRight} onSwipeLeft={onLeft}>
        <a href="/x">card</a>
      </SwipeActionWrapper>,
    );
    const el = getWrapper();
    fireEvent(el, pointerEvent("pointerdown", 100));
    fireEvent(el, pointerEvent("pointermove", 110)); // 10px
    fireEvent(el, pointerEvent("pointerup", 110));
    expect(onRight).not.toHaveBeenCalled();
    expect(onLeft).not.toHaveBeenCalled();
  });

  it("above-threshold right-swipe calls onSwipeRight after transitionend", () => {
    const onRight = vi.fn();
    const onLeft = vi.fn();
    render(
      <SwipeActionWrapper onSwipeRight={onRight} onSwipeLeft={onLeft}>
        <a href="/x">card</a>
      </SwipeActionWrapper>,
    );
    const el = getWrapper();
    fireEvent(el, pointerEvent("pointerdown", 100));
    fireEvent(el, pointerEvent("pointermove", 250)); // 150px > 20px activation, > 128px threshold (40% of 320)
    fireEvent(el, pointerEvent("pointerup", 250));
    // Trigger the transitionend the wrapper attaches one-shot
    fireEvent.transitionEnd(el);
    expect(onRight).toHaveBeenCalledOnce();
    expect(onLeft).not.toHaveBeenCalled();
  });

  it("above-threshold left-swipe calls onSwipeLeft", () => {
    const onRight = vi.fn();
    const onLeft = vi.fn();
    render(
      <SwipeActionWrapper onSwipeRight={onRight} onSwipeLeft={onLeft}>
        <a href="/x">card</a>
      </SwipeActionWrapper>,
    );
    const el = getWrapper();
    fireEvent(el, pointerEvent("pointerdown", 200));
    fireEvent(el, pointerEvent("pointermove", 50)); // -150px
    fireEvent(el, pointerEvent("pointerup", 50));
    fireEvent.transitionEnd(el);
    expect(onLeft).toHaveBeenCalledOnce();
    expect(onRight).not.toHaveBeenCalled();
  });

  it("below-threshold release snaps back via transform reset", () => {
    const onRight = vi.fn();
    const onLeft = vi.fn();
    render(
      <SwipeActionWrapper onSwipeRight={onRight} onSwipeLeft={onLeft}>
        <a href="/x">card</a>
      </SwipeActionWrapper>,
    );
    const el = getWrapper();
    fireEvent(el, pointerEvent("pointerdown", 100));
    fireEvent(el, pointerEvent("pointermove", 130)); // 30px > activation, < threshold(128)
    fireEvent(el, pointerEvent("pointerup", 130));
    expect(el.style.transform).toBe("translateX(0)");
    expect(onRight).not.toHaveBeenCalled();
  });

  it("vibrates at threshold crossing during pointermove", () => {
    render(
      <SwipeActionWrapper onSwipeRight={vi.fn()} onSwipeLeft={vi.fn()}>
        <a href="/x">card</a>
      </SwipeActionWrapper>,
    );
    const el = getWrapper();
    fireEvent(el, pointerEvent("pointerdown", 100));
    fireEvent(el, pointerEvent("pointermove", 250)); // crosses threshold
    expect(navigator.vibrate).toHaveBeenCalledWith(50);
  });

  it("prefers-reduced-motion: reduce disables swipe activation", () => {
    setReducedMotion(true);
    const onRight = vi.fn();
    render(
      <SwipeActionWrapper onSwipeRight={onRight} onSwipeLeft={vi.fn()}>
        <a href="/x">card</a>
      </SwipeActionWrapper>,
    );
    const el = getWrapper();
    fireEvent(el, pointerEvent("pointerdown", 100));
    fireEvent(el, pointerEvent("pointermove", 250));
    fireEvent(el, pointerEvent("pointerup", 250));
    expect(onRight).not.toHaveBeenCalled();
    expect(navigator.vibrate).not.toHaveBeenCalled();
  });

  it("disabled prop suppresses gesture handling entirely", () => {
    const onRight = vi.fn();
    render(
      <SwipeActionWrapper onSwipeRight={onRight} onSwipeLeft={vi.fn()} disabled>
        <a href="/x">card</a>
      </SwipeActionWrapper>,
    );
    const el = getWrapper();
    fireEvent(el, pointerEvent("pointerdown", 100));
    fireEvent(el, pointerEvent("pointermove", 250));
    fireEvent(el, pointerEvent("pointerup", 250));
    expect(onRight).not.toHaveBeenCalled();
  });
});
