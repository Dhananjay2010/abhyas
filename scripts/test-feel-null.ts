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

interface FakeSupabase {
  storedFeel: unknown;
  from: (table: string) => unknown;
}

function makeFakeSupabase(): FakeSupabase {
  const fake: FakeSupabase = {
    storedFeel: undefined,
    from: (table: string) => {
      if (table !== "session_exercises") throw new Error(`Unexpected table: ${table}`);
      return {
        update: (payload: { feel: unknown; status: string; completed_at: string }) => {
          fake.storedFeel = payload.feel;
          return {
            eq: () => ({
              not: () => ({
                select: async () => ({ data: [{ id: "ex1" }], error: null }),
              }),
            }),
          };
        },
      };
    },
  };
  return fake;
}

async function runTests() {
  console.log("\nTesting feel storage\n");

  console.log("1. User chooses 'easy' -> feel stored as 'easy'");
  {
    const fake = makeFakeSupabase();
    await finishExerciseCore(
      fake as unknown as import("../src/lib/session/finish-exercise").SupabaseClient,
      "user1",
      {
        sessionExerciseId: "ex1",
        feel: "easy",
        skipped: false,
      },
      {
        applyProgression: async () => null,
      },
    );
    assertEquals(fake.storedFeel, "easy", "Stores 'easy'");
  }

  console.log("\n2. User chooses 'right' -> feel stored as 'right'");
  {
    const fake = makeFakeSupabase();
    await finishExerciseCore(
      fake as unknown as import("../src/lib/session/finish-exercise").SupabaseClient,
      "user1",
      {
        sessionExerciseId: "ex1",
        feel: "right",
        skipped: false,
      },
      {
        applyProgression: async () => null,
      },
    );
    assertEquals(fake.storedFeel, "right", "Stores 'right'");
  }

  console.log("\n3. User chooses 'hard' -> feel stored as 'hard'");
  {
    const fake = makeFakeSupabase();
    await finishExerciseCore(
      fake as unknown as import("../src/lib/session/finish-exercise").SupabaseClient,
      "user1",
      {
        sessionExerciseId: "ex1",
        feel: "hard",
        skipped: false,
      },
      {
        applyProgression: async () => null,
      },
    );
    assertEquals(fake.storedFeel, "hard", "Stores 'hard'");
  }

  console.log("\n4. User doesn't choose (feel=null) -> feel stored as null");
  {
    const fake = makeFakeSupabase();
    await finishExerciseCore(
      fake as unknown as import("../src/lib/session/finish-exercise").SupabaseClient,
      "user1",
      {
        sessionExerciseId: "ex1",
        feel: null,
        skipped: false,
      },
      {
        applyProgression: async () => null,
      },
    );
    assertEquals(fake.storedFeel, null, "Stores null when not chosen");
  }

  console.log("\n5. Skipped exercise -> feel stored as provided (can be null)");
  {
    const fake = makeFakeSupabase();
    await finishExerciseCore(
      fake as unknown as import("../src/lib/session/finish-exercise").SupabaseClient,
      "user1",
      {
        sessionExerciseId: "ex1",
        feel: null,
        skipped: true,
      },
      {
        applyProgression: async () => null,
      },
    );
    assertEquals(fake.storedFeel, null, "Stores null for skipped");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }

  console.log("\n✨ All feel storage tests passed!");
}

runTests();
