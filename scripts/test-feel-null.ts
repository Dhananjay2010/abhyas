#!/usr/bin/env tsx
/**
 * Test feel storage: null unless user chose one.
 *
 *   npx tsx scripts/test-feel-null.ts
 */

import { finishExerciseCore } from "../src/lib/session/finish-exercise";
import type { FinishExerciseDeps } from "../src/lib/session/finish-exercise-deps";

let passed = 0;
let failed = 0;

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function makeFakeDeps() {
  const storedFeel: { value: unknown } = { value: undefined };
  
  return {
    get storedFeel() { return storedFeel.value; },
    updateExercise: async (id: string, patch: { feel: unknown; status: string; completed_at: string }) => {
      storedFeel.value = patch.feel;
      return { data: { id }, error: null };
    },
  };
}

async function runTests() {
  console.log("\nTesting feel storage\n");

  console.log("1. User chooses 'easy' -> feel stored as 'easy'");
  {
    const fake = makeFakeDeps();
    await finishExerciseCore(
      fake,
      "user1",
      {
        sessionExerciseId: "ex1",
        feel: "easy",
        skipped: false,
      },
      { applyProgression: async () => null },
      null,
    );
    assertEquals(fake.storedFeel, "easy", "Stores 'easy'");
  }

  console.log("\n2. User chooses 'right' -> feel stored as 'right'");
  {
    const fake = makeFakeDeps();
    await finishExerciseCore(
      fake,
      "user1",
      {
        sessionExerciseId: "ex1",
        feel: "right",
        skipped: false,
      },
      { applyProgression: async () => null },
      null,
    );
    assertEquals(fake.storedFeel, "right", "Stores 'right'");
  }

  console.log("\n3. User chooses 'hard' -> feel stored as 'hard'");
  {
    const fake = makeFakeDeps();
    await finishExerciseCore(
      fake,
      "user1",
      {
        sessionExerciseId: "ex1",
        feel: "hard",
        skipped: false,
      },
      { applyProgression: async () => null },
      null,
    );
    assertEquals(fake.storedFeel, "hard", "Stores 'hard'");
  }

  console.log("\n4. User doesn't choose (null) -> feel stored as null");
  {
    const fake = makeFakeDeps();
    await finishExerciseCore(
      fake,
      "user1",
      {
        sessionExerciseId: "ex1",
        feel: null,
        skipped: false,
      },
      { applyProgression: async () => null },
      null,
    );
    assertEquals(fake.storedFeel, null, "Stores null");
  }

  console.log("\n5. User skips exercise -> feel NOT stored (row not updated)");
  {
    const fake = makeFakeDeps();
    await finishExerciseCore(
      fake,
      "user1",
      {
        sessionExerciseId: "ex1",
        feel: null,
        skipped: true,
      },
      { applyProgression: async () => null },
      null,
    );
    assertEquals(fake.storedFeel, null, "Skipped exercise doesn't store feel");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }

  console.log("\n✨ All feel storage tests passed!");
}

runTests();
