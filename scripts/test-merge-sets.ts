#!/usr/bin/env tsx
/*
 * Test: Merge server sets with local confirmed saves (behavioural)
 *
 * Tests the merge function that prevents dropping local confirmed saves
 * when router.refresh or resync brings stale server data.
 *
 * Case B1-B: Set 4 showed empty after it was saved.
 */

import { mergeSets, type ExerciseWithSets } from "../src/lib/session/merge-sets";

export {}; // Make this a module

let passed = 0;
let failed = 0;

function testMerge(name: string, fn: () => void | Promise<void>) {
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

type TestExercise = ExerciseWithSets & { name: string };

async function main() {
  console.log("Testing merge-sets (behavioural)\n");

  // Test 1: Server has all sets, local has subset - use server
  await testMerge("Server has all sets, local has subset → use server", () => {
    const local: TestExercise[] = [
      {
        id: "ex-1",
        name: "Bench",
        sets: [
          { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 2, reps: 10, weightKg: 60, durationSeconds: null },
        ],
      },
    ];

    const server: TestExercise[] = [
      {
        id: "ex-1",
        name: "Bench",
        sets: [
          { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 2, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 3, reps: 10, weightKg: 60, durationSeconds: null },
        ],
      },
    ];

    const merged = mergeSets(local, server);

    assertEqual(merged[0].sets.length, 3, "Should have all 3 server sets");
    assertEqual(merged[0].sets[2].setNumber, 3, "Should have set 3");
  });

  // Test 2: Local has confirmed save (set 4), server doesn't yet - keep local set 4
  // This is the "refresh-before-save-lands" case
  await testMerge("Case (B): refresh-before-save-lands → keep local set 4", () => {
    const local: TestExercise[] = [
      {
        id: "ex-1",
        name: "Bench",
        sets: [
          { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 2, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 3, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 4, reps: 12, weightKg: 65, durationSeconds: null }, // Just saved locally
        ],
      },
    ];

    const server: TestExercise[] = [
      {
        id: "ex-1",
        name: "Bench",
        sets: [
          // Server only has 3 sets (stale, before set 4 landed)
          { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 2, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 3, reps: 10, weightKg: 60, durationSeconds: null },
        ],
      },
    ];

    const merged = mergeSets(local, server);

    assertEqual(merged[0].sets.length, 4, "Should keep local set 4 that's not in server yet");
    assertEqual(merged[0].sets[3].setNumber, 4, "Should have set 4");
    assertEqual(merged[0].sets[3].reps, 12, "Should preserve set 4's reps");
    assertEqual(merged[0].sets[3].weightKg, 65, "Should preserve set 4's weight");
  });

  // Test 3: Both have set 3, server's is different - use server's version (landed truth)
  await testMerge("Both have set 3, server's differs → use server", () => {
    const local: TestExercise[] = [
      {
        id: "ex-1",
        name: "Bench",
        sets: [
          { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 2, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 3, reps: 8, weightKg: 62, durationSeconds: null }, // Local optimistic
        ],
      },
    ];

    const server: TestExercise[] = [
      {
        id: "ex-1",
        name: "Bench",
        sets: [
          { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 2, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 3, reps: 9, weightKg: 63, durationSeconds: null }, // Server has different values
        ],
      },
    ];

    const merged = mergeSets(local, server);

    assertEqual(merged[0].sets.length, 3, "Should have 3 sets");
    assertEqual(merged[0].sets[2].reps, 9, "Should use server's reps");
    assertEqual(merged[0].sets[2].weightKg, 63, "Should use server's weight");
  });

  // Test 4: Multiple exercises, some with local-only sets
  await testMerge("Multiple exercises with mixed local/server sets", () => {
    const local: TestExercise[] = [
      {
        id: "ex-1",
        name: "Bench",
        sets: [
          { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 2, reps: 10, weightKg: 60, durationSeconds: null },
        ],
      },
      {
        id: "ex-2",
        name: "Row",
        sets: [
          { setNumber: 1, reps: 12, weightKg: 50, durationSeconds: null },
          { setNumber: 2, reps: 12, weightKg: 50, durationSeconds: null },
          { setNumber: 3, reps: 12, weightKg: 50, durationSeconds: null }, // Local confirmed
        ],
      },
    ];

    const server: TestExercise[] = [
      {
        id: "ex-1",
        name: "Bench",
        sets: [
          { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 2, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 3, reps: 10, weightKg: 60, durationSeconds: null }, // Server has set 3 for ex-1
        ],
      },
      {
        id: "ex-2",
        name: "Row",
        sets: [
          { setNumber: 1, reps: 12, weightKg: 50, durationSeconds: null },
          { setNumber: 2, reps: 12, weightKg: 50, durationSeconds: null },
          // Server doesn't have ex-2 set 3 yet
        ],
      },
    ];

    const merged = mergeSets(local, server);

    assertEqual(merged[0].sets.length, 3, "Ex-1 should have 3 sets from server");
    assertEqual(merged[1].sets.length, 3, "Ex-2 should keep local set 3");
    assertEqual(merged[1].sets[2].setNumber, 3, "Ex-2 should have set 3");
  });

  // Test 5: Empty server (initial load) - keep local
  await testMerge("Empty server exercises → keep local", () => {
    const local: TestExercise[] = [
      {
        id: "ex-1",
        name: "Bench",
        sets: [{ setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null }],
      },
    ];

    const server: TestExercise[] = [
      {
        id: "ex-1",
        name: "Bench",
        sets: [],
      },
    ];

    const merged = mergeSets(local, server);

    assertEqual(merged[0].sets.length, 1, "Should keep local set");
  });

  // Test 6: MUTANT TEST - Always take server data only (drops confirmed local saves)
  await testMerge("MUTANT: always take server → SHOULD FAIL", async () => {
    const local: TestExercise[] = [
      {
        id: "ex-1",
        name: "Bench",
        sets: [
          { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 2, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 3, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 4, reps: 12, weightKg: 65, durationSeconds: null }, // Local confirmed
        ],
      },
    ];

    const server: TestExercise[] = [
      {
        id: "ex-1",
        name: "Bench",
        sets: [
          { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 2, reps: 10, weightKg: 60, durationSeconds: null },
          { setNumber: 3, reps: 10, weightKg: 60, durationSeconds: null },
          // Server doesn't have set 4
        ],
      },
    ];

    // Mutant implementation: always return server data only
    const mutant = (local: TestExercise[], server: TestExercise[]): TestExercise[] => {
      return server; // WRONG: drops local confirmed saves
    };

    const merged = mutant(local, server);

    // This should fail because mutant drops set 4
    if (merged[0].sets.length === 3) {
      throw new Error("MUTANT SURVIVED: Dropped local confirmed save (set 4)");
    }

    // If mutant is killed, this assertion would pass
    assertEqual(merged[0].sets.length, 4, "Should preserve local set 4");
  });

  // Summary
  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
