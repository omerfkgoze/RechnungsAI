// Shared numeric helpers for BR-CO-* arithmetic rules.
// Extracted here so rule files can import without creating a circular
// dependency with engine.ts (engine imports rule arrays; rule files import
// these helpers → cycle → arrays are undefined at initialization time).

/** Parse a textual monetary value. Returns NaN on bad input. */
export function num(v: string | undefined | null): number {
  if (v === undefined || v === null) return NaN;
  const trimmed = String(v).replace(/,/g, ".");
  if (trimmed === "") return NaN;
  return Number.parseFloat(trimmed);
}

/** EN 16931 monetary rounding: 2 decimal places, commercial rounding. */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return n;
  const factor = 100;
  return Math.sign(n) * Math.round(Math.abs(n) * factor) / factor;
}

/** Two amounts equal within ±0.01 (one cent tolerance). */
export function eq2(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(round2(a) - round2(b)) <= 0.01;
}

export function sum(values: (string | undefined)[]): number {
  let acc = 0;
  for (const v of values) {
    const n = num(v);
    if (Number.isFinite(n)) acc += n;
  }
  return acc;
}
