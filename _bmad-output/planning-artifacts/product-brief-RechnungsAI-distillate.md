---
title: "Product Brief Distillate: RechnungsAI"
type: llm-distillate
source: "product-brief-RechnungsAI.md"
created: "2026-04-02"
purpose: "Token-efficient context for downstream PRD creation"
---

# Product Brief Distillate: RechnungsAI

## Competitive Intelligence

- **DATEV**: Market leader, Trustpilot 2.0/5. Opaque pricing €100-300+/mo. Access only via Steuerberater. Can't generate credit note invoices on e-Rechnungsplattform. Legacy UX. Lock-in via Steuerberater network (~30K practices), not product quality.
- **Lexoffice (Haufe Group)**: 250K+ users, €7.90-32.90/mo. Zero AI automation — all transaction categorization manual. German-only. Haufe Group has capital to bolt on AI quickly once competitive threat materializes.
- **sevDesk**: €12.90-42.90/mo. Basic OCR, frequent bugs, inconsistent support. German-only. Pricing creeps high for micro-businesses needing full features.
- **BuchhaltungsButler**: "Testsieger 2026" award. AI auto-categorization with DATEV-level control. Targets startups/growing businesses. German-only. **Closest competitive threat** — could expand downmarket into micro-businesses. Complex UX may limit appeal to 5-20 employee segment.
- **Norman.finance**: AI-first "zero involvement" accounting autopilot. Bilingual EN/DE. OMR Reviews presence. Exclusively freelancer-focused — no multi-user, no AP workflows. "Zero involvement" messaging resonates strongly in market.
- **Accountable**: €0-59.90/mo. Bilingual. Bank sync issues reported. Limited AI.
- **English-language options extremely limited**: Only Norman, Accountable, Sorted, Vivid Business offer English interfaces.
- German SME buyers rely heavily on editorial trust signals (Testsieger awards, OMR Reviews) over self-discovery — implications for marketing strategy.

## Market Data

- Germany accounting software market: ~6.44% CAGR (2026-2031)
- **SME segment: 10.85% CAGR** — nearly 2x market average, indicating structural under-penetration
- Cloud-based solutions: 68% market share by 2025 — SaaS delivery expected
- Global accounting software: projected $42.17B by 2032 (10.5% CAGR)
- 1M+ Handwerk businesses in Germany — largest homogeneous KMU segment
- 80% of German KMU have <5 employees; digital maturity index: 5/100
- 400K+ foreign entrepreneurs in Germany — near-zero English accounting tools
- Sage 2025 research: 25% of KMU unprepared for e-invoice transition, 48% awareness rate

## Regulatory Context

- **Jan 2025**: All businesses must receive e-invoices (XRechnung/ZUGFeRD)
- **Jan 2027**: Businesses >€800K annual turnover must send e-invoices
- **Jan 2028**: All businesses must send — no exceptions
- Post-grace-period: tax audits will incorporate e-invoice compliance checks → "nice to have" becomes "existential risk"
- Standards: EN 16931, XRechnung, ZUGFeRD, PEPPOL BIS 3.0
- GoBD compliance = ongoing legal obligation, not one-time checkbox. Requires 10-year immutable archive with tamper-proof logging.
- DSGVO (EU data residency) required — blocks non-EU hosting without proper DPA
- EU e-invoicing wave: France (2026), Belgium (2026), Poland (2026) — repeatable expansion opportunity

## Requirements Hints

- **DATEV CSV/XML export is non-negotiable** — most KMU retain Steuerberater, won't switch accountant. Export format must exactly match DATEV specifications.
- SKR03/SKR04 German chart of accounts — both must be supported for AI categorization
- EN 16931 compliance validation on both incoming and outgoing invoices
- GoBD-compliant archiving: immutable storage (S3/R2), change logs, 10-year retention
- Human-in-the-loop confirmation for AI categorization — LLM miscategorization flows directly into tax returns, liability exposure
- AI accuracy metric must be defined precisely: field-level precision/recall, not just "95%+"
- Natural language query interface in German — "Geçen ayın KDV toplamını hesapla" / "Was war meine USt-Summe letzten Monat?"
- Anomaly detection: recurring invoice inconsistencies, missing documents, potential errors
- Mobile-friendly capture (photo → structured data) is core "aha moment"

## Technical Context

- Suggested stack: Next.js + Supabase (rapid MVP), OpenAI/Claude API (document processing + categorization), Hetzner Cloud (EU data residency), Stripe (payments)
- AI document processing: OpenAI Vision API or Claude for photo/PDF → structured data extraction
- German invoices vary wildly: handwritten Handwerk invoices, thermal paper receipts, multi-page PDF contracts — accuracy claims need prototype validation with 200+ real invoices
- FinTS/PSD2 bank APIs notoriously unreliable and fragmented in Germany — moved to Phase 2 to reduce MVP risk
- PEPPOL access point partnership needed for Phase 4 EU expansion — should be architecturally considered now (e.g., ecosio, Comarch)
- Data network effect: every invoice processed trains model on German-specific formats, vendor names, SKR mappings → accuracy moat widens with scale

## Scope Signals

### MVP (confirmed in scope)

- AI document processing (photo/PDF → structured data) — the wedge
- AI auto-categorization (SKR03/SKR04)
- XRechnung/ZUGFeRD invoice generation (EN 16931)
- Incoming e-invoice validator
- DATEV CSV/XML export
- GoBD-compliant digital archive
- Web dashboard

### Phase 2 (Months 3-6)

- Bank connection (FinTS/PSD2) — moved from MVP
- Full accounting (EÜR + GuV)
- ELSTER integration (USt-VA auto-submission)
- Multi-user support
- English language support

### Phase 3 (Months 6-12)

- Steuerberater portal (client overview, corrections, compliance status) — each onboarded accountant becomes channel partner for 20-50 clients
- E-commerce integrations (Shopify, WooCommerce)
- AI tax optimization suggestions
- API marketplace

### Phase 4 (Year 2)

- Austria & Switzerland expansion (DACH)
- Sector-specific modules (Handwerk, Gastro, e-commerce)

### Explicitly out / not discussed

- Payroll module — Phase 2 at earliest
- White-label/embedded banking partnerships — opportunity noted but not scoped

## Rejected / Deferred Ideas (with rationale)

- **FinTS/PSD2 in MVP**: Deferred to Phase 2. German bank APIs are fragmented and unreliable — adds significant integration risk to MVP without being core to the "aha moment" (scan + categorize + export).
- **Steuerberater portal in Phase 2**: Deferred to Phase 3. Valuable distribution flywheel but requires established user base first. Phase 2 focuses on product depth (accounting, ELSTER), Phase 3 on distribution scaling.
- **Validation/interview section in brief**: User decided not to include. Brief stands on market data and regulatory analysis rather than customer interview evidence.
- **Full DATEV integration (beyond export)**: Not discussed. Export-only approach keeps RechnungsAI independent of DATEV ecosystem changes while maintaining Steuerberater compatibility.

## GTM Strategy

- **Primary: Product-led growth** — free tier (10 invoices/month) → self-serve conversion. Lead with incoming invoice processing as zero-friction wedge. Target CAC <€50, payback ~2 months at €25 ARPU.
- **Handwerkskammer & IHK partnerships**: 53 Handwerkskammern + 79 IHKs running e-Rechnung readiness programs. Co-branded compliance starter kit = trusted channel, near-zero CAC.
- **Trade community seeding**: SHK-Forum, Elektriker-Community, Handwerk Facebook groups. Content strategy: compliance countdown, free validator tools.
- **Steuerberater referral (Phase 3+)**: Portal launch converts accountants into channel partners.
- **Buyer = User** dynamic enables exceptional unit economics vs. enterprise accounting (CAC €500-2000+).
- German SME buyers rely on editorial trust signals — Testsieger awards, OMR Reviews positioning important for credibility.

## Pricing Model

- Free: 3 e-invoices/month (acquisition)
- Starter €14.90/mo: Unlimited invoices, AI categorization, DATEV export
- Business €29.90/mo: Multi-user, bank integration, full accounting
- Pro €49.90/mo: API, advanced reporting, priority support
- Overage: €0.50/invoice (high-volume)
- Steuerberater partner referral commission (Phase 3+)
- Target: 500 paying customers × €25 avg ARPU = €12,500 MRR in 12 months

## Key Risks & Open Questions

- **BuchhaltungsButler downmarket expansion**: "Testsieger 2026" with AI capabilities — could compress RechnungsAI's positioning window. First-mover advantage may be 12-18 months.
- **Lexoffice/sevDesk AI retrofit**: Haufe Group capital + 250K user base. Can bolt on AI features rapidly once threat materializes.
- **AI hallucination in financial data**: Wrong SKR mapping or VAT extraction flows into tax returns. Liability exposure unaddressed. Human-in-the-loop mandatory.
- **GoBD certification process**: Is it self-declaration or formal certification? Legal diligence needed pre-launch.
- **Steuerberater resistance**: Accountants may discourage tools outside DATEV ecosystem. DATEV export mitigates but doesn't eliminate.
- **DATEV format dependency**: DATEV could change export formats or restrict third-party integrations.
- **e-Rechnung mandate helps incumbents too**: Forced compliance often drives businesses to ask existing provider (DATEV/Steuerberater) for upgrade, not search for new tools.
- **Micro-business digital adoption paradox**: Target segment scores 5/100 on digital maturity but product requires SaaS adoption. UX simplicity and mobile-first capture are critical mitigations.
- **Phase 2 roadmap overload**: EÜR+GuV + ELSTER + multi-user + English + bank connection in months 3-6 is ambitious. Expect timeline pressure.
- **Unit economics unmodeled**: Per-invoice AI inference cost (LLM API calls), GoBD storage per user/year, infrastructure costs not yet calculated. At €12.5K MRR, margins may be thin.

## User Segments — Priority

1. **Handwerk trades (primary)**: Electricians, plumbers, carpenters. 1M+ businesses. High invoice volume, zero digital maturity, owner does bookkeeping. Highest pain, lowest current solution adoption.
2. **Small e-commerce (primary)**: Shopify/WooCommerce sellers. Multi-channel VAT complexity, growing transaction volumes. More digitally savvy than Handwerk.
3. **Foreign entrepreneurs (secondary, Phase 2+)**: 400K+ in Germany. English-language gap. Needs validation.
