---
stepsCompleted:
  - "step-01-init"
  - "step-02-discovery"
  - "step-02b-vision"
  - "step-02c-executive-summary"
  - "step-03-success"
  - "step-04-journeys"
  - "step-05-domain"
  - "step-06-innovation"
  - "step-07-project-type"
  - "step-08-scoping"
  - "step-09-functional"
  - "step-10-nonfunctional"
  - "step-11-polish"
  - "step-12-complete"
inputDocuments:
  - "planning-artifacts/product-brief-RechnungsAI.md"
  - "planning-artifacts/product-brief-RechnungsAI-distillate.md"
documentCounts:
  briefs: 2
  research: 0
  brainstorming: 0
  projectDocs: 0
classification:
  projectType: "saas_b2b"
  domain: "fintech"
  complexity: "high"
  projectContext: "greenfield"
workflowType: "prd"
---

# Product Requirements Document - RechnungsAI

**Author:** GOZE
**Date:** 2026-04-02

## Executive Summary

RechnungsAI is an AI-powered e-invoicing and accounting SaaS platform built for German micro-businesses with 5–20 employees — a segment structurally underserved by existing tools. Germany's Wachstumschancengesetz mandates that all businesses must send and receive structured electronic invoices (XRechnung/ZUGFeRD) by January 2028, yet 25% of SMEs remain unprepared. Current solutions force a false choice: affordable but fully manual (Lexoffice), or powerful but expensive and complex (DATEV). RechnungsAI eliminates this trade-off by delivering deep AI automation at accessible pricing.

The core workflow: snap a photo of an invoice, and AI extracts structured data in ~3 seconds with 95%+ accuracy, auto-categorizes it to SKR03/04, validates EN 16931 compliance, and exports to the Steuerberater via DATEV — replacing a 3-hour weekly chore with a 20-minute automated process.

### What Makes This Special

**AI depth at Lexoffice pricing.** RechnungsAI delivers four layers of AI value — intelligent document processing, automatic SKR03/04 categorization, anomaly detection, and natural language querying — at €14.90/month Starter pricing. Competitors offer either zero automation (Lexoffice) or automation wrapped in enterprise complexity (BuchhaltungsButler, DATEV). RechnungsAI is built on the insight that complex, repetitive tasks demand digital, AI-powered solutions that are simple, understandable, and make life easier — not harder.

The compounding data moat widens with every invoice processed: German-specific formats, vendor names, industry patterns, and SKR mappings train the model into accuracy that generic OCR tools cannot match. The 2025–2027 regulatory transition window creates a once-in-a-generation forced switching event with winner-take-most dynamics.

## Project Classification

- **Type:** SaaS B2B — multi-tenant platform with subscription tiers, web dashboard, and third-party integrations (DATEV, ELSTER)
- **Domain:** Fintech — invoice processing, tax compliance, financial data handling under GoBD, DSGVO, and EN 16931 regulatory frameworks
- **Complexity:** High — regulated industry with AI accuracy directly impacting tax returns, multiple compliance standards, and data residency requirements
- **Context:** Greenfield — new product built from scratch to exploit the e-Rechnung mandate window

## Success Criteria

### User Success

- **"Aha" moment:** User photographs an invoice and sees it appear as a categorized, validated entry within seconds — work that used to take 15 minutes happens instantly.
- **"Indispensable" moment:** Weekly engagement notification — "This week you scanned 4 receipts and freed yourself from that paper pile. You have €124 in tax deductions ready for your accountant!" — delivered Sunday evening or Monday morning via push/email. Users feel ongoing, quantified value.
- **Time saved:** ~2.5 hours per week reduction in manual bookkeeping tasks.
- **Error reduction:** From 8–15% manual error rate to <2% with AI-assisted processing.
- **Time-to-value:** First invoice processed within 5 minutes of signup.

### Business Success

- **3-month milestone:** 20 "fanatic" users who actively report bugs, request features, and validate product-market fit. Quality of feedback over quantity of users.
- **12-month targets:**
  - 500 paying customers
  - €25 average ARPU → €12,500 MRR
  - NPS >50
- **Conversion:** Free tier (10 invoices/month) → paid conversion rate tracked as leading indicator. Target to be established after initial cohort data.
- **Retention:** Weekly active usage as core engagement metric — users who export to DATEV at least once per month indicate deep integration into workflow.

### Technical Success

- **AI accuracy:** ≥99.5% field-level precision on structured data extraction (sender, amount, VAT, date, line items). Measured as precision/recall per field, not aggregate.
- **Availability:** 99.9% uptime — financial data processing cannot tolerate downtime during business hours.
- **Compliance:** Full GoBD-compliant data architecture — immutable storage, tamper-proof change logs, 10-year retention guarantee. Architecture validated against GoBD standards before launch.
- **e-Invoice compliance:** EN 16931 validation on incoming invoices. Outgoing XRechnung/ZUGFeRD generation in Phase 2.
- **Data integrity:** Error-free processing pipeline with guaranteed immutability throughout legal retention periods.

### Measurable Outcomes

| Metric                         | 3-Month Target | 12-Month Target |
| ------------------------------ | -------------- | --------------- |
| Active users (fanatic testers) | 20             | 500 paying      |
| MRR                            | —              | €12,500         |
| Invoice processing accuracy    | ≥95%           | ≥99.5%          |
| Time-to-value                  | <5 min         | <3 min          |
| Weekly time saved per user     | ~2 hrs         | ~2.5 hrs        |
| NPS                            | Baseline       | >50             |
| Uptime                         | 99.5%          | 99.9%           |

## Product Scope

> Detailed MVP feature set, phased roadmap, and risk mitigation strategy are defined in the **Project Scoping & Phased Development** section below.

**MVP summary:** AI-powered incoming invoice processing → auto-categorization (SKR03/SKR04) → DATEV CSV export → GoBD-Ready archive + Verfahrensdokumentation generator. Outgoing e-invoice generation deferred to Phase 2.

**5-phase roadmap:** Phase 1 (MVP) → Phase 2 (Outgoing Invoices) → Phase 3 (Product Depth) → Phase 4 (Distribution) → Phase 5 (DACH Expansion)

## User Journeys

### Journey 1: Thomas — The Handwerk Business Owner (Primary User, Happy Path)

**Persona:** Thomas Brenner, 42, owns a Schreinerei (carpentry workshop) in Munich. 6 employees, ~€800K annual revenue. Processes 25–30 incoming and 15–20 outgoing invoices weekly. Zero digital maturity — currently uses Excel and Word templates. His Steuerberater Frau Schmidt complains monthly about miscategorized entries and missing documents.

**Opening Scene — Discovery:**
Thomas attends a mandatory e-Rechnung readiness seminar at his local Handwerkskammer in October 2026. The presenter explains that by January 2027, businesses with >€800K revenue must send compliant e-invoices. Thomas panics — his Word template won't cut it. After the seminar, he Googles "e-Rechnung einfach KMU" and finds RechnungsAI's free compliance checker tool. He validates one of his incoming invoices and sees it's non-compliant. The tool suggests signing up for a free account to fix this.

During signup, Thomas sees a "How your data is protected" screen: German data centers, bank-grade encryption, GoBD-certified archive. The message "Deine Daten bleiben in Deutschland" eases his cloud anxiety. He proceeds.

**Rising Action — First Use:**
Thomas signs up, uploads a photo of a paper invoice from his wood supplier Holz-Müller GmbH. In 3 seconds, AI extracts everything: invoice number, date, net amount, VAT rate/amount, supplier details. It auto-suggests SKR03 code 3400 (Wareneingang 19% Vorsteuer). Thomas stares at the screen — this would have taken him 15 minutes manually.

He uploads 6 more invoices. One triggers a yellow warning: "Supplier USt-ID missing — Vorsteuerabzug at risk." Thomas calls the supplier to request a corrected invoice. Without this alert, he would have lost thousands in VAT deductions at year-end.

**Climax — The Monday Morning Transformation:**
Two weeks in, Thomas's Monday morning has changed completely. 08:00 — photographs paper invoices, drags PDFs onto the dashboard, uploads an XRechnung XML file. 08:10 — all 7 invoices processed, categorized, validated. 08:15 — done. Total: 15 minutes instead of 3–4 hours. And on first login, the system generated his Verfahrensdokumentation — a 30-page GoBD process document he can hand to any tax auditor. Thomas couldn't believe it: "I've been meaning to get this done for years."

**Resolution — The New Reality:**
Month-end arrives. Thomas clicks "DATEV Export" and sends everything to Frau Schmidt. She imports it in 2 minutes — no USB stick, no missing documents, no miscategorized entries. She calls Thomas: "Was hast du gemacht? Das ist perfekt." Thomas upgrades to the Starter plan. On Sunday evening, he receives a notification: "This week you processed 12 invoices, saved ~2.5 hours, and have €2,340 in VAT deductions ready for your accountant." He smiles — accounting has become invisible.

**Requirements revealed:** Photo capture → AI extraction, SKR03/04 auto-categorization, compliance validation with actionable warnings, DATEV export, GoBD archive, Verfahrensdokumentation auto-generation, weekly value notifications, trust-building onboarding screen.

### Journey 2: Thomas — Error Recovery (Primary User, Edge Case)

**Scene:** Thomas uploads a crumpled, coffee-stained thermal receipt from a hardware store. The AI extraction confidence is low — it flags the amount as uncertain (€147.23 or €147.83?) and cannot identify the supplier name.

**Recovery path:** The system presents the extracted data with highlighted uncertain fields in amber. Thomas manually corrects the amount and types the supplier name. The AI learns: next time a receipt from "Bauhaus Germering" appears, it recognizes it instantly. Thomas also uploads a ZUGFeRD PDF that fails EN 16931 validation — three mandatory fields are missing. The system generates a pre-written email to the supplier requesting a corrected invoice, which Thomas sends with one click.

**Resolution:** Thomas learns to trust the system's confidence indicators. High confidence (green) = approve and move on. Low confidence (amber) = quick manual check. Validation failure (red) = system helps him fix it. The AI's accuracy on his regular suppliers improves from 95% to 99%+ within the first month as it learns his specific vendor patterns.

**Requirements revealed:** Confidence scoring, graceful degradation on poor-quality inputs, manual correction with AI learning, supplier pattern recognition, automated correction request emails, progressive accuracy improvement.

### Journey 3: Lisa — The E-Commerce Operator

**Persona:** Lisa Hartmann, 29, runs a small home décor brand on Shopify and sells through Amazon DE. Based in Hamburg. 2 employees, ~€350K annual revenue. Receives 60+ supplier invoices monthly from manufacturers in Germany, Poland, and China. Manages multi-channel VAT complexity. Digitally savvy but overwhelmed by German accounting rules — she moved from the Netherlands 3 years ago.

**Opening Scene:**
Lisa is drowning in invoices from multiple suppliers across three countries. Her Shopify orders generate automatic records, but supplier invoices arrive as PDFs in German, Polish, and English. She manually enters each into a spreadsheet, often guessing the correct SKR04 code. Last quarter, her Steuerberater found €4,200 in VAT errors — Lisa had been applying the wrong rate to intra-EU purchases.

**Rising Action:**
Lisa discovers RechnungsAI through an OMR Reviews article comparing AI accounting tools. She signs up for the free tier and uploads a batch of 20 supplier invoices — mix of German PDFs and a Polish PDF. The AI processes all German invoices flawlessly. The Polish invoice is partially extracted with lower confidence — Lisa corrects a few fields, and the system learns the supplier's format.

The game-changer: AI auto-detects that 5 invoices are intra-EU reverse-charge transactions and suggests the correct SKR04 codes with the appropriate VAT treatment. Lisa's eyes widen — this is exactly where she made the €4,200 error last quarter.

**Climax:**
Month-end. Lisa clicks DATEV Export and sends it to her Steuerberater. Zero errors for the first time ever. Her accountant asks what changed. Lisa hits the free tier limit (10 invoices/month) in the second week and upgrades to Starter immediately — the €14.90/month pays for itself by preventing a single VAT miscategorization.

**Resolution:**
Lisa processes 60+ invoices monthly in under an hour instead of an entire Saturday. She recommends RechnungsAI in a Shopify seller Facebook group, bringing in 8 new signups. On Monday morning she gets her weekly recap: "This month you processed 63 invoices across 3 countries. €890 in correctly applied reverse-charge VAT saved from potential errors."

**Requirements revealed:** Batch upload processing, multi-format invoice handling, intra-EU VAT logic awareness, SKR04 support alongside SKR03, progressive learning from corrections, OMR Reviews / social proof as discovery channel, free-to-paid conversion trigger at limit.

### Journey 4: Frau Schmidt — The Steuerberater (Indirect User)

**Persona:** Claudia Schmidt, 54, independent Steuerberaterin with a practice in Munich. Manages 85 business clients, 40% of whom are Handwerk micro-businesses. Uses DATEV Unternehmen Online as her primary system. Spends 30% of her time on data cleanup — chasing missing documents, correcting miscategorized entries, and re-entering data that arrives on USB sticks or in messy email attachments.

**Opening Scene:**
Frau Schmidt dreads month-end. Her Handwerk clients send data in every format imaginable: USB sticks with jumbled PDFs, Excel files with wrong column headers, shoeboxes of receipts (literally). She spends 2–3 hours per client just getting data into DATEV. She's heard about RechnungsAI from Thomas, who suddenly started sending perfect DATEV exports.

**Rising Action:**
Three of Frau Schmidt's clients now use RechnungsAI. When their month-end data arrives, the difference is stark. Thomas's export: perfectly structured DATEV CSV, every invoice categorized to the correct SKR03 code, all documents archived and cross-referenced. Her other client Bäckerei Huber: same USB stick chaos as always, 4 missing invoices, 6 wrong category assignments.

She opens Thomas's DATEV export, imports it into DATEV Unternehmen Online. Import completes in 2 minutes. Zero errors. She compares: Thomas's data took 2 minutes, Bäckerei Huber's took 2.5 hours. Same number of invoices.

**Climax:**
Frau Schmidt recommends RechnungsAI to 5 more clients. Each client she onboards saves her 2+ hours of monthly cleanup. She calculates: if 20 of her Handwerk clients switch, she saves 40+ hours per month — time she can spend on actual advisory work (tax optimization, business consulting) instead of data entry.

**Resolution:**
Frau Schmidt becomes an informal ambassador. She doesn't use RechnungsAI directly, but the quality of data she receives transforms her practice. She eagerly awaits the Phase 4 Steuerberater portal — a client overview dashboard where she can see all clients' compliance status, flag corrections, and communicate directly through the platform.

**Requirements revealed:** DATEV export format must exactly match DATEV Unternehmen Online import specifications, SKR03/04 accuracy is critical for Steuerberater trust, Steuerberater as organic distribution channel, Phase 4 portal as retention/expansion mechanism, data quality as the primary value for indirect users.

### Journey Requirements Summary

| Capability Area                        | Thomas (Handwerk)        | Lisa (E-Commerce)        | Frau Schmidt (Steuerberater) |
| -------------------------------------- | ------------------------ | ------------------------ | ---------------------------- |
| Photo/PDF capture & AI extraction      | Core workflow            | Core workflow            | Indirect benefit             |
| SKR03/SKR04 auto-categorization        | SKR03 primary            | SKR04 primary            | Validation of accuracy       |
| EN 16931 compliance validation         | Incoming (MVP)           | Incoming focus           | Data quality assurance       |
| XRechnung/ZUGFeRD generation           | Phase 2                  | Phase 2                  | N/A                          |
| Verfahrensdokumentation generator      | Retention driver         | Retention driver         | Audit readiness              |
| DATEV CSV/XML export                   | Monthly to Steuerberater | Monthly to Steuerberater | Import into DATEV system     |
| GoBD-compliant archive                 | Legal compliance         | Legal compliance         | Audit readiness              |
| Confidence scoring & manual correction | Edge case handling       | Multi-language invoices  | N/A                          |
| Weekly value notifications             | Retention driver         | Retention driver         | N/A                          |
| Intra-EU VAT handling                  | N/A                      | Critical need            | Validation                   |
| Steuerberater portal (Phase 4)         | N/A                      | N/A                      | Future core workflow         |

## Security & Trust Requirements

> Measurable security criteria (encryption standards, token expiry, OWASP compliance) are specified in **Non-Functional Requirements > Security & Data Protection**.

RechnungsAI's target users — conservative German tradespeople aged 40+ with minimal digital experience — have deep skepticism about cloud-based financial data storage. Trust is not a feature; it is a prerequisite for adoption.

### Data Residency

- All data hosted exclusively in German data centers (Hetzner Cloud, Nürnberg/Falkenstein)
- Full DSGVO (EU GDPR) compliance — no data leaves the EU
- Data processing agreements (Auftragsverarbeitungsvertrag/AVV) available on request

### Encryption

- AES-256 encryption at rest for all stored documents and financial data
- TLS 1.3 encryption in transit for all communications
- User-facing messaging: "Your data is as secure as at your bank"

### GoBD-Certified Archive

- Immutable storage with tamper-proof change logs
- 10-year retention guarantee with automated lifecycle management
- Audit-ready export for Finanzamt inspections
- User-facing messaging: "Even the Finanzamt trusts this archive"

### Account & Data Control

- Complete data deletion upon account closure (except legally mandated retention periods)
- Data export in standard formats at any time — no vendor lock-in
- Transparent data usage policy: invoice data used for AI model improvement only in anonymized, aggregated form

### Trust-Building UX

- Onboarding includes a "How your data is protected" screen before first invoice upload
- Security badges visible on dashboard (DSGVO, GoBD, German hosting)
- Trust seal from recognized German IT security certification (target: TÜV or BSI Grundschutz)

## Domain-Specific Requirements

### Compliance & Regulatory

**GoBD Compliance (MVP: "GoBD-Ready" Architecture):**

- No formal IDW PS 880 certification for MVP — prohibitively expensive and time-consuming
- Architecture designed to meet GoBD principles: Nachvollziehbarkeit (traceability), Unveränderbarkeit (immutability), Vollständigkeit (completeness)
- Immutable storage with cryptographic hashing (each document receives SHA-256 hash at ingestion)
- Tamper-proof change logs recording every action (view, export, edit) with timestamp and user ID
- 10-year automated retention with lifecycle management
- Legal review of GoBD-Ready claims required before launch — self-declaration with documented architecture decisions

**EN 16931 e-Invoice Compliance:**

- MVP: Incoming validation only — parse and validate XRechnung (UBL 2.1) and ZUGFeRD (CII D16B) against EN 16931 business rules
- Phase 2: Outgoing generation — produce compliant XRechnung XML and ZUGFeRD hybrid PDF (PDF/A-3 with embedded XML)
- Validation against official KoSIT validation tools (reference validator) before release

**DSGVO (EU GDPR):**

- All processing within EU borders (German data centers)
- Data processing agreement (AVV) template available for enterprise users
- Right to deletion implemented (except legally mandated retention)
- Privacy-by-design: minimum data collection, purpose limitation

### Technical Constraints — DATEV CSV Export

**MVP approach: CSV Export only (DATEV-Format Buchungsstapel).** No DATEV Marketplace partnership required.

**File Structure (EXTF Format):**

- 3-part structure: Header record (Row 1) → Column headers (Row 2) → Data rows (Row 3+)
- Encoding: Windows-1252 (CP1252), not UTF-8
- Delimiter: Semicolon (`;`)
- Text qualifier: Double quotes
- Decimal separator: Comma (German locale, e.g., `24,95`)

**Header Record (Row 1) — Key fields:**

- Format identifier: `EXTF` (external format)
- Format version: 700, category 21 (Buchungsstapel)
- Berater-Nr (consultant number) and Mandanten-Nr (client number) — user must configure these in settings
- WJ-Beginn (fiscal year start), Sachkontenlänge (G/L account digit length, typically 4 for SKR03/04)
- Datum-von/Datum-bis (date range of bookings)
- Währung: `EUR`

**Critical Data Fields (116+ columns, key ones for MVP):**

| Field          | Format             | Notes                                   |
| -------------- | ------------------ | --------------------------------------- |
| Umsatz         | Decimal, comma-sep | Amount without debit/credit indicator   |
| Soll/Haben-Kz  | `S` or `H`         | S=debit to Konto, H=credit to Konto     |
| Konto          | Integer            | Debit account (e.g., 1200 for bank)     |
| Gegenkonto     | Integer            | Credit account (e.g., 4940 for revenue) |
| BU-Schlüssel   | Integer            | Tax key: 9=19% VSt, 8=7% VSt            |
| Belegdatum     | `ddMM` (4-digit)   | Day+month only; year from header        |
| Belegfeld 1    | String (max 36)    | Invoice number                          |
| Buchungstext   | String (max 60)    | Booking description                     |
| Festschreibung | `0` or `1`         | 0=temporary, 1=final                    |

**Implementation Guidance:**

- Reference: DATEV Developer Portal (developer.datev.de) — public format documentation
- Reference implementation: `ledermann/datev` Ruby gem for format validation patterns
- Sachkontenlänge must match user's SKR configuration (4 digits for standard SKR03/SKR04)
- BU-Schlüssel mapping must cover all standard German VAT scenarios (19%, 7%, 0%, reverse-charge, intra-EU)
- Test exports must be validated by importing into DATEV Unternehmen Online test environment

**DATEV Format Risk Mitigation:**

- Export-only approach keeps RechnungsAI independent of DATEV ecosystem changes
- Version field in header (currently 700) must be monitored for format updates
- CSV format is stable and widely supported — lower risk than API integration

### AI Accuracy & Liability

**Human-in-the-Loop Requirement:**

- Every AI-extracted field presented for user confirmation before saving
- Confidence scoring per field: green (>95%), amber (70–95%), red (<70%)
- Amber and red fields require explicit user attention before proceeding
- All AI corrections tracked for model improvement (anonymized)

**Legal Disclaimer (mandatory):**

- Displayed at onboarding and on every AI-processed result
- Text: "AI-suggested data must be reviewed. Final responsibility lies with the user."
- German version: "Die von der KI vorgeschlagenen Daten müssen überprüft werden. Die endgültige Verantwortung liegt beim Nutzer."
- Disclaimer acceptance logged for legal records

**Accuracy Tracking:**

- Field-level precision/recall tracked per: invoice type, supplier, document quality
- Accuracy dashboard for internal monitoring (not user-facing in MVP)
- Model improvement pipeline: user corrections → anonymized training data → improved accuracy

### Risk Mitigations

| Risk                                       | Impact                           | Mitigation                                                                   |
| ------------------------------------------ | -------------------------------- | ---------------------------------------------------------------------------- |
| GoBD non-compliance discovered post-launch | Legal liability, user trust loss | Pre-launch legal review, GoBD-Ready architecture documentation               |
| DATEV format change                        | Export breaks for all users      | Monitor developer.datev.de, version field checking, format abstraction layer |
| AI miscategorization → wrong tax return    | User financial loss, liability   | Human-in-the-loop, disclaimer, confidence scoring, accuracy tracking         |
| Steuerberater rejects export               | User churn, trust loss           | Test with real Steuerberater during beta, exact format compliance            |
| DSGVO violation                            | Fines up to 4% revenue           | Privacy-by-design, German hosting, AVV template, DPO consultation            |

## SaaS B2B Specific Requirements

### Multi-Tenancy Architecture

**MVP: Single-user per tenant, but future-proof database design.**

- Database schema designed with tenant isolation from day one — every table includes `tenant_id` foreign key
- Row-level security (RLS) policies enforced at database level (Supabase native RLS)
- MVP: one user per tenant, one tenant per account — simple 1:1 mapping
- Phase 2 readiness: schema supports multiple users per tenant without migration — `users` table linked to `tenants` via junction table, role column pre-defined but unused in MVP
- Tenant-scoped data access: all queries filtered by tenant context — no cross-tenant data leakage possible by design
- Tenant settings store: Berater-Nr, Mandanten-Nr, SKR plan (03/04), fiscal year start, company details — configurable per tenant

### Permission Model

**MVP: Simple authentication. Phase 2-ready RBAC structure.**

- MVP: Email + password authentication via Supabase Auth. Optional social login (Google) for faster onboarding
- MVP: Single role — account owner has full access to all features
- Database schema includes `role` column from day one with pre-defined enum values:
  - `owner` — full access (MVP: only this role active)
  - `bookkeeper` — invoice processing, categorization, export (Phase 3)
  - `viewer` — read-only dashboard access (Phase 3)
- Phase 3: role assignment UI, invitation flow, per-role permission checks
- No RBAC enforcement logic in MVP codebase — only the data model is prepared

### Subscription & Billing

**Stripe integration with frictionless free tier.**

- **Free tier:** No credit card required. 10 invoices/month. Full feature access within limit. Designed to build trust before asking for payment
- **Upgrade trigger:** When user approaches or hits free tier limit, contextual upgrade prompt — not a hard paywall but a clear value message: "You've processed 8 of 10 free invoices this month. Upgrade to Starter for unlimited processing at €14.90/month"
- **Payment flow:** Stripe Checkout for upgrade. Credit card or SEPA direct debit (critical for German market — many SMEs prefer Lastschrift over credit card)
- **Subscription tiers:**

| Tier     | Price     | Invoice Limit | Key Features                                               |
| -------- | --------- | ------------- | ---------------------------------------------------------- |
| Free     | €0        | 10/month      | Full AI processing, DATEV export, GoBD archive             |
| Starter  | €14.90/mo | Unlimited     | Everything in Free + priority processing                   |
| Business | €29.90/mo | Unlimited     | Multi-user, bank integration, full accounting (Phase 3)    |
| Pro      | €49.90/mo | Unlimited     | API access, advanced reporting, priority support (Phase 4) |

- **Billing edge cases:** Prorated upgrades mid-cycle, downgrade at period end, invoice generation for subscription (meta: RechnungsAI generates its own invoices)
- **Overage model:** Not enforced in MVP. Free tier hard-caps at 10. No per-invoice charges initially — simplicity over revenue optimization

### Integration Architecture

**MVP: Export-oriented. Phase 2+: Bidirectional.**

- **DATEV CSV Export (MVP):** Primary integration — detailed in Domain Requirements. One-click export with Buchungsstapel format
- **Email (MVP):** Outgoing e-invoice delivery via transactional email (e.g., Resend or AWS SES). Incoming invoice forwarding address per tenant (Phase 3)
- **File storage (MVP):** Hetzner-hosted S3-compatible object storage for GoBD archive. Immutable bucket policy
- **AI processing (MVP):** Claude/OpenAI API for document extraction and categorization. Abstraction layer to swap providers without codebase changes
- **Phase 2 integrations:** Outgoing e-invoice generation (XRechnung/ZUGFeRD)
- **Phase 3 integrations:** FinTS/PSD2 bank connection, ELSTER API
- **Phase 4 integrations:** Shopify/WooCommerce webhooks, Steuerberater portal API, PEPPOL access point

### Implementation Considerations

- **Responsive web-first:** Mobile-friendly responsive design — not a native app. Photo capture via browser camera API. PWA consideration for "add to home screen" on mobile
- **Offline handling:** No offline mode in MVP. All processing requires server-side AI. Graceful error handling for network interruptions during upload
- **Performance targets:** Invoice AI extraction <5 seconds (p95), dashboard load <2 seconds, DATEV export generation <10 seconds for up to 500 invoices
- **Localization:** German UI only in MVP. Architecture supports i18n from day one (string externalization, locale-aware date/currency formatting). English in Phase 3
- **Session management:** JWT-based auth tokens, 30-day refresh tokens for "stay logged in" — Thomas shouldn't have to re-login every Monday morning

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Problem-solving MVP — solve one painful workflow (incoming invoice processing → AI categorization → DATEV export) exceptionally well. Lead with incoming invoice processing as zero-friction wedge. Outgoing e-invoice generation deferred to Phase 2 to reduce MVP complexity for solo developer.

**Solo Developer Reality:** Single developer building the entire stack. This constrains MVP scope to features that one person can build, test, and maintain. Every feature included must justify its presence against the question: "Can Thomas use the product without this?"

**Pre-Launch Validation Gate:** MVP will not be released to end users until real-world accuracy testing is completed with 200+ authentic German invoices across multiple formats (paper photos, PDF, XRechnung XML, ZUGFeRD). This is a hard gate — no exceptions.

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**

- Journey 1 (Thomas — happy path): Full support
- Journey 2 (Thomas — error recovery): Full support
- Journey 3 (Lisa — e-commerce): Partial support (German invoices only, intra-EU VAT awareness as stretch goal)
- Journey 4 (Frau Schmidt — Steuerberater): Indirect support via DATEV export quality

**Must-Have Capabilities:**

| #   | Capability                                              | Justification                                                               |
| --- | ------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | Photo/PDF/XML upload & AI data extraction               | Core "aha moment" — without this, no product                                |
| 2   | AI auto-categorization (SKR03/SKR04)                    | Eliminates the manual code-hunting pain                                     |
| 3   | Human-in-the-loop confirmation with confidence scoring  | Legal liability protection, trust building                                  |
| 4   | Incoming e-invoice validation (EN 16931)                | Vorsteuerabzug protection — direct money saved                              |
| 5   | DATEV CSV export (Buchungsstapel format)                | Non-negotiable — Steuerberater workflow bridge                              |
| 6   | GoBD-Ready archive (immutable storage, change logs)     | Legal requirement, trust prerequisite                                       |
| 7   | Verfahrensdokumentation auto-generator                  | GoBD compliance proof — massive retention driver, eliminates a dreaded task |
| 8   | Web dashboard (invoice list, status, actions)           | Operational hub for all workflows                                           |
| 9   | Authentication (email + password)                       | Access control baseline                                                     |
| 10  | Stripe billing (free tier + Starter upgrade)            | Revenue activation                                                          |
| 11  | Weekly value notification (email)                       | Retention driver, "indispensable" moment                                    |
| 12  | Trust-building onboarding (security screen, disclaimer) | Adoption prerequisite for target segment                                    |

**Explicitly Deferred from MVP (solo developer scope protection):**

- XRechnung/ZUGFeRD outgoing invoice generation — significant scope, deferred to Phase 2
- Bank connection (FinTS/PSD2) — high integration complexity, not core to "aha moment"
- Full accounting (EÜR + GuV) — significant scope, Phase 3
- ELSTER integration — requires separate certification process
- Multi-user / RBAC enforcement — schema prepared, UI deferred
- English language — German-only MVP
- Anomaly detection — nice-to-have, not must-have
- Natural language querying — impressive but not essential for core workflow
- SEPA direct debit — Stripe credit card only for MVP; SEPA added when payment friction data justifies it

### Post-MVP Features

**Phase 2 — Outgoing Invoices & Compliance (Months 3–4):**

- XRechnung/ZUGFeRD outgoing invoice generation (EN 16931 compliant)
- Outgoing invoice management (create, send, track)
- SEPA direct debit payment option

**Phase 3 — Product Depth (Months 4–7):**

- Bank connection (FinTS/PSD2) — automated transaction matching
- Full accounting (EÜR + GuV) — replaces Excel/external tools
- ELSTER integration (USt-VA auto-submission)
- Multi-user support with RBAC (owner/bookkeeper/viewer)
- English language support
- Anomaly detection and proactive alerts
- Incoming invoice email forwarding (dedicated address per tenant)

**Phase 4 — Distribution Scaling (Months 7–12):**

- Steuerberater portal (client overview, corrections, communication)
- E-commerce integrations (Shopify, WooCommerce)
- AI tax optimization suggestions
- Natural language querying in German
- API marketplace
- Advanced reporting

**Phase 5 — Market Expansion (Year 2):**

- Austria & Switzerland (DACH) expansion
- Sector-specific modules (Handwerk, Gastro, e-commerce)
- PEPPOL access point integration

### Risk Mitigation Strategy

**Technical Risks:**

| Risk                                          | Likelihood | Impact   | Mitigation                                                                                                                      |
| --------------------------------------------- | ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| AI accuracy below 95% on real invoices        | Medium     | Critical | Pre-launch validation gate with 200+ real invoices. Fallback: increase human-in-the-loop surface area, reduce automation claims |
| Solo developer burnout / feature overload     | High       | Critical | Strict MVP scope discipline. No feature additions without removing something. Time-box MVP to 8–10 weeks                        |
| DATEV export format rejected by Steuerberater | Medium     | High     | Test with 2–3 real Steuerberater during beta. Use reference implementation (ledermann/datev) for format validation              |
| GoBD architecture insufficient                | Low        | High     | Pre-launch legal review. Document architecture decisions. GoBD-Ready positioning (not certified)                                |

**Market Risks:**

| Risk                                              | Likelihood | Impact | Mitigation                                                                                                            |
| ------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| Target users too digitally immature to adopt SaaS | Medium     | High   | Extreme UX simplicity. Handwerkskammer partnership for guided onboarding                                              |
| Incumbent (Lexoffice/sevDesk) ships AI features   | Medium     | Medium | Speed-to-market advantage. Data moat widens with each invoice. First 20 fanatics validate PMF before incumbents react |
| Free tier attracts users who never convert        | Medium     | Low    | 10 invoice limit is generous enough for trust, tight enough for conversion pressure. Monitor cohort data              |

**Resource Risks (Solo Developer):**

| Risk                                       | Likelihood | Impact   | Mitigation                                                                                     |
| ------------------------------------------ | ---------- | -------- | ---------------------------------------------------------------------------------------------- |
| Scope creep delays launch                  | High       | Critical | This PRD is the scope contract. No additions without explicit trade-offs                       |
| Single point of failure (illness, burnout) | Medium     | High     | Automated deployments, infrastructure-as-code, comprehensive documentation. No knowledge silos |
| Support burden overwhelms development      | Medium     | Medium   | 20 fanatic users = manageable support. Community channel (Discord/Slack) for peer support      |

## Functional Requirements

### Document Capture & AI Processing

- FR1: User can upload invoice documents via photo capture (browser camera), file upload (PDF, image), or XML file upload
- FR2: User can upload multiple invoices in a single batch operation
- FR3: System can extract structured data from uploaded invoices (invoice number, date, sender, recipient, line items, net amount, VAT rate, VAT amount, gross amount, currency, supplier tax ID) using AI processing
- FR4: System can process uploaded documents and return extracted data within 5 seconds
- FR5: System can assign a confidence score (green/amber/red) to each extracted field
- FR6: User can review, edit, and confirm AI-extracted data before saving
- FR7: System can learn from user corrections to improve future extraction accuracy for the same supplier

### Invoice Categorization

- FR8: System can automatically suggest SKR03 or SKR04 account codes for each invoice based on AI analysis
- FR9: User can select between SKR03 and SKR04 chart of accounts in tenant settings
- FR10: User can accept, modify, or override AI-suggested account codes
- FR11: System can improve categorization accuracy over time based on user corrections
- FR12: System can map appropriate BU-Schlüssel (tax key) for standard German VAT scenarios (19%, 7%, 0%, reverse-charge, intra-EU)

### E-Invoice Validation (Incoming)

- FR13: System can validate incoming XRechnung (UBL 2.1) and ZUGFeRD (CII D16B) invoices against EN 16931 business rules
- FR14: System can display validation results with specific error descriptions for non-compliant invoices
- FR15: System can generate a pre-written email to suppliers requesting correction of non-compliant invoices

### DATEV Export

- FR16: User can configure DATEV settings (Berater-Nr, Mandanten-Nr, Sachkontenlänge, fiscal year start)
- FR17: User can export processed invoices as DATEV-Format CSV (Buchungsstapel, EXTF format)
- FR18: System can generate DATEV CSV with correct encoding (Windows-1252), delimiter (semicolon), and date format (ddMM)
- FR19: User can select a date range for DATEV export
- FR20: User can download the generated DATEV CSV file

### GoBD-Compliant Archive

- FR21: System can automatically store every uploaded and generated document in immutable storage with SHA-256 hash
- FR22: System can log all document actions (upload, view, edit, export, delete) with timestamp and user ID
- FR23: System can retain all archived documents for a minimum of 10 years
- FR24: User can search and retrieve archived documents by date range, supplier, amount, or invoice number
- FR25: User can export archived documents for audit purposes (Finanzamt inspection)

### Verfahrensdokumentation (GoBD Process Documentation)

- FR26: System can auto-generate a Verfahrensdokumentation PDF based on tenant configuration (company details, accounting workflow, software used, archiving procedures, access controls)
- FR27: System can update the Verfahrensdokumentation when tenant settings or workflow configuration change
- FR28: User can download the generated Verfahrensdokumentation as PDF
- FR29: System can display the Verfahrensdokumentation status on dashboard (generated, up-to-date, needs update)

### Dashboard & Invoice Management

- FR30: User can view a list of all invoices with status indicators (processed, pending review, validation error)
- FR31: User can filter and sort invoices by date, supplier, amount, status, and category
- FR32: User can view detailed information for any individual invoice
- FR33: User can see a weekly value summary (invoices processed, time saved, VAT deductions accumulated)
- FR34: System can display overall processing statistics (total invoices, accuracy rate, export history)

### User Account & Authentication

- FR35: User can register with email and password
- FR36: User can log in and maintain a persistent session (30-day refresh)
- FR37: User can reset their password via email
- FR38: User can configure tenant settings (company name, address, tax ID, SKR plan, DATEV configuration)
- FR39: User can view and manage their subscription status

### Subscription & Billing

- FR40: User can use the free tier (up to 10 invoices/month) without providing payment information
- FR41: System can track monthly invoice usage against the free tier limit
- FR42: System can display contextual upgrade prompts when approaching or reaching the free tier limit
- FR43: User can upgrade to the Starter plan via Stripe Checkout
- FR44: User can view billing history and download subscription invoices

### Notifications & Engagement

- FR45: System can send weekly value recap emails (invoices processed, time saved, accumulated deductions) on Sunday evening or Monday morning
- FR46: System can display compliance warnings for invoices with missing or invalid data (e.g., missing USt-ID)
- FR47: User can configure notification preferences (email on/off)

### Trust & Onboarding

- FR48: System can display a "How your data is protected" information screen during onboarding before first invoice upload
- FR49: System can display the AI disclaimer on every AI-processed result ("AI-suggested data must be reviewed. Final responsibility lies with the user.")
- FR50: System can display security badges (DSGVO, GoBD, German hosting) on the dashboard
- FR51: User can accept the AI disclaimer (acceptance logged for legal records)

## Non-Functional Requirements

### Performance

- NFR1: AI invoice data extraction must complete within 5 seconds (p95) for single document upload
- NFR2: Batch upload of up to 20 documents must complete processing within 60 seconds (p95)
- NFR3: Dashboard page load must complete within 2 seconds on standard broadband connection
- NFR4: DATEV CSV export generation must complete within 10 seconds for up to 500 invoices
- NFR5: Invoice search and filtering must return results within 1 second
- NFR6: Photo capture via browser camera must render preview within 500ms

### Security & Data Protection

- NFR7: All data at rest encrypted with AES-256; all data in transit encrypted with TLS 1.3
- NFR8: All infrastructure hosted in German data centers (EU data residency) — no data processing outside EU
- NFR9: Row-level security enforced at database level — zero cross-tenant data access possible
- NFR10: Authentication tokens expire after 30 days; password reset tokens expire after 1 hour
- NFR11: All document operations logged with immutable audit trail (who, what, when)
- NFR12: System must pass OWASP Top 10 vulnerability assessment before launch
- NFR13: AI processing API calls must not transmit or store user data beyond the processing request (no training on user data by third-party AI providers)

### Scalability

- NFR14: System architecture must support growth from 20 to 500 concurrent users without re-architecture
- NFR15: Database schema must support 500 tenants × 1,000 invoices/year × 10-year retention = 5M document records
- NFR16: File storage must scale to accommodate GoBD 10-year archive requirements (estimated 50GB per 500 tenants over 10 years)
- NFR17: AI processing pipeline must support horizontal scaling via queue-based architecture (add workers without code changes)

### Reliability & Availability

- NFR18: System uptime target: 99.5% in first 3 months, 99.9% at 12 months
- NFR19: Automated database backups every 24 hours with 30-day retention
- NFR20: Zero data loss guarantee — no uploaded invoice or generated document may be lost under any failure scenario
- NFR21: Graceful degradation: if AI processing is temporarily unavailable, users can still access dashboard, view existing invoices, and export DATEV files
- NFR22: Recovery time objective (RTO): 4 hours for full system restore from backup

### Usability

- NFR23: Core workflow (upload → review → confirm) must be completable by a user with digital maturity index 5/100 without external help
- NFR24: All UI text in German (MVP). No English-only error messages, tooltips, or system notifications
- NFR25: Responsive design must be fully functional on mobile devices (minimum 375px viewport width) — photo capture is a core mobile use case
- NFR26: Maximum 3 clicks from dashboard to any core action (upload, export, archive search)

### Integration Reliability

- NFR27: DATEV CSV export must produce files that import successfully into DATEV Unternehmen Online without manual format correction
- NFR28: AI API provider abstraction layer must allow switching between Claude and OpenAI APIs without user-facing changes
- NFR29: Stripe webhook processing must handle retries and idempotency — no duplicate charges or missed subscription events
- NFR30: Email delivery (weekly notifications, invoice sending) must achieve >95% deliverability rate
