"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function DashboardKeyboardShortcuts() {
  const router = useRouter();
  const cursorIdRef = useRef<string | null>(null);

  useEffect(() => {

    function getInvoiceRows(): HTMLElement[] {
      return Array.from(document.querySelectorAll<HTMLElement>("[data-invoice-id]"));
    }

    function clearCursor() {
      document.querySelectorAll("[data-keyboard-selected='true']").forEach((el) => {
        (el as HTMLElement).removeAttribute("data-keyboard-selected");
        (el as HTMLElement).classList.remove("ring-2", "ring-offset-2", "ring-primary");
      });
    }

    function setCursor(el: HTMLElement) {
      clearCursor();
      el.setAttribute("data-keyboard-selected", "true");
      el.classList.add("ring-2", "ring-offset-2", "ring-primary");
      cursorIdRef.current = el.getAttribute("data-invoice-id");
    }

    function moveCursor(direction: "down" | "up") {
      const rows = getInvoiceRows();
      if (rows.length === 0) return;
      const currentIdx = rows.findIndex((r) => r.getAttribute("data-keyboard-selected") === "true");
      let nextIdx: number;
      if (currentIdx === -1) {
        nextIdx = direction === "down" ? 0 : rows.length - 1;
      } else {
        nextIdx = direction === "down"
          ? (currentIdx + 1) % rows.length
          : (currentIdx - 1 + rows.length) % rows.length;
      }
      const target = rows[nextIdx];
      if (target) setCursor(target);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.isComposing || e.keyCode === 229) return;
      if (!window.matchMedia("(min-width: 1024px)").matches) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        (active instanceof HTMLElement && active.contentEditable === "true")
      ) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveCursor("down");
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveCursor("up");
        return;
      }
      if (e.key === "Enter") {
        const id = cursorIdRef.current;
        if (!id) return;
        e.preventDefault();
        try {
          router.push(`?selected=${id}`, { scroll: false });
        } catch {
          // defensive — router.push shouldn't throw
        }
        return;
      }
      if (e.key.toLowerCase() === "a") {
        // If detail pane is mounted, let it handle the shortcut
        if (document.querySelector("[data-invoice-actions-header]")) return;
        return;
      }
      if (e.key.toLowerCase() === "e") {
        e.preventDefault();
        try {
          const exportCta = document.querySelector<HTMLElement>("[data-export-cta]");
          exportCta?.click();
        } catch {
          // defensive
        }
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearCursor();
    };
  }, [router]);

  return null;
}
