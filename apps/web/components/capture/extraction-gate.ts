// Module-scoped semaphore that caps concurrent client-side extraction
// kickoffs. Lives at module scope so concurrent shell instances (e.g. two
// /erfassen tabs) share the cap. See Story 2.3 AC #4e for rationale — at
// cap=5 the 20-doc NFR2 budget has ~3× headroom.

export const MAX_CONCURRENT_EXTRACTIONS = 5;

type Waiter = { resolve: () => void; cancelled: boolean };

let maxConcurrent = MAX_CONCURRENT_EXTRACTIONS;
let activeExtractions = 0;
const extractionQueue: Waiter[] = [];

export async function runExtractionGated(
  task: () => Promise<void>,
): Promise<void> {
  // Always enqueue when waiters exist, even if under cap — otherwise a caller
  // arriving between a task's `finally` and the resumed awaiter's increment
  // can jump ahead of queued tasks (FIFO violation).
  if (activeExtractions >= maxConcurrent || extractionQueue.length > 0) {
    const waiter: Waiter = { resolve: () => {}, cancelled: false };
    await new Promise<void>((resolve) => {
      waiter.resolve = resolve;
      extractionQueue.push(waiter);
    });
    if (waiter.cancelled) return;
  }
  activeExtractions++;
  try {
    await task();
  } finally {
    // Clamp to 0 so a stale reset (should not happen, but defensive) cannot
    // drive the counter negative and widen the effective cap for later batches.
    activeExtractions = Math.max(0, activeExtractions - 1);
    const next = extractionQueue.shift();
    if (next) next.resolve();
  }
}

// AC #9(g): drop pending kickoffs without disturbing in-flight accounting.
// In-flight Server Actions continue to completion; their `finally` will
// correctly decrement the active counter. Queued waiters are resolved with a
// cancelled flag so `runExtractionGated` returns before running its task.
export function clearExtractionQueue(): void {
  while (extractionQueue.length > 0) {
    const waiter = extractionQueue.shift();
    if (!waiter) break;
    waiter.cancelled = true;
    waiter.resolve();
  }
}

// Test helpers.
export function resetExtractionGate(): void {
  activeExtractions = 0;
  extractionQueue.length = 0;
  maxConcurrent = MAX_CONCURRENT_EXTRACTIONS;
}
export function setMaxConcurrentExtractionsForTesting(n: number): void {
  maxConcurrent = n;
}
export function getActiveExtractions(): number {
  return activeExtractions;
}
export function getQueuedExtractionCount(): number {
  return extractionQueue.length;
}
