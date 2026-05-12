// UN/ECE Recommendation 20 (Codes for Units of Measure used in International Trade)
// plus Recommendation 21 (codes used in Customs/Trade-Statistics). Used by
// BR-CL-23 (invoice line unit code).
//
// This set is the practical subset that appears in real EN 16931 invoices
// (~120 codes). The full Rec 20 list is ~700 codes; we intentionally narrow
// to the realistic invoice subset to keep the rule message useful — exotic
// codes will fail with a clear "Mengeneinheit nicht gültig (UN/ECE Rec. 20)"
// rather than a "we know but never see this" pass.

export const UNECE_REC20_UNITS: ReadonlySet<string> = new Set([
  // Counts / pieces
  "PCE", "EA", "C62", "NIU", "ZZ", "H87", "XPP", "LOT", "PR", "SET",
  "NAR", "NPR", "NPT", "NPL", "NMP", "NCL", "NBB",
  // Length
  "MTR", "CMT", "MMT", "KMT", "INH", "FOT", "YRD", "MIL", "HMT", "DMT",
  // Area
  "MTK", "CMK", "MMK", "HAR", "MIK", "INK", "FTK", "YDK",
  // Volume
  "MTQ", "LTR", "MLT", "CLT", "DLT", "HLT", "CMQ", "MMQ", "FTQ", "INQ",
  "GLI", "GLL", "OZA", "OZI", "PTI", "PTL", "QTI", "QTL", "BLD",
  // Mass
  "KGM", "GRM", "MGM", "TNE", "DTN", "CTM", "MGM", "LBR", "ONZ", "STN",
  "LTN", "CGM", "MKG",
  // Time / duration
  "SEC", "MIN", "HUR", "DAY", "WEE", "MON", "ANN", "Q34",
  // Power / energy
  "KWH", "MWH", "JOU", "KJO", "MAW", "KWT", "WTT",
  // Frequency / data
  "HTZ", "KHZ", "MHZ", "GHZ", "BYT", "C16", "D85",
  // Misc service / pricing units
  "P1", "ROL", "PA", "PK", "BG", "BX", "CT", "CR", "DR", "DZN",
  "GRO", "PG", "RM", "SH", "SX", "TU", "WG", "WM",
  // EN 16931 examples that aren't strictly Rec 20 but accepted in practice
  "MTS", "HKM", "M4", "TKM",
]);

export function isUneceRec20Unit(code: string | undefined): boolean {
  if (!code) return false;
  return UNECE_REC20_UNITS.has(code.toUpperCase());
}
