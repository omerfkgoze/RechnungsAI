// VAT category codes per EN 16931 §6.5 / UNTDID 5305 subset.
//   S  Standard rate
//   Z  Zero rated goods
//   E  Exempt from tax
//   AE Reverse charge
//   K  Intra-Community supply
//   G  Free export item (export outside EU)
//   O  Services outside scope of tax
//   L  Canary Islands general indirect tax
//   M  Tax for production, services and importation in Ceuta/Melilla
//   B  Transferred (VAT)  — kept for compatibility with some senders
//   IC Intra-Community VAT (alias used by some XRechnung CIUS senders)
//   IG IGIC (Canary Islands) — alternative encoding
//   IP IPSI (Ceuta/Melilla) — alternative encoding

export const VAT_CATEGORIES: ReadonlySet<string> = new Set([
  "S", "Z", "E", "AE", "K", "G", "O", "L", "M", "B", "IC", "IG", "IP",
]);

export function isVatCategory(code: string | undefined): boolean {
  if (!code) return false;
  return VAT_CATEGORIES.has(code.toUpperCase());
}
