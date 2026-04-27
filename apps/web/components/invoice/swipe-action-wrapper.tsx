"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type SwipeActionWrapperProps = {
  children: React.ReactNode;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  disabled?: boolean;
  className?: string;
};

const ACTIVATION_PX = 20;
const THRESHOLD_RATIO = 0.4;
const SNAP_BACK_TRANSITION = "transform 200ms cubic-bezier(0.34,1.56,0.64,1)";
const COMMIT_TRANSITION = "transform 300ms ease-out";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function SwipeActionWrapper({
  children,
  onSwipeRight,
  onSwipeLeft,
  disabled,
  className,
}: SwipeActionWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const activatedRef = useRef(false);
  const vibratedRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const reducedMotionRef = useRef(false);

  const [overlayKind, setOverlayKind] = useState<"approve" | "flag" | null>(null);
  const [overlayOpacity, setOverlayOpacity] = useState(0);

  useEffect(() => {
    reducedMotionRef.current = prefersReducedMotion();
  }, []);

  const resetTransform = useCallback((withTransition: boolean) => {
    const el = containerRef.current;
    if (!el) return;
    el.style.transition = withTransition && !reducedMotionRef.current ? SNAP_BACK_TRANSITION : "";
    el.style.transform = "translateX(0)";
    setOverlayOpacity(0);
    setOverlayKind(null);
    activatedRef.current = false;
    vibratedRef.current = false;
    startXRef.current = null;
    startYRef.current = null;
    pointerIdRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      startXRef.current = e.clientX;
      startYRef.current = e.clientY;
      activatedRef.current = false;
      vibratedRef.current = false;
      pointerIdRef.current = e.pointerId;
      const el = containerRef.current;
      if (el) el.style.transition = "";
    },
    [disabled],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (startXRef.current === null || startYRef.current === null) return;
      if (reducedMotionRef.current) return;
      const dx = e.clientX - startXRef.current;
      const dy = e.clientY - startYRef.current;

      // Below activation distance, treat as click. Above, engage horizontal swipe
      // only if horizontal motion dominates (avoid hijacking vertical scroll).
      if (!activatedRef.current) {
        if (Math.abs(dx) < ACTIVATION_PX) return;
        if (Math.abs(dy) > Math.abs(dx)) return;
        activatedRef.current = true;
        const target = e.currentTarget;
        if (pointerIdRef.current !== null && target.setPointerCapture) {
          try {
            target.setPointerCapture(pointerIdRef.current);
          } catch {
            // jsdom or unsupported — non-fatal
          }
        }
      }

      const el = containerRef.current;
      if (!el) return;
      const width = el.offsetWidth || 320;
      const threshold = width * THRESHOLD_RATIO;
      el.style.transform = `translateX(${dx}px)`;
      const kind = dx > 0 ? "approve" : "flag";
      setOverlayKind(kind);
      setOverlayOpacity(Math.min(1, Math.abs(dx) / threshold));

      if (!vibratedRef.current && Math.abs(dx) >= threshold) {
        vibratedRef.current = true;
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try {
            navigator.vibrate(50);
          } catch {
            // Best-effort — no fallback needed
          }
        }
      }
    },
    [disabled],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) {
        resetTransform(false);
        return;
      }
      if (startXRef.current === null) return;
      if (!activatedRef.current) {
        // Below 20px — treat as a tap; let the click bubble through.
        resetTransform(false);
        return;
      }
      const dx = e.clientX - startXRef.current;
      const el = containerRef.current;
      if (!el) {
        resetTransform(false);
        return;
      }
      const width = el.offsetWidth || 320;
      const threshold = width * THRESHOLD_RATIO;

      // Past the click-threshold but in a swipe gesture: prevent the click from
      // navigating to the detail page. The Link's onClick will see a synthetic
      // event with no preventDefault available from here, but capturing the
      // post-swipe state in `activatedRef` lets the parent suppress nav.
      e.preventDefault();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e as any).stopPropagation?.();

      if (Math.abs(dx) < threshold) {
        resetTransform(true);
        return;
      }

      const direction = dx > 0 ? "right" : "left";
      el.style.transition = reducedMotionRef.current ? "" : COMMIT_TRANSITION;
      el.style.transform = `translateX(${direction === "right" ? width : -width}px)`;

      const fire = () => {
        if (direction === "right") onSwipeRight();
        else onSwipeLeft();
        resetTransform(false);
      };

      if (reducedMotionRef.current) {
        fire();
      } else {
        const onEnd = () => {
          el.removeEventListener("transitionend", onEnd);
          fire();
        };
        el.addEventListener("transitionend", onEnd, { once: true });
        // Safety net: if the transitionend never fires (e.g. element removed)
        // fall back to a timer slightly longer than the CSS duration.
        setTimeout(() => {
          if (activatedRef.current) {
            el.removeEventListener("transitionend", onEnd);
            fire();
          }
        }, 350);
      }
    },
    [disabled, onSwipeLeft, onSwipeRight, resetTransform],
  );

  const onPointerCancel = useCallback(() => {
    if (!activatedRef.current) {
      startXRef.current = null;
      startYRef.current = null;
      return;
    }
    resetTransform(true);
  }, [resetTransform]);

  // Suppress click navigation if a swipe was just committed past activation.
  // Children typically include a Link/<a> — by capture-phase intercepting the
  // click here we keep the underlying click path working for taps.
  const onClickCapture = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (activatedRef.current) {
        e.preventDefault();
        e.stopPropagation();
        activatedRef.current = false;
      }
    },
    [],
  );

  return (
    <div
      ref={containerRef}
      data-testid="swipe-action-wrapper"
      className={cn(
        "relative touch-pan-y select-none",
        // motion-reduce: keep transforms clean (no spring) — buttons are the
        // primary path for users with prefers-reduced-motion.
        "motion-reduce:transition-none",
        className,
      )}
      style={{ transform: "translateX(0)" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClickCapture={onClickCapture}
    >
      {overlayKind ? (
        <div
          aria-hidden
          data-testid={`swipe-overlay-${overlayKind}`}
          className={cn(
            "pointer-events-none absolute inset-0 rounded-lg",
            overlayKind === "approve"
              ? "bg-gradient-to-r from-transparent to-confidence-high/70"
              : "bg-gradient-to-l from-transparent to-confidence-medium/70",
          )}
          style={{ opacity: overlayOpacity }}
        />
      ) : null}
      {children}
    </div>
  );
}
