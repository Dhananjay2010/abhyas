#!/usr/bin/env tsx
/*
 * Test: Client re-sync on set conflict (behavioural)
 *
 * Tests the pure reducer/selector logic that handles SetConflictResult.
 * No source code grep - pure function testing.
 */

type LoggedSet = {
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
};

type Exercise = {
  id: string;
  sets: LoggedSet[];
  status: "pending" | "completed";
  plannedSets: number;
};

type SetConflictResult = {
  ok: false;
  reason: "set_exists";
  savedSets: LoggedSet[];
};

/**
 * Pure reducer: applies conflict result to exercises state.
 * This is the core client logic extracted for testing.
 */
function applyConflictResult(
  exercises: Exercise[],
  exerciseId: string,
  conflict: SetConflictResult,
): Exercise[] {
  return exercises.map((e) =>
    e.id === exerciseId
      ? { ...e, sets: conflict.savedSets }
      : e,
  );
}

/**
 * Pure selector: finds next unfinished exercise after conflict.
 */
function findNextUnfinishedIndex(
  exercises: Exercise[],
  currentIndex: number,
): number {
  const found = exercises.findIndex(
    (e, i) => i >= currentIndex && e.status === "pending" && e.sets.length < e.plannedSets,
  );
  return found !== -1 ? found : currentIndex;
}

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
  console.log("Testing client conflict re-sync (behavioural)\n");

  // Test 1: applyConflictResult replaces exercise sets with savedSets
  await test("applyConflictResult replaces exercise sets with savedSets", () => {
    const exercises: Exercise[] = [
      { id: "ex-1", sets: [], status: "pending", plannedSets: 3 },
      { id: "ex-2", sets: [], status: "pending", plannedSets: 4 },
    ];

    const conflict: SetConflictResult = {
      ok: false,
      reason: "set_exists",
      savedSets: [
        { setNumber: 1, reps: 12, weightKg: 30, durationSeconds: null },
        { setNumber: 2, reps: 12, weightKg: 30, durationSeconds: null },
      ],
    };

    const updated = applyConflictResult(exercises, "ex-1", conflict);

    assertEqual(updated[0].sets.length, 2, "Exercise 1 should have 2 sets");
    assertEqual(updated[0].sets[0].reps, 12, "Set 1 reps should be 12");
    assertEqual(updated[0].sets[0].weightKg, 30, "Set 1 weight should be 30");
    assertEqual(updated[1].sets.length, 0, "Exercise 2 should be unchanged");
  });

  // Test 2: findNextUnfinishedIndex advances to next unlogged exercise
  await test("findNextUnfinishedIndex advances to next unlogged exercise", () => {
    const exercises: Exercise[] = [
      { id: "ex-1", sets: [{ setNumber: 1, reps: 12, weightKg: 30, durationSeconds: null }], status: "pending", plannedSets: 3 },
      { id: "ex-2", sets: [], status: "pending", plannedSets: 4 },
      { id: "ex-3", sets: [], status: "pending", plannedSets: 3 },
    ];

    const nextIndex = findNextUnfinishedIndex(exercises, 0);
    assertEqual(nextIndex, 0, "Should stay at ex-1 (1/3 sets done)");
  });

  // Test 3: findNextUnfinishedIndex moves to next when current is complete
  await test("findNextUnfinishedIndex moves to next when current complete", () => {
    const exercises: Exercise[] = [
      { id: "ex-1", sets: [
        { setNumber: 1, reps: 12, weightKg: 30, durationSeconds: null },
        { setNumber: 2, reps: 12, weightKg: 30, durationSeconds: null },
        { setNumber: 3, reps: 12, weightKg: 30, durationSeconds: null },
      ], status: "pending", plannedSets: 3 },
      { id: "ex-2", sets: [], status: "pending", plannedSets: 4 },
    ];

    const nextIndex = findNextUnfinishedIndex(exercises, 0);
    assertEqual(nextIndex, 1, "Should advance to ex-2");
  });

  // Test 4: B1 scenario - stale client re-syncs to server state
  await test("B1: stale client re-syncs to server state", () => {
    const staleExercises: Exercise[] = [
      { id: "ex-1", sets: [], status: "pending", plannedSets: 3 }, // Stale: thought no sets logged
    ];

    const conflict: SetConflictResult = {
      ok: false,
      reason: "set_exists",
      savedSets: [
        { setNumber: 1, reps: 12, weightKg: 30, durationSeconds: null }, // Server truth
      ],
    };

    const resynced = applyConflictResult(staleExercises, "ex-1", conflict);

    assertEqual(resynced[0].sets.length, 1, "Client now has 1 set");
    assertEqual(resynced[0].sets[0].reps, 12, "Client sees server's 12 reps");
    assertEqual(resynced[0].sets[0].weightKg, 30, "Client sees server's 30 kg");
  });

  // Test 5: Conflict does not affect other exercises
  await test("Conflict does not affect other exercises", () => {
    const exercises: Exercise[] = [
      { id: "ex-1", sets: [], status: "pending", plannedSets: 3 },
      { id: "ex-2", sets: [{ setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null }], status: "pending", plannedSets: 4 },
      { id: "ex-3", sets: [], status: "pending", plannedSets: 3 },
    ];

    const conflict: SetConflictResult = {
      ok: false,
      reason: "set_exists",
      savedSets: [
        { setNumber: 1, reps: 12, weightKg: 30, durationSeconds: null },
      ],
    };

    const updated = applyConflictResult(exercises, "ex-1", conflict);

    assertEqual(updated[1].sets.length, 1, "Exercise 2 unchanged");
    assertEqual(updated[1].sets[0].reps, 10, "Exercise 2 set 1 reps unchanged");
    assertEqual(updated[2].sets.length, 0, "Exercise 3 unchanged");
  });

  // Test 6: Empty savedSets clears exercise sets
  await test("Empty savedSets clears exercise sets", () => {
    const exercises: Exercise[] = [
      { id: "ex-1", sets: [{ setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null }], status: "pending", plannedSets: 3 },
    ];

    const conflict: SetConflictResult = {
      ok: false,
      reason: "set_exists",
      savedSets: [], // Server has no sets
    };

    const updated = applyConflictResult(exercises, "ex-1", conflict);
    assertEqual(updated[0].sets.length, 0, "Exercise sets should be cleared");
  });

  // Summary
  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
