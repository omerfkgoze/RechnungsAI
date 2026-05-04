# DATEV Settings Scope — Prep Research

**Date:** 2026-05-04
**For:** Story 5.1 — DATEV Settings Configuration
**Outcome:** ✅ All four DATEV settings fields already implemented. Story 5.1 scope is narrower than expected.

---

## Key Finding: DATEV Settings Already Exist in All Layers

Investigation found that DATEV tenant configuration was partially implemented during Story 1.5 (Tenant Settings and Dashboard Shell). All four fields required for EXTF export are already live.

| Layer | Status | Evidence |
|-------|--------|----------|
| DB migration | ✅ Done | `20260415100000_tenant_settings.sql` |
| Zod schema | ✅ Done | `packages/shared/src/schemas/tenant-settings.ts` |
| TypeScript types | ✅ Done | `packages/shared/src/types/database.ts` |
| Server Action | ✅ Done | `apps/web/app/actions/tenant.ts → updateTenantSettings` |
| Settings UI | ✅ Done | `apps/web/components/settings/tenant-settings-form.tsx` |

---

## What Exists Today

### DB Schema (`20260415100000_tenant_settings.sql`)

```sql
alter table public.tenants
  add column if not exists datev_berater_nr text null,
  add column if not exists datev_mandanten_nr text null,
  add column if not exists datev_sachkontenlaenge smallint not null default 4,
  add column if not exists datev_fiscal_year_start smallint not null default 1;

-- CHECK constraints already wired:
-- datev_berater_nr: ^[0-9]{1,7}$ or null
-- datev_mandanten_nr: ^[0-9]{1,5}$ or null
-- datev_sachkontenlaenge: between 4 and 8
-- datev_fiscal_year_start: between 1 and 12
```

### Zod Validation (`packages/shared/src/schemas/tenant-settings.ts`)

All four fields in `tenantSettingsSchema`:
- `datev_berater_nr` — optional, regex `^[0-9]{1,7}$`
- `datev_mandanten_nr` — optional, regex `^[0-9]{1,5}$`
- `datev_sachkontenlaenge` — `z.coerce.number().int().min(4).max(8)`
- `datev_fiscal_year_start` — `z.coerce.number().int().min(1).max(12)`

### Settings UI (`tenant-settings-form.tsx`)

"DATEV-Konfiguration" section already rendered with:
- Berater-Nr. → `<Input inputMode="numeric" maxLength={7} />`
- Mandanten-Nr. → `<Input inputMode="numeric" maxLength={5} />`
- Sachkontenlänge → `<select>` with options 4–8
- Geschäftsjahr-Beginn → `<select>` with GERMAN_MONTHS (1–12)

---

## What Story 5.1 Actually Needs

Story 5.1 is **not** about adding settings fields — they already exist. The story should focus on:

### 1. Test Coverage (Missing)

No tests exist yet for the DATEV tenant settings fields. Story 5.1 must add:
- Unit tests: Zod schema validation for all four DATEV fields
- Integration tests: `updateTenantSettings` action saves DATEV fields correctly
- Edge cases: `berater_nr = null` (optional), `sachkontenlaenge = 4` (default)

### 2. Default Kreditorenkonto Setting (Gap)

The EXTF format requires a Gegenkonto (offsetting account = Kreditorenkonto) for every booking row. This field is **not yet in tenant settings**. Story 5.1 should add:

```sql
alter table public.tenants
  add column if not exists datev_default_kreditorenkonto text null;
-- CHECK: ^[0-9]{5,9}$ or null
```

Zod validation: optional 5–9 digit account number.

UI: new input "Standard-Kreditorenkonto" with `placeholder="z. B. 70000"`.

**Why this matters:** Without a Gegenkonto, Story 5.2 cannot generate valid Buchungsstapel rows. Either this field is provided or Story 5.2 uses a hardcoded fallback (`70000` for SKR03, `10000` for SKR04). Decision needed before Story 5.2 starts.

**Recommendation:** Add the DB column + Zod field in Story 5.1. Use `null` → fallback logic in Story 5.2. This avoids blocking 5.2 on user configuration.

### 3. "Export bereit" Indicator (Optional)

The settings page could show a readiness indicator: "DATEV-Export bereit" (green) when `berater_nr` and `mandanten_nr` are both non-null, "Konfiguration unvollständig" (orange) otherwise. This is a UX enhancement — optional for 5.1.

---

## Fields Required by EXTF v700 Header and Where They Come From

| EXTF Header Field | DB Column | Default | Required for Export |
|------------------|-----------|---------|-------------------|
| Berater (pos 11) | `datev_berater_nr` | null | **Yes** — export fails if null |
| Mandant (pos 12) | `datev_mandanten_nr` | null | **Yes** — export fails if null |
| WJ-Beginn (pos 13) | `datev_fiscal_year_start` | 1 (January) | Computed |
| Sachkontenlänge (pos 14) | `datev_sachkontenlaenge` | 4 | Yes (has safe default) |
| SKR (pos 26) | `tenants.skr_plan` | — | Used to format accounts |

---

## Story 5.1 Revised Scope

| Task | Effort | Priority |
|------|--------|----------|
| Add `datev_default_kreditorenkonto` migration | Minimal | **Critical** (blocks 5.2) |
| Add Zod field + UI input for Kreditorenkonto | Small | **Critical** |
| Add unit tests for all DATEV schema fields | Medium | High |
| Add "export bereit" indicator to settings page | Small | Low (optional) |
| Verify `updateTenantSettings` persists DATEV fields (integration test) | Small | High |

No new DB table needed — all fields belong in `tenants` table alongside existing DATEV columns.

---

## Story 5.3 Guard Requirement

Story 5.3 (Export Flow and Download Route Handler) **must** check before generating CSV:

```typescript
if (!tenantConfig.beraterNr || !tenantConfig.mandantenNr) {
  return Response.json(
    { error: "DATEV-Konfiguration unvollständig. Bitte Berater-Nr. und Mandanten-Nr. in den Einstellungen hinterlegen." },
    { status: 400 }
  );
}
```

This guard prevents generating invalid EXTF files with empty header fields.

---

*Research completed 2026-05-04. P2 resolved. Story 5.1 scope confirmed.*
