import { afterEach, describe, expect, it } from "vitest";
import {
  getActiveExtractions,
  getQueuedExtractionCount,
  MAX_CONCURRENT_EXTRACTIONS,
  resetExtractionGate,
  runExtractionGated,
} from "./extraction-gate";

// Helper: a task whose promise we can resolve manually, with a label to
// observe FIFO ordering.
function deferredTask(label: string, log: string[]) {
  let resolveFn: (() => void) | undefined;
  const task = () =>
    new Promise<void>((resolve) => {
      log.push(`start:${label}`);
      resolveFn = () => {
        log.push(`end:${label}`);
        resolve();
      };
    });
  return { task, resolve: () => resolveFn?.() };
}

// Fixed-count task for counting concurrency peaks.
async function microtick() {
  // Flush pending microtasks so gate internals settle.
  await Promise.resolve();
  await Promise.resolve();
}

describe("extraction-gate", () => {
  afterEach(() => {
    resetExtractionGate();
  });

  it("7 tasks with cap=5 → exactly 5 run concurrently, 2 queue", async () => {
    const log: string[] = [];
    const deferred = Array.from({ length: 7 }, (_, i) =>
      deferredTask(`t${i}`, log),
    );
    // Fire all 7 in parallel (do not await).
    const running = deferred.map((d) => runExtractionGated(d.task));

    await microtick();

    expect(getActiveExtractions()).toBe(MAX_CONCURRENT_EXTRACTIONS); // 5
    expect(getQueuedExtractionCount()).toBe(2);
    // First 5 should have started, last 2 should NOT have started yet.
    expect(log.filter((l) => l.startsWith("start:"))).toEqual([
      "start:t0", "start:t1", "start:t2", "start:t3", "start:t4",
    ]);

    // Resolve first two; the next two queued should start in FIFO order.
    deferred[0]!.resolve();
    deferred[1]!.resolve();
    await microtick();
    expect(log).toContain("start:t5");
    expect(log).toContain("start:t6");
    const starts = log.filter((l) => l.startsWith("start:"));
    expect(starts.indexOf("start:t5")).toBeLessThan(starts.indexOf("start:t6"));

    // Drain the rest so `running` resolves.
    for (let i = 2; i < 7; i++) deferred[i]!.resolve();
    await Promise.all(running);
    expect(getActiveExtractions()).toBe(0);
    expect(getQueuedExtractionCount()).toBe(0);
  });

  it("a throwing task releases its slot so the next task runs", async () => {
    const log: string[] = [];
    const deferred = Array.from({ length: 6 }, (_, i) =>
      deferredTask(`d${i}`, log),
    );
    // Task 0 will throw instead of resolving.
    const throwingTask = async () => {
      log.push("start:throw");
      throw new Error("boom");
    };
    const running: Array<Promise<unknown>> = [];
    // Fill the cap with throwing + 4 deferred tasks (total 5 in-flight).
    running.push(runExtractionGated(throwingTask).catch(() => {}));
    for (let i = 0; i < 4; i++) {
      running.push(runExtractionGated(deferred[i]!.task));
    }
    // Enqueue a 6th which must wait.
    running.push(runExtractionGated(deferred[4]!.task));

    await microtick();
    // Throw should have completed synchronously → slot released → d4 started.
    expect(log).toContain("start:throw");
    expect(log).toContain("start:d4");
    expect(getActiveExtractions()).toBe(MAX_CONCURRENT_EXTRACTIONS);

    // Drain.
    for (let i = 0; i < 5; i++) deferred[i]!.resolve();
    await Promise.all(running);
    expect(getActiveExtractions()).toBe(0);
  });

  it("activeExtractions returns to 0 after all complete", async () => {
    const log: string[] = [];
    const deferred = Array.from({ length: 3 }, (_, i) =>
      deferredTask(`c${i}`, log),
    );
    const running = deferred.map((d) => runExtractionGated(d.task));
    await microtick();
    expect(getActiveExtractions()).toBe(3);
    deferred.forEach((d) => d.resolve());
    await Promise.all(running);
    expect(getActiveExtractions()).toBe(0);
    expect(getQueuedExtractionCount()).toBe(0);
  });

  it("resetExtractionGate clears active count and queue", async () => {
    const log: string[] = [];
    const deferred = Array.from({ length: 7 }, (_, i) =>
      deferredTask(`r${i}`, log),
    );
    deferred.forEach((d) => {
      void runExtractionGated(d.task);
    });
    await microtick();
    expect(getActiveExtractions()).toBeGreaterThan(0);
    expect(getQueuedExtractionCount()).toBeGreaterThan(0);
    resetExtractionGate();
    expect(getActiveExtractions()).toBe(0);
    expect(getQueuedExtractionCount()).toBe(0);
    // Drain to avoid unhandled promises (in-flight tasks will still finish).
    deferred.forEach((d) => d.resolve());
  });
});
