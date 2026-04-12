# Deferred Work

## Deferred from: code review of 1-2-design-token-system-and-base-layout (2026-04-12)

- `.dark` theme tokens removed but `dark:` variants remain in shadcn primitives (badge, sheet, dropdown-menu). Latent dead code; no runtime impact while `.dark` class is never applied. Revisit when dark mode is reintroduced or strip `dark:` variants for cleanliness.
- `next/font/local` lacks `adjustFontFallback`. Causes measurable CLS when Inter swaps in over the fallback stack. Optimization, not in AC.
- Four weight-specific Inter woff2 files are all declared `preload: true` (~400-500KB critical-path). A single variable Inter file would cut the font payload ~40% and improve LCP on slow networks.
- `font-feature-settings: "cv11", "ss01"` on body may silently no-op if the subsetted woff2 lacks feature tables. Cosmetic (alternate `a`/`l` glyphs); verify or drop.
- DelayedLoading `aria-busy="true"` never transitions to `false`. Screen readers remain "busy" indefinitely on stuck loads.
- Skeleton loading provides no initial "Lädt…" announcement until the 5s "Dauert etwas länger…" message fires. AT users hear silence for 5s.
