This section covers responsive design, accessibility, and UX consistency. Part 6 of 6 from ux-design-specification.md.

## Responsive Design, Accessibility, and UX Consistency

- Button hierarchy: 3-tier max per screen; Primary=filled Primary/Success color 48px full-width mobile (one per screen); Secondary=outlined Primary Light 44px; Tertiary=text-only Slate Gray 44px invisible target
- Context button colors: Approve=Green #2ECC71; Navigate=Blue #003153; Destructive=Red #E74C3C outlined only never filled; Export=Blue #003153
- Button rules: never two primary on same screen; destructive never most prominent; mobile primary always bottom-positioned; labels=imperative verbs ("Freigeben" not "Freigabe"); min 2 words preferred
- Feedback: success=inline green checkmark (1s), toast bottom-center green border (3s auto-dismiss), SessionSummary card (persistent), haptic 50ms; warning=amber bg+icon+text (persistent), amber toast with action (persistent), inline amber banner (persistent); error=red bg+icon+guidance (persistent), amber toast NOT red modal with retry (persistent), full-screen gentle error with retry+support (persistent)
- Feedback rules: never red alert modals; strongest negative=amber toast; all errors conversational German; success non-blocking; undo 5s after destructive/approval; toasts stack max 3
- Undo pattern: bottom toast with "Rueckgaengig" link + 5-second countdown bar; auto-dismiss=permanent; next action replaces previous undo toast
- Form patterns: smart defaults (edit not create); single column mobile; labels above fields; required=subtle asterisk; optional grouped under "Weitere Angaben" accordion collapsed; submit button sticky bottom on mobile
- Input types: amounts=numeric keypad+EUR prefix+German locale; USt-IdNr=DE prefix+9 digits; dates=native picker mobile/shadcn desktop; SKR=searchable select most-used top; supplier=autocomplete known; Berater/Mandanten-Nr=numeric digits only
- Inline correction: field editable with AI value pre-filled; source highlight; appropriate keyboard; Uebernehmen (green) + AI-Wert wiederherstellen (tertiary)
- Validation: real-time for format; on-blur for completeness; never validate mid-typing; messages below field not modal
- Navigation mobile: bottom bar 3 items (Dashboard/Erfassen FAB/Archiv); labels always visible; 64px height; persistent except camera+onboarding; no hamburger menus
- Navigation desktop: left sidebar 240px expanded/64px collapsed; Dashboard/Erfassen/Archiv/Einstellungen
- Page transitions: horizontal slide for lateral; vertical slide for depth
- Settings via profile icon in dashboard header (low frequency)
- Desktop keyboard shortcuts: up/down navigate list; Enter opens detail; A approves; E exports; ? for help
- Empty states: always have clear action+encouraging tone; centered; h2 headline; body-sm description; no sad faces/oops language
- Loading states: never full-screen spinner; always skeleton/shimmer of expected shape; >5s show "Dauert etwas laenger"; >15s show retry; background ops in PipelineHeader only
- Content tone: conversational not technical; imperative verbs; specific not vague; encouraging; quantified; "Du" not "Sie"
- Responsive: mobile primary 320-767px (single column, bottom nav, full-viewport camera, vertical accordion, swipe gestures, 48x48px targets); tablet 768-1023px (single column wider cards, bottom nav retained, no split-view); desktop 1024px+ (split-view left 380px fixed list + right detail, top nav, keyboard shortcuts, hover states)
- Breakpoints: Tailwind defaults; sm 640px; md 768px; lg 1024px split-view activates; xl 1280px; 2xl 1536px; container max-width 1280px
- Accessibility target: WCAG 2.1 Level AA; EU Accessibility Act (effective June 2025)
- Color/contrast: 4.5:1 normal text; 3:1 large text; confidence never color-alone; focus ring 2px solid Primary 2px offset; supports forced high-contrast mode
- Keyboard: all elements Tab-reachable; skip-to-content link; arrow keys in lists (Radix built-in); Escape closes overlays; focus trap in modals
- Screen reader: semantic HTML landmarks; aria-live polite for status changes; form errors via aria-describedby; confidence read as text+percentage
- Touch/motor: 48x48px min targets; 8px min gap; no time-dependent interactions; swipe always has button alternative
- Content a11y: clear simple German; tabular-nums+consistent decimal; dates DD.MM.YYYY; PDF text layer for screen readers
- Testing: device matrix iPhone SE/14, Samsung Galaxy A, iPad, desktop Chrome/Firefox/Safari; network 3G throttle; portrait lock camera only; browsers Chrome/Firefox/Safari/Edge 90+
- A11y testing: axe-core in CI (zero violations); manual keyboard all core flows; VoiceOver+NVDA screen readers; deuteranopia/protanopia simulation; 200% zoom functional
- Dev guidelines: Tailwind responsive prefixes mobile-first; rem for spacing; dvh for viewport; picture+srcset for thumbnails; CSS Grid 380px 1fr at lg; prefers-reduced-motion; Radix primitives for interactive patterns; eslint-plugin-jsx-a11y; never outline:none without replacement
