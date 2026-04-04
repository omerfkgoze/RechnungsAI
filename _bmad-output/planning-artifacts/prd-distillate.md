---
type: bmad-distillate
sources:
  - "prd.md"
downstream_consumer: "general"
created: "2026-04-04"
token_estimate: 3850
parts: 1
---

## Core Concept
- RechnungsAI: AI-powered e-invoicing/accounting SaaS for German micro-businesses (5-20 employees)
- Germany's Wachstumschancengesetz mandates structured e-invoices (XRechnung/ZUGFeRD) by Jan 2028; 25% SMEs unprepared
- Market gap: Lexoffice = affordable but manual; DATEV = powerful but expensive/complex; RechnungsAI = AI automation at accessible pricing
- Core workflow: photo of invoice -> AI extraction (~3s, 95%+ accuracy) -> SKR03/04 auto-categorization -> EN 16931 validation -> DATEV export; replaces 3hr/week manual chore with 20min
- Data moat: German-specific formats/vendors/SKR mappings compound with each invoice processed; generic OCR cannot match
- 2025-2027 regulatory transition = once-in-a-generation forced switching event with winner-take-most dynamics

## Project Classification
- Type: SaaS B2B; multi-tenant, subscription tiers, web dashboard, integrations (DATEV, ELSTER)
- Domain: Fintech; GoBD, DSGVO, EN 16931 regulatory frameworks
- Complexity: High; regulated industry, AI accuracy impacts tax returns, data residency requirements
- Context: Greenfield; solo developer building entire stack
- Author: GOZE; Date: 2026-04-02

## Users & Personas
- Thomas Brenner: 42, Schreinerei owner Munich, 6 employees, ~EUR 800K revenue, 25-30 incoming + 15-20 outgoing invoices/week, zero digital maturity, uses Excel/Word; primary user
- Lisa Hartmann: 29, e-commerce (Shopify/Amazon DE) Hamburg, 2 employees, ~EUR 350K revenue, 60+ supplier invoices/month from DE/PL/CN, multi-channel VAT complexity; needs intra-EU reverse-charge handling
- Frau Claudia Schmidt: 54, Steuerberaterin Munich, 85 clients (40% Handwerk), uses DATEV Unternehmen Online; indirect user, spends 30% time on data cleanup; organic distribution channel
- Target demographic: conservative German tradespeople 40+ with minimal digital experience; deep cloud skepticism

## Success Criteria
- Aha moment: invoice photographed -> categorized/validated entry in seconds
- Indispensable moment: weekly engagement notification quantifying time saved and tax deductions
- Time saved: ~2.5 hrs/week reduction in manual bookkeeping
- Error reduction: 8-15% manual error rate -> <2% AI-assisted
- Time-to-value: first invoice within 5 min of signup
- 3-month: 20 fanatic users actively reporting bugs/requesting features (quality over quantity)
- 12-month: 500 paying customers; EUR 25 avg ARPU -> EUR 12,500 MRR; NPS >50
- Free-to-paid conversion rate tracked as leading indicator; target established after initial cohort
- Retention metric: weekly active usage; DATEV export >= 1x/month indicates deep workflow integration
- AI accuracy: >=95% at 3 months, >=99.5% field-level precision at 12 months (per-field precision/recall, not aggregate)
- Uptime: 99.5% at 3 months, 99.9% at 12 months
- Time-to-value target: <5 min at 3 months, <3 min at 12 months
- Weekly time saved: ~2 hrs at 3 months, ~2.5 hrs at 12 months

## MVP Feature Set (Phase 1)
- Photo/PDF/XML upload + AI data extraction (core aha moment)
- AI auto-categorization SKR03/SKR04
- Human-in-the-loop confirmation with confidence scoring (green >95%, amber 70-95%, red <70%)
- Incoming e-invoice validation EN 16931 (XRechnung UBL 2.1, ZUGFeRD CII D16B)
- DATEV CSV export (Buchungsstapel EXTF format)
- GoBD-Ready archive (immutable storage, SHA-256 hash, change logs, 10-year retention)
- Verfahrensdokumentation auto-generator (PDF)
- Web dashboard (invoice list, status, actions, filtering, search)
- Email+password auth via Supabase Auth; optional Google social login; 30-day JWT refresh tokens
- Stripe billing: free tier (10 invoices/month, no CC required) + Starter EUR 14.90/mo upgrade via Stripe Checkout
- Weekly value notification email (Sunday evening/Monday morning)
- Trust-building onboarding (security screen, AI disclaimer, security badges)
- Pre-launch validation gate: 200+ authentic German invoices across paper photos/PDF/XRechnung XML/ZUGFeRD; hard gate, no exceptions
- MVP time-box: 8-10 weeks
- Solo developer scope discipline: no feature additions without removing something

## Explicitly Deferred from MVP
- XRechnung/ZUGFeRD outgoing generation -> Phase 2
- Bank connection (FinTS/PSD2) -> Phase 3
- Full accounting (EUR/GuV) -> Phase 3
- ELSTER integration -> Phase 3 (separate certification)
- Multi-user/RBAC enforcement -> Phase 3 (schema prepared, UI deferred)
- English language -> Phase 3
- Anomaly detection; natural language querying -> Phase 4
- SEPA direct debit -> deferred until payment friction data justifies

## Phased Roadmap
- Phase 2 (Months 3-4): outgoing XRechnung/ZUGFeRD generation (EN 16931), outgoing invoice management, SEPA direct debit
- Phase 3 (Months 4-7): bank connection FinTS/PSD2, full accounting EÜR+GuV, ELSTER USt-VA auto-submission, multi-user RBAC (owner/bookkeeper/viewer), English, anomaly detection, incoming invoice email forwarding per tenant
- Phase 4 (Months 7-12): Steuerberater portal, Shopify/WooCommerce integrations, AI tax optimization, German NL querying, API marketplace, advanced reporting
- Phase 5 (Year 2): DACH expansion (Austria/Switzerland), sector-specific modules (Handwerk/Gastro/e-commerce), PEPPOL access point

## Subscription Tiers
- Free: EUR 0, 10/month, full AI processing + DATEV export + GoBD archive
- Starter: EUR 14.90/mo, unlimited, priority processing
- Business: EUR 29.90/mo, unlimited, multi-user + bank integration + full accounting (Phase 3)
- Pro: EUR 49.90/mo, unlimited, API access + advanced reporting + priority support (Phase 4)
- Upgrade trigger: contextual prompt at 8/10 invoices, not hard paywall
- Billing edge cases: prorated upgrades mid-cycle, downgrade at period end, self-invoicing

## DATEV CSV Export Technical Spec
- EXTF format: 3-part (header row 1, column headers row 2, data rows 3+)
- Encoding: Windows-1252 (not UTF-8); delimiter: semicolon; text qualifier: double quotes; decimal: comma
- Header fields: EXTF identifier, version 700, category 21 (Buchungsstapel), Berater-Nr, Mandanten-Nr, WJ-Beginn, Sachkontenlänge (typically 4), date range, currency EUR
- Key data fields (116+ columns): Umsatz (decimal comma-sep), Soll/Haben-Kz (S/H), Konto, Gegenkonto, BU-Schlüssel (9=19% VSt, 8=7% VSt), Belegdatum (ddMM 4-digit), Belegfeld 1 (max 36), Buchungstext (max 60), Festschreibung (0/1)
- BU-Schlüssel must cover all German VAT scenarios: 19%, 7%, 0%, reverse-charge, intra-EU
- References: DATEV Developer Portal (developer.datev.de); ledermann/datev Ruby gem for format validation
- Test exports validated by importing into DATEV Unternehmen Online test environment
- Monitor version field (currently 700) for format updates

## Multi-Tenancy & Auth
- Every table includes tenant_id FK; Supabase native RLS enforced at DB level
- MVP: 1 user per tenant, 1:1 mapping; schema supports multi-user without migration (users->tenants junction table, role column pre-defined)
- Role enum: owner (MVP active), bookkeeper (Phase 3), viewer (Phase 3)
- Tenant settings: Berater-Nr, Mandanten-Nr, SKR plan, fiscal year start, company details

## Security & Trust
- Data residency: exclusively German data centers (Hetzner Cloud, Nürnberg/Falkenstein); no data leaves EU
- Encryption: AES-256 at rest, TLS 1.3 in transit
- GoBD-Ready archive: immutable storage, SHA-256 hash at ingestion, tamper-proof change logs, 10-year retention, audit-ready export
- No formal IDW PS 880 certification for MVP (prohibitively expensive); GoBD-Ready positioning with documented architecture
- Legal review of GoBD-Ready claims required before launch
- DSGVO: AVV template for enterprise, right to deletion (except legal retention), privacy-by-design, minimum data collection
- Complete data deletion on account closure (except mandated retention); data export anytime (no vendor lock-in)
- Invoice data used for AI improvement only in anonymized/aggregated form
- AI API calls must not transmit/store user data beyond processing request; no third-party training on user data
- Trust UX: onboarding security screen, dashboard badges (DSGVO/GoBD/German hosting), target TÜV or BSI Grundschutz certification
- OWASP Top 10 assessment required before launch

## AI & Accuracy
- Human-in-the-loop mandatory: every AI field presented for user confirmation before saving
- Confidence scoring per field: green >95%, amber 70-95%, red <70%; amber/red require explicit attention
- Legal disclaimer mandatory at onboarding + every AI result: "AI-suggested data must be reviewed. Final responsibility lies with the user." (German: "Die von der KI vorgeschlagenen Daten müssen überprüft werden. Die endgültige Verantwortung liegt beim Nutzer."); acceptance logged
- Accuracy tracking: field-level precision/recall per invoice type, supplier, document quality; internal dashboard (not user-facing MVP)
- Model improvement: user corrections -> anonymized training data -> improved accuracy
- AI provider: Claude/OpenAI API with abstraction layer to swap without codebase changes
- Supplier pattern recognition: accuracy improves from 95% to 99%+ within first month per supplier

## Non-Functional Requirements
- NFR1: AI extraction <5s (p95) single doc; NFR2: batch 20 docs <60s (p95)
- NFR3: dashboard load <2s; NFR4: DATEV export <10s for 500 invoices; NFR5: search/filter <1s; NFR6: camera preview <500ms
- NFR9: row-level security, zero cross-tenant access; NFR10: auth tokens 30-day expiry, password reset 1hr expiry
- NFR14: architecture supports 20 to 500 concurrent users without re-architecture
- NFR15: DB supports 500 tenants x 1000 invoices/year x 10 years = 5M documents
- NFR16: file storage ~50GB per 500 tenants over 10 years
- NFR17: AI pipeline horizontal scaling via queue-based architecture
- NFR19: automated DB backups every 24hrs, 30-day retention; NFR20: zero data loss guarantee
- NFR21: graceful degradation if AI unavailable (dashboard/archive/export still work); NFR22: RTO 4 hours
- NFR23: core workflow usable by digital maturity index 5/100 without help
- NFR24: all UI text German only (MVP), no English-only errors/tooltips
- NFR25: responsive min 375px viewport; NFR26: max 3 clicks to any core action
- NFR27: DATEV CSV must import into DATEV Unternehmen Online without manual correction
- NFR28: AI API abstraction layer allows Claude<->OpenAI swap without user-facing changes
- NFR29: Stripe webhook retries + idempotency (no duplicate charges/missed events)
- NFR30: email deliverability >95%

## Integration Architecture
- MVP: DATEV CSV export; transactional email (Resend/AWS SES); Hetzner S3-compatible object storage (immutable bucket); Claude/OpenAI API
- Phase 2: outgoing e-invoice generation
- Phase 3: FinTS/PSD2 bank, ELSTER API, incoming invoice email forwarding
- Phase 4: Shopify/WooCommerce webhooks, Steuerberater portal API, PEPPOL access point
- Responsive web-first (not native app); photo via browser camera API; PWA consideration
- No offline mode MVP; German UI only; i18n architecture from day one

## Risks
- HIGH RISK: solo developer burnout/feature overload (likelihood high, impact critical); mitigation: strict MVP scope, 8-10 week time-box, no additions without trade-offs
- HIGH RISK: scope creep delays launch; mitigation: PRD is scope contract
- MEDIUM RISK: AI accuracy <95% on real invoices (impact critical); mitigation: 200+ invoice validation gate, fallback to increased human-in-the-loop
- MEDIUM RISK: DATEV export rejected by Steuerberater (impact high); mitigation: test with 2-3 real Steuerberater during beta, reference implementation validation
- MEDIUM RISK: target users too digitally immature for SaaS (impact high); mitigation: extreme UX simplicity, Handwerkskammer partnership
- MEDIUM RISK: incumbent (Lexoffice/sevDesk) ships AI features; mitigation: speed-to-market, data moat, validate PMF with first 20 fanatics before incumbents react
- MEDIUM RISK: single point of failure (illness/burnout); mitigation: automated deployments, IaC, comprehensive docs
- LOW RISK: GoBD architecture insufficient (impact high); mitigation: pre-launch legal review, documented decisions
- MEDIUM RISK: free tier attracts non-converters (impact low); mitigation: 10 invoice limit balances trust and conversion pressure
- RISK: DSGVO violation -> fines up to 4% revenue; mitigation: privacy-by-design, German hosting, AVV, DPO consultation
- RISK: AI miscategorization -> wrong tax return; mitigation: human-in-the-loop, disclaimer, confidence scoring, accuracy tracking
- RISK: DATEV format change; mitigation: monitor developer.datev.de, version checking, format abstraction layer
- RISK: GoBD non-compliance post-launch; mitigation: pre-launch legal review, GoBD-Ready architecture documentation

## Discovery Channels
- Handwerkskammer e-Rechnung readiness seminars; free compliance checker tool as lead magnet
- OMR Reviews articles; Shopify seller Facebook groups (organic referral)
- Steuerberater as organic distribution channel (Phase 4 portal deepens this)

## Functional Requirements Summary (FR1-FR51)
- FR1-FR7: document capture (photo/PDF/XML upload, batch, AI extraction <5s, confidence scoring, manual correction with AI learning)
- FR8-FR12: categorization (SKR03/04 auto-suggestion, user override, BU-Schlüssel mapping for all VAT scenarios)
- FR13-FR15: incoming e-invoice validation (XRechnung/ZUGFeRD against EN 16931, error display, pre-written correction email generation)
- FR16-FR20: DATEV export (settings config, Buchungsstapel EXTF, Windows-1252/semicolon/ddMM, date range selection, download)
- FR21-FR25: GoBD archive (immutable SHA-256, action logging, 10-year retention, search by date/supplier/amount/invoice#, audit export)
- FR26-FR29: Verfahrensdokumentation (auto-generate PDF from tenant config, auto-update on config change, download, dashboard status)
- FR30-FR34: dashboard (invoice list with status, filter/sort, detail view, weekly value summary, processing statistics)
- FR35-FR39: auth & account (register, persistent session 30-day, password reset, tenant settings, subscription management)
- FR40-FR44: billing (free tier no CC, usage tracking, contextual upgrade prompts, Stripe Checkout, billing history/invoices)
- FR45-FR47: notifications (weekly value recap email, compliance warnings for missing USt-ID etc., notification preferences)
- FR48-FR51: trust & onboarding (data protection screen, AI disclaimer on every result, security badges, disclaimer acceptance logging)
