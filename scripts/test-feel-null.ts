#!/usr/bin/env tsx
/**
 * Test feel storage: null unless user chose one.
 *
 *   npx tsx scripts/test-feel-null.ts
 */

import { finishExerciseCore } from "../src/lib/session/finish-exercise";

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
    applyProgression: async () => null,
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
    );
    assertEquals(fake.storedFeel, null, "Stores null");
  }

  console.log("\n5. User skips exercise -> feel is still stored (row is updated, progression skipped)");
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
    );
    assertEquals(fake.storedFeel, null, "Skipped exercise stores feel (but doesn't apply progression)");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }

  console.log("\n✨ All feel storage tests passed!");
}

runTests();
