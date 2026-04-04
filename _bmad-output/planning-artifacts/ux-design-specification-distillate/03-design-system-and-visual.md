This section covers design system and visual foundation. Part 3 of 6 from ux-design-specification.md.

## Design System and Visual Foundation

- Design system: shadcn/ui components copied to /components/ui/; custom components in /invoice, /dashboard, /capture, /onboarding, /layout
- Installation: npx shadcn@latest init; core MVP components: Button, Card, Dialog, Sheet, Input, Select, Table, Badge, Toast, Dropdown Menu, Form, Label, Separator, Skeleton, Tooltip
- Progressive enhancement: MVP=minimal customization; Post-MVP=visual identity refinement, micro-animations; Phase 2+=custom component evaluation
- Color system theme: "German Engineering Trust"
- Primary palette: Prussian Blue #003153 (HSL 204 100% 16%) for nav/headers/primary actions; Steel Blue #4682B4 (HSL 207 44% 49%) for hover/focus/active states; white foreground
- Semantic palette: Success/High Confidence Emerald Green #2ECC71 (HSL 145 63% 49%); Warning/Medium Warm Amber #F39C12 (HSL 37 90% 51%); Destructive/Low Soft Red #E74C3C (HSL 6 78% 57%); Info Ocean Blue #3498DB (HSL 204 70% 53%)
- Neutrals: Foreground Charcoal #2C3E50; Secondary Slate Gray #708090; Muted Light Slate #94A3B8; Border Silver #CBD5E1; Surface Ghost White #F8FAFC; Background Snow #F1F5F9; Card pure White
- Confidence zones: green >95% (visually recessive, emerald left border); amber 70-95% (gentle pulse animation, 2s loop); red <70% (static, action badge, red left border)
- Accessibility contrast: Charcoal on White=12.1:1; Prussian Blue on White=14.8:1; confidence colors always paired with icons (checkmark/warning triangle/error cross) + text (colorblind safe)
- Typography: Inter font (high x-height, distinctive letterforms for financial data 0/O 1/l/I 5/S, native tabular figures); 15KB WOFF2; fallback: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
- Type scale (mobile/desktop): display 28/36px bold; h1 24/30px semi-bold; h2 20/24px semi-bold; h3 17/20px semi-bold; body 16/16px regular; body-sm 14/14px regular; caption 12/12px regular; amount 18/20px semi-bold tabular-nums; amount-lg 24/32px bold
- Number display: tabular-nums always; Euro precedes with thin space (EUR 1.234,56); German locale (period=thousands, comma=decimal); VAT shows Netto/USt/Brutto
- Font weights: Bold(700)=hero numbers; Semi-bold(600)=headings/amounts; Regular(400)=body; never Light/Thin
- Spacing: 4px base unit; space-1(4px) through space-12(48px); contextual density: Dashboard=generous (space-6 to space-8), Review=compact (space-3 to space-4), Export/Settings=standard (space-4 to space-6)
- Grid: mobile=single column 16px padding; tablet(768px+)=2-column dashboard; desktop(1024px+)=12-column max-width 1280px; review desktop=60/40 split
- Touch targets: primary actions 48px min; secondary 44px min; swipe zone full card width 60px min height; FAB 56px diameter
- Border radius: sm=6px (buttons/badges); md=8px (cards/dropdowns); lg=12px (modals/sheets); xl=16px (hero cards); full=9999px (FAB/avatar)
- Animation tokens: fast=150ms; normal=250ms; slow=350ms; all respect prefers-reduced-motion
- Design direction chosen: "Pipeline + Progressive Reveal" (Direction 6 base + Direction 4 accordion); 6 directions evaluated as HTML mockups
- Pipeline stages: Erfasst (Captured) then Verarbeitung (Processing) then Bereit (Ready) then Exportiert (Exported); WhatsApp-style indicators: circle/half-circle/filled-circle/checkmark/double-checkmark
- Accordion cards: collapsed=supplier+amount+confidence border; expanded=full fields+VAT breakdown+SKR+confidence+actions
- Stats time-scoped: weekly invoices processed (Monday ritual); monthly exported (Steuerberater cycle); weekly time saved; consecutive weeks streak
