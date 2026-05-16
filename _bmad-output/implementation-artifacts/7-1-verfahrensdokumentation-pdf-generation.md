# Story 7.1: Verfahrensdokumentation PDF Generation

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want a Verfahrensdokumentation PDF to be automatically generated from my company settings,
so that I have the required GoBD documentation ready for the Finanzamt without writing it myself.

## Acceptance Criteria

**AC1 — Content assembly (pure, `packages/gobd`)**
Given a tenant has completed their company and DATEV settings,
When generation is triggered,
Then `packages/gobd/src/verfahrensdokumentation.ts` exposes `assembleVerdokData(tenant)` which returns a plain `VerdokData` object containing: company details (name, address, tax ID), accounting workflow description (invoice capture → AI extraction → review → approval), software used (RechnungsAI version + AI provider/model), chart of accounts (SKR03/SKR04), archiving procedures (immutable storage, SHA-256 sealing, 10-year retention), access controls (Supabase Auth, tenant isolation / RLS), and data protection measures (encryption in transit, EU/German hosting) (FR26).
`assembleVerdokData` does **not** touch the network/DB — it is a pure mapping from a tenant settings object to `VerdokData`. The Server Action fetches the `tenants` row and passes it in.

**AC2 — Config hash (pure, `packages/gobd`)**
Given the same 10 tenant fields defined in spike P2,
When `computeVerdokConfigHash(input)` is called,
Then it returns a deterministic 64-char lowercase hex SHA-256 over the canonicalized JSON of exactly those 10 fields, with every nullable field coerced via `?? null` (never `undefined`).

**AC3 — Server-side render, no headless browser**
Given `VerdokData`,
When the PDF is produced,
Then it is rendered with `@react-pdf/renderer` `renderToBuffer()` in the Node.js runtime (`export const runtime = "nodejs"`) — no Puppeteer / headless Chromium — and German characters `ä ö ü ß Ä Ö Ü` render correctly via the embedded Noto Sans font.

**AC4 — Storage + DB record (UPSERT)**
Given a successfully rendered PDF,
When generation completes,
Then the PDF is uploaded to the private `verfahrensdokumentation` Supabase Storage bucket at `{tenant_id}/verdok-{generated_at_iso}.pdf`, and a row in `public.verfahrensdokumentation` is UPSERTed on `tenant_id` conflict with `config_hash`, `pdf_storage_path`, `generated_by`, **and `generated_at = now()`** (D-1: `generated_at` MUST be refreshed on regeneration — see Dev Notes).

**AC5 — Download via Route Handler**
Given the user clicks the download button,
When the request hits `GET /api/verdok/[id]/pdf`,
Then the handler authenticates the user, enforces tenant isolation (the `[id]` must resolve to the caller's own tenant), serves the stored PDF as a binary `application/pdf` attachment with `Cache-Control: private, no-store`, and the filename follows `Verfahrensdokumentation_[CompanyName]_[YYYY-MM-DD].pdf` (FR28).

**AC6 — Audit trail**
Given a generation completes and given a download completes,
When each action finishes,
Then a `verdok_generated` event is written to `audit_logs` via the existing `logAuditEvent` helper (generation logs config_hash in metadata; download is best-effort and must never block the binary response).

**AC7 — Empty / incomplete settings guard**
Given required tenant settings are missing (no `company_name`, `company_address`, `tax_id`, or DATEV `datev_berater_nr` / `datev_mandanten_nr`),
When the user requests the Verfahrensdokumentation,
Then no PDF is generated and a conversational German message is shown: "Für die Verfahrensdokumentation werden deine Firmendaten und DATEV-Einstellungen benötigt. Bitte vervollständige zuerst deine Einstellungen." with a direct link to `/einstellungen`.

## Etkilenen Mevcut UI / Logic

> *Bu story mevcut hangi component/logic'i etkiliyor veya onunla çakışabilir?* (Epic 6 retro A1)

- **`apps/web/app/(app)/einstellungen/page.tsx`** — bu story buraya bir "Verfahrensdokumentation" bölümü (oluştur + indir butonu veya AC7 eksik-ayar mesajı) ekler. Mevcut `TenantSettingsForm` davranışını **değiştirmez**; sadece sayfaya yeni bir bölüm ekler.
- **`apps/web/app/actions/tenant.ts` → `updateTenantSettings`** — bu story onu **değiştirmez**. Ayarlar değişince statünün "Aktualisierung verfügbar"a düşmesi (auto-update) **Story 7.2 kapsamıdır**, burada değil. 7.1 yalnızca generate + download teslim eder; çakışma yok.
- **`apps/web/app/actions/invoices/shared.ts` → `logAuditEvent` + `AuditEventType`** — `AuditEventType` union'ına `"verdok_generated"` eklenecek (DB constraint zaten migration'da mevcut). Mevcut event tiplerine dokunulmaz.
- **`packages/gobd/src/index.ts`** — yeni export'lar eklenir (`assembleVerdokData`, `computeVerdokConfigHash`, tipler). Mevcut `hash`/`zip`/`csv` export'ları korunur — barrel'a ekleme, değiştirme değil.
- **`packages/gobd/package.json`** — yeni dependency `json-stringify-deterministic` eklenir; mevcut deps korunur.
- **`apps/web/package.json` + `apps/web/next.config.ts`** — `@react-pdf/renderer` dependency + `serverExternalPackages` eklenir. `next.config.ts`'deki mevcut `output: "standalone"` korunmalı (silinmemeli).
- **Dashboard widget** — 7.1 kapsamında **değildir** (Story 7.2 + prep-P4). 7.1 dashboard'a dokunmaz.

## Tasks / Subtasks

- [x] **Task 1 — Storage bucket prerequisite (D-2)** ✅ DONE (2026-05-16, ayrı session) (AC: 4)
  - [x] Dashboard YERİNE migration ile kuruldu (reproducible, `supabase db reset`+Cloud'da kalıcı; `invoices` bucket precedent'i): `supabase/migrations/20260516010000_storage_verfahrensdokumentation_bucket.sql`
  - [x] private bucket, `application/pdf` only, 5MB limit; RLS `(storage.foldername(name))[1] = public.my_tenant_id()::text` (INSERT + SELECT; UPDATE/DELETE yok — path `{tenant_id}/verdok-{iso}.pdf` versiyonlu, üzerine yazma yok)
  - [ ] **Dev başlangıç doğrulaması:** `supabase db reset` → `select id from storage.buckets where id='verfahrensdokumentation';` 1 satır dönmeli; cross-tenant signed URL erişememeli
- [ ] **Task 2 — `packages/gobd` config hash** (AC: 2)
  - [ ] `pnpm --filter @rechnungsai/gobd add json-stringify-deterministic@^1.0.1`
  - [ ] `packages/gobd/src/verdok-hash.ts` — spike P2 Decision 2 SQL/TS'yi birebir uygula (`VerdokHashInput` tipi + `computeVerdokConfigHash`)
  - [ ] `packages/gobd/src/index.ts` — `computeVerdokConfigHash` + `VerdokHashInput` export et
  - [ ] `packages/gobd/src/verdok-hash.test.ts` — spike P2'deki 6 case + linchpin testi (10 alan sayımı)
- [ ] **Task 3 — `packages/gobd` content assembly** (AC: 1)
  - [ ] `packages/gobd/src/verfahrensdokumentation.ts` — `VerdokData` tipi + `assembleVerdokData(tenant): VerdokData` (saf fonksiyon, DB/network yok)
  - [ ] Statik metin blokları (workflow, archiving, access controls, data protection) Almanca sabit prose; tenant alanları enjekte edilir
  - [ ] RechnungsAI sürümü: `apps/web` `package.json` version'ı ya da paylaşılan sabit; AI provider/model: `packages/ai` `getExtractionModel()` mantığını yansıtan sabit string (import zinciri yaratma — gobd `packages/ai`'ye bağlı olmamalı; string parametre ya da sabit geç)
  - [ ] `packages/gobd/src/index.ts` — `assembleVerdokData` + `VerdokData` export
  - [ ] `packages/gobd/src/verfahrensdokumentation.test.ts` — well-formed VerdokData, eksik alan davranışı
- [ ] **Task 4 — `@react-pdf/renderer` kurulum** (AC: 3)
  - [ ] `pnpm --filter @rechnungsai/web add @react-pdf/renderer@^4.5.1`
  - [ ] `apps/web/next.config.ts` → `serverExternalPackages: ["@react-pdf/renderer"]` ekle (mevcut `output: "standalone"` KORUNUR)
  - [x] `apps/web/public/fonts/NotoSans-Regular.ttf` + `NotoSans-Bold.ttf` ✅ DONE (2026-05-16, ayrı session — Google noto-fonts hinted/ttf, SIL OFL 1.1, ~570KB each)
  - [ ] `apps/web/lib/pdf/fonts.ts` — `registerFonts()` (spike P1 §4)
- [ ] **Task 5 — PDF template** (AC: 1, 3)
  - [ ] `apps/web/lib/pdf/verdok-template.tsx` — `VerdokTemplate({ data }: { data: VerdokData })`; A4, çok bölümlü; spike P1 skeleton'u tüm GoBD bölümleriyle doldur
  - [ ] Umlaut smoke satırı template'te kalsın (font gömme doğrulaması)
- [ ] **Task 6 — Generate Server Action** (AC: 1, 2, 4, 6, 7)
  - [ ] `apps/web/app/actions/verdok.ts` (yeni) → `generateVerdok()`: auth → user.tenant_id → tenants row fetch → AC7 eksik-ayar guard → `assembleVerdokData` → `renderToBuffer(<VerdokTemplate/>)` → Storage upload → `computeVerdokConfigHash` → `verfahrensdokumentation` UPSERT (**`generated_at: new Date().toISOString()` payload'da — D-1**) → `logAuditEvent("verdok_generated", metadata:{config_hash})` → `revalidatePath("/einstellungen")`
  - [ ] `logAuditEvent` / `AuditEventType` union'ına `"verdok_generated"` ekle (`apps/web/app/actions/invoices/shared.ts`)
- [ ] **Task 7 — Download Route Handler** (AC: 5, 6)
  - [ ] `apps/web/app/api/verdok/[id]/pdf/route.ts` — `runtime = "nodejs"`, `dynamic = "force-dynamic"`; `datev/[exportId]/route.ts` auth+tenant-isolation desenini birebir izle
  - [ ] `verfahrensdokumentation` row fetch (tenant-scoped) → Storage'dan PDF indir → binary attachment, `Content-Disposition` filename `Verfahrensdokumentation_[CompanyName]_[YYYY-MM-DD].pdf` (`toTenantSlug` helper'ı kullan)
  - [ ] Best-effort `verdok_generated` audit (download); hata response'u bloklamaz
- [ ] **Task 8 — Einstellungen UI** (AC: 5, 7)
  - [ ] `einstellungen/page.tsx`'e "Verfahrensdokumentation" bölümü: ayarlar tamamsa generate + download; eksikse AC7 mesajı + `/einstellungen` (kendi sayfası — vurgulu CTA) link
  - [ ] Boş durum: UX empty-state deseni (UX-DR19; üzücü ton yok)
- [ ] **Task 9 — Tests + smoke**
  - [ ] `apps/web/__tests__/verdok-pdf.smoke.test.tsx` — `%PDF-` prefix + umlaut buffer kontrolü (spike P1 §Test Strategy)
  - [ ] Server Action testi: AC7 guard, UPSERT payload `generated_at` içeriyor
  - [ ] Route handler testi: cross-tenant 404, auth 401
  - [ ] `pnpm -r test` yeşil; manuel: gerçek tarayıcıda PDF aç, `ä ö ü ß` doğru render

## Dev Notes

### Architecture patterns & constraints

- **`packages/gobd` saf TypeScript kalır** — React/PDF dependency YOK. Spike P1 kritik bulgusu: `@react-pdf/renderer` monorepo dış paketten import edilince Next.js App Router'da çoklu React reconciler crash'i (`TypeError: Cannot read properties of undefined (reading 'S')`, GitHub #3285, açık). `@react-pdf/renderer` **yalnızca `apps/web`** doğrudan dependency'sidir.
- **Veri akışı:** `packages/gobd` saf `VerdokData` üretir → `apps/web` template + render + storage + route yapar. `assembleVerdokData` ağ/DB'ye dokunmaz; tenants satırını Server Action çeker.
- **`computeVerdokConfigHash` invariantı:** her nullable alan `?? null` (asla `undefined`). `JSON.stringify(undefined)` anahtarı düşürür → sessiz hash kayması. `string | null` tipi compile-time'da zorlar. Tam liste (10 alan) spike P2 Decision 1'de — `steuerberater_email` HARİÇ (sadece iletişim, GoBD içeriği değil; Epic 8.3 kapsamı).
- **Auto-detection Story 7.2'de** — 7.1 yalnızca generate + download. DB trigger YOK (spike P2 Decision 3: Server Action hash compare).
- **Migration durumu:** `20260516000000_verfahrensdokumentation.sql` ZATEN landed (prep P3). `database.ts` tipleri ZATEN yamalı (`verfahrensdokumentation` block, satır 183). Bu story yeni migration YAZMAZ. `audit_logs_event_type_chk` constraint'i `verdok_generated`'ı zaten içeriyor — yalnızca TS `AuditEventType` union'ı güncellenecek.

### Likely Failure Modes (Epic 5/6 retro A2 — load-bearing for review)

- **F-1 — `@react-pdf/renderer` `packages/gobd`'a konursa runtime crash.** Mitigasyon: dep yalnızca `apps/web`; `packages/gobd` React'siz kalır. Review'da `packages/gobd/package.json`'da react-pdf YOK kontrolü.
- **F-2 — Edge runtime yanlışlıkla seçilirse render patlar.** Mitigasyon: route'ta `export const runtime = "nodejs"` zorunlu, açıkça yazılı.
- **F-3 — Font yükleme yarışı → bozuk/`?` karakterler.** Mitigasyon: `registerFonts()` route dosyasında **module-level** (handler içinde değil), `renderToBuffer`'dan önce.
- **F-4 — D-1: `generated_at` UPSERT'te stale kalır.** İlk üretim Gün 1; 10 gün sonra yeniden üretim aynı satırı günceller ama `generated_at` Gün 1 kalır → Story 7.2 widget yanlış tarih gösterir. Mitigasyon: UPSERT payload'ına AÇIKÇA `generated_at: new Date().toISOString()`. Review bunu doğrulamalı.
- **F-5 — D-2: Storage bucket yoksa upload başarısız ama DB satırı yazılır → kırık kayıt (var olmayan dosyaya işaret eden `pdf_storage_path`).** Mitigasyon: Task 1 bucket önce; Server Action'da upload başarısızsa DB UPSERT YAPMA (upload → sonra UPSERT sırası; upload error'da erken return).
- **F-6 — `undefined` vs `null` hash alanlarında → sessiz hash uyuşmazlığı.** Mitigasyon: `?? null` + `string | null` tip + null/non-null test case (spike P2).
- **F-7 — Hash alan kayması:** `tenants`'a alan eklenip `VerdokHashInput`'a eklenmezse hash bozulur. Mitigasyon: linchpin testi (10 alan sayımı) compile-time'da yakalar.
- **F-8 — Route handler tenant izolasyon bypass'ı.** Mitigasyon: `datev/[exportId]/route.ts` deseni birebir — `user.id → users.tenant_id`, sonra `.eq("tenant_id", tenantId)`. `[id]` parametresine asla doğrudan güvenme.
- **F-9 — AC7 guard atlanırsa yarı-dolu PDF üretilir.** Mitigasyon: Server Action'da render'dan ÖNCE zorunlu alan kontrolü; eksikse erken return + Almanca mesaj.
- **F-10 — Download audit hatası binary response'u bloklarsa indirme bozulur.** Mitigasyon: download audit best-effort (try/catch, hata yutulur, Sentry'e gider, response devam eder) — `logAuditEvent` zaten bu desende.
- **F-11 — `next.config.ts` düzenlenirken mevcut `output: "standalone"` silinirse standalone build bozulur.** Mitigasyon: yalnızca `serverExternalPackages` EKLE, mevcut alanları koru.
- **F-12 — Noto Sans `output: standalone`'da eksik.** Düşük risk: `public/` standalone'a default dahil; ek config gerekmez (spike P1 risk register).

### GDPR migration axis (Epic 6 retro A2)

Bu story **yeni migration eklemiyor** (P3'te landed). Mevcut migration'ın GDPR durumu doğrulandı: `generated_by` → `auth.users` FK'sı `ON DELETE SET NULL` (kullanıcı silinince doküman tenant'a ait kalır, satır silinmez, `generated_by` NULL olur). PII kolonu yok (`config_hash` geri döndürülemez). Yeni FK eklenmiyor. ✅ Sorun yok.

### Source tree — touch list

- NEW `packages/gobd/src/verdok-hash.ts`, `verdok-hash.test.ts`
- NEW `packages/gobd/src/verfahrensdokumentation.ts`, `verfahrensdokumentation.test.ts`
- UPDATE `packages/gobd/src/index.ts` (export ekle), `packages/gobd/package.json` (dep ekle)
- NEW `apps/web/lib/pdf/fonts.ts`, `apps/web/lib/pdf/verdok-template.tsx`
- DONE `apps/web/public/fonts/NotoSans-Regular.ttf`, `NotoSans-Bold.ttf` (indirildi)
- DONE `supabase/migrations/20260516010000_storage_verfahrensdokumentation_bucket.sql` (bucket + RLS — landed, `supabase db reset` ile uygulanır)
- NEW `apps/web/app/actions/verdok.ts`, `apps/web/app/api/verdok/[id]/pdf/route.ts`
- UPDATE `apps/web/next.config.ts` (serverExternalPackages), `apps/web/package.json` (dep)
- UPDATE `apps/web/app/actions/invoices/shared.ts` (`AuditEventType` += `verdok_generated`)
- UPDATE `apps/web/app/(app)/einstellungen/page.tsx` (Verfahrensdokumentation bölümü)
- NEW `apps/web/__tests__/verdok-pdf.smoke.test.tsx` + action/route testleri

### Testing standards

- `packages/gobd`: Vitest (`vitest run`), saf data assertion — React/PDF YOK. Min 6 hash testi + linchpin (spike P2 §Test Strategy).
- `apps/web`: Vitest; smoke testi `renderToBuffer` → `%PDF-` prefix + umlaut buffer uzunluğu.
- Acceptance gate: `pnpm -r test` yeşil **+ manuel tarayıcı**: PDF açılır, `ä ö ü ß` doğru (kutucuk/`?` değil) — bu story'de smoke "DONE" ancak gerçek tarayıcı oturumu doğrulandıysa (Epic 6 A3: aksi halde BLOCKED-BY-ENVIRONMENT).
- `pnpm --filter @rechnungsai/gobd test` ve `pnpm --filter @rechnungsai/web test` ayrı koşulabilir.

### Project Structure Notes

- `apps/web/AGENTS.md`: Bu Next.js eğitim verisindekinden farklı — kod yazmadan önce `node_modules/next/dist/docs/` içindeki ilgili rehberi oku (özellikle Route Handler + `serverExternalPackages` + runtime export). Native `<input type="date">` yasak (bu story'de tarih input'u yok ama not edildi).
- Route Handler auth+tenant deseni: `apps/web/app/api/export/datev/[exportId]/route.ts` referans (auth → users.tenant_id → tenant-scoped query → binary response + `private, no-store`).
- Storage signed URL deseni: `apps/web/app/actions/invoices/review.ts:268` / `upload.ts:557` (`createSignedUrl`).
- `toTenantSlug` helper: `apps/web/app/api/_helpers/filename` (dosya adı için).
- `assembleVerdokData`'da AI provider/model sabiti — `packages/gobd`'ı `packages/ai`'ye bağlama (gobd saf kalmalı); sabit string ya da Server Action'dan parametre geç. `packages/ai/src/provider.ts` default: OpenAI `gpt-4o-mini` / Google `gemini-2.5-flash`. RechnungsAI sürümü: `apps/web/package.json` `0.1.0` (Server Action'dan parametre olarak geçmek temiz).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.1] — AC kaynak
- [Source: _bmad-output/planning-artifacts/prd.md#FR26-FR28]
- [Source: _bmad-output/implementation-artifacts/spike-p1-react-pdf-renderer-2026-05-16.md] — render pipeline, font, route, package placement, version pin
- [Source: _bmad-output/implementation-artifacts/spike-p2-verdok-hash-strategy-2026-05-16.md] — 10 hash alanı, `verdok-hash.ts` TS, UPSERT akışı, test stratejisi
- [Source: _bmad-output/implementation-artifacts/spec-prep-p3-verfahrensdokumentation-migration.md] — landed migration + database.ts tipleri
- [Source: _bmad-output/implementation-artifacts/epic-6-retro-2026-05-16.md#D-1] — `generated_at` UPSERT fix (Story 7.1 sorumluluğu)
- [Source: _bmad-output/implementation-artifacts/epic-6-retro-2026-05-16.md#D-2] — Storage bucket prerequisite
- [Source: _bmad-output/implementation-artifacts/epic-6-retro-2026-05-16.md#Action Items A1/A2/A3]
- [Source: supabase/migrations/20260516000000_verfahrensdokumentation.sql] — tablo/RLS/audit constraint (landed)
- [Source: apps/web/app/api/export/datev/[exportId]/route.ts] — Route Handler auth+tenant+binary deseni
- [Source: apps/web/app/actions/invoices/shared.ts] — `logAuditEvent` + `AuditEventType`
- [Source: apps/web/app/actions/tenant.ts] — tenant settings okuma/yazma deseni
- [Source: apps/web/app/(app)/einstellungen/page.tsx] — settings sayfası entegrasyon noktası

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
