import { afterEach, describe, expect, it } from "vitest";
import {
  clearExtractionQueue,
  getActiveExtractions,
  getQueuedExtractionCount,
  MAX_CONCURRENT_EXTRACTIONS,
  resetExtractionGate,
  runExtractionGated,
  setMaxConcurrentExtractionsForTesting,
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

  it("AC #4e: 7 tasks with cap=3 → 3 run, 4 queue in FIFO order", async () => {
    setMaxConcurrentExtractionsForTesting(3);
    const log: string[] = [];
    const deferred = Array.from({ length: 7 }, (_, i) =>
      deferredTask(`q${i}`, log),
    );
    const running = deferred.map((d) => runExtractionGated(d.task));

    await microtick();
    expect(getActiveExtractions()).toBe(3);
    expect(getQueuedExtractionCount()).toBe(4);
    expect(log.filter((l) => l.startsWith("start:"))).toEqual([
      "start:q0",
      "start:q1",
      "start:q2",
    ]);

    // Drain everything and verify FIFO ordering of starts.
    for (let i = 0; i < 7; i++) {
      deferred[i]!.resolve();
      await microtick();
    }
    await Promise.all(running);
    const starts = log.filter((l) => l.startsWith("start:"));
    expect(starts).toEqual([
      "start:q0",
      "start:q1",
      "start:q2",
      "start:q3",
      "start:q4",
      "start:q5",
      "start:q6",
    ]);
    expect(getActiveExtractions()).toBe(0);
    expect(getQueuedExtractionCount()).toBe(0);
  });

  it("late caller cannot jump ahead of already-queued waiters (FIFO)", async () => {
    setMaxConcurrentExtractionsForTesting(2);
    const log: string[] = [];
    const deferred = Array.from({ length: 4 }, (_, i) =>
      deferredTask(`f${i}`, log),
    );
    // Fill cap (2) + queue one waiter (f2).
    const running: Array<Promise<unknown>> = [];
    running.push(runExtractionGated(deferred[0]!.task));
    running.push(runExtractionGated(deferred[1]!.task));
    running.push(runExtractionGated(deferred[2]!.task));
    await microtick();
    expect(getQueuedExtractionCount()).toBe(1);

    // Resolve f0 → f2 should be next, NOT a newly arriving f3.
    deferred[0]!.resolve();
    // Fire f3 in the exact same tick as f0's release.
    running.push(runExtractionGated(deferred[3]!.task));
    await microtick();

    // f2 (queued first) must have started; f3 (arrived at cap release) must
    // still be queued — proves it did not jump the line.
    expect(log).toContain("start:f2");
    expect(log).not.toContain("start:f3");
    expect(getQueuedExtractionCount()).toBe(1);

    deferred[1]!.resolve();
    await microtick();
    deferred[2]!.resolve();
    await microtick();
    deferred[3]!.resolve();
    await Promise.all(running);
  });

  it("clearExtractionQueue cancels pending waiters without zeroing active count", async () => {
    const log: string[] = [];
    const deferred = Array.from({ length: 7 }, (_, i) =>
      deferredTask(`k${i}`, log),
    );
    const running = deferred.map((d) => runExtractionGated(d.task));
    await microtick();
    const activeBefore = getActiveExtractions();
    expect(activeBefore).toBe(MAX_CONCURRENT_EXTRACTIONS);
    expect(getQueuedExtractionCount()).toBe(2);

    clearExtractionQueue();
    // Active tasks untouched; queued waiters resolved with cancelled=true.
    expect(getActiveExtractions()).toBe(activeBefore);
    expect(getQueuedExtractionCount()).toBe(0);

    // Resolve in-flight → counter must reach 0 (not go negative).
    for (let i = 0; i < MAX_CONCURRENT_EXTRACTIONS; i++) deferred[i]!.resolve();
    await Promise.all(running);
    expect(getActiveExtractions()).toBe(0);
    // Cancelled waiters must NOT have run their tasks.
    expect(log.some((l) => l === "start:k5")).toBe(false);
    expect(log.some((l) => l === "start:k6")).toBe(false);
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
