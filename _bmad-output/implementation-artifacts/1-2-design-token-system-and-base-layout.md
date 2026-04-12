# Story 1.2: Design Token System and Base Layout

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want a visually consistent, responsive interface with clear navigation,
So that I can easily find my way around the application on any device.

## Acceptance Criteria

1. **Given** the Next.js application is initialized **When** design tokens are inspected **Then** `apps/web/app/globals.css` defines the full color palette as HSL CSS custom properties (primary Prussian Blue `204 100% 16%`, primary-light Steel Blue `207 44% 49%`, success/confidence-high Emerald `145 63% 49%`, warning/confidence-medium Amber `37 90% 51%`, destructive/confidence-low Soft Red `6 78% 57%`, info Ocean Blue `204 70% 53%`, foreground Charcoal `210 29% 24%`, secondary-foreground Slate Gray `210 14% 53%`, muted `215 16% 65%`, border `214 32% 91%`, surface `210 40% 98%`, background Snow `210 40% 96%`, card `0 0% 100%`) — all shadcn/ui semantic tokens remap to these values via `@theme inline`.
2. **Given** the token system is implemented **When** typography is applied **Then** Inter is self-hosted as WOFF2 under `apps/web/public/fonts/` using `next/font/local`, loaded with `variable: "--font-sans"` and `display: "swap"`; `font-variant-numeric: tabular-nums` is available via a utility (e.g. `.tabular-nums` or token) and used on all financial amount styles; fallback stack is `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`.
3. **Given** the type scale is defined **When** heading and text classes are used **Then** tokens match the UX spec scale — `display` 28px mobile / 36px desktop @ 700, `h1` 24/30px @ 600, `h2` 20/24px @ 600, `h3` 17/20px @ 600, `body` 16px @ 400, `body-sm` 14px @ 400, `caption` 12px @ 400, `amount` 18/20px @ 600 tabular-nums, `amount-lg` 24/32px @ 700 tabular-nums.
4. **Given** spacing, radius, and animation tokens are defined **When** `globals.css` is inspected **Then** spacing uses a 4px base unit (`--space-1` = 4px through `--space-12` = 48px), radius tokens are `--radius-sm: 6px`, `--radius-md: 8px`, `--radius-lg: 12px`, `--radius-xl: 16px`, `--radius-full: 9999px`, and animation tokens are `--animation-fast: 150ms`, `--animation-normal: 250ms`, `--animation-slow: 350ms`.
5. **Given** the app is viewed at a mobile viewport (320–767px) **When** a user visits any `(app)` route **Then** a bottom navigation bar renders with 3 items — Dashboard (Übersicht), Erfassen (center FAB, prominent), Archiv — at 64px bar height with always-visible German labels; all touch targets are ≥ 48×48px with ≥ 8px gap; the layout is single-column with 16px horizontal padding.
6. **Given** the app is viewed at a desktop viewport (≥ 1024px) **When** the layout renders **Then** a left sidebar navigation is displayed (240px expanded, 64px collapsed via toggle) containing Dashboard, Erfassen, Archiv, Einstellungen with lucide icons + German labels; the main content container is centered with `max-width: 1280px`; active route is visually indicated (background + left border or equivalent) and the selected state uses the Primary token.
7. **Given** the tablet viewport (768–1023px) **When** the layout renders **Then** the mobile bottom navigation pattern is retained (per UX spec) with enhanced content padding; the layout does not switch to sidebar until ≥ 1024px.
8. **Given** the `TrustBadgeBar` component is implemented **When** it renders at the top of every `(app)` route **Then** it shows German flag emoji/icon + "Gehostet in Deutschland" + GoBD + DSGVO badges at 28–36px height using Primary color at 5% opacity background; it collapses to icon-only when the page scrolls past a threshold; it is never dismissable, never interactive (non-focusable), and has `aria-label="Vertrauenskennzeichen"`.
9. **Given** a page intentionally has no content **When** the `EmptyState` component renders **Then** it shows centered content with an `h2` headline, `body-sm` description, and optional primary action button; tone is encouraging and neutral (no sad faces, no "oops", no English); styling uses space-10 vertical breathing room.
10. **Given** a route is loading **When** a `loading.tsx` file resolves **Then** Skeleton/shimmer primitives render matching the expected content shape (never a full-screen spinner); after 5s a `Dauert etwas länger...` message appears; after 15s a `Nochmal versuchen?` retry option appears; all shimmer animations respect `@media (prefers-reduced-motion: reduce)` by disabling the sweep.
11. **Given** the shell is complete **When** `pnpm build`, `pnpm lint`, and `pnpm check-types` are run from the repo root **Then** all three pass with zero errors; the app renders at `/` (temporary landing or redirect) without hydration warnings.

## Tasks / Subtasks

- [ ] Task 1: Design Token System in `globals.css` (AC: #1, #3, #4)
  - [ ] 1.1 Replace default shadcn neutral tokens in `apps/web/app/globals.css` with the full RechnungsAI palette as HSL triplets (NOT `oklch`) — primary, primary-light, primary-foreground, success, warning, destructive, info, foreground, secondary-foreground, muted, muted-foreground, border, surface, background, card, card-foreground, accent, accent-foreground
  - [ ] 1.2 Define confidence-scoring tokens (`--confidence-high`, `--confidence-medium`, `--confidence-low`) aliased to semantic success/warning/destructive
  - [ ] 1.3 Extend the `@theme inline { ... }` block so Tailwind v4 utilities (`bg-primary`, `text-destructive`, etc.) resolve to the new tokens using `hsl(var(--token))`
  - [ ] 1.4 Add spacing tokens `--space-1` through `--space-12` on a 4px scale (also exposed as Tailwind via `@theme inline --spacing-*` if needed; otherwise rely on Tailwind's built-in 0.25rem scale — document choice)
  - [ ] 1.5 Add `--radius-sm/md/lg/xl/full` tokens and wire them into `@theme inline` for `rounded-*` utilities
  - [ ] 1.6 Add `--animation-fast/normal/slow` tokens; expose as Tailwind `duration-*` via `@theme inline --animate-duration-*` OR document usage via arbitrary `duration-[var(--animation-fast)]`
  - [ ] 1.7 Type-scale utilities: add custom CSS classes or `@theme inline` text size tokens for `display`, `h1`, `h2`, `h3`, `body`, `body-sm`, `caption`, `amount`, `amount-lg` matching the mobile→desktop responsive sizes from UX spec (use `clamp()` or breakpoint rules)
  - [ ] 1.8 Add a global `@media (prefers-reduced-motion: reduce)` rule that disables `transition-*` and keyframe animations
  - [ ] 1.9 Delete unused chart and sidebar color tokens inherited from shadcn init if they are not needed for Story 1.2 — keep only what's in the ACs (chart tokens may be deferred but keep sidebar tokens since the sidebar is in scope)

- [ ] Task 2: Inter Self-Hosted Font (AC: #2)
  - [ ] 2.1 Download Inter v4 WOFF2 files (weights 400, 500, 600, 700 — variable font preferred; otherwise the 4 static weights) from rsms.me/inter or Google Fonts and place under `apps/web/public/fonts/`
  - [ ] 2.2 In `apps/web/app/layout.tsx`, replace `Geist` / `Geist_Mono` imports with `localFont` from `next/font/local`; configure `variable: "--font-sans"`, `display: "swap"`, `preload: true`, `fallback: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]`
  - [ ] 2.3 Remove the `next/font/google` Geist dependencies from `layout.tsx`
  - [ ] 2.4 Wire the font CSS variable onto `<html>` via `className={inter.variable}` so Tailwind `font-sans` uses Inter
  - [ ] 2.5 Update `<html lang="en">` to `<html lang="de">` — the app is German-only per PRD
  - [ ] 2.6 Update `export const metadata` in `layout.tsx` to German: `title: "RechnungsAI"`, `description: "Rechnungen blitzschnell archivieren — GoBD-sicher, DSGVO-konform."`

- [ ] Task 3: shadcn/ui Component Installation (AC: #5, #6, #8, #9, #10)
  - [ ] 3.1 From `apps/web/`, run `pnpm dlx shadcn@latest add button card badge sheet skeleton separator tooltip dropdown-menu` — Button already exists, this is additive
  - [ ] 3.2 Verify the installed components live under `apps/web/components/ui/` and use the updated design tokens (primary, etc.) automatically — spot-check `button.tsx` variants
  - [ ] 3.3 Do NOT install Form/Input/Select/Table — those are Story 1.3+ scope

- [ ] Task 4: Layout Components — `components/layout/` (AC: #5, #6, #7, #8)
  - [ ] 4.1 Create `apps/web/components/layout/trust-badge-bar.tsx` — Server Component, renders the 4 badges (Flag, GoBD, DSGVO, Hetzner/DE hosting) using lucide-react icons where available, otherwise inline SVG; height 28–36px; background `bg-primary/5`; text uses `text-primary text-xs`; NOT focusable (`aria-hidden="false"` but no buttons/links); accept optional `collapsed?: boolean` prop for scroll-triggered icon-only mode
  - [ ] 4.2 Create `apps/web/components/layout/trust-badge-bar-client.tsx` — Client Component wrapper that owns the scroll listener (IntersectionObserver or `window.scroll`) and toggles `collapsed` state; throttle to 60fps; disable observer if `prefers-reduced-motion`
  - [ ] 4.3 Create `apps/web/components/layout/mobile-nav.tsx` — Client Component (uses `usePathname`); fixed bottom bar, 64px height, 3 items in a grid (Dashboard, Erfassen FAB, Archiv); Erfassen slot is a 56px circular FAB lifted ~16px above the bar centered; labels always visible at 12px `caption`; active item uses `text-primary`, inactive uses `text-muted-foreground`; each tap target ≥ 48×48px with 8px gap; hidden at `lg:` breakpoint
  - [ ] 4.4 Create `apps/web/components/layout/sidebar-nav.tsx` — Client Component; 240px expanded / 64px collapsed; items Dashboard, Erfassen, Archiv, Einstellungen; lucide icons; collapse state stored in a Zustand `ui-store` if not too heavy — otherwise local component state via `useState` + `localStorage`; keyboard-accessible (arrow key focus movement is NOT required for MVP, just tab-order); only visible at `lg:` breakpoint and above
  - [ ] 4.5 Create `apps/web/components/layout/app-shell.tsx` — Server Component that composes: `<TrustBadgeBarClient />` sticky at top, main content slot, `<MobileNav />` (lg:hidden), `<SidebarNav />` (hidden lg:block); main content container has `max-w-[1280px] mx-auto px-4 lg:px-6`
  - [ ] 4.6 Create `apps/web/components/layout/empty-state.tsx` — Server Component; props `{ title: string; description?: string; action?: React.ReactNode }`; centered vertical layout with `py-10` (space-10)
  - [ ] 4.7 Create `apps/web/components/layout/delayed-loading.tsx` — Client Component; takes children (skeleton); uses `useEffect` timers to render `Dauert etwas länger...` after 5s and `Nochmal versuchen?` button after 15s; retry button calls `router.refresh()` from `next/navigation`
  - [ ] 4.8 All layout files are kebab-case filenames with PascalCase default exports; co-locate no tests in this story (Vitest not yet installed — deferred)

- [ ] Task 5: `(app)` Route Group Scaffold (AC: #5, #6, #7, #11)
  - [ ] 5.1 Create `apps/web/app/(app)/layout.tsx` — Server Component; wraps `children` in `<AppShell>`; NO auth check yet (that's Story 1.3)
  - [ ] 5.2 Create `apps/web/app/(app)/dashboard/page.tsx` — temporary placeholder rendering `<EmptyState title="Dashboard" description="Übersicht kommt in Story 1.5." />` (this will be replaced by Story 1.5)
  - [ ] 5.3 Create `apps/web/app/(app)/dashboard/loading.tsx` — renders Skeleton shell matching the expected pipeline/stats layout (3 stat cards + 4 pipeline rows) wrapped in `<DelayedLoading>`
  - [ ] 5.4 Update root `apps/web/app/page.tsx` — redirect to `/dashboard` for now (use `redirect()` from `next/navigation`) OR render a simple landing marker; the redirect is preferred for Story 1.2 verification
  - [ ] 5.5 Create `apps/web/app/not-found.tsx` with a German 404: `<EmptyState title="Seite nicht gefunden" description="Die angeforderte Seite existiert nicht mehr." action={...}/>`
  - [ ] 5.6 Create `apps/web/app/error.tsx` (Client Component with `"use client"`) — generic German error boundary: `Etwas ist schiefgelaufen. Bitte lade die Seite neu.` with a retry button calling `reset()`; log to console with prefix `[layout:error]` — Sentry wiring is deferred to a later story

- [ ] Task 6: Accessibility & Motion (AC: #10)
  - [ ] 6.1 Verify all interactive elements have visible focus rings using `--primary-light` via Tailwind `focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary-light))]` or an equivalent utility
  - [ ] 6.2 Confirm `prefers-reduced-motion: reduce` disables shimmer/animations in Skeleton components (add `motion-reduce:animate-none` where relevant)
  - [ ] 6.3 Color contrast smoke check: Charcoal `#2C3E50` on Snow `#F1F5F9`, Primary `#003153` on white — both ≥ 4.5:1 (documented in Dev Notes, no automated test this story)
  - [ ] 6.4 Touch targets in `MobileNav` are ≥ 48×48px (verify in dev tools / manual browser check)

- [ ] Task 7: Verification & Dev Server Check (AC: #11)
  - [ ] 7.1 Run `pnpm lint` from repo root — zero errors
  - [ ] 7.2 Run `pnpm check-types` in `apps/web` — zero errors (also `pnpm -w turbo run check-types` if wired)
  - [ ] 7.3 Run `pnpm build` from repo root — full Turborepo build succeeds
  - [ ] 7.4 Run `pnpm dev`, open `http://localhost:3000`, verify:
    - Root redirects to `/dashboard`
    - Mobile viewport (Chrome devtools 375px) shows bottom nav + trust badge bar
    - Desktop viewport (≥ 1024px) shows sidebar + trust badge bar; bottom nav is hidden
    - Throwing an error in a test page invokes `error.tsx`
    - Navigating to an unknown route invokes `not-found.tsx`
  - [ ] 7.5 Visually confirm Inter font is loaded (Devtools → Network → woff2 request; or computed style on `body` shows `Inter` first)
  - [ ] 7.6 Verify no hydration warnings in the browser console

## Dev Notes

### CRITICAL: Next.js 16 Breaking Changes

This project uses **Next.js 16.2.3** — APIs, conventions, and file structure may differ from LLM training data. `apps/web/AGENTS.md` explicitly instructs: *"Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices."* Specifically check the current shape of:

- `next/font/local` options (especially `fallback`, `display`, `variable`)
- `redirect()` from `next/navigation`
- Route group conventions (`(group)` folders)
- `error.tsx` / `not-found.tsx` / `loading.tsx` conventions
- Turbopack dev config

If any usage in this story conflicts with the installed Next.js docs, **defer to the installed docs**.

### Tailwind CSS v4 Token Wiring

This project uses Tailwind v4 with `@import "tailwindcss"` in `globals.css` (NOT `@tailwind base/components/utilities`). Tokens are bridged to utilities via the `@theme inline { ... }` block. Pattern:

```css
:root {
  --primary: 204 100% 16%; /* HSL triplet, no hsl() wrapper */
  --primary-foreground: 0 0% 100%;
}

@theme inline {
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
}
```

This keeps tokens swappable (e.g. future dark mode) while generating proper Tailwind utilities (`bg-primary`, `text-primary-foreground`).

**Do NOT** use `oklch()` — the existing `globals.css` default values are `oklch`, but the UX spec and token system use HSL. Replace them all.

### Design Token Reference Table (from UX spec)

| Token                     | HSL                 | Hex     | Role                          |
| ------------------------- | ------------------- | ------- | ----------------------------- |
| `--primary`               | `204 100% 16%`      | #003153 | Prussian Blue — authority     |
| `--primary-light`         | `207 44% 49%`       | #4682B4 | Steel Blue — hover/focus      |
| `--primary-foreground`    | `0 0% 100%`         | #FFFFFF | Text on primary               |
| `--success` / `--confidence-high`   | `145 63% 49%` | #2ECC71 | Approve, green zone     |
| `--warning` / `--confidence-medium` | `37 90% 51%`  | #F39C12 | Amber zone              |
| `--destructive` / `--confidence-low`| `6 78% 57%`   | #E74C3C | Red zone, errors        |
| `--info`                  | `204 70% 53%`       | #3498DB | Informational             |
| `--foreground`            | `210 29% 24%`       | #2C3E50 | Charcoal primary text     |
| `--secondary-foreground`  | `210 14% 53%`       | #708090 | Slate Gray secondary text |
| `--muted` / `--muted-foreground` | `215 16% 65%` | #94A3B8 | Disabled, placeholders |
| `--border`                | `214 32% 91%`       | #CBD5E1 | Card borders              |
| `--surface`               | `210 40% 98%`       | #F8FAFC | Elevated surfaces         |
| `--background`            | `210 40% 96%`       | #F1F5F9 | Page background           |
| `--card`                  | `0 0% 100%`         | #FFFFFF | Card background           |

### File Targets (final state after this story)

```
apps/web/
  app/
    globals.css                             # Rewritten — HSL tokens, type scale, animation tokens
    layout.tsx                              # Inter localFont, lang="de", German metadata
    page.tsx                                # Redirects to /dashboard
    not-found.tsx                           # NEW — German 404
    error.tsx                               # NEW — German error boundary
    (app)/
      layout.tsx                            # NEW — wraps children in <AppShell>
      dashboard/
        page.tsx                            # NEW — placeholder EmptyState
        loading.tsx                         # NEW — Skeleton + DelayedLoading
  components/
    ui/
      button.tsx                            # existing
      card.tsx                              # NEW (shadcn add)
      badge.tsx                             # NEW (shadcn add)
      sheet.tsx                             # NEW (shadcn add)
      skeleton.tsx                          # NEW (shadcn add)
      separator.tsx                         # NEW (shadcn add)
      tooltip.tsx                           # NEW (shadcn add)
      dropdown-menu.tsx                     # NEW (shadcn add)
    layout/
      app-shell.tsx                         # NEW
      trust-badge-bar.tsx                   # NEW (Server)
      trust-badge-bar-client.tsx            # NEW (Client)
      mobile-nav.tsx                        # NEW (Client)
      sidebar-nav.tsx                       # NEW (Client)
      empty-state.tsx                       # NEW (Server)
      delayed-loading.tsx                   # NEW (Client)
  public/
    fonts/
      Inter-*.woff2                         # NEW — self-hosted
```

### Anti-Patterns to Avoid (from architecture + story 1.1 learnings)

- DO NOT use `@tailwind base/components/utilities` directives — Tailwind v4 uses `@import "tailwindcss"`.
- DO NOT use `oklch()` — this story replaces the default shadcn palette with HSL.
- DO NOT add Framer Motion yet — swipe gestures / cascade animations ship with Story 2.x / 3.x; native CSS transitions are sufficient here. Keep the bundle lean.
- DO NOT add Zustand unless needed — sidebar collapse state can use `useState` + `localStorage`. If you reach for Zustand, place the store at `apps/web/stores/ui-store.ts` per the architecture directory map.
- DO NOT add Vitest, tests, or `*.test.tsx` in this story — testing harness setup is a separate story. Story 1.1 review deferred this intentionally.
- DO NOT install Form, Input, Select, or Table shadcn components — those land with Story 1.3 (auth) and Story 1.5 (settings).
- DO NOT use `src/` directory (intentional `--no-src-dir` per Story 1.1).
- DO NOT use English user-facing text — all copy in conversational German with "Du" address per NFR24 and UX spec tone rules.
- DO NOT create Supabase clients, Server Actions, or middleware yet — authentication lands in Story 1.3.
- DO NOT use `any` type anywhere. Infer types from props or Zod where possible.
- DO NOT add `console.log` without `[module:action]` prefix; the only logging in this story is the error boundary (`[layout:error]`).

### Previous Story Intelligence (Story 1.1)

- Turborepo + pnpm workspaces are set up; run lint/build from repo root to hit all workspaces.
- The 8 domain packages (shared, ai, datev, validation, gobd, pdf, email + config packages) are scaffolded but empty — this story does NOT populate them.
- `packages/shared/src/types/action-result.ts` already exports `ActionResult<T>` — not needed for this story (no Server Actions), but be aware it exists.
- Supabase local dev is wired via `.env.local` but this story does NOT touch Supabase. Avoid importing from `@supabase/ssr` in this story.
- `eslint-plugin-only-warn` is active in domain packages — errors appear as warnings there. `apps/web` uses `@rechnungsai/eslint-config/next-js` which enforces errors strictly. Expect lint to be strict inside `apps/web/`.
- Story 1.1 review caught: `.env*` leaked into Docker context; `Dockerfile` now pins pnpm@10.33.0; `apps/web/tsconfig.json` extends `@rechnungsai/typescript-config/nextjs.json`. Follow the same discipline — extend shared configs, don't duplicate.
- Story 1.1 review deferred: `globalEnv` in `turbo.json`, import-boundary ESLint enforcement, domain package `build` scripts. All out of scope here.
- shadcn init was run with `style: "base-nova"`, `baseColor: "neutral"`, `cssVariables: true`. New components you `shadcn add` will use the updated tokens automatically once `globals.css` is rewritten — verify after adding.

### Architecture Compliance (from architecture.md)

- Component organization: feature-based folders (`components/layout/`, `components/ui/`) per `#Implementation Patterns & Consistency Rules → Structure Patterns`.
- Naming: kebab-case files, PascalCase components, camelCase functions, `@rechnungsai/{name}` for packages.
- Server Components by default; only opt into `"use client"` for interactivity (`MobileNav`, `SidebarNav`, `TrustBadgeBarClient`, `DelayedLoading`, `error.tsx`).
- Import aliases configured in `components.json`: `@/components`, `@/lib/utils`, `@/components/ui`.
- Every Server Action (future) must return `ActionResult<T>` — not relevant here but remember the shape.
- All dates, currency, error messages use the formats in `#Format Patterns` / `#Process Patterns` when they start appearing in later stories.

### Library/Framework Versions (current lockfile)

| Library         | Version   | Notes                                               |
| --------------- | --------- | --------------------------------------------------- |
| next            | 16.2.3    | App Router, Turbopack dev, read `node_modules/next/dist/docs/` |
| react / react-dom | 19.2.4  | React 19 — use new form/transition APIs only when needed |
| tailwindcss     | ^4        | `@import "tailwindcss"`, `@theme inline` pattern    |
| shadcn (cli)    | ^4.2.0    | `pnpm dlx shadcn@latest add <component>`            |
| lucide-react    | ^1.8.0    | Icon library                                        |
| class-variance-authority | ^0.7.1 | shadcn variant helper                          |
| clsx / tailwind-merge | ^2.1.1 / ^3.5.0 | `cn()` utility in `lib/utils.ts`        |
| tw-animate-css  | ^1.4.0    | Already imported in `globals.css` for shadcn animations |
| @base-ui/react  | ^1.3.0    | shadcn base-nova style underlying primitives        |

No new runtime dependencies should be added in this story beyond the shadcn components pulled by the CLI. If the shadcn CLI wants to install peers, let it — don't manually add them.

### German Copy Library (for this story)

| Element                  | German text                                          |
| ------------------------ | ---------------------------------------------------- |
| MobileNav: Dashboard     | "Übersicht"                                          |
| MobileNav: Erfassen FAB  | "Erfassen"                                           |
| MobileNav: Archiv        | "Archiv"                                             |
| SidebarNav: Einstellungen| "Einstellungen"                                      |
| TrustBadgeBar            | "🇩🇪 Gehostet in Deutschland"  ·  "GoBD"  ·  "DSGVO"  |
| Loading delay (5s)       | "Dauert etwas länger..."                             |
| Loading retry (15s)      | "Nochmal versuchen"                                  |
| 404 title                | "Seite nicht gefunden"                               |
| 404 description          | "Die angeforderte Seite existiert nicht mehr."       |
| 404 action               | "Zurück zur Übersicht"                               |
| Error boundary title     | "Etwas ist schiefgelaufen"                           |
| Error boundary description | "Bitte lade die Seite neu oder versuche es gleich noch einmal." |
| Error boundary retry     | "Erneut versuchen"                                   |
| Dashboard placeholder    | title "Dashboard" · description "Übersicht kommt in Story 1.5." |

Use `lang="de"` on `<html>` so screen readers announce correctly.

### Accessibility Contract

- `<html lang="de">` (change from `lang="en"`)
- All navigation links carry meaningful `aria-label` (e.g. `aria-label="Zur Übersicht"` on the Dashboard icon link)
- `<nav>` wrappers with `aria-label="Hauptnavigation"` (sidebar) and `aria-label="Mobile Navigation"` (bottom bar)
- `TrustBadgeBar` wrapped in `<div role="status" aria-label="Vertrauenskennzeichen">` — not a `<nav>`, not interactive
- Focus-visible rings use `--primary-light`, never removed with `outline: none` without a replacement
- Skeleton components have `aria-busy="true"` and `aria-live="polite"` on their parent region

### Project Structure Notes

- Story 1.2 creates the first user-facing UI in the project. Any pattern set here (icon conventions, layout prop shapes, focus styles) will be copied by later stories — keep it clean and minimal.
- The `(app)` route group scaffolded here becomes the home of dashboard, invoices, capture, archive, settings, etc. in Epic 2–8. Do not leak auth logic into `(app)/layout.tsx` — that belongs in Story 1.3 via `middleware.ts`.
- `(auth)` and `(onboarding)` route groups are NOT created in this story.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2] — acceptance criteria and user story
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Visual Design Foundation → Color System] — full color palette, HSL values, rationale
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Typography System] — Inter, type scale, tabular-nums rules
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Spacing & Layout Foundation] — 4px scale, radius tokens, touch targets
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Empty States] — tone, structure, German copy
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Loading States] — skeleton patterns, 5s/15s delay rules
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Responsive Design & Accessibility] — mobile/tablet/desktop breakpoints, 48×48px touch targets
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Implementation Approach — Animation Specifications] — 150/250/350ms tokens
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture] — RSC default, Zustand minimal, Framer Motion deferred
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules] — naming, structure, enforcement
- [Source: _bmad-output/planning-artifacts/architecture.md#Complete Project Directory Structure] — layout of `app/`, `components/`, `public/fonts/`
- [Source: _bmad-output/implementation-artifacts/1-1-monorepo-and-nextjs-project-initialization.md] — prior conventions and review-deferred items
- [Source: apps/web/AGENTS.md] — "Read node_modules/next/dist/docs/ before writing Next.js code"

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
