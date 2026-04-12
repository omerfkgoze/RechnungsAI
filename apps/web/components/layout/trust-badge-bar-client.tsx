"use client";

import { useEffect, useState } from "react";
import { TrustBadgeBar } from "./trust-badge-bar";

const SCROLL_THRESHOLD = 48;

export function TrustBadgeBarClient() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) return;

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        setCollapsed(window.scrollY > SCROLL_THRESHOLD);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="sticky top-0 z-40">
      <TrustBadgeBar collapsed={collapsed} />
    </div>
  );
}
