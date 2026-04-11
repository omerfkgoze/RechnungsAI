# Story 1.1: Monorepo and Next.js Project Initialization

Status: ready-for-dev

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

- [ ] Task 1: Turborepo Monorepo Initialization (AC: #1)
  - [ ] 1.1 Run `pnpm dlx create-turbo@latest rechnungsai --package-manager pnpm` in the project root
  - [ ] 1.2 Verify `pnpm-workspace.yaml` includes `apps/*` and `packages/*`
  - [ ] 1.3 Configure `turbo.json` with tasks: `build` (dependsOn: `^build`, outputs: `dist/**`, `.next/**`), `dev` (cache: false, persistent: true), `lint` (outputs: []), `check-types` (dependsOn: `^build`)
  - [ ] 1.4 Add `test` task to `turbo.json` (outputs: `coverage/**`)

- [ ] Task 2: Next.js App Router Setup (AC: #2, #3)
  - [ ] 2.1 Run `pnpm create next-app@latest web --typescript --tailwind --eslint --app --turbopack --no-src-dir` inside `apps/`
  - [ ] 2.2 Verify TypeScript strict mode is enabled in `apps/web/tsconfig.json` (`"strict": true`)
  - [ ] 2.3 Run `pnpm dlx shadcn@latest init` inside `apps/web`
  - [ ] 2.4 Verify `components.json` is created with correct configuration
  - [ ] 2.5 Confirm Tailwind CSS v4 is configured (check `globals.css` for `@import "tailwindcss"` syntax, NOT `@tailwind` directives — v4 uses CSS-native imports)

- [ ] Task 3: Workspace Packages Setup (AC: #4)
  - [ ] 3.1 Create `packages/shared/` with `package.json` (name: `@rechnungsai/shared`), `tsconfig.json`, and `src/index.ts` barrel export
  - [ ] 3.2 Create `packages/shared/src/schemas/` directory (future Zod schemas)
  - [ ] 3.3 Create `packages/shared/src/types/` directory with `action-result.ts` containing `ActionResult<T>` type
  - [ ] 3.4 Create `packages/shared/src/constants/` directory
  - [ ] 3.5 Create `packages/ai/` with `package.json` (name: `@rechnungsai/ai`), `tsconfig.json`, `src/index.ts` — depends on `@rechnungsai/shared`
  - [ ] 3.6 Create `packages/datev/` with `package.json` (name: `@rechnungsai/datev`), `tsconfig.json`, `src/index.ts` — depends on `@rechnungsai/shared`
  - [ ] 3.7 Create `packages/validation/` with `package.json` (name: `@rechnungsai/validation`), `tsconfig.json`, `src/index.ts` — depends on `@rechnungsai/shared`
  - [ ] 3.8 Create `packages/gobd/` with `package.json` (name: `@rechnungsai/gobd`), `tsconfig.json`, `src/index.ts` — depends on `@rechnungsai/shared`
  - [ ] 3.9 Create `packages/pdf/` with `package.json` (name: `@rechnungsai/pdf`), `tsconfig.json`, `src/index.ts` — depends on `@rechnungsai/shared`
  - [ ] 3.10 Create `packages/email/` with `package.json` (name: `@rechnungsai/email`), `tsconfig.json`, `src/index.ts` — depends on `@rechnungsai/shared`
  - [ ] 3.11 Verify `packages/typescript-config/` exists (created by create-turbo) with `base.json` and `nextjs.json`
  - [ ] 3.12 Verify `packages/eslint-config/` exists (created by create-turbo) with `base.js` and `nextjs.js`
  - [ ] 3.13 All package `tsconfig.json` files must extend from `@rechnungsai/typescript-config`

- [ ] Task 4: Supabase Local Development Setup (AC: #5, #7)
  - [ ] 4.1 Run `supabase init` in the project root to create `supabase/` directory with `config.toml`
  - [ ] 4.2 Create initial migration file `supabase/migrations/00000000000000_init.sql` (empty or with comment: `-- Initial migration placeholder`)
  - [ ] 4.3 Create `supabase/seed.sql` with placeholder comment
  - [ ] 4.4 Verify `supabase start` launches local instance (requires Docker running)
  - [ ] 4.5 Add Supabase environment variables to `apps/web/.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

- [ ] Task 5: ESLint Configuration (AC: #8)
  - [ ] 5.1 Ensure shared ESLint config in `packages/eslint-config/` covers TypeScript strict rules
  - [ ] 5.2 Verify `apps/web` extends the shared ESLint config
  - [ ] 5.3 Run `pnpm lint` from root — must pass with zero errors
  - [ ] 5.4 All workspace packages must have lint scripts configured

- [ ] Task 6: Dockerfile Multi-Stage Build (AC: #9)
  - [ ] 6.1 Create `Dockerfile` at project root with multi-stage build
  - [ ] 6.2 Stage 1 (builder): `FROM node:20-alpine`, install pnpm, copy workspace, run `turbo prune --scope=web --docker`
  - [ ] 6.3 Stage 2 (installer): Install dependencies from pruned output, run `turbo run build --filter=web`
  - [ ] 6.4 Stage 3 (runner): Minimal production image with standalone Next.js output
  - [ ] 6.5 Create `.dockerignore` excluding `node_modules`, `.next`, `.git`, `supabase/`, `_bmad*`

- [ ] Task 7: Package Dependency Enforcement (AC: #10)
  - [ ] 7.1 All domain packages (`ai`, `datev`, `validation`, `gobd`, `pdf`, `email`) list only `@rechnungsai/shared` as workspace dependency
  - [ ] 7.2 `packages/shared` has zero workspace dependencies (leaf node)
  - [ ] 7.3 `apps/web` lists required workspace packages as dependencies using `workspace:*` protocol
  - [ ] 7.4 Add a comment in root `package.json` documenting the dependency rule

- [ ] Task 8: Development Verification (AC: #6)
  - [ ] 8.1 Run `pnpm install` from root — must resolve all workspace dependencies
  - [ ] 8.2 Run `pnpm dev` — Next.js dev server must start without errors
  - [ ] 8.3 Run `pnpm build` — all packages and web app must build successfully
  - [ ] 8.4 Run `pnpm lint` — must pass across all workspaces
  - [ ] 8.5 Verify `turbo.json` caching works (second build should hit cache)

- [ ] Task 9: Environment and Configuration Files
  - [ ] 9.1 Create `apps/web/.env.example` with all required environment variables
  - [ ] 9.2 Create `apps/web/.env.local` (gitignored) with local Supabase values from `supabase start` output
  - [ ] 9.3 Verify `.gitignore` includes: `node_modules`, `.next`, `.env.local`, `.env*.local`, `.turbo`
  - [ ] 9.4 Create `.npmrc` with `auto-install-peers=true` if not present

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
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "outputs": []
    },
    "check-types": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"]
    }
  }
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
  | { success: false; error: string }
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

| Element | Convention | Example |
|---------|-----------|---------|
| Files | kebab-case | `invoice-card.tsx` |
| Components | PascalCase | `InvoiceCard` |
| Functions | camelCase | `getInvoices` |
| Constants | UPPER_SNAKE_CASE | `MAX_FREE_INVOICES` |
| DB tables | snake_case plural | `invoices` |
| DB columns | snake_case | `tenant_id` |
| Packages | `@rechnungsai/{name}` | `@rechnungsai/shared` |

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

### Debug Log References

### Completion Notes List

### File List
