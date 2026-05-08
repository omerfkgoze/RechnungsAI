// P10 — German tenant names should round-trip readably through the filename.
// We transliterate umlauts + ß explicitly, then NFD-strip remaining combining
// marks (Unicode block U+0300–U+036F), then collapse anything else to '-'.
// "Müller GmbH" → "mueller-gmbh". Caller must fall back to a stable slug
// when the result is empty (e.g. fully non-ASCII tenant name like "株式会社").
export function toTenantSlug(companyName: string): string {
  const transliterated = companyName
    .replace(/ß/g, "ss")
    .replace(/[äÄ]/g, (c) => (c === "ä" ? "ae" : "Ae"))
    .replace(/[öÖ]/g, (c) => (c === "ö" ? "oe" : "Oe"))
    .replace(/[üÜ]/g, (c) => (c === "ü" ? "ue" : "Ue"));
  return transliterated
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
