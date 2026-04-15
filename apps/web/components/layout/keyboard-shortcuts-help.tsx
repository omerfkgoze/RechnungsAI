"use client";

import { useEffect, useRef, useState } from "react";

const SHORTCUTS = [
  { key: "?", description: "Diese Hilfe öffnen/schließen", bound: true },
  {
    key: "g d",
    description: "Zum Dashboard",
    bound: false,
    // TODO: Epic 3 binds navigation shortcuts
  },
  {
    key: "g e",
    description: "Zu den Einstellungen",
    bound: false,
    // TODO: Epic 3 binds navigation shortcuts
  },
  {
    key: "/",
    description: "Suche (kommt in Epic 3)",
    bound: false,
    // TODO: Epic 3 binds global search shortcut
  },
] as const;

export function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore on mobile viewports
      if (!window.matchMedia("(min-width: 1024px)").matches) return;

      // Ignore when focused on interactive text inputs
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        (active instanceof HTMLElement &&
          active.contentEditable === "true")
      ) {
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  function handleDialogClose() {
    setOpen(false);
  }

  // Click outside (backdrop click) dismisses the dialog
  function handleDialogClick(e: React.MouseEvent<HTMLDialogElement>) {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const rect = dialog.getBoundingClientRect();
    const clickedOutside =
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom;
    if (clickedOutside) setOpen(false);
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={handleDialogClose}
      onClick={handleDialogClick}
      className="rounded-xl border border-border bg-background p-6 shadow-lg backdrop:bg-black/40 open:flex open:flex-col open:gap-4 max-w-sm w-full"
    >
      <h2 className="text-h2 font-semibold text-foreground">Tastenkürzel</h2>
      <table className="w-full text-body-sm">
        <tbody>
          {SHORTCUTS.map(({ key, description, bound }) => (
            <tr key={key} className={bound ? "" : "text-muted-foreground"}>
              <td className="py-1.5 pr-4 font-mono font-medium">
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs">
                  {key}
                </kbd>
              </td>
              <td className="py-1.5">
                {description}
                {!bound && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    (bald verfügbar)
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="mt-2 self-end rounded-md px-3 py-1.5 text-body-sm text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Schließen
      </button>
    </dialog>
  );
}
