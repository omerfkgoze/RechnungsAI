import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { KeyboardShortcutsHelp } from "./keyboard-shortcuts-help";

vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
  matches: query === "(min-width: 1024px)",
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

describe("KeyboardShortcutsHelp", () => {
  it("renders the 5 new shortcut rows as bound (no 'bald verfügbar' suffix)", () => {
    render(<KeyboardShortcutsHelp />);

    const newBoundKeys = [
      { key: "↑ ↓", description: "Liste navigieren" },
      { key: "Enter", description: "Detail öffnen" },
      { key: "A", description: "Freigeben" },
      { key: "E", description: "DATEV-Export" },
    ];

    for (const { description } of newBoundKeys) {
      const el = screen.queryByText(description);
      expect(el).not.toBeNull();
      expect(el?.closest("tr")?.textContent).not.toContain("bald verfügbar");
    }
  });
});
