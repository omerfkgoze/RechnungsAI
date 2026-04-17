import { describe, expect, it } from "vitest";
import {
  confidenceLevel,
  statusFromOverallConfidence,
} from "./confidence.js";

describe("confidenceLevel", () => {
  it("returns 'high' at the exact 0.95 threshold", () => {
    expect(confidenceLevel(0.95)).toBe("high");
  });

  it("returns 'medium' just below the high threshold", () => {
    expect(confidenceLevel(0.94999)).toBe("medium");
  });

  it("returns 'medium' at the 0.70 threshold", () => {
    expect(confidenceLevel(0.7)).toBe("medium");
  });

  it("returns 'low' just below the medium threshold", () => {
    expect(confidenceLevel(0.69999)).toBe("low");
  });

  it("returns 'low' at 0", () => {
    expect(confidenceLevel(0)).toBe("low");
  });

  it("returns 'high' at 1", () => {
    expect(confidenceLevel(1)).toBe("high");
  });
});

describe("statusFromOverallConfidence", () => {
  it("returns 'ready' at the exact high threshold", () => {
    expect(statusFromOverallConfidence(0.95)).toBe("ready");
  });

  it("returns 'review' just below the high threshold", () => {
    expect(statusFromOverallConfidence(0.9499)).toBe("review");
  });

  it("returns 'review' at zero", () => {
    expect(statusFromOverallConfidence(0)).toBe("review");
  });
});
