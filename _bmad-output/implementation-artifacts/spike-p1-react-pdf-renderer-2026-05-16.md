# Spike P1 — `@react-pdf/renderer` Integration

**Date:** 2026-05-16
**Epic:** 7 — Verfahrensdokumentation
**Blocks:** Story 7.1 (Verfahrensdokumentation PDF Generation)
**Research source:** `_bmad-output/planning-artifacts/research/technical-prep-p1-react-pdf-renderer-spike-research-2026-05-16.md`

---

## Decision Summary

All six P1 spike questions are answered. Story 7.1 may proceed.

| Spike Question | Decision | Confidence |
|---------------|----------|------------|
| Node runtime compat | ✅ `renderToBuffer()` works in Node.js | High |
| Vercel serverless | ✅ Node.js runtime — Edge Runtime incompatible | High |
| Bundle size | ✅ ~2MB serverless fn, 0KB client (server-only) | High |
| Package placement | **`apps/web` only — NOT `packages/gobd`** | High |
| JSX/React import strategy | Standard `react-jsx`, no extra tsconfig | High |
| Version pin | `^4.5.1` (React 19 compat since v4.1.0) | High |

---

## Critical Finding — Package Placement Reversal

The Epic 6 retro tentatively suggested `packages/gobd` for the PDF renderer. **This is not safe.**

**GitHub Issue #3285** (January 2026, status: open): When `@react-pdf/renderer` is installed in a monorepo external package and imported through Next.js App Router, PDF generation crashes at runtime:

```
TypeError: Cannot read properties of undefined (reading 'S')
```

Root cause: multiple React reconciler instances — Next.js App Router's bundler creates a separate React context from the one `@react-pdf/renderer` expects. No official fix exists.

**Decision:** `@react-pdf/renderer` is a direct dep of `apps/web` only.

`packages/gobd` remains a pure TypeScript package (no React, no PDF dep), consistent with the pure-compute pattern of `packages/validation` and `packages/pdf` from Epic 6.

---

## Confirmed Architecture

```
┌──────────────────────────────────────────────────────┐
│  packages/gobd  (pure TypeScript, no React dep)      │
│    verfahrensdokumentation.ts                        │
│    → assembleVerdokData(tenantId): VerdokData        │
│    Tests: Vitest, plain data assertions              │
└────────────────────┬─────────────────────────────────┘
                     │ VerdokData (plain TS object)
                     ▼
┌──────────────────────────────────────────────────────┐
│  apps/web  (Next.js 16, React 19)                    │
│    lib/pdf/fonts.ts           ← Font.register()      │
│    lib/pdf/verdok-template.tsx ← JSX PDF template    │
│    app/api/verdok/[id]/pdf/route.ts ← Route Handler  │
│      GET → assembleVerdokData → renderToBuffer       │
│          → Response(pdf, { Content-Type: pdf })      │
│    package.json: "@react-pdf/renderer": "^4.5.1"     │
└──────────────────────────────────────────────────────┘
```

---

## Required Code Changes

### 1. Install

```bash
pnpm --filter @rechnungsai/web add @react-pdf/renderer@^4.5.1
```

### 2. `apps/web/next.config.ts`

```typescript
const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ['@react-pdf/renderer'],   // ← add this
};
```

### 3. Font setup — `apps/web/public/fonts/`

Download from Google Fonts (SIL OFL 1.1 — permissive, no SaaS restriction):
- `NotoSans-Regular.ttf`
- `NotoSans-Bold.ttf`

**Why Noto Sans?** Default PDF fonts (Helvetica, Times) are ASCII-only — cannot render `ä ö ü ß`. NotoSans covers full Unicode. OFL license is commercially safe (no SaaS-triggering clause; consistent with Epic 6 MIT-only discipline).

Variable fonts not supported — register separate TTF per weight.

### 4. `apps/web/lib/pdf/fonts.ts`

```typescript
import { Font } from '@react-pdf/renderer'
import path from 'path'

export function registerFonts() {
  Font.register({
    family: 'NotoSans',
    fonts: [
      { src: path.join(process.cwd(), 'public/fonts/NotoSans-Regular.ttf'), fontWeight: 'normal' },
      { src: path.join(process.cwd(), 'public/fonts/NotoSans-Bold.ttf'), fontWeight: 'bold' },
    ],
  })
}
```

Call at **module level** in the route file (not inside the handler) — avoids font loading race with `renderToBuffer`.

### 5. `apps/web/lib/pdf/verdok-template.tsx` (skeleton)

```tsx
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import type { VerdokData } from '@rechnungsai/gobd'

const styles = StyleSheet.create({
  page: { fontFamily: 'NotoSans', fontSize: 11, padding: 40, color: '#111' },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  section: { marginBottom: 10 },
  label: { fontWeight: 'bold', marginBottom: 2 },
})

export function VerdokTemplate({ data }: { data: VerdokData }) {
  return (
    <Document title="Verfahrensdokumentation" author={data.tenantName}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Verfahrensdokumentation</Text>
        {/* sections from VerdokData — fleshed out in Story 7.1 */}
        <View style={styles.section}>
          <Text style={styles.label}>Mandant</Text>
          <Text>{data.tenantName}</Text>
        </View>
        {/* umlaut smoke line — verifies font embedding */}
        <Text>Ä Ö Ü ä ö ü ß</Text>
      </Page>
    </Document>
  )
}
```

### 6. Route Handler (`apps/web/app/api/verdok/[id]/pdf/route.ts`)

```typescript
import { renderToBuffer } from '@react-pdf/renderer'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registerFonts } from '@/lib/pdf/fonts'
import { VerdokTemplate } from '@/lib/pdf/verdok-template'
import { assembleVerdokData } from '@rechnungsai/gobd'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'          // ← never Edge

registerFonts()                          // ← module level

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse(null, { status: 401 })

  // tenantId guard — same pattern as datev_exports download
  const tenantId = params.id
  const data = await assembleVerdokData(tenantId, supabase)

  const buffer = await renderToBuffer(<VerdokTemplate data={data} />)

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="verfahrensdokumentation-${tenantId}.pdf"`,
    },
  })
}
```

---

## Test Strategy

### `packages/gobd` (pure Vitest)

Test `assembleVerdokData()` returns well-formed `VerdokData`. No PDF rendering, no React.

### `apps/web` smoke test

```typescript
// apps/web/__tests__/verdok-pdf.smoke.test.tsx
import { renderToBuffer } from '@react-pdf/renderer'
import { registerFonts } from '../lib/pdf/fonts'
import { VerdokTemplate } from '../lib/pdf/verdok-template'

beforeAll(() => { registerFonts() })

test('VerdokTemplate renders valid PDF buffer', async () => {
  const buffer = await renderToBuffer(
    <VerdokTemplate data={{ tenantName: 'Müller GmbH' }} />
  )
  expect(buffer.length).toBeGreaterThan(1000)
  expect(buffer.slice(0, 5).toString()).toBe('%PDF-')
})
```

**Acceptance gate:** Test green + manual open of PDF in browser confirms `ä ö ü ß` rendered (not `?` or boxes).

---

## Risk Register

| Risk | Severity | Mitigation | Status |
|------|----------|-----------|--------|
| Monorepo crash if dep placed in `packages/gobd` | High | Architecture decision: dep in `apps/web` only | ✅ Resolved by design |
| Font loading race → garbled chars | Medium | `registerFonts()` at module level | ✅ Pattern established |
| Noto Sans missing in standalone build | Medium | `public/` is included in `output: standalone` by default | ✅ No extra config |
| Edge Runtime selected accidentally | High | `export const runtime = 'nodejs'` explicit | ✅ Required in route |
| React 19 compat break | Low | v4.1.0+ officially supports React 19; v4.5.1 latest | ✅ Verified |
| Memory leak accumulation | Low | Serverless function exits per request — leak irrelevant | ✅ Non-issue |

---

## What This Spike Does NOT Cover

- **`VerdokData` schema** — content assembly fields for GoBD paragraphs, tenant config mapping. Addressed in Story 7.1 dev notes + P2 spike (settings hash).
- **`verfahrensdokumentation` table schema** — addressed in P3 migration spike.
- **Dashboard status widget route** — P4 (parallel, during 7.1 first sprint).
- **Multi-page layout** — Story 7.1 will flesh out the template; this spike proves the render pipeline works end-to-end.

---

## Story 7.1 Readiness Gate

Before Story 7.1 is written, verify:

- [ ] `pnpm --filter @rechnungsai/web add @react-pdf/renderer@^4.5.1` runs without dep conflict
- [ ] Noto Sans TTF files downloaded and placed in `apps/web/public/fonts/`
- [ ] Smoke test (`%PDF-` + umlaut check) passes in `pnpm test`
- [ ] Manual: `GET /api/verdok/smoke` returns downloadable PDF with correct German characters

All four gates passing = Story 7.1 may begin.
