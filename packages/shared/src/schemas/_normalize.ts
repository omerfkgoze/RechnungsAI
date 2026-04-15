// Strip zero-width and bidi-override characters that would pass a naive trim
// but render invisible / spoofable content downstream (invoices, exports).
export const ZERO_WIDTH_AND_BIDI =
  /[\u200B-\u200D\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export const normalizeName = (value: string) =>
  value.replace(ZERO_WIDTH_AND_BIDI, "").trim();
