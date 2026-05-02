<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Date Input Convention

Native `<input type="date">` is **forbidden** in user-facing UI. German users expect to type `DD.MM.YYYY`
with auto-inserted dots, not an OS-native date picker. Always use the active-mask pattern:

- `inputMode="numeric"`, `placeholder="TT.MM.JJJJ"`, `maxLength={10}`, `type="text"`
- `onChange`: `const masked = applyGermanDateMask(e.target.value, prev); setValue(masked);`
- Convert to ISO before writing to URL / DB: `const iso = parseGermanDate(masked);`
- Initialize draft from ISO URL param: `isoToGermanDateInput(sp.get("dateFrom") ?? "")`

Reference implementation: `components/archive/archive-search-filters.tsx` (Von/Bis inputs) and
`components/dashboard/invoice-list-filters.tsx` (Von/Bis inputs).
Helpers: `applyGermanDateMask`, `isoToGermanDateInput`, `parseGermanDate` in `lib/format.ts`.
