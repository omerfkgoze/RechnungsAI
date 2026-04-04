---
type: bmad-distillate
sources:
  - "../ux-design-specification.md"
downstream_consumer: "general"
created: "2026-04-03"
token_estimate: 10800
parts: 7
---

## RechnungsAI UX Design Specification

- AI-powered e-invoicing/accounting SaaS for German micro-businesses (5-20 employees); Wachstumschancengesetz mandates XRechnung/ZUGFeRD by Jan 2028; 25% SMEs unprepared
- Core promise: 3-hour weekly bookkeeping with 8-15% errors becomes 20-min automated workflow with <2% errors
- Target digital maturity: 5/100; every decision prioritizes simplicity/trust/immediate value over features
- Platform: Mobile-first PWA (add-to-home-screen, no browser chrome); mobile=capture device, desktop=bulk review/export
- Design system: shadcn/ui + Tailwind CSS + Radix UI primitives; components copied into project (/components/ui/); full ownership, no external dependency
- Tech stack alignment: React/Next.js App Router; Framer Motion for animations
- Font: Inter (tabular-nums for financial data; fallback: system font stack); 16px min body on mobile
- Primary color: Prussian Blue #003153 (HSL 204 100% 16%); confidence: green #2ECC71 >95%, amber #F39C12 70-95%, red #E74C3C <70%
- WCAG 2.1 AA compliance required; European Accessibility Act (effective June 2025); confidence colors always paired with icons + text labels
- Dark mode: not in MVP; token architecture supports future addition
- Address form: informal "Du" in-app; formal "Sie" for Steuerberater-facing outputs
- Sections: user-personas, core-experience-and-patterns, design-system-and-visual, user-journeys, components-and-implementation, responsive-and-accessibility

## Section Manifest

- [01-user-personas.md](01-user-personas.md) — Target users (Thomas, Lisa, Frau Schmidt), design challenges, and opportunities
- [02-core-experience-and-patterns.md](02-core-experience-and-patterns.md) — Core interaction model, emotional design, UX inspiration, anti-patterns
- [03-design-system-and-visual.md](03-design-system-and-visual.md) — Colors, typography, spacing, animation, design direction choice
- [04-user-journeys.md](04-user-journeys.md) — Onboarding, daily capture/review, DATEV export, error recovery flows
- [05-components-and-implementation.md](05-components-and-implementation.md) — shadcn/ui usage, 7 MVP custom components, state management, roadmap
- [06-responsive-and-accessibility.md](06-responsive-and-accessibility.md) — Responsive strategy, WCAG compliance, UX consistency patterns, testing
