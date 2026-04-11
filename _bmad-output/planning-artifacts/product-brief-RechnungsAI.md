---
title: "Product Brief: RechnungsAI"
status: "complete"
created: "2026-04-01"
updated: "2026-04-02"
inputs:
  - docs/pre-brainstorming-RechnungsAI.md
  - web research (Brave Search — market data, competitor analysis)
---

# Product Brief: RechnungsAI

## Executive Summary

Germany's Wachstumschancengesetz has triggered the most sweeping B2B e-invoicing mandate in Europe. By January 2028, every German business — regardless of size — must send and receive structured electronic invoices (XRechnung/ZUGFeRD). Yet 25% of SMEs remain unprepared, and awareness sits at just 48%.

RechnungsAI is an AI-powered, e-Rechnung compliant accounting tool built for the neglected middle: micro-businesses with 5–20 employees — too large for freelancer tools like Norman or Lexoffice, too small and price-sensitive for DATEV. It transforms invoice processing from a 3-hour weekly chore with 8–15% error rates into a 20-minute automated workflow with under 2% errors. Snap a photo of an invoice, and AI reads it in 3 seconds with 95%+ accuracy, auto-categorizes it to SKR03/04, and exports it to your Steuerberater via DATEV — one click.

The timing is urgent. The 2025–2027 transition window is a once-in-a-generation forced switching event with winner-take-most dynamics — once businesses choose a compliance tool, switching costs rise sharply (data migration, accountant workflows, learned habits). The micro-business segment is growing at 10.85% CAGR — nearly double the market average. RechnungsAI is positioned to capture this land grab with an AI-native architecture that incumbents cannot easily retrofit, and a compounding data moat: every invoice processed trains the model on German-specific formats, vendor names, and SKR mappings, widening the accuracy gap over time.

## The Problem

A Handwerk business owner in Munich receives 40 invoices a month — PDF attachments, paper mail, email forwards. Today, she spends ~15 minutes per invoice on manual data entry, hunts for the right SKR03 code in Excel, emails everything to her Steuerberater on a USB stick, and prays the VAT return is correct. Total: 3 hours per week, 8–15% error rate, and constant anxiety about Vorsteuerabzug loss.

This is not an edge case. Germany has over 1 million Handwerk businesses alone. 80% of German KMU have fewer than 5 employees, scoring just 5 out of 100 on the digital maturity index. These businesses don't have a bookkeeper on staff — the owner does it themselves, badly, late at night.

The e-Rechnung mandate makes this worse before it gets better. By 2027, these businesses must send compliant structured invoices or face audit consequences. The tools available to them today:

- **DATEV** (€100–300+/month): Powerful but hostile — Trustpilot 2.0/5, opaque pricing, requires Steuerberater intermediation, can't even generate credit note invoices on its e-invoice platform.
- **Lexoffice** (€7.90–32.90/month): User-friendly but zero AI automation — every transaction categorized manually. 250K+ users tolerating friction because alternatives are worse.
- **sevDesk** (€12.90–42.90/month): Basic OCR, frequent bugs, inconsistent support.
- **Norman.finance**: Genuinely AI-first, but exclusively targets freelancers — no multi-user, no AP workflows for growing teams.
- **BuchhaltungsButler**: AI categorization exists but wrapped in DATEV-level complexity, targeting startups rather than micro-businesses.

The 5–20 employee micro-business segment is structurally underserved. Too complex for solo tools, too cost-conscious for enterprise solutions.

## The Solution

RechnungsAI replaces the manual invoice workflow with an AI-powered pipeline:

1. **Capture** — Snap a photo of a paper invoice, or upload PDF/XML. AI extracts all structured data in ~3 seconds with 95%+ accuracy, including EN 16931 compliance validation.
2. **Categorize** — AI automatically maps transactions to SKR03/SKR04 chart of accounts. No manual code hunting. The system learns from corrections and improves over time.
3. **Export** — One-click DATEV CSV/XML export to your Steuerberater. The critical insight: KMU owners will not abandon their accountant. RechnungsAI works _with_ the Steuerberater relationship, not against it.
4. **Comply** — Generate XRechnung/ZUGFeRD compliant outgoing invoices. Automatic VAT calculation with ELSTER-ready output. GoBD-compliant 10-year immutable archive.

**The "aha moment":** A business owner photographs a stack of invoices and watches them appear as categorized, validated entries in seconds — work that used to take an evening now takes minutes.

## What Makes This Different

**AI depth, not AI buzzwords.** While Lexoffice offers zero automation and sevDesk provides basic OCR, RechnungsAI delivers four layers of AI value:

1. **Intelligent document processing** — Photo/PDF/XML → structured data with compliance validation. Not just OCR — contextual understanding of German invoice formats.
2. **Automatic transaction categorization** — SKR03/04 mapping using LLMs optimized for German financial terminology. Target 90%+ field-level accuracy where competitors offer only basic rule-based matching (Lexoffice, sevDesk) or complex UX wrappers (BuchhaltungsButler).
3. **Anomaly detection** — Proactive alerts for inconsistencies in recurring invoices, missing documents, and potential errors.
4. **Natural language interface** — "What was my VAT total last quarter?" in plain German. Critical for a segment where 58% lack digital competency.

**Price positioning.** Starter at €14.90/month — half of sevDesk's comparable tier, a fraction of DATEV. The AI advantage at Lexoffice pricing.

**Structural moats:**

- **Data network effect** — Every invoice processed trains the model on German-specific formats, vendor names, industry patterns, and SKR mappings. After 100K invoices, accuracy on a Handwerk plumber's Großhändler invoice becomes untouchable by generic OCR tools. This moat widens with scale.
- EU data residency (DSGVO compliance) — immediate barrier to US competitors, though not permanent as cloud providers expand EU regions
- German language optimization — most LLM tools underperform outside English; advantage durable for 2–3 years
- GoBD-compliant archiving — deep regulatory integration that's expensive to replicate

## Who This Serves

**Primary: Micro-business owners (5–20 employees)**

- _Handwerk trades_ (1M+ businesses): Electricians, plumbers, carpenters — high invoice volume, zero digital maturity, doing bookkeeping themselves after hours.
- _Small e-commerce operators_: Shopify/WooCommerce sellers managing supplier invoices, VAT across channels, and growing transaction volumes.

These owners want accounting to _disappear_, not just simplify. They value time saved over feature richness.

**Secondary: Foreign entrepreneurs in Germany (400K+)**

- Near-zero English-language accounting options. Phase 2 bilingual support unlocks this underserved niche.

**Buyer = User.** Unlike enterprise accounting where CAC runs €500–2000+ due to sales cycles, the person choosing RechnungsAI is the person using it. With a free tier and self-serve conversion, target CAC under €50 — payback in ~2 months at €25 ARPU. Product-led growth is the natural distribution model.

**Go-to-market wedge:** Lead with incoming invoice processing — the daily pain point with zero switching friction. A business can start scanning and categorizing received invoices today without changing how they send invoices. This free-to-try wedge naturally upsells to outgoing e-Rechnung generation as the 2027 mandate deadline approaches.

## Success Criteria

| Metric                                  | 12-Month Target |
| --------------------------------------- | --------------- |
| Paying customers                        | 500             |
| Average MRR per customer                | €25             |
| Monthly Recurring Revenue               | €12,500         |
| Invoice processing accuracy             | >95%            |
| Time-to-value (first invoice processed) | <5 minutes      |
| Weekly time saved per user              | ~2.5 hours      |
| NPS                                     | >50             |

Benchmark: German micro-SaaS precedents (e.g., StageTimer.io) demonstrate this MRR level is achievable in 12–18 months.

## Scope

**MVP (In scope):**

- AI document processing (photo/PDF → structured data) — the wedge product
- AI auto-categorization (SKR03/SKR04)
- XRechnung/ZUGFeRD invoice generation (EN 16931 compliant)
- Incoming e-invoice validator (format + business rules)
- DATEV CSV/XML export
- GoBD-compliant digital archive
- Web dashboard (invoice list, status tracking)

**Explicitly NOT in MVP:**

- Bank account connection (FinTS/PSD2) — Phase 2
- Full double-entry accounting (EÜR + GuV) — Phase 2
- Payroll module — Phase 2
- ELSTER integration (USt-VA auto-submission) — Phase 2
- English language support — Phase 2
- E-commerce integrations (Shopify, WooCommerce) — Phase 3
- Steuerberater portal — Phase 3
- Austria/Switzerland expansion — Phase 4

## Roadmap Vision

If RechnungsAI succeeds, it becomes the default accounting operating system for DACH-region micro-businesses — an AI-native alternative to the DATEV ecosystem that grows with the business rather than forcing them into enterprise complexity.

- **Phase 2 (Months 3–6):** Bank connection (FinTS/PSD2), full accounting (EÜR + GuV), ELSTER integration, multi-user support, English language
- **Phase 3 (Months 6–12):** Steuerberater portal (client overview, corrections, compliance status), e-commerce integrations, AI tax optimization suggestions, API marketplace
- **Phase 4 (Year 2):** Austria & Switzerland expansion, sector-specific modules (Handwerk, Gastro, e-commerce)

The regulatory wave doesn't end with Germany. France (2026), Belgium (2026), Poland (2026) are all mandating e-invoicing. A proven compliance-first, AI-first platform has a repeatable expansion playbook across the EU.

## Pricing

| Tier         | Monthly | Includes                                            |
| ------------ | ------- | --------------------------------------------------- |
| **Free**     | €0      | 3 e-invoices/month (acquisition funnel)             |
| **Starter**  | €14.90  | Unlimited invoices, AI categorization, DATEV export |
| **Business** | €29.90  | Multi-user, bank integration, full accounting       |
| **Pro**      | €49.90  | API access, advanced reporting, priority support    |

Additional revenue: €0.50/invoice for high-volume customers, Steuerberater partner referral program.

## Go-to-Market Channels

1. **Product-led growth (primary):** Free tier (10 invoices/month) → self-serve conversion. Lead with incoming invoice processing as zero-friction wedge. Target CAC under €50 with ~2-month payback.
2. **Handwerkskammer & IHK partnerships:** Germany's 53 Handwerkskammern and 79 IHKs are actively running e-Rechnung readiness programs. Co-branded "compliance starter kit" distributed through these chambers reaches millions of businesses via a trusted channel at near-zero CAC.
3. **Trade community seeding:** Handwerk forums (SHK-Forum, Elektriker-Community) and Facebook groups. "Compliance countdown" content strategy with free tools (e-Rechnung validator, deadline checker) seeds organic adoption.
4. **Steuerberater referral program (Phase 3):** Once the Steuerberater portal launches, each onboarded accountant becomes a channel partner pulling in 20–50 clients.

## Key Risks

- **AI accuracy in financial context:** LLM miscategorization flows directly into tax returns. Human-in-the-loop confirmation and clear accuracy metrics (field-level precision/recall) are essential to build trust.
- **Incumbent response:** Lexoffice (Haufe Group) and sevDesk have the capital and user base to bolt on AI features. First-mover window is 12–18 months.
- **Steuerberater resistance:** Accountants may discourage tools outside the DATEV ecosystem. Mitigation: DATEV-compatible export + future Steuerberater portal that adds value to their workflow.
- **MVP scope discipline:** The defined MVP is substantial. Prioritize the core wedge (AI scan + categorize + DATEV export) for fastest time-to-learning.
- **GoBD compliance:** Requires ongoing legal and technical diligence — not a one-time checkbox but a continuous obligation.
