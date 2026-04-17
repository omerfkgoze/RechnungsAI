export const CONFIDENCE_THRESHOLD_HIGH = 0.95;
export const CONFIDENCE_THRESHOLD_MEDIUM = 0.7;

export type ConfidenceLevel = "high" | "medium" | "low";

export function confidenceLevel(value: number): ConfidenceLevel {
  if (value >= CONFIDENCE_THRESHOLD_HIGH) return "high";
  if (value >= CONFIDENCE_THRESHOLD_MEDIUM) return "medium";
  return "low";
}

export function statusFromOverallConfidence(
  overall: number,
): "ready" | "review" {
  return overall >= CONFIDENCE_THRESHOLD_HIGH ? "ready" : "review";
}
