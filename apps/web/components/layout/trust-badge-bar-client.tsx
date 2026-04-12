"use client";

import { useEffect, useState } from "react";
import { TrustBadgeBar } from "./trust-badge-bar";

const SCROLL_THRESHOLD = 48;

export function TrustBadgeBarClient() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--trust-bar-height",
      collapsed ? "28px" : "36px",
    );
  }, [collapsed]);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    let ticking = false;
    let detach: (() => void) | null = null;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        setCollapsed(window.scrollY > SCROLL_THRESHOLD);
        ticking = false;
      });
    };

    const attach = () => {
      setCollapsed(window.scrollY > SCROLL_THRESHOLD);
      window.addEventListener("scroll", onScroll, { passive: true });
      detach = () => window.removeEventListener("scroll", onScroll);
    };

    const sync = () => {
      if (mql.matches) {
        detach?.();
        detach = null;
        setCollapsed(false);
      } else if (!detach) {
        attach();
      }
    };

    sync();
    mql.addEventListener("change", sync);

    return () => {
      mql.removeEventListener("change", sync);
      detach?.();
    };
  }, []);

  return (
    <div className="sticky top-0 z-40">
      <TrustBadgeBar collapsed={collapsed} />
    </div>
  );
}
