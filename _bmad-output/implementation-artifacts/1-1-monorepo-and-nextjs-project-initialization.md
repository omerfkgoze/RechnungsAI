# Story 1.1: Monorepo and Next.js Project Initialization

Status: done

## Story

As a developer,
I want a fully initialized monorepo with Next.js, Tailwind CSS, shadcn/ui, and local Supabase dev environment,
So that all subsequent features can be built on a solid, consistent foundation.

## Acceptance Criteria

1. **Given** the project repository is empty **When** the developer runs the initialization scripts **Then** a Turborepo monorepo is created with pnpm workspaces
2. **Given** Turborepo is initialized **When** the apps directory is inspected **Then** `apps/web` contains a Next.js App Router application with TypeScript strict mode
3. **Given** Next.js is initialized **When** styling tools are inspected **Then** Tailwind CSS v4 and shadcn/ui are initialized in `apps/web`
4. **Given** the monorepo structure is inspected **When** the packages directory is checked **Then** `packages/shared`, `packages/ai`, `packages/datev`, `packages/validation`, `packages/gobd`, `packages/pdf`, `packages/email`, `packages/typescript-config`, and `packages/eslint-config` directories exist with proper `package.json` files
5. **Given** Supabase is configured **When** the `supabase/` directory is inspected **Then** `config.toml` and an initial migration file exist
6. **Given** all packages are set up **When** `pnpm dev` is run **Then** the Next.js dev server starts successfully
7. **Given** Supabase CLI is installed **When** `supabase start` is run **Then** the local Supabase instance launches (PostgreSQL, Auth, Storage)
8. **Given** linting is configured **When** ESLint runs on the initial codebase **Then** it passes with zero errors
9. **Given** deployment is considered **When** the Dockerfile is inspected **Then** a multi-stage build using `turbo prune --scope=web` is present
10. **Given** package boundaries are defined **When** dependency rules are inspected **Then** `apps/web` can import any package; packages only import from `shared`; no cross-package imports except `shared`

## Tasks / Subtasks

- [x] Task 1: Turborepo Monorepo Initialization (AC: #1)
  - [x] 1.1 Run `pnpm dlx create-turbo@latest rechnungsai --package-manager pnpm` in the project root
  - [x] 1.2 Verify `pnpm-workspace.yaml` includes `apps/*` and `packages/*`
  - [x] 1.3 Configure `turbo.json` with tasks: `build` (dependsOn: `^build`, outputs: `dist/**`, `.next/**`), `dev` (cache: false, persistent: true), `lint` (outputs: []), `check-types` (dependsOn: `^build`)
  - [x] 1.4 Add `test` task to `turbo.json` (outputs: `coverage/**`)

- [x] Task 2: Next.js App Router Setup (AC: #2, #3)
  - [x] 2.1 Run `pnpm create next-app@latest web --typescript --tailwind --eslint --app --turbopack --no-src-dir` inside `apps/`
  - [x] 2.2 Verify TypeScript strict mode is enabled in `apps/web/tsconfig.json` (`"strict": true`)
  - [x] 2.3 Run `pnpm dlx shadcn@latest init` inside `apps/web`
  - [x] 2.4 Verify `components.json` is created with correct configuration
  - [x] 2.5 Confirm Tailwind CSS v4 is configured (check `globals.css` for `@import "tailwindcss"` syntax, NOT `@tailwind` directives — v4 uses CSS-native imports)

- [x] Task 3: Workspace Packages Setup (AC: #4)
  - [x] 3.1 Create `packages/shared/` with `package.json` (name: `@rechnungsai/shared`), `tsconfig.json`, and `src/index.ts` barrel export
  - [x] 3.2 Create `packages/shared/src/schemas/` directory (future Zod schemas)
  - [x] 3.3 Create `packages/shared/src/types/` directory with `action-result.ts` containing `ActionResult<T>` type
  - [x] 3.4 Create `packages/shared/src/constants/` directory
  - [x] 3.5 Create `packages/ai/` with `package.json` (name: `@rechnungsai/ai`), `tsconfig.json`, `src/index.ts` — depends on `@rechnungsai/shared`
  - [x] 3.6 Create `packages/datev/` with `package.json` (name: `@rechnungsai/datev`), `tsconfig.json`, `src/index.ts` — depends on `@rechnungsai/shared`
  - [x] 3.7 Create `packages/validation/` with `package.json` (name: `@rechnungsai/validation`), `tsconfig.json`, `src/index.ts` — depends on `@rechnungsai/shared`
  - [x] 3.8 Create `packages/gobd/` with `package.json` (name: `@rechnungsai/gobd`), `tsconfig.json`, `src/index.ts` — depends on `@rechnungsai/shared`
  - [x] 3.9 Create `packages/pdf/` with `package.json` (name: `@rechnungsai/pdf`), `tsconfig.json`, `src/index.ts` — depends on `@rechnungsai/shared`
  - [x] 3.10 Create `packages/email/` with `package.json` (name: `@rechnungsai/email`), `tsconfig.json`, `src/index.ts` — depends on `@rechnungsai/shared`
  - [x] 3.11 Verify `packages/typescript-config/` exists (created by create-turbo) with `base.json` and `nextjs.json`
  - [x] 3.12 Verify `packages/eslint-config/` exists (created by create-turbo) with `base.js` and `nextjs.js`
  - [x] 3.13 All package `tsconfig.json` files must extend from `@rechnungsai/typescript-config`

- [x] Task 4: Supabase Local Development Setup (AC: #5, #7)
  - [x] 4.1 Run `supabase init` in the project root to create `supabase/` directory with `config.toml`
  - [x] 4.2 Create initial migration file `supabase/migrations/00000000000000_init.sql` (empty or with comment: `-- Initial migration placeholder`)
  - [x] 4.3 Create `supabase/seed.sql` with placeholder comment
  - [x] 4.4 Verify `supabase start` launches local instance (requires Docker running)
  - [x] 4.5 Add Supabase environment variables to `apps/web/.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

- [x] Task 5: ESLint Configuration (AC: #8)
  - [x] 5.1 Ensure shared ESLint config in `packages/eslint-config/` covers TypeScript strict rules
  - [x] 5.2 Verify `apps/web` extends the shared ESLint config
  - [x] 5.3 Run `pnpm lint` from root — must pass with zero errors
  - [x] 5.4 All workspace packages must have lint scripts configured

- [x] Task 6: Dockerfile Multi-Stage Build (AC: #9)
  - [x] 6.1 Create `Dockerfile` at project root with multi-stage build
  - [x] 6.2 Stage 1 (builder): `FROM node:20-alpine`, install pnpm, copy workspace, run `turbo prune --scope=web --docker`
  - [x] 6.3 Stage 2 (installer): Install dependencies from pruned output, run `turbo run build --filter=web`
  - [x] 6.4 Stage 3 (runner): Minimal production image with standalone Next.js output
  - [x] 6.5 Create `.dockerignore` excluding `node_modules`, `.next`, `.git`, `supabase/`, `_bmad*`

- [x] Task 7: Package Dependency Enforcement (AC: #10)
  - [x] 7.1 All domain packages (`ai`, `datev`, `validation`, `gobd`, `pdf`, `email`) list only `@rechnungsai/shared` as workspace dependency
  - [x] 7.2 `packages/shared` has zero workspace dependencies (leaf node)
  - [x] 7.3 `apps/web` lists required workspace packages as dependencies using `workspace:*` protocol
  - [x] 7.4 Add a comment in root `package.json` documenting the dependency rule

- [x] Task 8: Development Verification (AC: #6)
  - [x] 8.1 Run `pnpm install` from root — must resolve all workspace dependencies
  - [x] 8.2 Run `pnpm dev` — Next.js dev server must start without errors
  - [x] 8.3 Run `pnpm build` — all packages and web app must build successfully
  - [x] 8.4 Run `pnpm lint` — must pass across all workspaces
  - [x] 8.5 Verify `turbo.json` caching works (second build should hit cache)

- [x] Task 9: Environment and Configuration Files
  - [x] 9.1 Create `apps/web/.env.example` with all required environment variables
  - [x] 9.2 Create `apps/web/.env.local` (gitignored) with local Supabase values from `supabase start` output
  - [x] 9.3 Verify `.gitignore` includes: `node_modules`, `.next`, `.env.local`, `.env*.local`, `.turbo`
  - [x] 9.4 Create `.npmrc` with `auto-install-peers=true` if not present

## Dev Notes

### Critical Architecture Constraints

- **Monorepo tool:** Turborepo with pnpm workspaces — NOT npm/yarn
- **Next.js version:** Use latest stable (currently v16.x) with App Router — NOT Pages Router
- **Tailwind CSS version:** v4 — uses `@import "tailwindcss"` in CSS, NOT `@tailwind base/components/utilities` directives (this is a v3→v4 breaking change)
- **shadcn/ui:** Components are copied into the project (`components/ui/`), not installed as a dependency — you own the code
- **TypeScript:** Strict mode mandatory across all packages
- **Node.js:** Use v20 LTS for Dockerfile base image (compatibility with Coolify/Nixpacks)

### Turborepo Configuration Details

```jsonc
// turbo.json — required task configuration
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"],
    },
    "dev": {
      "cache": false,
      "persistent": true,
    },
    "lint": {
      "outputs": [],
    },
    "check-types": {
      "dependsOn": ["^build"],
      "outputs": [],
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"],
    },
  },
}
```

### Package Structure Convention

Each workspace package follows this structure:

```
packages/{name}/
  ├── package.json        # name: @rechnungsai/{name}
  ├── tsconfig.json       # extends @rechnungsai/typescript-config
  ├── src/
  │   └── index.ts        # barrel export
  └── vitest.config.ts    # (add when tests exist — NOT in this story)
```

### ActionResult<T> Type (packages/shared)

```typescript
// packages/shared/src/types/action-result.ts
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };
```

This is the ONLY return format for all Server Actions throughout the project.

### Dockerfile Multi-Stage Pattern

```dockerfile
# Stage 1: Prune monorepo
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY . .
RUN pnpm dlx turbo prune --scope=web --docker

# Stage 2: Install and build
FROM node:20-alpine AS installer
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=builder /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=builder /app/out/full/ .
RUN pnpm turbo run build --filter=web

# Stage 3: Production runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=installer /app/apps/web/.next/standalone ./
COPY --from=installer /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=installer /app/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "apps/web/server.js"]
```

### Naming Conventions (Enforce from Day One)

| Element    | Convention            | Example               |
| ---------- | --------------------- | --------------------- |
| Files      | kebab-case            | `invoice-card.tsx`    |
| Components | PascalCase            | `InvoiceCard`         |
| Functions  | camelCase             | `getInvoices`         |
| Constants  | UPPER_SNAKE_CASE      | `MAX_FREE_INVOICES`   |
| DB tables  | snake_case plural     | `invoices`            |
| DB columns | snake_case            | `tenant_id`           |
| Packages   | `@rechnungsai/{name}` | `@rechnungsai/shared` |

### Package Dependency Graph

```
apps/web → @rechnungsai/shared, @rechnungsai/ai, @rechnungsai/datev,
           @rechnungsai/validation, @rechnungsai/gobd, @rechnungsai/pdf,
           @rechnungsai/email

packages/ai → @rechnungsai/shared
packages/datev → @rechnungsai/shared
packages/validation → @rechnungsai/shared
packages/gobd → @rechnungsai/shared
packages/pdf → @rechnungsai/shared
packages/email → @rechnungsai/shared

packages/shared → (no workspace dependencies — leaf node)

FORBIDDEN:
- packages/* → apps/web
- packages/* → packages/* (except shared)
```

### Supabase Local Dev Setup

After `supabase init` and `supabase start`, the CLI outputs local connection details. Copy these to `apps/web/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase start output>
SUPABASE_SERVICE_ROLE_KEY=<from supabase start output>
```

Docker must be running before `supabase start`. The local instance includes PostgreSQL, Auth (GoTrue), Storage, and Realtime.

### Anti-Patterns to Avoid

- DO NOT use `npm` or `yarn` — pnpm only
- DO NOT use Pages Router — App Router only
- DO NOT install Vitest in this story — testing setup is separate
- DO NOT add application code (components, pages, Server Actions) — this is infrastructure only
- DO NOT use `@tailwind` directives in CSS — Tailwind v4 uses `@import "tailwindcss"`
- DO NOT add cross-package dependencies (e.g., `packages/ai` importing from `packages/datev`)
- DO NOT skip TypeScript strict mode in any tsconfig
- DO NOT use `src/` directory in Next.js (the `--no-src-dir` flag is intentional)

### Next.js Config Notes

- Enable `output: "standalone"` in `next.config.ts` — required for Docker deployment
- Turbopack is the default dev bundler (via `--turbopack` flag) — no additional config needed
- App Router is the default (via `--app` flag)

### Project Structure Notes

- Alignment with architecture spec: all directories match the architecture document exactly
- The `supabase/` directory sits at project root (not under `apps/` or `packages/`)
- Config packages (`typescript-config`, `eslint-config`) are created by `create-turbo` — extend, don't replace
- `apps/web/components/ui/` will be populated by shadcn/ui — the `init` command creates the directory structure

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Starter Template Evaluation] — initialization commands and rationale
- [Source: _bmad-output/planning-artifacts/architecture.md#Complete Project Directory Structure] — full file tree
- [Source: _bmad-output/planning-artifacts/architecture.md#Package Boundaries] — dependency rules
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules] — naming and enforcement
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1] — acceptance criteria and user story
- [Source: _bmad-output/planning-artifacts/epics.md#Additional Requirements] — monorepo structure, implementation sequence

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Supabase port conflict resolved by stopping existing SubTrack instance before starting RechnungsAI instance
- Removed stale `apps/web/pnpm-workspace.yaml` and `apps/web/pnpm-lock.yaml` created by create-next-app (caused Turbopack root detection warning)
- Added `type: "module"` to all domain packages to resolve ESLint ES module warnings
- Supabase skipped migration file named `init.sql` by design — rename to apply

### Completion Notes List

- Turborepo monorepo initialized with pnpm@10.33.0 and turbo@2.9.6
- Next.js 16.2.3 with App Router, Turbopack, TypeScript strict mode, Tailwind CSS v4, shadcn/ui
- 8 workspace packages created: shared, ai, datev, validation, gobd, pdf, email + web app
- Config packages (typescript-config, eslint-config) from create-turbo, renamed to @rechnungsai/\* scope
- Package dependency graph enforced: domain packages depend only on shared; shared has no workspace deps
- Supabase local dev environment configured and verified (PostgreSQL, Auth, Storage, Realtime)
- Multi-stage Dockerfile for production deployment with turbo prune
- All verification gates passed: pnpm install, pnpm dev, pnpm build, pnpm lint, turbo caching (FULL TURBO)

### File List

- package.json (new - root monorepo config)
- pnpm-workspace.yaml (new - workspace definition)
- pnpm-lock.yaml (new - lockfile)
- turbo.json (new - Turborepo task config)
- .gitignore (modified - added node_modules, .next, .env.local, .turbo, dist)
- .npmrc (new - auto-install-peers)
- .dockerignore (new)
- Dockerfile (new - multi-stage build)
- apps/web/ (new - Next.js 16 App Router application)
- apps/web/package.json
- apps/web/tsconfig.json
- apps/web/next.config.ts
- apps/web/eslint.config.mjs
- apps/web/components.json
- apps/web/app/globals.css
- apps/web/app/layout.tsx
- apps/web/app/page.tsx
- apps/web/components/ui/button.tsx
- apps/web/lib/utils.ts
- apps/web/.env.example (new)
- apps/web/.env.local (new - gitignored)
- packages/shared/package.json (new)
- packages/shared/tsconfig.json (new)
- packages/shared/eslint.config.js (new)
- packages/shared/src/index.ts (new)
- packages/shared/src/types/action-result.ts (new)
- packages/ai/package.json (new)
- packages/ai/tsconfig.json (new)
- packages/ai/eslint.config.js (new)
- packages/ai/src/index.ts (new)
- packages/datev/package.json (new)
- packages/datev/tsconfig.json (new)
- packages/datev/eslint.config.js (new)
- packages/datev/src/index.ts (new)
- packages/validation/package.json (new)
- packages/validation/tsconfig.json (new)
- packages/validation/eslint.config.js (new)
- packages/validation/src/index.ts (new)
- packages/gobd/package.json (new)
- packages/gobd/tsconfig.json (new)
- packages/gobd/eslint.config.js (new)
- packages/gobd/src/index.ts (new)
- packages/pdf/package.json (new)
- packages/pdf/tsconfig.json (new)
- packages/pdf/eslint.config.js (new)
- packages/pdf/src/index.ts (new)
- packages/email/package.json (new)
- packages/email/tsconfig.json (new)
- packages/email/eslint.config.js (new)
- packages/email/src/index.ts (new)
- packages/typescript-config/package.json (modified - renamed to @rechnungsai/typescript-config)
- packages/eslint-config/package.json (modified - renamed to @rechnungsai/eslint-config)
- supabase/config.toml (new)
- supabase/migrations/00000000000000_init.sql (new)
- supabase/seed.sql (new)

### Change Log

- 2026-04-11: Story 1.1 implemented — Turborepo monorepo with Next.js 16, Tailwind CSS v4, shadcn/ui, Supabase, 8 workspace packages, Dockerfile, ESLint
- 2026-04-11: Code review completed — 6 patches applied, 4 deferred, 10 dismissed. Fixes: removed nested .git from apps/web (create-next-app artifact), apps/web/tsconfig.json now extends shared config, ESLint config uses @rechnungsai/eslint-config, Dockerfile pnpm pinned to 10.33.0, .dockerignore excludes .env\*, shared index.ts NodeNext .js extension fix

## Review Findings

- [x] [Review][Patch] `apps/` directory untracked — nested `.git` from `create-next-app` removed; `apps/web/` staged — FIXED
- [x] [Review][Patch] ~~`packages/shared/src/index.ts` exports nothing~~ — FALSE POSITIVE, barrel re-export already present; fixed `.js` extension for NodeNext resolution
- [x] [Review][Patch] `apps/web/tsconfig.json` now extends `@rechnungsai/typescript-config/nextjs.json` — FIXED
- [x] [Review][Patch] `apps/web/eslint.config.mjs` now uses `@rechnungsai/eslint-config/next-js`; devDep added — FIXED
- [x] [Review][Patch] Dockerfile now pins `pnpm@10.33.0` — FIXED
- [x] [Review][Patch] `.dockerignore` now excludes `.env*` files — FIXED
- [x] [Review][Defer] `eslint-plugin-only-warn` silences all ESLint errors to warnings in domain packages — create-turbo default, intentional pattern — deferred, pre-existing
- [x] [Review][Defer] `turbo.json` missing `globalEnv` declarations — env var changes (Supabase keys) won't invalidate Turbo cache — deferred, pre-existing
- [x] [Review][Defer] Monorepo import boundary enforced only by documentation comment — no ESLint boundary plugin or tooling enforcing cross-package import rules — deferred, pre-existing
- [x] [Review][Defer] Domain packages lack `build` scripts — potential risk if Next.js standalone tracer cannot follow raw `.ts` entrypoints; needs production deploy verification — deferred, pre-existing
