---
type: bmad-distillate
sources:
  - "architecture.md"
downstream_consumer: "general"
created: "2026-04-04"
token_estimate: 3800
parts: 1
---

## Project Context

- Project: RechnungsAI; User: GOZE; Date: 2026-04-03; Status: complete
- Input docs: product-brief-RechnungsAI-distillate.md, prd.md, ux-design-specification-distillate/\_index.md
- Domain: Full-stack SaaS (web + PWA + AI pipeline + compliance); Complexity: High — regulated fintech; AI accuracy impacts tax liability
- 51 FRs (FR1–FR51) across 9 capability areas; 30 NFRs (NFR1–NFR30)
- ~12 major architectural components

## Functional Requirements by Capability

- FR1–FR7: Document Capture & AI Processing — AI pipeline, file storage, async queue, camera API
- FR8–FR12: Invoice Categorization — ML integration, SKR03/04 mapping, learning/feedback loop
- FR13–FR15: E-Invoice Validation — EN 16931 (XRechnung UBL 2.1, ZUGFeRD CII D16B), email generation
- FR16–FR20: DATEV Export — EXTF format (Windows-1252, semicolon delimiter, 116+ columns), tenant settings
- FR21–FR25: GoBD-Compliant Archive — immutable object storage, SHA-256 hashing, audit trail, 10-year lifecycle
- FR26–FR29: Verfahrensdokumentation — PDF generation, tenant-aware templates
- FR30–FR34: Dashboard & Management — real-time pipeline view, filtering, stats aggregation
- FR35–FR44: Auth & Billing — Supabase Auth, Stripe integration, usage tracking, subscriptions
- FR45–FR51: Notifications & Trust — email (weekly recaps), onboarding, compliance badges

## Non-Functional Requirements

- Performance: AI extraction <5s p95; batch 20 docs <60s; dashboard <2s; DATEV export <10s/500 invoices; search <1s; camera preview <500ms
- Security: AES-256 at rest; TLS 1.3 in transit; German data centers only; RLS at DB level; 30-day auth tokens; OWASP Top 10; no third-party AI training on user data
- Scalability: 20→500 concurrent users without re-architecture; 5M document records; 50GB archive; horizontal AI pipeline scaling via queue
- Reliability: 99.5%→99.9% uptime; daily backups (30-day retention); zero data loss; 4-hour RTO; graceful degradation when AI unavailable
- Usability: digital maturity index 5/100; German-only MVP; responsive ≥375px; max 3 clicks to core action
- Integration: DATEV CSV import-compatible; AI provider swappable; Stripe webhook idempotency; >95% email deliverability

## Technical Constraints

- German data residency (DSGVO) — blocks US-only cloud services
- GoBD immutability — write-once storage, cryptographic hashing
- DATEV EXTF format — Windows-1252, semicolons, specific header structure
- EN 16931 validation — KoSIT reference validator integration
- Solo developer — managed services preferred
- AI provider abstraction — Claude + OpenAI swappable from day one
- PWA offline capture — Service Worker + IndexedDB
- 10-year retention — cost-efficient immutable storage with lifecycle management
- No AI training on user data — zero-retention API endpoints required

## Cross-Cutting Concerns

- Tenant Isolation: RLS on all data paths (DB, storage, AI, exports, audit)
- Audit Trail/Immutability: every document operation logged immutably
- AI Confidence + Human-in-the-Loop: confidence scoring propagates extraction→review→export
- Error Handling: system usable when AI down (dashboard, archive, export for confirmed invoices)
- German Locale: all UI German; numbers 1.234,56; dates dd.MM.yyyy; currency €
- Security/Encryption: AES-256 rest, TLS 1.3 transit, no plaintext financial data
- Performance Budget: strict p95 targets on AI processing and page loads

## Starter Template Decision

- Selected: create-turbo (vanilla) + create-next-app (rationale: monorepo infra without opinions on auth/DB/deployment; avoids rip-and-replace anti-pattern)
- Rejected: next-forge (Clerk auth, Prisma, Neon DB, Vercel-centric — too many replacements); create-t3-turbo (tRPC/better-auth redundant with Supabase, includes unnecessary Expo)
- Init: `pnpm dlx create-turbo@latest rechnungsai --package-manager pnpm` → `pnpm create next-app@latest web --typescript --tailwind --eslint --app --turbopack --no-src-dir` → `pnpm dlx shadcn@latest init`

## Core Stack Decisions

- Language: TypeScript strict; Node.js runtime; pnpm workspaces
- Styling: Tailwind CSS v4 + shadcn/ui (copied, full ownership) + CSS custom properties
- Build: Turbopack (dev), Turborepo (monorepo orchestration/caching), ESLint
- Testing: Vitest (co-located tests, Jest-compatible API)
- DB: Supabase PostgreSQL self-hosted (Hetzner Germany); Supabase JS Client (`@supabase/supabase-js`); Supabase Storage (S3-compatible, RLS-enforced)
- Caching: Next.js built-in (`revalidate`); no Redis at MVP
- Type safety: `supabase gen types` auto-generated; Zod schemas shared across forms/AI/API
- Migrations: Supabase CLI (`supabase db diff` / `supabase migration`)
- Auth: Supabase Auth (Email + Password + Google OAuth); JWT 30-day refresh; RLS authorization
- Rate limiting: Next.js Middleware in-memory (MVP); Redis Phase 2
- AI Data Privacy: zero-retention API endpoints (Anthropic/OpenAI)
- Mutations: Next.js Server Actions (zero boilerplate, progressive enhancement)
- External endpoints: Next.js Route Handlers (Stripe webhooks, DATEV CSV, AI callbacks)
- AI integration: Vercel AI SDK v5 — `generateObject()` with Zod; one-line provider swap (Claude↔OpenAI)
- Email: Resend + React Email (3K free/mo, >95% deliverability, EU region)
- Error handling: structured responses + Sentry; conversational German messages
- Data fetching: React Server Components (server-rendered Supabase)
- Client state: Zustand (camera queue, offline buffer, gesture state)
- Forms: React Hook Form + Zod (shadcn/ui Form built on RHF)
- Animation: Framer Motion (swipe gestures, cascade animations, `prefers-reduced-motion`)
- PDF: React PDF (`@react-pdf/renderer`) — JSX templates, server-side, no headless browser
- Hosting: Hetzner Cloud Germany (DSGVO mandatory)
- Orchestration: Coolify self-hosted (one-click Supabase, Git auto-deploy, SSL, logs)
- Build: Dockerfile multi-stage (`turbo prune --scope=web`)
- CI/CD: Coolify Git Push Auto-Deploy (main branch)
- Monitoring: Sentry cloud free tier (5K events/mo, `@sentry/nextjs`)
- Uptime: Coolify health checks (external monitoring Phase 2)

## Deferred to Phase 2

- Redis caching (rate limiting/session caching)
- Full observability (Axiom/Better Stack)
- GitHub Actions CI/CD
- Queue-based AI pipeline (BullMQ or Supabase Edge Functions) for horizontal scaling
- Full offline PWA capabilities

## Implementation Sequence

1. Supabase self-host (Coolify) → 2. Turborepo + Next.js init → 3. Supabase Auth + RLS → 4. shadcn/ui + Tailwind + design tokens → 5. AI pipeline (Vercel AI SDK) → 6. Core features (capture, review, DATEV, GoBD) → 7. Stripe billing → 8. Resend emails → 9. Sentry → 10. Coolify deployment

## Naming Conventions

- DB: tables snake_case plural (`invoices`, `audit_logs`); columns snake_case; FKs `{singular}_id`; enums snake_case
- Code: files kebab-case; components PascalCase; functions/variables camelCase; Zod schemas camelCase+Schema; types PascalCase; constants UPPER_SNAKE_CASE; Server Actions camelCase verb+noun
- Routes: App Router kebab-case folders; Route Handlers kebab-case; Server Action files feature-based

## Key Patterns

- Server Action return: `ActionResult<T> = { success: true; data: T } | { success: false; error: string }`
- Date formats: DB=ISO 8601 UTC timestamptz; UI=dd.MM.yyyy; DATEV=ddMM (4-digit); API=ISO 8601
- Currency: DB=numeric(10,2); UI=€ 1.234,56 German locale; DATEV=German comma decimal; API=decimal point
- Supabase client: server-side `createServerClient` (from `@supabase/ssr`); client-side `createBrowserClient` only for realtime/offline
- Zustand: one store per feature domain, minimal scope
- Error handling: try/catch → log `[module:action]` prefix → Sentry.captureException → return German error message
- Loading: route-level `loading.tsx`; component-level shadcn Skeleton; AI processing pipeline status (○→◐→●→✓); no spinners

## Enforcement Rules (10)

1. kebab-case files, PascalCase components, camelCase functions
2. `ActionResult<T>` from every Server Action
3. All user-facing errors in conversational German
4. `createServerClient` server-side; `createBrowserClient` client-only when needed
5. Zod schemas in shared locations, reused across forms/AI/API
6. Currency as numeric(10,2), display German locale
7. Log prefix `[module:action]`
8. Co-located tests with Vitest
9. Feature-domain component organization
10. ISO 8601 UTC for all date storage/API

## Anti-Patterns (Forbidden)

- `any` type; direct DB queries without RLS; English user-facing errors; inline magic numbers; `console.log` without module prefix; client-side Supabase for data fetching

## Monorepo Structure

- `apps/web/` — Next.js App Router: routes (auth, onboarding, app, api), actions, components (ui/invoice/capture/dashboard/export/onboarding/layout), lib (supabase/stripe/sentry/utils/constants), stores (capture-store, ui-store)
- `packages/shared/` — schemas (invoice, tenant, auth, export), types (invoice, tenant, action-result, database), constants (confidence, invoices, skr)
- `packages/ai/` — extract-invoice.ts, categorize-invoice.ts, prompts/, providers.ts
- `packages/datev/` — buchungsstapel.ts, encoding.ts (Windows-1252), header.ts, bu-schluessel.ts
- `packages/validation/` — xrechnung.ts (UBL 2.1), zugferd.ts (CII D16B), en16931-rules.ts
- `packages/gobd/` — archive.ts, hash.ts (SHA-256), audit-log.ts, verfahrensdokumentation.ts
- `packages/pdf/` — templates/verfahrensdokumentation.tsx
- `packages/email/` — templates (weekly-recap, welcome, correction-request)
- `packages/typescript-config/`, `packages/eslint-config/`
- `supabase/` — config.toml, seed.sql, migrations/

## Package Dependency Rules

- apps/web → can import any package
- All packages → import only from shared (leaf node)
- FORBIDDEN: packages importing from apps/web; packages importing from each other (except shared); apps/web importing directly from package node_modules

## API Boundaries

- Server Actions (`app/actions/*.ts`): all mutations; Supabase Auth cookie
- Stripe Webhook (`api/webhooks/stripe`): signature verification
- DATEV Download (`api/export/datev`): CSV binary response; Supabase Auth
- Cron Weekly Recap (`api/cron/weekly-recap`): cron secret header
- Auth Callback (`(app)/auth/callback`): Supabase PKCE (Google OAuth)

## Data Access Layers

- RSC pages: `createServerClient` read; RLS enforced
- Server Actions: `createServerClient` read/write; RLS enforced
- Route Handlers: `createServerClient` read/write; RLS enforced (except webhooks)
- Client Components: `createBrowserClient` realtime only; RLS enforced
- Storage: Storage API via server client; bucket RLS policies

## Cross-Component Dependencies

- Zod schemas = connective tissue: form validation ↔ AI structured output ↔ Supabase type validation
- Vercel AI SDK depends on Zod schemas from shared for `generateObject()`
- Framer Motion gesture system (swipe-to-approve) drives Server Action calls
- React Email templates share design tokens with shadcn/ui theme

## Data Flow

Upload → middleware auth → Server Action extractInvoiceData → packages/ai (Vercel AI SDK → Claude/OpenAI, zero retention) → Zod validated structured data → packages/gobd SHA-256 hash → Supabase Storage (immutable) → Supabase DB (invoice + audit log) → Dashboard RSC pipeline view → User reviews → approveInvoice (status + audit) → exportToDatev → packages/datev EXTF CSV (Windows-1252) → Route Handler CSV download → Steuerberater imports into DATEV Unternehmen Online

## Validation & Gaps

- All 51 FRs and 30 NFRs covered; all decisions coherent; ~120 files defined; 10 enforcement rules + 6 anti-patterns
- Gap (Important): Queue-based AI pipeline not detailed for MVP — synchronous calls in Server Actions; Phase 2 BullMQ/Edge Functions
- Gap (Important): PWA offline capture shallow — basic Service Worker + IndexedDB; Phase 2 full offline sync
- Gap (Minor): German terms trigger spell checker — add .cspell.json with German accounting dictionary
- Overall: READY FOR IMPLEMENTATION; confidence High

## Dev Workflow

- Local: `pnpm dev` (Turborepo); `supabase start` (local Docker); `supabase db diff`; `supabase gen types`
- Build/Deploy: `pnpm build` → `docker build -t rechnungsai .` (multi-stage turbo prune) → Coolify GitHub push main → webhook → build → deploy
