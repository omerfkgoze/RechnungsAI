import path from "node:path";
import { Font } from "@react-pdf/renderer";

let registered = false;

/**
 * Registers the embedded Noto Sans family with @react-pdf/renderer.
 *
 * Default PDF fonts (Helvetica/Times) are ASCII-only and cannot render
 * `ä ö ü ß` (AC3). Noto Sans (SIL OFL 1.1) covers full Unicode.
 *
 * Call at MODULE level in the route/Server Action (not inside the handler):
 * registering inside the request path races with `renderToBuffer` and
 * produces garbled glyphs (spike P1, F-3). The `registered` guard makes
 * repeat module-level calls idempotent.
 */
export function registerFonts(): void {
  if (registered) return;
  const fontsDir = path.join(process.cwd(), "public", "fonts");
  Font.register({
    family: "NotoSans",
    fonts: [
      { src: path.join(fontsDir, "NotoSans-Regular.ttf"), fontWeight: "normal" },
      { src: path.join(fontsDir, "NotoSans-Bold.ttf"), fontWeight: "bold" },
    ],
  });
  registered = true;
}
