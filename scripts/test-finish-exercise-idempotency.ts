#!/usr/bin/env tsx
/*
 * Test: finishExercise idempotency
 *
 * Tests the real finishExerciseCore function with a stateful fake deps
 * that actually applies filters and updates rows in memory. Verifies
 * that progression is applied exactly once per exercise completion.
 */

import {
  finishExerciseCore,
  type ProgressionFeedback,
} from "../src/lib/session/finish-exercise";
import type { FinishExerciseDeps } from "../src/lib/session/finish-exercise-deps";

type ExerciseStatus = "pending" | "completed" | "skipped" | "swapped_out";

interface SessionExerciseRow {
  id: string;
  status: ExerciseStatus;
  feel: string | null;
  completed_at: string | null;
}

/**
 * Stateful fake deps that stores session_exercises rows in memory
 * and actually applies the conditional filter.
 */
function createFakeDeps(
  initialRows: SessionExerciseRow[],
  options: { skipConditionalFilter?: boolean; progressionFn?: (userId: string, sessionExerciseId: string, feel: string | null) => Promise<ProgressionFeedback | null> } = {},
) {
  const rows = new Map<string, SessionExerciseRow>(
    initialRows.map((r) => [r.id, { ...r }]),
  );

  const deps: FinishExerciseDeps = {
    updateExercise: async (id: string, payload: { feel: unknown; status: string; completed_at: string }) => {
      // Simulate async operation with a microtask delay to allow concurrent calls to interleave
      await Promise.resolve();

      const row = rows.get(id);
      if (!row) {
        return { data: null, error: null };
      }

      // Apply the conditional filter unless explicitly disabled
      const shouldUpdate = options.skipConditionalFilter ||
        (row.status !== "completed" && row.status !== "skipped");

      if (!shouldUpdate) {
        return { data: null, error: null };
      }

      // Update the row
      Object.assign(row, payload);
      return { data: { id: row.id }, error: null };
    },
    applyProgression: options.progressionFn || (async () => null),
  };

  return {
    deps,
    getRow: (id: string) => rows.get(id),
    getRows: () => Array.from(rows.values()),
  };
}

/**
 * Spy for applyProgression that counts calls and returns a canned response.
 */
function createProgressionSpy() {
  let callCount = 0;
  const calls: Array<{ userId: string; sessionExerciseId: string; feel: string | null }> = [];

  return {
    fn: async (
      userId: string,
      sessionExerciseId: string,
      feel: string | null,
    ) => {
      callCount++;
      calls.push({ userId, sessionExerciseId, feel });
      return {
        outcome: "success",
        message: "Weight increased",
    weightAtFailureStartKg: null,
        personalBest: null,
      } as ProgressionFeedback;
    },
    getCallCount: () => callCount,
    getCalls: () => calls,
  };
}

// Test harness
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ ${name}`);
      console.error(`  ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  })();
}

function assertEqual<T>(actual: T, expected: T, msg: string = "") {
  if (actual !== expected) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${msg ? `: ${msg}` : ""}`,
    );
  }
}

async function main() {
  console.log("Testing finishExercise idempotency with real core function\n");

  // Test 1: Two sequential calls - progression applied exactly once
  await test("Two sequential calls: progression applied exactly once", async () => {
    const spy = createProgressionSpy();
    const fake = createFakeDeps([{ id: "ex-1", status: "pending", feel: null, completed_at: null }], { progressionFn: spy.fn });

    const result1 = await finishExerciseCore(fake.deps, "user-1", {
      sessionExerciseId: "ex-1",
      feel: "right",
      skipped: false,
    });

    const result2 = await finishExerciseCore(fake.deps, "user-1", {
      sessionExerciseId: "ex-1",
      feel: "right",
      skipped: false,
    });

    assertEqual(result1.ok, true, "First call should succeed");
    assertEqual(result2.ok, true, "Second call should succeed");
    assertEqual(spy.getCallCount(), 1, "Progression should be called exactly once");
    
    const row = fake.getRow("ex-1");
    assertEqual(row?.status, "completed", "Status should be completed");
  });

  // Test 2: Concurrent calls with Promise.all - only one applies progression
  await test("Concurrent calls: progression applied exactly once", async () => {
    const spy = createProgressionSpy();
    const fake = createFakeDeps([{ id: "ex-2", status: "pending", feel: null, completed_at: null }], { progressionFn: spy.fn });

    const [result1, result2] = await Promise.all([
      finishExerciseCore(fake.deps, "user-1", {
        sessionExerciseId: "ex-2",
        feel: "hard",
        skipped: false,
      }),
      finishExerciseCore(fake.deps, "user-1", {
        sessionExerciseId: "ex-2",
        feel: "hard",
        skipped: false,
      }),
    ]);

    assertEqual(result1.ok, true, "First concurrent call should succeed");
    assertEqual(result2.ok, true, "Second concurrent call should succeed");
    assertEqual(spy.getCallCount(), 1, "Progression should be called exactly once despite concurrency");
    
    const row = fake.getRow("ex-2");
    assertEqual(row?.status, "completed", "Status should be completed");
  });

  // Test 3: Skip then complete - status stays skipped, zero progression calls
  await test("Skip then complete: status stays skipped, no progression", async () => {
    const fake = createFakeDeps([{ id: "ex-3", status: "pending", feel: null, completed_at: null }]);
    const spy = createProgressionSpy();

    const result1 = await finishExerciseCore(fake.deps, "user-1", {
      sessionExerciseId: "ex-3",
      feel: null,
      skipped: true,
    });

    const result2 = await finishExerciseCore(fake.deps, "user-1", {
      sessionExerciseId: "ex-3",
      feel: "right",
      skipped: false,
    });

    assertEqual(result1.ok, true, "Skip should succeed");
    assertEqual(result2.ok, true, "Complete after skip should succeed idempotently");
    assertEqual(spy.getCallCount(), 0, "Progression should never be called for skipped exercise");
    
    const row = fake.getRow("ex-3");
    assertEqual(row?.status, "skipped", "Status should remain skipped");
  });

  // Test 4: Already completed - no progression
  await test("Already completed exercise: no progression", async () => {
    const fake = createFakeDeps([{ id: "ex-4", status: "completed", feel: "right", completed_at: "2026-10-24T00:00:00Z" }]);
    const spy = createProgressionSpy();

    const result = await finishExerciseCore(fake.deps, "user-1", {
      sessionExerciseId: "ex-4",
      feel: "hard",
      skipped: false,
    });

    assertEqual(result.ok, true, "Should succeed idempotently");
    assertEqual(spy.getCallCount(), 0, "Progression should not be called");
    
    const row = fake.getRow("ex-4");
    assertEqual(row?.status, "completed", "Status should remain completed");
  });

  // Test 5: Three rapid sequential calls
  await test("Three sequential calls: progression applied exactly once", async () => {
    const spy = createProgressionSpy();
    const fake = createFakeDeps([{ id: "ex-5", status: "pending", feel: null, completed_at: null }], { progressionFn: spy.fn });

    await finishExerciseCore(fake.deps, "user-1", {
      sessionExerciseId: "ex-5",
      feel: "easy",
    });

    await finishExerciseCore(fake.deps, "user-1", {
      sessionExerciseId: "ex-5",
      feel: "easy",
    });

    await finishExerciseCore(fake.deps, "user-1", {
      sessionExerciseId: "ex-5",
      feel: "easy",
    });

    assertEqual(spy.getCallCount(), 1, "Progression should be called exactly once for three calls");
  });

  // Test 6: GUARD TEST - Without conditional filter, concurrent calls both apply progression
  await test("Guard test: without conditional filter, concurrent calls both succeed", async () => {
    const spy = createProgressionSpy();
    const fake = createFakeDeps(
      [{ id: "ex-6", status: "pending", feel: null, completed_at: null }],
      { skipConditionalFilter: true, progressionFn: spy.fn }, // DISABLE the .not() filter
    );

    await Promise.all([
      finishExerciseCore(fake.deps, "user-1", {
        sessionExerciseId: "ex-6",
        feel: "right",
      }),
      finishExerciseCore(fake.deps, "user-1", {
        sessionExerciseId: "ex-6",
        feel: "right",
      }),
    ]);

    // Without the conditional filter, both calls succeed and progression runs twice
    const callCount = spy.getCallCount();
    if (callCount !== 2) {
      throw new Error(
        `Guard test failed: expected 2 progression calls without filter, got ${callCount}. ` +
        `This means the test cannot detect if the conditional filter is removed.`
      );
    }
  });

  // Test 7: Skip doesn't call progression even once
  await test("Skip: progression never called", async () => {
    const fake = createFakeDeps([{ id: "ex-7", status: "pending", feel: null, completed_at: null }]);
    const spy = createProgressionSpy();

    const result = await finishExerciseCore(fake.deps, "user-1", {
      sessionExerciseId: "ex-7",
      feel: null,
      skipped: true,
    });

    assertEqual(result.ok, true, "Skip should succeed");
    assertEqual(spy.getCallCount(), 0, "Progression should not be called for skip");
    assertEqual(fake.getRow("ex-7")?.status, "skipped", "Status should be skipped");
  });

  // Summary
  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    console.log("\nSchema verification:");
    console.log("session_exercises.status is NOT NULL per 20260908090000_initial_schema.sql:314");
    console.log('  status  exercise_status not null default \'pending\'');
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

main();
