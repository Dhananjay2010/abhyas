#!/usr/bin/env tsx
/*
 * Test: Exercises reducer integration with mergeSets
 *
 * Tests that the resume path (merge action) actually calls mergeSets
 * to prevent dropping confirmed local saves when router.refresh brings stale server data.
 *
 * Regression: If mergeSets is not called in the reducer, local sets are lost on resume.
 */

import { exercisesReducer } from "../src/lib/session/exercises-reducer";
import type { ExerciseWithSets } from "../src/lib/session/merge-sets";

export {}; // Make this a module

let passed = 0;
let failed = 0;

function testReducer(name: string, fn: () => void | Promise<void>) {
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

type TestExercise = ExerciseWithSets & { name: string; status: string };

async function main() {
  console.log("Testing exercises reducer (resume/merge integration)\n");

  // Test 1: 'set' action replaces state completely
  await testReducer("'set' action replaces state", () => {
    const initial: TestExercise[] = [
      {
        id: "ex-1",
        name: "Bench",
        status: "pending",
        sets: [{ setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null }],
      },
    ];

    const newState: TestExercise[] = [
      {
        id: "ex-2",
        name: "Squat",
        status: "pending",
        sets: [{ setNumber: 1, reps: 12, weightKg: 80, durationSeconds: null }],
      },
    ];

    const result = exercisesReducer(initial, { type: "set", exercises: newState });

    assertEqual(result.length, 1, "Should have one exercise");
    assertEqual(result[0].id, "ex-2", "Should have new exercise");
    assertEqual((result[0] as TestExercise).name, "Squat", "Should be Squat");
  });

  // Test 2: 'merge' action calls mergeSets (Case B: resume after local save)
  // Local has set 3 that server doesn't have yet (refresh before save landed)
  await testReducer("'merge' action calls mergeSets - keeps local set not in server", () => {
    const localState: TestExercise[] = [
      {
        id: "ex-1",
        name: "Bench",
        status: "in-progress",
        sets: [
          { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 2, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 3, reps: 12, weightKg: 65, durationSeconds: null }, // Just saved locally
        ],
      },
    ];

    const serverData: TestExercise[] = [
      {
        id: "ex-1",
        name: "Bench",
        status: "in-progress",
        sets: [
          // Server is stale, only has 2 sets (before set 3 landed)
          { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 2, reps: 10, weightKg: 60, durationSeconds: null },
        ],
      },
    ];

    const result = exercisesReducer(localState, { type: "merge", serverData });

    assertEqual(result.length, 1, "Should have one exercise");
    assertEqual(result[0].sets.length, 3, "Should keep local set 3 that's not in server yet");
    assertEqual(result[0].sets[2].setNumber, 3, "Should have set 3");
    assertEqual(result[0].sets[2].reps, 12, "Should preserve set 3's reps");
    assertEqual(result[0].sets[2].weightKg, 65, "Should preserve set 3's weight");
  });

  // Test 3: 'merge' action calls mergeSets - server has more sets, use server
  await testReducer("'merge' action calls mergeSets - server has more sets", () => {
    const localState: TestExercise[] = [
      {
        id: "ex-1",
        name: "Bench",
        status: "in-progress",
        sets: [
          { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 2, reps: 10, weightKg: 60, durationSeconds: null },
        ],
      },
    ];

    const serverData: TestExercise[] = [
      {
        id: "ex-1",
        name: "Bench",
        status: "in-progress",
        sets: [
          { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 2, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 3, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 4, reps: 10, weightKg: 60, durationSeconds: null },
        ],
      },
    ];

    const result = exercisesReducer(localState, { type: "merge", serverData });

    assertEqual(result.length, 1, "Should have one exercise");
    assertEqual(result[0].sets.length, 4, "Should use server's 4 sets");
    assertEqual(result[0].sets[3].setNumber, 4, "Should have set 4");
  });

  // Test 4: Resume path preserves local confirmed saves via mergeSets
  // This test documents the expected behavior: local set survives merge
  await testReducer("Resume path preserves local confirmed saves via mergeSets", () => {
    const localState: TestExercise[] = [
      {
        id: "ex-1",
        name: "Deadlift",
        status: "in-progress",
        sets: [
          { setNumber: 1, reps: 8, weightKg: 100, durationSeconds: null },
          { setNumber: 2, reps: 8, weightKg: 105, durationSeconds: null },
          { setNumber: 3, reps: 8, weightKg: 110, durationSeconds: null }, // Local save, not on server yet
        ],
      },
    ];

    const serverData: TestExercise[] = [
      {
        id: "ex-1",
        name: "Deadlift",
        status: "in-progress",
        sets: [
          { setNumber: 1, reps: 8, weightKg: 100, durationSeconds: null },
          { setNumber: 2, reps: 8, weightKg: 105, durationSeconds: null },
          // Missing set 3 (stale server data from before it landed)
        ],
      },
    ];

    const result = exercisesReducer(localState, { type: "merge", serverData });

    // If mergeSets is NOT called (mutant), result would have only 2 sets (from server)
    // With mergeSets called (correct), result keeps local set 3
    assertEqual(result[0].sets.length, 3, "mergeSets must be called to keep local set 3");
    assertEqual(result[0].sets[2].weightKg, 110, "Local set 3's weight must be preserved");
  });

  // Summary
  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
