// Module-scoped semaphore that caps concurrent client-side extraction
// kickoffs. Lives at module scope so concurrent shell instances (e.g. two
// /erfassen tabs) share the cap. See Story 2.3 AC #4e for rationale — at
// cap=5 the 20-doc NFR2 budget has ~3× headroom.

export const MAX_CONCURRENT_EXTRACTIONS = 5;

let activeExtractions = 0;
const extractionQueue: Array<() => void> = [];

export async function runExtractionGated(
  task: () => Promise<void>,
): Promise<void> {
  if (activeExtractions >= MAX_CONCURRENT_EXTRACTIONS) {
    await new Promise<void>((resolve) => {
      extractionQueue.push(resolve);
    });
  }
  activeExtractions++;
  try {
    await task();
  } finally {
    activeExtractions--;
    const next = extractionQueue.shift();
    if (next) next();
  }
}

// Test helpers.
export function resetExtractionGate(): void {
  activeExtractions = 0;
  extractionQueue.length = 0;
}
export function getActiveExtractions(): number {
  return activeExtractions;
}
export function getQueuedExtractionCount(): number {
  return extractionQueue.length;
}
