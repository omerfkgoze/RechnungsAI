---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - prd.md
  - architecture.md
  - ux-design-specification.md
  - ux-design-specification-distillate/_index.md
---

# RechnungsAI - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for RechnungsAI, decomposing the requirements from the PRD, UX Design, and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: User can upload invoice documents via photo capture (browser camera), file upload (PDF, image), or XML file upload
FR2: User can upload multiple invoices in a single batch operation
FR3: System can extract structured data from uploaded invoices (invoice number, date, sender, recipient, line items, net amount, VAT rate, VAT amount, gross amount, currency, supplier tax ID) using AI processing
FR4: System can process uploaded documents and return extracted data within 5 seconds
FR5: System can assign a confidence score (green/amber/red) to each extracted field
FR6: User can review, edit, and confirm AI-extracted data before saving
FR7: System can learn from user corrections to improve future extraction accuracy for the same supplier
FR8: System can automatically suggest SKR03 or SKR04 account codes for each invoice based on AI analysis
FR9: User can select between SKR03 and SKR04 chart of accounts in tenant settings
FR10: User can accept, modify, or override AI-suggested account codes
FR11: System can improve categorization accuracy over time based on user corrections
FR12: System can map appropriate BU-Schlüssel (tax key) for standard German VAT scenarios (19%, 7%, 0%, reverse-charge, intra-EU)
FR13: System can validate incoming XRechnung (UBL 2.1) and ZUGFeRD (CII D16B) invoices against EN 16931 business rules
FR14: System can display validation results with specific error descriptions for non-compliant invoices
FR15: System can generate a pre-written email to suppliers requesting correction of non-compliant invoices
FR16: User can configure DATEV settings (Berater-Nr, Mandanten-Nr, Sachkontenlänge, fiscal year start)
FR17: User can export processed invoices as DATEV-Format CSV (Buchungsstapel, EXTF format)
FR18: System can generate DATEV CSV with correct encoding (Windows-1252), delimiter (semicolon), and date format (ddMM)
FR19: User can select a date range for DATEV export
FR20: User can download the generated DATEV CSV file
FR21: System can automatically store every uploaded and generated document in immutable storage with SHA-256 hash
FR22: System can log all document actions (upload, view, edit, export, delete) with timestamp and user ID
FR23: System can retain all archived documents for a minimum of 10 years
FR24: User can search and retrieve archived documents by date range, supplier, amount, or invoice number
FR25: User can export archived documents for audit purposes (Finanzamt inspection)
FR26: System can auto-generate a Verfahrensdokumentation PDF based on tenant configuration (company details, accounting workflow, software used, archiving procedures, access controls)
FR27: System can update the Verfahrensdokumentation when tenant settings or workflow configuration change
FR28: User can download the generated Verfahrensdokumentation as PDF
FR29: System can display the Verfahrensdokumentation status on dashboard (generated, up-to-date, needs update)
FR30: User can view a list of all invoices with status indicators (processed, pending review, validation error)
FR31: User can filter and sort invoices by date, supplier, amount, status, and category
FR32: User can view detailed information for any individual invoice
FR33: User can see a weekly value summary (invoices processed, time saved, VAT deductions accumulated)
FR34: System can display overall processing statistics (total invoices, accuracy rate, export history)
FR35: User can register with email and password
FR36: User can log in and maintain a persistent session (30-day refresh)
FR37: User can reset their password via email
FR38: User can configure tenant settings (company name, address, tax ID, SKR plan, DATEV configuration)
FR39: User can view and manage their subscription status
FR40: User can use the free tier (up to 10 invoices/month) without providing payment information
FR41: System can track monthly invoice usage against the free tier limit
FR42: System can display contextual upgrade prompts when approaching or reaching the free tier limit
FR43: User can upgrade to the Starter plan via Stripe Checkout
FR44: User can view billing history and download subscription invoices
FR45: System can send weekly value recap emails (invoices processed, time saved, accumulated deductions) on Sunday evening or Monday morning
FR46: System can display compliance warnings for invoices with missing or invalid data (e.g., missing USt-ID)
FR47: User can configure notification preferences (email on/off)
FR48: System can display a "How your data is protected" information screen during onboarding before first invoice upload
FR49: System can display the AI disclaimer on every AI-processed result ("AI-suggested data must be reviewed. Final responsibility lies with the user.")
FR50: System can display security badges (DSGVO, GoBD, German hosting) on the dashboard
FR51: User can accept the AI disclaimer (acceptance logged for legal records)

### NonFunctional Requirements

NFR1: AI invoice data extraction must complete within 5 seconds (p95) for single document upload
NFR2: Batch upload of up to 20 documents must complete processing within 60 seconds (p95)
NFR3: Dashboard page load must complete within 2 seconds on standard broadband connection
NFR4: DATEV CSV export generation must complete within 10 seconds for up to 500 invoices
NFR5: Invoice search and filtering must return results within 1 second
NFR6: Photo capture via browser camera must render preview within 500ms
NFR7: All data at rest encrypted with AES-256; all data in transit encrypted with TLS 1.3
NFR8: All infrastructure hosted in German data centers (EU data residency) — no data processing outside EU
NFR9: Row-level security enforced at database level — zero cross-tenant data access possible
NFR10: Authentication tokens expire after 30 days; password reset tokens expire after 1 hour
NFR11: All document operations logged with immutable audit trail (who, what, when)
NFR12: System must pass OWASP Top 10 vulnerability assessment before launch
NFR13: AI processing API calls must not transmit or store user data beyond the processing request (no training on user data by third-party AI providers)
NFR14: System architecture must support growth from 20 to 500 concurrent users without re-architecture
NFR15: Database schema must support 500 tenants x 1,000 invoices/year x 10-year retention = 5M document records
NFR16: File storage must scale to accommodate GoBD 10-year archive requirements (estimated 50GB per 500 tenants over 10 years)
NFR17: AI processing pipeline must support horizontal scaling via queue-based architecture (add workers without code changes)
NFR18: System uptime target: 99.5% in first 3 months, 99.9% at 12 months
NFR19: Automated database backups every 24 hours with 30-day retention
NFR20: Zero data loss guarantee — no uploaded invoice or generated document may be lost under any failure scenario
NFR21: Graceful degradation: if AI processing is temporarily unavailable, users can still access dashboard, view existing invoices, and export DATEV files
NFR22: Recovery time objective (RTO): 4 hours for full system restore from backup
NFR23: Core workflow (upload, review, confirm) must be completable by a user with digital maturity index 5/100 without external help
NFR24: All UI text in German (MVP). No English-only error messages, tooltips, or system notifications
NFR25: Responsive design must be fully functional on mobile devices (minimum 375px viewport width)
NFR26: Maximum 3 clicks from dashboard to any core action (upload, export, archive search)
NFR27: DATEV CSV export must produce files that import successfully into DATEV Unternehmen Online without manual format correction
NFR28: AI API provider abstraction layer must allow switching between Claude and OpenAI APIs without user-facing changes
NFR29: Stripe webhook processing must handle retries and idempotency — no duplicate charges or missed subscription events
NFR30: Email delivery (weekly notifications, invoice sending) must achieve >95% deliverability rate

### Additional Requirements

- Starter Template: create-turbo (vanilla) + create-next-app — monorepo infra without opinions on auth/DB/deployment; init via `pnpm dlx create-turbo@latest rechnungsai --package-manager pnpm` then `pnpm create next-app@latest web --typescript --tailwind --eslint --app --turbopack --no-src-dir` then `pnpm dlx shadcn@latest init`
- Monorepo structure: apps/web (Next.js App Router), packages/shared (schemas, types, constants), packages/ai, packages/datev, packages/validation, packages/gobd, packages/pdf, packages/email, packages/typescript-config, packages/eslint-config, supabase/
- Infrastructure: Supabase self-hosted on Hetzner Germany via Coolify; Coolify Git Push Auto-Deploy (main branch)
- Database: Supabase PostgreSQL with RLS; auto-generated types via `supabase gen types`; migrations via Supabase CLI
- Auth: Supabase Auth (Email + Password + Google OAuth); JWT 30-day refresh; RLS authorization
- AI Integration: Vercel AI SDK v5 with `generateObject()` + Zod schemas; one-line provider swap (Claude/OpenAI); zero-retention API endpoints
- Styling: Tailwind CSS v4 + shadcn/ui (copied, full ownership) + CSS custom properties
- State Management: Zustand for client state (camera queue, offline buffer); React Query/SWR for server state
- Forms: React Hook Form + Zod validation (shared schemas across forms/AI/API)
- Animation: Framer Motion (swipe gestures, cascade animations, prefers-reduced-motion)
- PDF Generation: React PDF (@react-pdf/renderer) — JSX templates, server-side
- Email: Resend + React Email (3K free/mo, EU region)
- Monitoring: Sentry cloud free tier (@sentry/nextjs)
- Testing: Vitest (co-located tests, Jest-compatible API)
- Build/Deploy: Dockerfile multi-stage (turbo prune --scope=web); Coolify auto-deploy
- Naming Conventions: DB tables snake_case plural, columns snake_case; files kebab-case, components PascalCase, functions camelCase
- Package Dependency Rules: apps/web can import any package; all packages import only from shared; no cross-package imports except shared
- Enforcement Rules: ActionResult<T> from every Server Action; all user-facing errors in conversational German; Zod schemas shared; ISO 8601 UTC for dates; co-located tests
- Implementation Sequence: 1. Supabase self-host (Coolify) → 2. Turborepo + Next.js init → 3. Supabase Auth + RLS → 4. shadcn/ui + Tailwind + design tokens → 5. AI pipeline (Vercel AI SDK) → 6. Core features → 7. Stripe billing → 8. Resend emails → 9. Sentry → 10. Coolify deployment
- German data residency mandatory (DSGVO) — blocks US-only cloud services
- GoBD immutability — write-once storage, cryptographic hashing
- DATEV EXTF format — Windows-1252, semicolons, specific header structure (version 700, category 21)
- EN 16931 validation — KoSIT reference validator integration
- PWA offline capture — Service Worker + IndexedDB (basic for MVP; full offline Phase 2)
- 10-year document retention with lifecycle management
- Queue-based AI pipeline deferred to Phase 2 (synchronous Server Actions for MVP)
- German locale throughout: numbers 1.234,56; dates dd.MM.yyyy; currency EUR; "Du" address form

### UX Design Requirements

UX-DR1: Implement PipelineHeader component — nav+status element showing lifecycle pipeline (Erfasst/Verarbeitung/Bereit/Exportiert) with real-time counts, WhatsApp-style stage indicators (circle/half-circle/filled-circle/checkmark), states (Default, Attention pulse when count>0, Processing shimmer, Empty, Tapped 105% scale+haptic), role=navigation, mobile abbreviates labels
UX-DR2: Implement AccordionInvoiceCard component — collapsed view (supplier+amount+confidence 4px left border), expanded view (all fields+VAT+SKR+confidence per field+actions), swipe right=approve (green) / left=flag (amber), swipe activation >20px threshold 40% card width, spring snap 200ms / momentum 300ms ease-out, haptic at threshold, keyboard alternatives (Enter expand, Escape collapse, button alternatives to swipe)
UX-DR3: Implement ConfidenceIndicator component — per-field AI confidence display; variants: dot (compact), badge (percentage), bar (progress); green >95% checkmark no animation, amber 70-94% triangle pulse 2s, red <70% cross static; onTap opens source viewer; explanation text for amber/red
UX-DR4: Implement CameraCapture component — full-screen viewfinder with document detection overlay, auto-capture when 4 corners stable >500ms, multi-capture mode with counter badge, gallery fallback for PDF/image, offline queue via IndexedDB+Service Worker, Camera API getUserMedia environment facing, max 2MB JPEG, open time <500ms, manual shutter 56px
UX-DR5: Implement SessionSummary component — end-of-session card showing invoice count, duration, estimated time saved, error count, streak weeks, export readiness; states: Perfect Session, With Corrections, Streak Milestone, Export Prompt (>=10 ready), First Session
UX-DR6: Implement TrustBadgeBar component — ambient security bar with German flag + "Gehostet in Deutschland" + GoBD + DSGVO badges; fixed top 28-36px; Primary at 5% opacity; collapses to icon-only on scroll; never dismissable, never interactive
UX-DR7: Implement ExportAction component — context-aware export button; states: Dormant (readyCount=0, text only), Available (1-9, subtle card), Prominent (>=10, Primary Light bg+pulse border), Month-End Urgent (last 5 days+readyCount>0)
UX-DR8: Implement design token system — Prussian Blue #003153 primary palette, Steel Blue #4682B4 hover/focus, semantic confidence colors (Emerald Green #2ECC71 / Warm Amber #F39C12 / Soft Red #E74C3C), neutrals (Charcoal #2C3E50 / Slate Gray #708090 / Ghost White #F8FAFC), 4px spacing base unit, Inter font with tabular-nums for financial data
UX-DR9: Implement mobile bottom navigation — 3 items (Dashboard / Erfassen FAB / Archiv), labels always visible, 64px height, persistent except camera+onboarding; desktop left sidebar 240px expanded / 64px collapsed
UX-DR10: Implement responsive split-view layout — mobile single column (320-767px), tablet wider cards (768-1023px), desktop split-view (1024px+) with 380px fixed list + detail pane; Tailwind breakpoints
UX-DR11: Implement swipe-to-approve interaction pattern — "Tinder swipe" for high-confidence green invoices (right=approve, left=flag), Framer Motion gesture system, haptic feedback at threshold, 5-second undo toast with countdown bar after every approve/flag/delete
UX-DR12: Implement trust-building onboarding flow — Landing → Signup (email+password or Google, no CC) → Trust Screen (German flag, security badges, NOT skippable) → Company Setup (3 fields max: company name, SKR toggle, optional Steuerberater) → First Invoice Prompt (full-screen camera) → AI Processing (3s cascade animation) → Aha Moment → Success; target: signup to first capture <3min
UX-DR13: Implement confidence-based review queue — sorted by confidence (green first, then amber, then red); green=swipe right <1s; amber=pulse on fields, one-line explanation, tap to source highlight, 10-30s; red=action items with guidance, pre-written correction email, 30-60s
UX-DR14: Implement DATEV export flow UX — dashboard prompt ("N Rechnungen bereit"), auto-suggested config (max 1 tap if complete), 3-step generation progress (Validating/Formatting/Packaging), partial export support ("21 von 23 exportiert, 2 uebersprungen"), download CSV or email to Steuerberater
UX-DR15: Implement error recovery UX patterns — source document viewer with original image/PDF, relevant area highlighted, pinch-to-zoom, extracted value alongside; AI learning feedback messages per supplier; non-blocking error handling (one bad invoice never prevents others)
UX-DR16: Implement accessibility requirements — WCAG 2.1 AA compliance, 4.5:1 contrast normal text, 48x48px min touch targets with 8px gap, skip-to-content link, aria-live for status changes, form errors via aria-describedby, confidence read as text+percentage, prefers-reduced-motion support, axe-core in CI
UX-DR17: Implement loading and feedback patterns — skeleton/shimmer (never full-screen spinner), >5s "Dauert etwas laenger", >15s retry option; success=inline green checkmark 1s + toast 3s auto-dismiss; warning=amber persistent; error=conversational German guidance persistent; toast stack max 3
UX-DR18: Implement form patterns — smart defaults (edit not create), single column mobile, labels above fields, required=subtle asterisk, optional fields under "Weitere Angaben" accordion, submit button sticky bottom mobile, inline correction with AI value pre-filled, real-time format validation, on-blur completeness validation
UX-DR19: Implement empty states — clear action + encouraging tone, centered layout, h2 headline, body-sm description, no sad faces/oops language; content tone conversational German with imperative verbs and "Du" address
UX-DR20: Implement desktop keyboard shortcuts — up/down navigate list, Enter opens detail, A approves, E exports, ? for help

### FR Coverage Map

FR1: Epic 2 - Photo/PDF/XML invoice upload
FR2: Epic 2 - Batch upload multiple invoices
FR3: Epic 2 - AI structured data extraction
FR4: Epic 2 - AI processing within 5 seconds
FR5: Epic 2 - Confidence score per extracted field
FR6: Epic 3 - Review, edit, confirm AI-extracted data
FR7: Epic 3 - AI learns from user corrections
FR8: Epic 3 - Auto-suggest SKR03/SKR04 account codes
FR9: Epic 3 - SKR plan selection in tenant settings
FR10: Epic 3 - Accept, modify, override AI-suggested codes
FR11: Epic 3 - Categorization accuracy improvement over time
FR12: Epic 3 - BU-Schlüssel mapping for German VAT scenarios
FR13: Epic 6 - Validate XRechnung/ZUGFeRD against EN 16931
FR14: Epic 6 - Display validation error descriptions
FR15: Epic 6 - Generate correction email to suppliers
FR16: Epic 5 - Configure DATEV settings
FR17: Epic 5 - Export as DATEV CSV (Buchungsstapel EXTF)
FR18: Epic 5 - Correct encoding/delimiter/date format
FR19: Epic 5 - Date range selection for export
FR20: Epic 5 - Download generated DATEV CSV
FR21: Epic 4 - Immutable storage with SHA-256 hash
FR22: Epic 4 - Log all document actions with audit trail
FR23: Epic 4 - 10-year document retention
FR24: Epic 4 - Search archived documents
FR25: Epic 4 - Export archived documents for audit
FR26: Epic 7 - Auto-generate Verfahrensdokumentation PDF
FR27: Epic 7 - Update Verfahrensdokumentation on config change
FR28: Epic 7 - Download Verfahrensdokumentation PDF
FR29: Epic 7 - Dashboard Verfahrensdokumentation status
FR30: Epic 3 - Invoice list with status indicators
FR31: Epic 3 - Filter and sort invoices
FR32: Epic 3 - Invoice detail view
FR33: Epic 3 - Weekly value summary
FR34: Epic 3 - Processing statistics
FR35: Epic 1 - User registration (email + password)
FR36: Epic 1 - Persistent session (30-day refresh)
FR37: Epic 1 - Password reset via email
FR38: Epic 1 - Tenant settings configuration
FR39: Epic 8 - Subscription status management
FR40: Epic 8 - Free tier (10 invoices/month, no CC)
FR41: Epic 8 - Monthly usage tracking
FR42: Epic 8 - Contextual upgrade prompts
FR43: Epic 8 - Stripe Checkout upgrade
FR44: Epic 8 - Billing history and invoices
FR45: Epic 8 - Weekly value recap emails
FR46: Epic 3 - Compliance warnings for invalid data
FR47: Epic 8 - Notification preferences
FR48: Epic 1 - Data protection onboarding screen
FR49: Epic 1 - AI disclaimer on every result
FR50: Epic 1 - Security badges on dashboard
FR51: Epic 1 - AI disclaimer acceptance logging

## Epic List

### Epic 1: Project Foundation and User Authentication
Users can register, log in, and configure tenant settings. The secure session management and trust-building onboarding experience establishes confidence. Includes starter template setup, design token system, navigation, and responsive layout as the foundation for all subsequent epics.
**FRs covered:** FR35, FR36, FR37, FR38, FR48, FR49, FR50, FR51
**UX-DRs covered:** UX-DR6, UX-DR8, UX-DR9, UX-DR10, UX-DR12, UX-DR16, UX-DR17, UX-DR18, UX-DR19

### Epic 2: Invoice Capture and AI Data Extraction
Users can upload invoices via photo capture, PDF, or XML and AI extracts structured data within seconds. Each extracted field displays a confidence score.
**FRs covered:** FR1, FR2, FR3, FR4, FR5
**UX-DRs covered:** UX-DR3, UX-DR4

### Epic 3: Invoice Review, Approval, and Dashboard
Users can review AI-extracted data, correct errors, and approve invoices. Swipe-to-approve enables instant approval of high-confidence invoices while low-confidence items receive guided correction flows. The pipeline dashboard provides full invoice management.
**FRs covered:** FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR30, FR31, FR32, FR33, FR34, FR46
**UX-DRs covered:** UX-DR1, UX-DR2, UX-DR5, UX-DR7, UX-DR11, UX-DR13, UX-DR15, UX-DR20

### Epic 4: GoBD-Compliant Archive and Audit Trail
All user documents are automatically protected with immutable storage, SHA-256 hashing, 10-year retention, and a complete audit trail. Users can search and export archived documents for Finanzamt inspection.
**FRs covered:** FR21, FR22, FR23, FR24, FR25

### Epic 5: DATEV Export
Users can export approved invoices as DATEV CSV (Buchungsstapel EXTF format) and send to their Steuerberater. Correct Windows-1252 encoding, BU-Schlüssel mapping, and partial export support included.
**FRs covered:** FR16, FR17, FR18, FR19, FR20
**UX-DRs covered:** UX-DR14

### Epic 6: E-Invoice Validation
Users can validate incoming XRechnung and ZUGFeRD invoices against EN 16931 business rules, view detailed error descriptions, and send correction emails to suppliers.
**FRs covered:** FR13, FR14, FR15

### Epic 7: Verfahrensdokumentation
Users can download an auto-generated Verfahrensdokumentation PDF based on tenant configuration, see its status on the dashboard, and receive automatic updates when settings change.
**FRs covered:** FR26, FR27, FR28, FR29

### Epic 8: Subscription, Billing, and Notifications
Users can start with a free tier, upgrade to paid plans via Stripe, view billing history, and receive weekly value recap emails with time saved and deduction summaries.
**FRs covered:** FR39, FR40, FR41, FR42, FR43, FR44, FR45, FR47

---

## Epic 1: Project Foundation and User Authentication

Users can register, log in, and configure tenant settings. The secure session management and trust-building onboarding experience establishes confidence. Includes starter template setup, design token system, navigation, and responsive layout as the foundation for all subsequent epics.

### Story 1.1: Monorepo and Next.js Project Initialization

As a developer,
I want a fully initialized monorepo with Next.js, Tailwind CSS, shadcn/ui, and local Supabase dev environment,
So that all subsequent features can be built on a solid, consistent foundation.

**Acceptance Criteria:**

**Given** the project repository is empty
**When** the developer runs the initialization scripts
**Then** a Turborepo monorepo is created with pnpm workspaces
**And** apps/web contains a Next.js App Router application with TypeScript strict mode
**And** Tailwind CSS v4 and shadcn/ui are initialized in apps/web
**And** packages/shared, packages/ai, packages/datev, packages/validation, packages/gobd, packages/pdf, packages/email, packages/typescript-config, and packages/eslint-config directories exist with proper package.json files
**And** supabase/ directory contains config.toml and an initial migration
**And** `pnpm dev` starts the Next.js dev server successfully
**And** `supabase start` launches the local Supabase instance (PostgreSQL, Auth, Storage)
**And** ESLint is configured and passes on the initial codebase
**And** a Dockerfile with multi-stage build (turbo prune --scope=web) is present
**And** package dependency rules are enforced: apps/web can import any package; packages only import from shared

### Story 1.2: Design Token System and Base Layout

As a user,
I want a visually consistent, responsive interface with clear navigation,
So that I can easily find my way around the application on any device.

**Acceptance Criteria:**

**Given** the Next.js application is initialized
**When** the design token system is implemented
**Then** CSS custom properties define the full color palette: Prussian Blue #003153 (primary), Steel Blue #4682B4 (hover/focus), Emerald Green #2ECC71 (success/high confidence), Warm Amber #F39C12 (warning/medium confidence), Soft Red #E74C3C (destructive/low confidence), and neutral scale (Charcoal #2C3E50, Slate Gray #708090, Ghost White #F8FAFC, Snow #F1F5F9)
**And** Inter font is loaded with WOFF2 format, tabular-nums enabled for financial data, fallback to system font stack
**And** the type scale matches the specification: display 28/36px, h1 24/30px, body 16px, amount 18/20px with tabular-nums
**And** spacing uses 4px base unit (space-1 through space-12)
**And** border radius tokens are defined: sm=6px, md=8px, lg=12px, xl=16px, full=9999px
**And** animation tokens are defined: fast=150ms, normal=250ms, slow=350ms with prefers-reduced-motion support

**Given** a user visits the app on a mobile device (320-767px)
**When** the layout renders
**Then** a bottom navigation bar is displayed with 3 items (Dashboard, Erfassen FAB, Archiv) at 64px height with always-visible labels
**And** the layout is single column with 16px padding
**And** all touch targets are minimum 48x48px with 8px gap

**Given** a user visits the app on a desktop (1024px+)
**When** the layout renders
**Then** a left sidebar navigation is displayed (240px expanded, 64px collapsed) with Dashboard, Erfassen, Archiv, Einstellungen
**And** the container has max-width 1280px

**Given** the TrustBadgeBar component is implemented
**When** it renders at the top of the page
**Then** it displays German flag + "Gehostet in Deutschland" + GoBD + DSGVO badges at 28-36px height with Primary at 5% opacity
**And** it collapses to icon-only on scroll
**And** it is never dismissable and never interactive

**Given** a page has no content
**When** an empty state is rendered
**Then** it shows a centered layout with h2 headline, body-sm description, clear action button, and encouraging tone without sad faces or oops language

**Given** content is loading
**When** the loading state renders
**Then** skeleton/shimmer patterns are displayed matching the expected content shape (never a full-screen spinner)
**And** after >5s a message "Dauert etwas laenger..." is shown
**And** after >15s a retry option appears

### Story 1.3: User Registration and Authentication

As a user,
I want to register and log in securely with email/password or Google,
So that my data is protected and I can access my account from any device.

**Acceptance Criteria:**

**Given** a new user visits the registration page
**When** they enter a valid email and password and submit
**Then** a new account is created via Supabase Auth
**And** a tenant record is created with a 1:1 user-tenant mapping
**And** the users table includes tenant_id FK with RLS policies enforced
**And** the user is redirected to the onboarding flow
**And** all UI text is in German using conversational tone with "Du" address

**Given** a new user chooses Google OAuth
**When** they complete the Google sign-in flow
**Then** a new account is created via Supabase Auth with PKCE callback
**And** a tenant record is created automatically
**And** the user is redirected to the onboarding flow

**Given** a registered user visits the login page
**When** they enter valid credentials
**Then** they are authenticated with a 30-day JWT refresh token (persistent session)
**And** they are redirected to the dashboard

**Given** a user has forgotten their password
**When** they request a password reset
**Then** a reset email is sent with a token that expires after 1 hour
**And** the user can set a new password via the reset link

**Given** any authenticated request
**When** the database is queried
**Then** RLS policies enforce tenant isolation — zero cross-tenant data access is possible (NFR9)

**Given** the auth system is implemented
**When** authentication tokens are inspected
**Then** tokens expire after 30 days and password reset tokens expire after 1 hour (NFR10)

### Story 1.4: Trust-Building Onboarding Flow

As a new user,
I want to understand how my data is protected and set up my company quickly,
So that I feel confident using the system before uploading my first invoice.

**Acceptance Criteria:**

**Given** a newly registered user completes signup
**When** the onboarding flow begins
**Then** the user is shown a Trust Screen displaying: German flag, "Gehostet in Deutschland", GoBD-compliant archive, DSGVO-konform, bank-grade encryption (AES-256)
**And** the Trust Screen is NOT skippable but is concise
**And** all text is in German with conversational tone (FR48)

**Given** the user has viewed the Trust Screen
**When** they proceed to Company Setup
**Then** the form shows maximum 3 fields: company name, SKR03/SKR04 toggle, optional Steuerberater name
**And** a "Spaeter ergaenzen" link is clearly visible for optional fields
**And** the form uses single column layout on mobile with labels above fields, required fields marked with subtle asterisk
**And** the submit button is sticky at the bottom on mobile (UX-DR18)

**Given** the user completes Company Setup
**When** they proceed to the First Invoice Prompt
**Then** a full-screen camera icon with a single clear action is displayed
**And** the prompt encourages the user to take their first photo

**Given** the AI disclaimer must be presented
**When** it is shown during onboarding
**Then** the text reads: "Die von der KI vorgeschlagenen Daten muessen ueberprueft werden. Die endgueltige Verantwortung liegt beim Nutzer." (FR49)
**And** the user must explicitly accept the disclaimer
**And** the acceptance is logged with timestamp and user ID for legal records (FR51)

**Given** the onboarding flow is measured
**When** tracking is reviewed
**Then** the target is: signup to first capture <3 minutes, Trust Screen drop-off <5%, Company Setup drop-off <10%

### Story 1.5: Tenant Settings and Dashboard Shell

As a user,
I want to configure my company details and DATEV settings and see a dashboard overview,
So that my invoices are processed with the correct business context and I have a central place to manage my work.

**Acceptance Criteria:**

**Given** an authenticated user navigates to Settings
**When** the tenant settings page loads
**Then** the user can view and edit: company name, company address, tax ID (USt-IdNr with DE prefix + 9 digits), SKR plan (SKR03/SKR04 searchable select), DATEV configuration (Berater-Nr numeric, Mandanten-Nr numeric, Sachkontenlaenge, fiscal year start) (FR38)
**And** the form uses smart defaults (edit not create), with real-time format validation and on-blur completeness validation
**And** optional fields are grouped under a "Weitere Angaben" accordion, collapsed by default
**And** all validation messages appear below the field, never in modals
**And** Server Actions return ActionResult<T> format

**Given** an authenticated user navigates to the Dashboard
**When** the dashboard page loads
**Then** a shell layout is displayed with placeholder sections for: invoice pipeline (to be populated in Epic 3), weekly value summary area, and processing statistics area
**And** security badges (DSGVO, GoBD, German hosting) are visible on the dashboard (FR50)
**And** the AI disclaimer is configured to display on every future AI-processed result (FR49)
**And** the page loads within 2 seconds (NFR3)

**Given** the user views the dashboard on desktop
**When** keyboard shortcuts are available
**Then** the ? key shows a help overlay listing available shortcuts (UX-DR20)

**Given** any user-facing error occurs
**When** the error is displayed
**Then** the message is in conversational German, specific, and actionable — never technical English (NFR24)
**And** errors are logged with [module:action] prefix and sent to Sentry

---

## Epic 2: Invoice Capture and AI Data Extraction

Users can upload invoices via photo capture, PDF, or XML and AI extracts structured data within seconds. Each extracted field displays a confidence score.

### Story 2.1: Single Invoice Upload (Photo, PDF, Image, XML)

As a user,
I want to upload an invoice by taking a photo, selecting a PDF/image file, or uploading an XML file,
So that I can quickly get my invoices into the system without manual data entry.

**Acceptance Criteria:**

**Given** an authenticated user taps the Erfassen FAB or navigates to capture
**When** the CameraCapture component opens
**Then** a full-screen viewfinder is displayed with document detection overlay
**And** the camera opens within <500ms using Camera API getUserMedia with environment-facing preference (NFR6)
**And** auto-capture triggers when 4 document corners are stable for >500ms
**And** a manual shutter button (56px) is available as an alternative
**And** captured images are compressed to max 2MB JPEG
**And** the camera stays open after capture for immediate next photo

**Given** the user wants to upload a file instead of using the camera
**When** they select the gallery/file fallback option
**Then** they can select PDF, image (JPEG/PNG), or XML files from their device
**And** accepted file types are validated before upload

**Given** an invoice file is captured or selected
**When** the upload begins
**Then** the file is uploaded to Supabase Storage via a Server Action
**And** an invoice record is created in the invoices table with status "captured" and tenant_id
**And** the invoices table includes columns: id, tenant_id, status (enum: captured/processing/ready/review/exported), file_path, file_type, original_filename, created_at, updated_at
**And** RLS policies enforce tenant isolation on the invoices table

**Given** the device is offline
**When** the user captures an invoice photo
**Then** the image is queued in IndexedDB via Service Worker for upload when connectivity returns (UX-DR4)

### Story 2.2: AI Data Extraction Pipeline

As a user,
I want the system to automatically extract all invoice data and show me how confident it is about each field,
So that I can quickly verify the data instead of typing it all manually.

**Acceptance Criteria:**

**Given** an invoice has been uploaded with status "captured"
**When** the AI extraction pipeline is triggered
**Then** the invoice status changes to "processing"
**And** the system sends the document to the AI provider via Vercel AI SDK v5 `generateObject()` with a Zod schema defining the expected invoice structure
**And** the Zod schema (in packages/shared) includes: invoice_number, invoice_date, supplier_name, supplier_address, supplier_tax_id (USt-IdNr), recipient_name, recipient_address, line_items (array with description, quantity, unit_price, net_amount, vat_rate, vat_amount), net_total, vat_total, gross_total, currency, payment_terms
**And** each extracted field includes a confidence score (0.0 to 1.0)

**Given** the AI extraction completes successfully
**When** the results are processed
**Then** extraction completes within 5 seconds p95 for a single document (NFR1)
**And** the extracted data is stored in an invoice_data JSONB column on the invoices table
**And** the invoice status changes to "ready" (if all fields green >95%) or "review" (if any field amber or red)
**And** the AI API call uses a zero-retention endpoint — no user data stored by the AI provider (NFR13)
**And** the Server Action returns ActionResult<T> format

**Given** the AI extraction is displayed to the user
**When** the results appear on screen
**Then** a cascade animation shows fields appearing top-to-bottom over ~800ms (3s total processing visualization)
**And** each field displays a ConfidenceIndicator (UX-DR3): green checkmark (>95%, no animation), amber triangle (70-94%, pulse 2s loop), or red cross (<70%, static)
**And** the ConfidenceIndicator supports variants: dot (compact), badge (percentage), bar (progress)
**And** amber/red fields show explanation text describing why confidence is low
**And** tapping a ConfidenceIndicator opens the source document viewer (to be fully implemented in Epic 3)

**Given** the AI provider is temporarily unavailable
**When** extraction fails
**Then** the invoice remains in "captured" status
**And** the user sees a conversational German error message with retry option
**And** existing dashboard, archive, and export features continue to function (NFR21)

### Story 2.3: Batch Invoice Upload

As a user,
I want to upload multiple invoices at once,
So that I can quickly capture a stack of invoices without interrupting my workflow.

**Acceptance Criteria:**

**Given** the user is in the CameraCapture component
**When** multi-capture mode is active
**Then** a counter badge shows the number of captured invoices incrementing with each photo
**And** the camera stays open between captures — zero-wait capture flow
**And** the user can swipe down or tap "Fertig" to finish capturing and return to the dashboard

**Given** the user selects multiple files via the file upload option
**When** they confirm the selection
**Then** all selected files (PDF, image, XML) are queued for upload
**And** each file creates a separate invoice record

**Given** multiple invoices are uploaded in a batch
**When** AI processing begins
**Then** each invoice is processed independently — one failure does not block others
**And** batch of up to 20 documents completes processing within 60 seconds p95 (NFR2)
**And** the pipeline dashboard (to be built in Epic 3) shows real-time status for each invoice
**And** processing happens in background while the user can continue capturing or navigating the app

---

## Epic 3: Invoice Review, Approval, and Dashboard

Users can review AI-extracted data, correct errors, and approve invoices. Swipe-to-approve enables instant approval of high-confidence invoices while low-confidence items receive guided correction flows. The pipeline dashboard provides full invoice management.

### Story 3.1: Pipeline Dashboard and Invoice List

As a user,
I want to see all my invoices organized by processing status with real-time counts,
So that I always know what needs my attention and can manage my workflow efficiently.

**Acceptance Criteria:**

**Given** an authenticated user navigates to the Dashboard
**When** the pipeline dashboard loads
**Then** the PipelineHeader component displays lifecycle stages: Erfasst (captured), Verarbeitung (processing), Bereit (ready), Exportiert (exported) with real-time invoice counts per stage (UX-DR1)
**And** each stage uses WhatsApp-style indicators: circle (captured), half-circle (processing), filled-circle (ready), checkmark (exported)
**And** the PipelineHeader has states: Default, Attention (Bereit pulses when count>0), Processing (shimmer animation), Empty, Tapped (105% scale + haptic feedback)
**And** the component uses role=navigation with aria-label="Rechnungs-Pipeline"
**And** on mobile, stage labels are abbreviated

**Given** the dashboard displays the invoice list
**When** invoices are loaded
**Then** each invoice shows: supplier name, gross amount (EUR formatted as German locale 1.234,56), date (dd.MM.yyyy), status indicator, and confidence border color (FR30)
**And** invoices are displayed as cards in a scrollable list
**And** the list loads within 2 seconds (NFR3) using React Server Components with Supabase server client

**Given** the user wants to find specific invoices
**When** they use filter and sort controls
**Then** they can filter by: date range, supplier, amount range, status (captured/processing/ready/review/exported), and SKR category (FR31)
**And** they can sort by: date (newest/oldest), amount (highest/lowest), supplier (A-Z), status
**And** search and filtering return results within 1 second (NFR5)

**Given** the dashboard shows processing statistics
**When** the statistics section renders
**Then** it displays: total invoices processed, overall AI accuracy rate, and export history count (FR34)

### Story 3.2: Invoice Detail View and Field Editing

As a user,
I want to view all extracted data for an invoice and correct any fields the AI got wrong,
So that I can ensure accuracy before approving the invoice.

**Acceptance Criteria:**

**Given** the user taps/clicks on an invoice in the list
**When** the AccordionInvoiceCard expands (or detail pane opens on desktop)
**Then** the expanded view shows all extracted fields: invoice number, date, supplier details, recipient details, line items with quantity/unit price/net/VAT rate/VAT amount, net total, VAT total, gross total, currency, payment terms (FR32)
**And** each field displays its ConfidenceIndicator (green/amber/red) (UX-DR2)
**And** the card has a 4px left border colored by overall confidence level
**And** on desktop (1024px+), the split-view layout shows the invoice list (380px fixed) on the left and detail pane on the right (UX-DR10)

**Given** the user wants to edit an AI-extracted field
**When** they tap on an editable field
**Then** the field becomes editable with the AI value pre-filled
**And** the appropriate keyboard is shown (numeric keypad for amounts with EUR prefix and German locale, date picker for dates) (UX-DR18)
**And** "Uebernehmen" (green) and "AI-Wert wiederherstellen" (tertiary) buttons are available
**And** validation runs in real-time for format and on-blur for completeness
**And** validation messages appear below the field, never in modals

**Given** the user corrects a field value
**When** the correction is saved
**Then** the correction is persisted via a Server Action returning ActionResult<T>
**And** the user's correction is stored for AI learning — the system can improve future extraction accuracy for the same supplier (FR6, FR7)
**And** a success feedback is shown: inline green checkmark for 1 second (UX-DR17)

**Given** the user wants to compare extracted data with the source
**When** they tap on a ConfidenceIndicator or source link
**Then** the source document viewer opens showing the original image/PDF
**And** the relevant area of the document is highlighted
**And** the extracted value is shown alongside for comparison (UX-DR15)
**And** pinch-to-zoom is supported on touch devices

**Given** the AccordionInvoiceCard is used on mobile
**When** interacting with the card
**Then** keyboard alternatives exist: Enter to expand, Escape to collapse, tab-accessible buttons as alternatives to swipe (UX-DR2)

### Story 3.3: SKR Categorization and BU-Schluessel Mapping

As a user,
I want the system to automatically suggest the correct SKR account code and VAT tax key for each invoice,
So that my bookkeeping categorization is accurate and DATEV-ready.

**Acceptance Criteria:**

**Given** an invoice has been processed by AI extraction
**When** categorization is performed
**Then** the system suggests an SKR03 or SKR04 account code based on the user's tenant SKR plan setting (FR8, FR9)
**And** the AI suggestion includes a confidence score displayed via ConfidenceIndicator
**And** the suggested code appears in the invoice detail view with a searchable select showing most-used codes at the top

**Given** the user disagrees with the AI-suggested account code
**When** they modify or override the suggestion
**Then** the user can select any valid SKR code from the searchable dropdown (FR10)
**And** the override is saved and the system learns from this correction to improve future suggestions for the same supplier (FR11)
**And** an AI learning feedback message is shown: supplier-specific ("Bei naechster Rechnung von [Supplier] weiss ich Bescheid") or pattern-based ("Verstanden, ich merke mir das") (UX-DR15)

**Given** an invoice includes VAT
**When** the BU-Schluessel is determined
**Then** the system maps the appropriate tax key for all German VAT scenarios: 19% standard (BU 9), 7% reduced (BU 8), 0% exempt, reverse-charge, and intra-EU acquisitions (FR12)
**And** the BU-Schluessel is displayed alongside the VAT breakdown in the invoice detail

**Given** the categorization data is stored
**When** the invoice record is updated
**Then** the skr_code, bu_schluessel, and categorization_confidence fields are persisted on the invoice record
**And** a categorization_corrections table tracks all user overrides with tenant_id, invoice_id, original_code, corrected_code, and timestamp for the learning feedback loop

### Story 3.4: Swipe-to-Approve and Confidence-Based Review Queue

As a user,
I want to quickly approve high-confidence invoices with a swipe and focus my attention on ones that need review,
So that I can process a batch of invoices in minutes instead of hours.

**Acceptance Criteria:**

**Given** the user views the review queue
**When** invoices are sorted for review
**Then** invoices are ordered by confidence level: green (>95%) first, then amber (70-94%), then red (<70%) (UX-DR13)
**And** this sorting ensures the user experiences the "magic" of instant approvals before dealing with exceptions

**Given** a green (high-confidence) invoice is displayed
**When** the user swipes right on the AccordionInvoiceCard
**Then** the invoice is approved in <1 second
**And** swipe activation requires >20px movement, threshold at 40% card width
**And** below threshold: spring snap back in 200ms; above threshold: momentum animation 300ms ease-out
**And** haptic feedback fires at the swipe threshold (50ms)
**And** a green flash animation confirms the approval (UX-DR11)

**Given** the user swipes left on an invoice
**When** the swipe completes past threshold
**Then** the invoice is flagged for further review with amber indicator
**And** the same swipe physics apply (spring snap / momentum)

**Given** an invoice has just been approved or flagged
**When** the action completes
**Then** a 5-second undo toast appears at the bottom with a "Rueckgaengig" link and countdown bar (UX-DR11)
**And** if the user taps undo, the action is reversed
**And** auto-dismiss after 5 seconds makes the action permanent
**And** the next action replaces the previous undo toast
**And** toasts stack maximum 3

**Given** the user completes a review session
**When** all invoices in the current batch are processed
**Then** the SessionSummary component displays: invoice count, session duration, estimated time saved, error/correction count, consecutive week streak, and export readiness (UX-DR5)
**And** SessionSummary states include: Perfect Session (all green, no corrections), With Corrections, Streak Milestone, Export Prompt (>=10 ready invoices), First Session

**Given** the ExportAction component is rendered
**When** the ready invoice count changes
**Then** it reflects the correct state: Dormant (0 ready, text only), Available (1-9, subtle card), Prominent (>=10, Primary Light bg + pulse border), Month-End Urgent (last 5 days of month + readyCount>0) (UX-DR7)

### Story 3.5: Compliance Warnings and Weekly Value Summary

As a user,
I want to be warned about invoices with missing or invalid data and see how much time and money I am saving,
So that I can fix compliance issues before export and feel confident about the value the system provides.

**Acceptance Criteria:**

**Given** an invoice has missing or invalid required data
**When** the compliance check runs
**Then** warnings are displayed for issues such as: missing USt-IdNr, invalid date format, missing required fields, VAT calculation mismatches (FR46)
**And** warnings use amber background + icon + text, persistent until resolved (UX-DR17)
**And** each warning is specific and actionable in conversational German (e.g., "Die USt-IdNr fehlt auf dieser Rechnung. Bitte ergaenzen oder den Lieferanten kontaktieren.")
**And** warnings never block the entire workflow — one problematic invoice does not prevent others from being approved or exported

**Given** an authenticated user views the dashboard
**When** the weekly value summary section renders
**Then** it displays: invoices processed this week, estimated time saved (calculated from invoice count x average processing time), and accumulated VAT deductions (FR33)
**And** numbers use tabular-nums with German locale formatting (EUR 1.234,56)
**And** the summary is time-scoped: weekly invoices (Monday ritual), monthly exported (Steuerberater cycle)

**Given** the user is on the desktop dashboard
**When** they use keyboard shortcuts
**Then** up/down arrow keys navigate the invoice list, Enter opens invoice detail, A approves the selected invoice, E triggers export, and ? shows the help overlay (UX-DR20)
**And** all keyboard interactions have visual focus indicators (2px solid Primary, 2px offset)

---

## Epic 4: GoBD-Compliant Archive and Audit Trail

All user documents are automatically protected with immutable storage, SHA-256 hashing, 10-year retention, and a complete audit trail. Users can search and export archived documents for Finanzamt inspection.

### Story 4.1: Immutable Document Storage and SHA-256 Hashing

As a user,
I want every uploaded invoice to be automatically stored in a tamper-proof archive with a cryptographic hash,
So that my documents meet GoBD compliance requirements and I can prove they have not been altered.

**Acceptance Criteria:**

**Given** an invoice document is uploaded (photo, PDF, or XML)
**When** the document is persisted
**Then** the original file is stored in Supabase Storage in an immutable bucket with write-once policy
**And** a SHA-256 hash is computed at ingestion time and stored in the invoices table (hash_sha256 column) (FR21)
**And** the hash computation is performed server-side in the packages/gobd module (archive.ts + hash.ts)
**And** the original file cannot be modified or overwritten after storage — immutability is enforced at the storage layer

**Given** a previously stored document is accessed
**When** integrity verification is requested
**Then** the system recomputes the SHA-256 hash of the stored file and compares it against the stored hash
**And** any mismatch is flagged as a potential tampering event and logged in the audit trail

**Given** the archive storage is configured
**When** retention policies are set
**Then** documents are retained for a minimum of 10 years from upload date (FR23)
**And** lifecycle management prevents accidental deletion within the retention period
**And** storage is designed to scale to 50GB per 500 tenants over 10 years (NFR16)

**Given** all data storage decisions
**When** infrastructure is configured
**Then** all data is encrypted with AES-256 at rest and TLS 1.3 in transit (NFR7)
**And** all infrastructure is hosted in German data centers — no data leaves the EU (NFR8)
**And** zero data loss is guaranteed — no uploaded document may be lost under any failure scenario (NFR20)

### Story 4.2: Audit Trail and Action Logging

As a user,
I want every action on my documents to be logged in an immutable audit trail,
So that I have a complete history for GoBD compliance and Finanzamt inspections.

**Acceptance Criteria:**

**Given** any document operation occurs
**When** the action is performed
**Then** an immutable audit log entry is created in the audit_logs table recording: tenant_id, invoice_id, action type (upload, view, edit, approve, export, delete, hash_verify), user_id, timestamp (ISO 8601 UTC), and details (JSON with before/after values for edits) (FR22, NFR11)
**And** RLS policies enforce tenant isolation on the audit_logs table
**And** audit log entries are append-only — no update or delete operations are permitted on this table

**Given** the user edits an AI-extracted field
**When** the correction is saved
**Then** the audit log captures the field name, original AI value, corrected value, and confidence score at time of edit

**Given** the user approves or flags an invoice
**When** the status change is persisted
**Then** the audit log captures the previous status, new status, and approval method (swipe, button, keyboard shortcut)

**Given** a DATEV export is generated (to be implemented in Epic 5)
**When** the export completes
**Then** the audit log captures: export date range, number of invoices included, export format, and download/email action

**Given** the audit logging system is operational
**When** log entries are inspected
**Then** all timestamps use ISO 8601 UTC format
**And** the logging uses [gobd:audit] prefix for Sentry integration
**And** the audit_logs table supports the 5M document record scale (NFR15)

### Story 4.3: Archive Search and Audit Export

As a user,
I want to search my archived invoices and export them for tax audits,
So that I can quickly find any document and provide complete records to the Finanzamt when requested.

**Acceptance Criteria:**

**Given** an authenticated user navigates to the Archiv section
**When** the archive search page loads
**Then** the user can search documents by: date range (using native date picker on mobile, shadcn picker on desktop), supplier name (autocomplete from known suppliers), amount range (numeric keypad input with German locale), and invoice number (text search) (FR24)
**And** search results return within 1 second (NFR5)
**And** results display: supplier name, invoice date, gross amount, status, and upload date
**And** the archive is accessible within maximum 3 clicks from the dashboard (NFR26)

**Given** the user selects invoices for audit export
**When** they initiate an audit export
**Then** the system generates an export package containing: selected invoice documents (original files), extracted data summary (CSV or PDF), audit trail entries for each selected document, and SHA-256 hash verification results (FR25)
**And** the export is downloadable as a ZIP file
**And** the export action is logged in the audit trail

**Given** the user searches with no results
**When** the empty state is displayed
**Then** it shows an encouraging message with clear guidance in conversational German (e.g., "Keine Rechnungen gefunden. Versuche einen anderen Suchbegriff oder Zeitraum.")
**And** the empty state follows UX-DR19 patterns: centered, h2 headline, body-sm description, no sad faces

**Given** the archive contains documents spanning multiple years
**When** the user browses the archive
**Then** documents are organized chronologically and filterable by fiscal year
**And** the 10-year retention policy is visually indicated (documents cannot be manually deleted within retention period)

---

## Epic 5: DATEV Export

Users can export approved invoices as DATEV CSV (Buchungsstapel EXTF format) and send to their Steuerberater. Correct Windows-1252 encoding, BU-Schlüssel mapping, and partial export support included.

### Story 5.1: DATEV Settings Configuration

As a user,
I want to configure my DATEV export settings once,
So that every export is generated with the correct consultant and client numbers for my Steuerberater.

**Acceptance Criteria:**

**Given** an authenticated user navigates to Settings
**When** the DATEV configuration section is displayed
**Then** the user can configure: Berater-Nr (numeric digits only), Mandanten-Nr (numeric digits only), Sachkontenlaenge (typically 4, numeric select), and fiscal year start month (FR16)
**And** these fields are part of the tenant settings page created in Story 1.5
**And** input fields use numeric keypad on mobile
**And** the form validates format in real-time and completeness on-blur
**And** saved settings are persisted to the tenants table via Server Action returning ActionResult<T>

**Given** DATEV settings have not been configured
**When** the user attempts to export
**Then** the export flow detects missing settings and prompts the user to complete DATEV configuration inline — never navigating away from the export context (UX-DR14)
**And** the prompt is in conversational German: "Fuer den DATEV-Export werden noch deine Berater- und Mandantennummer benoetigt."

**Given** DATEV settings are already configured
**When** the user initiates an export
**Then** the settings are auto-populated with max 1 tap needed to proceed (UX-DR14)

### Story 5.2: DATEV Buchungsstapel CSV Generation

As a user,
I want my approved invoices to be converted into a properly formatted DATEV CSV file,
So that my Steuerberater can import it directly into DATEV Unternehmen Online without manual corrections.

**Acceptance Criteria:**

**Given** a set of approved invoices is selected for export
**When** the DATEV CSV generation runs in packages/datev
**Then** the output file follows the EXTF Buchungsstapel format with 3 parts (FR17, FR18):
**And** Row 1 (header): EXTF identifier, version 700, category 21 (Buchungsstapel), Berater-Nr, Mandanten-Nr, WJ-Beginn, Sachkontenlaenge, date range, currency EUR
**And** Row 2 (column headers): all 116+ DATEV column names
**And** Row 3+ (data rows): one row per invoice booking with correct field mapping

**Given** the CSV encoding requirements
**When** the file is encoded
**Then** the encoding is Windows-1252 (NOT UTF-8) using packages/datev/encoding.ts
**And** the delimiter is semicolon
**And** the text qualifier is double quotes
**And** the decimal separator is comma (German locale)
**And** dates are formatted as ddMM (4-digit, e.g., "1503" for March 15)

**Given** invoice data is mapped to DATEV fields
**When** each data row is generated
**Then** key fields are correctly mapped: Umsatz (amount with decimal comma), Soll/Haben-Kz (S or H), Konto (account number), Gegenkonto (contra account), BU-Schluessel (9=19% VSt, 8=7% VSt, plus 0%, reverse-charge, intra-EU), Belegdatum (ddMM), Belegfeld 1 (invoice reference, max 36 chars), Buchungstext (description, max 60 chars), Festschreibung (0 or 1)
**And** all German VAT scenarios are covered by the BU-Schluessel mapping (FR12 from Epic 3)

**Given** the generated CSV file
**When** it is imported into DATEV Unternehmen Online
**Then** it imports successfully without manual format correction (NFR27)
**And** the DATEV version field (currently 700) is configurable to support future format updates

### Story 5.3: DATEV Export Flow and Download

As a user,
I want to select a date range, see export progress, and download or email the DATEV CSV to my Steuerberater,
So that I can complete my monthly bookkeeping handoff in under a minute.

**Acceptance Criteria:**

**Given** the user initiates a DATEV export from the dashboard or ExportAction button
**When** the export flow begins
**Then** a dashboard prompt shows the count of ready invoices (e.g., "23 Rechnungen bereit fuer den Export") (UX-DR14)
**And** the export configuration screen auto-suggests: date period (based on last export date), format (DATEV EXTF), Berater-Nr and Mandanten-Nr (from tenant settings)

**Given** the user selects a date range
**When** they confirm the export parameters
**Then** the user can select a custom date range using date pickers (FR19)
**And** the default suggestion covers invoices since the last export

**Given** the export is processing
**When** progress is displayed
**Then** a 3-step progress indicator shows: "Wird validiert..." (Validating), "Wird formatiert..." (Formatting), "Wird zusammengestellt..." (Packaging) (UX-DR14)
**And** export generation completes within 10 seconds for up to 500 invoices (NFR4)

**Given** some invoices fail validation during export
**When** the export completes with warnings
**Then** partial export is supported — valid invoices are exported, invalid ones are skipped
**And** the result shows: "21 von 23 Rechnungen exportiert, 2 uebersprungen" with details on skipped invoices
**And** the export is never entirely blocked by individual invoice issues (UX-DR14)

**Given** the export is ready
**When** the user chooses a delivery method
**Then** they can download the CSV file directly via a Route Handler that serves the binary file (FR20)
**Or** they can email the CSV to their Steuerberater with auto-generated subject: "DATEV Export [Month Year] - [Company Name]" and professional German body text
**And** the Steuerberater email address is retrieved from tenant settings

**Given** the export completes
**When** the action is finalized
**Then** all exported invoices are updated to status "exported"
**And** the export event is logged in the audit trail (Epic 4)
**And** the ExportAction button state updates to reflect the new ready count

---

## Epic 6: E-Invoice Validation

Users can validate incoming XRechnung and ZUGFeRD invoices against EN 16931 business rules, view detailed error descriptions, and send correction emails to suppliers.

### Story 6.1: EN 16931 Invoice Validation Engine

As a user,
I want incoming e-invoices to be automatically validated against the official European standard,
So that I know immediately if a supplier's invoice is compliant before I process it.

**Acceptance Criteria:**

**Given** an XML file is uploaded that is identified as XRechnung (UBL 2.1 format)
**When** the validation engine processes the file
**Then** the packages/validation/xrechnung.ts module parses the UBL 2.1 structure
**And** all EN 16931 business rules are checked (mandatory fields, calculation rules, code list values, cross-field validations) (FR13)
**And** the validation result is stored on the invoice record with a validation_status (valid, invalid, warnings) and validation_errors (JSON array of error objects with rule_id, severity, field_path, message)

**Given** an XML or PDF file is uploaded that is identified as ZUGFeRD (CII D16B format)
**When** the validation engine processes the file
**Then** the packages/validation/zugferd.ts module extracts the embedded CII XML from the PDF (if applicable) and parses the D16B structure
**And** EN 16931 business rules are applied identically to the XRechnung validation
**And** the validation result is stored in the same format as XRechnung results

**Given** the validation engine processes a document
**When** validation rules are applied
**Then** the packages/validation/en16931-rules.ts module contains the shared business rules used by both XRechnung and ZUGFeRD validators
**And** rules cover: mandatory field presence, arithmetic consistency (line item totals, VAT calculations, gross total), valid code list values (currency, country, VAT category), and structural integrity

**Given** a non-XML invoice (photo, PDF without embedded XML)
**When** it is uploaded
**Then** EN 16931 validation is skipped (only applicable to structured e-invoices)
**And** the invoice proceeds through the standard AI extraction pipeline

### Story 6.2: Validation Results Display and Correction Email

As a user,
I want to see exactly what is wrong with a non-compliant e-invoice and send a correction request to the supplier with one tap,
So that I can resolve compliance issues quickly without writing emails manually.

**Acceptance Criteria:**

**Given** an e-invoice has been validated with errors
**When** the user views the invoice detail
**Then** validation results are displayed with specific error descriptions for each non-compliant rule (FR14)
**And** each error shows: rule ID (e.g., "BR-01"), severity (error/warning), affected field, and a human-readable description in conversational German (e.g., "Die Rechnungsnummer fehlt. Dieses Feld ist laut EN 16931 Pflicht.")
**And** errors use red indicators; warnings use amber indicators
**And** the validation summary shows total error count and warning count

**Given** the user wants to request a correction from the supplier
**When** they tap the "Korrektur anfordern" action
**Then** the system generates a pre-written correction email in formal German business correspondence ("Sie" form) containing: supplier name, invoice number, invoice date, list of specific compliance issues, and a request for a corrected invoice (FR15)
**And** the email is ready to send with one tap or can be edited before sending
**And** the supplier email is pre-filled from extracted invoice data if available

**Given** a correction email is sent
**When** the action completes
**Then** the invoice record is updated with a correction_requested_at timestamp
**And** the action is logged in the audit trail
**And** a success toast confirms: "Korrekturanfrage an [Supplier] gesendet" (3s auto-dismiss)

**Given** a validated e-invoice has only warnings (no errors)
**When** the user views the invoice
**Then** warnings are displayed as amber indicators but do not block processing
**And** the invoice can still be approved and exported normally

**Given** the validation results are empty (invoice is fully compliant)
**When** the user views the invoice
**Then** a green "EN 16931 konform" badge is displayed
**And** no additional action is required from the user

---

## Epic 7: Verfahrensdokumentation

Users can download an auto-generated Verfahrensdokumentation PDF based on tenant configuration, see its status on the dashboard, and receive automatic updates when settings change.

### Story 7.1: Verfahrensdokumentation PDF Generation

As a user,
I want a Verfahrensdokumentation PDF to be automatically generated from my company settings,
So that I have the required GoBD documentation ready for the Finanzamt without writing it myself.

**Acceptance Criteria:**

**Given** a tenant has completed their company and DATEV settings
**When** the Verfahrensdokumentation generation is triggered
**Then** the packages/gobd/verfahrensdokumentation.ts module assembles the document content from tenant configuration
**And** the packages/pdf/templates/verfahrensdokumentation.tsx React PDF template renders the document containing: company details (name, address, tax ID), accounting workflow description (invoice capture, AI extraction, review, approval), software used (RechnungsAI version, AI provider), chart of accounts (SKR03/SKR04), archiving procedures (immutable storage, SHA-256, 10-year retention), access controls (authentication method, tenant isolation), and data protection measures (encryption, German hosting) (FR26)
**And** the PDF is generated server-side using @react-pdf/renderer — no headless browser required
**And** the generated PDF is stored in Supabase Storage linked to the tenant
**And** a verfahrensdokumentation record is created/updated in the database with: tenant_id, generated_at, version, file_path, config_hash (SHA-256 of tenant settings used)

**Given** the user wants to download the Verfahrensdokumentation
**When** they click the download button
**Then** the PDF is served via a Route Handler as a binary download (FR28)
**And** the filename follows the pattern: "Verfahrensdokumentation_[CompanyName]_[Date].pdf"
**And** the download action is logged in the audit trail

**Given** no tenant settings have been configured yet
**When** the user requests the Verfahrensdokumentation
**Then** a conversational German message explains which settings are needed: "Fuer die Verfahrensdokumentation werden deine Firmendaten und DATEV-Einstellungen benoetigt. Bitte vervollstaendige zuerst deine Einstellungen."
**And** a direct link to the Settings page is provided

### Story 7.2: Verfahrensdokumentation Status and Auto-Update

As a user,
I want to see whether my Verfahrensdokumentation is up to date and have it automatically refresh when I change my settings,
So that I always have a current, accurate document without manual effort.

**Acceptance Criteria:**

**Given** the user views the dashboard
**When** the Verfahrensdokumentation status widget renders
**Then** it displays one of three states: "Aktuell" (generated and up-to-date, green indicator), "Aktualisierung verfuegbar" (settings changed since last generation, amber indicator), or "Nicht erstellt" (never generated, neutral indicator with action prompt) (FR29)
**And** the status is determined by comparing the current tenant settings hash against the config_hash stored with the last generated document

**Given** the user updates tenant settings (company details, SKR plan, DATEV configuration)
**When** the settings are saved successfully
**Then** the Verfahrensdokumentation status automatically changes to "Aktualisierung verfuegbar" (FR27)
**And** a subtle prompt suggests regenerating: "Deine Einstellungen haben sich geaendert. Moechtest du die Verfahrensdokumentation aktualisieren?"
**And** the user can trigger regeneration with one tap

**Given** the user triggers a regeneration
**When** the new PDF is generated
**Then** the previous version is retained in storage (version history)
**And** the new version replaces the active document
**And** the status returns to "Aktuell"
**And** the regeneration is logged in the audit trail with before/after config_hash

**Given** the Verfahrensdokumentation status is "Nicht erstellt"
**When** the user sees the dashboard widget
**Then** the widget uses the empty state pattern: encouraging tone, clear action button "Jetzt erstellen", no sad faces (UX-DR19)

---

## Epic 8: Subscription, Billing, and Notifications

Users can start with a free tier, upgrade to paid plans via Stripe, view billing history, and receive weekly value recap emails with time saved and deduction summaries.

### Story 8.1: Free Tier and Usage Tracking

As a user,
I want to use the system for free with up to 10 invoices per month without entering payment information,
So that I can experience the full value of the product before committing to a paid plan.

**Acceptance Criteria:**

**Given** a new user completes registration
**When** their account is created
**Then** they are automatically assigned to the free tier with a limit of 10 invoices per month (FR40)
**And** no credit card or payment information is required
**And** the free tier includes full AI processing, DATEV export, and GoBD archive functionality

**Given** a free tier user uploads invoices
**When** each invoice is processed
**Then** the system tracks the monthly invoice count against the free tier limit in the tenants table (invoice_count_month, invoice_count_reset_date columns) (FR41)
**And** the count resets on the first day of each calendar month

**Given** a free tier user reaches 8 out of 10 invoices
**When** the usage threshold is crossed
**Then** a contextual upgrade prompt is displayed: subtle, non-blocking, positioned contextually near the capture action (FR42)
**And** the prompt text is in conversational German: "Du hast diesen Monat schon 8 von 10 Rechnungen verarbeitet. Fuer unbegrenzte Rechnungen: Starter-Plan ab 14,90 EUR/Monat."
**And** the prompt is NOT a hard paywall — the user can dismiss and continue

**Given** a free tier user reaches 10 out of 10 invoices
**When** they attempt to upload another invoice
**Then** a clear message explains the limit has been reached: "Du hast dein monatliches Limit von 10 Rechnungen erreicht. Upgrade auf den Starter-Plan fuer unbegrenzte Verarbeitung."
**And** a prominent upgrade button is displayed
**And** existing invoices can still be viewed, reviewed, approved, and exported — only new uploads are blocked

### Story 8.2: Stripe Subscription and Billing Management

As a user,
I want to upgrade to a paid plan and manage my subscription,
So that I can process unlimited invoices and access my billing history.

**Acceptance Criteria:**

**Given** the user clicks the upgrade button or navigates to subscription management
**When** they choose to upgrade to the Starter plan (EUR 14.90/month)
**Then** they are redirected to Stripe Checkout for secure payment processing (FR43)
**And** upon successful payment, their tenant is updated to "starter" tier with unlimited invoice processing
**And** the upgrade is effective immediately with prorated billing for the current cycle

**Given** Stripe sends webhook events
**When** events are received at the api/webhooks/stripe Route Handler
**Then** the webhook signature is verified for security
**And** events are processed idempotently — no duplicate charges or missed subscription events (NFR29)
**And** handled events include: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.payment_succeeded, invoice.payment_failed
**And** subscription status changes are persisted to the tenants table (subscription_status, subscription_tier, stripe_customer_id, stripe_subscription_id)

**Given** the user navigates to subscription management
**When** the subscription page loads
**Then** the user can view their current plan, next billing date, and payment method (FR39)
**And** the user can view billing history and download subscription invoices from Stripe (FR44)
**And** all amounts display in German locale (EUR 14,90)

**Given** a user wants to downgrade
**When** they cancel their subscription
**Then** the cancellation takes effect at the end of the current billing period
**And** the user is informed: "Dein Starter-Plan bleibt bis zum [date] aktiv. Danach wechselst du automatisch zum kostenlosen Plan."
**And** the downgrade event is logged

**Given** a payment fails
**When** Stripe reports the failure via webhook
**Then** the user is notified with a conversational German message and a link to update payment details
**And** the subscription enters a grace period before downgrade

### Story 8.3: Weekly Value Recap Email and Notification Preferences

As a user,
I want to receive a weekly email showing how much time and money the system saved me,
So that I feel confident about the value I am getting and stay motivated to use the system regularly.

**Acceptance Criteria:**

**Given** the weekly recap cron job runs (Sunday evening or Monday morning)
**When** the api/cron/weekly-recap Route Handler is triggered with cron secret header verification
**Then** the system generates a personalized email for each active tenant using Resend + React Email (packages/email/templates/weekly-recap) (FR45)
**And** the email contains: number of invoices processed this week, estimated time saved (invoice count x average processing time), accumulated VAT deductions for the month, consecutive active weeks streak, and a count of invoices ready for export
**And** the email design shares design tokens with the shadcn/ui theme (Prussian Blue, Inter font)
**And** all text is in German with "Du" address and encouraging tone
**And** email deliverability achieves >95% (NFR30)

**Given** the email is sent
**When** the user receives it
**Then** it includes a clear call-to-action linking back to the dashboard
**And** if invoices are ready for export, a prominent export reminder is included
**And** the email footer includes an unsubscribe link

**Given** the user navigates to notification preferences
**When** the preferences page loads
**Then** the user can toggle email notifications on/off (FR47)
**And** the preference is stored in the tenants table (email_notifications_enabled boolean)
**And** the toggle is a simple on/off switch with immediate effect

**Given** a user has disabled email notifications
**When** the weekly recap cron runs
**Then** no email is sent to that user
**And** the cron job skips disabled tenants efficiently without generating emails

**Given** a new user registers
**When** their account is created
**Then** email notifications are enabled by default
**And** a welcome email is sent via packages/email/templates/welcome introducing the product and key features
