#!/usr/bin/env tsx
/*
 * Test: Client conflict resolution (behavioural)
 *
 * Tests the extracted resolveSetConflict function used by the session runner.
 */

import { resolveSetConflict, type ExerciseForConflict, type ConflictResult } from "../src/lib/session/conflict-reducer";

export {}; // Make this a module to avoid global scope collision

type TestExercise = ExerciseForConflict & { name: string };

let passed = 0;
let failed = 0;

function testClientConflict(name: string, fn: () => void | Promise<void>) {
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

function assertEqualClient<T>(actual: T, expected: T, msg: string = "") {
  if (actual !== expected) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${msg ? `: ${msg}` : ""}`,
    );
  }
}

async function main() {
  console.log("Testing client conflict resolution (behavioural)\n");

  // Test 1: resolveSetConflict replaces exercise sets with savedSets
  await testClientConflict("resolveSetConflict replaces exercise sets with savedSets", () => {
    const exercises: TestExercise[] = [
      { id: "ex-1", name: "Bench", sets: [], status: "pending", plannedSets: 3 },
      { id: "ex-2", name: "Row", sets: [], status: "pending", plannedSets: 4 },
    ];

    const conflict: ConflictResult = {
      ok: false,
      reason: "set_exists",
      savedSets: [
        { setNumber: 1, reps: 12, weightKg: 30, durationSeconds: null },
        { setNumber: 2, reps: 12, weightKg: 30, durationSeconds: null },
      ],
    };

    const resolution = resolveSetConflict(exercises, "ex-1", 0, conflict);

    assertEqualClient(resolution.exercises.length, 2, "Should have 2 exercises");
    assertEqualClient(resolution.exercises[0].sets.length, 2, "First exercise should have 2 sets");
    assertEqualClient(resolution.exercises[0].sets[0].reps, 12, "First set should have 12 reps");
    assertEqualClient(resolution.exercises[1].sets.length, 0, "Second exercise should be unchanged");
    assertEqualClient(resolution.message, "That set was already saved. Showing your latest sets.");
  });

  // Test 2: Advances to next unfinished exercise
  await testClientConflict("Advances to next unfinished exercise", () => {
    const exercises: TestExercise[] = [
      { id: "ex-1", name: "Bench", sets: [{ setNumber: 1, reps: 12, weightKg: 30, durationSeconds: null }], status: "pending", plannedSets: 1 },
      { id: "ex-2", name: "Row", sets: [], status: "pending", plannedSets: 3 },
    ];

    const conflict: ConflictResult = {
      ok: false,
      reason: "set_exists",
      savedSets: [{ setNumber: 1, reps: 12, weightKg: 30, durationSeconds: null }],
    };

    const resolution = resolveSetConflict(exercises, "ex-1", 0, conflict);

    assertEqualClient(resolution.nextExerciseIndex, 1, "Should advance to exercise 2");
  });

  // Test 3: Stays on current if it's still unfinished
  await testClientConflict("Stays on current if still unfinished", () => {
    const exercises: TestExercise[] = [
      { id: "ex-1", name: "Bench", sets: [], status: "pending", plannedSets: 3 },
      { id: "ex-2", name: "Row", sets: [], status: "pending", plannedSets: 3 },
    ];

    const conflict: ConflictResult = {
      ok: false,
      reason: "set_exists",
      savedSets: [{ setNumber: 1, reps: 12, weightKg: 30, durationSeconds: null }],
    };

    const resolution = resolveSetConflict(exercises, "ex-1", 0, conflict);

    assertEqualClient(resolution.nextExerciseIndex, 0, "Should stay on current exercise");
  });

  // Test 4: B1 regression - stale client re-syncs to server state
  await testClientConflict("B1: stale client re-syncs to server state", () => {
    const exercises: TestExercise[] = [
      { id: "ex-1", name: "Bench", sets: [], status: "pending", plannedSets: 3 },
    ];

    const conflict: ConflictResult = {
      ok: false,
      reason: "set_exists",
      savedSets: [
        { setNumber: 1, reps: 12, weightKg: 30, durationSeconds: null },
      ],
    };

    const resolution = resolveSetConflict(exercises, "ex-1", 0, conflict);

    assertEqualClient(resolution.exercises[0].sets.length, 1, "Should have 1 saved set");
    assertEqualClient(resolution.exercises[0].sets[0].reps, 12, "Reps should be 12");
    assertEqualClient(resolution.exercises[0].sets[0].weightKg, 30, "Weight should be 30");
  });

  // Test 5: Conflict does not affect other exercises
  await testClientConflict("Conflict does not affect other exercises", () => {
    const exercises: TestExercise[] = [
      { id: "ex-1", name: "Bench", sets: [], status: "pending", plannedSets: 3 },
      { id: "ex-2", name: "Row", sets: [{ setNumber: 1, reps: 8, weightKg: 50, durationSeconds: null }], status: "pending", plannedSets: 3 },
    ];

    const conflict: ConflictResult = {
      ok: false,
      reason: "set_exists",
      savedSets: [{ setNumber: 1, reps: 12, weightKg: 30, durationSeconds: null }],
    };

    const resolution = resolveSetConflict(exercises, "ex-1", 0, conflict);

    assertEqualClient(resolution.exercises[1].sets.length, 1, "Exercise 2 should keep its set");
    assertEqualClient(resolution.exercises[1].sets[0].reps, 8, "Exercise 2 reps unchanged");
  });

  // Test 6: Empty savedSets clears exercise sets
  await testClientConflict("Empty savedSets clears exercise sets", () => {
    const exercises: TestExercise[] = [
      { id: "ex-1", name: "Bench", sets: [{ setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null }], status: "pending", plannedSets: 3 },
    ];

    const conflict: ConflictResult = {
      ok: false,
      reason: "set_exists",
      savedSets: [],
    };

    const resolution = resolveSetConflict(exercises, "ex-1", 0, conflict);

    assertEqualClient(resolution.exercises[0].sets.length, 0, "Should clear sets");
  });

  // Summary
  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
