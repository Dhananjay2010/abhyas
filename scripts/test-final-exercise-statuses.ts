#!/usr/bin/env tsx
/**
 * Test final exercise statuses on finish and end early.
 *
 *   npx tsx scripts/test-final-exercise-statuses.ts
 */

import { finishSessionCore } from "../src/lib/session/finish-session";
import { abandonSessionCore } from "../src/lib/session/abandon-session";

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
  sessionData: unknown;
  exercisesData: unknown[];
  exerciseUpdates: Array<{ id: string; status: string }>;
  from: (table: string) => unknown;
}

function makeFakeSupabase(
  sessionData: unknown,
  exercisesData: unknown[],
  updateError?: string
): FakeSupabase {
  const fake: FakeSupabase = {
    sessionData,
    exercisesData,
    exerciseUpdates: [],
    from: (table: string) => {
      if (table === "sessions") {
        return {
          select: () => ({
            eq: async () => ({ data: [sessionData], error: null }),
          }),
          update: () => ({
            eq: () => ({
              eq: async () => ({
                error: updateError ? { message: updateError } : null,
                count: updateError ? null : 1,
              }),
            }),
          }),
        };
      } else if (table === "session_exercises") {
        return {
          select: (columns: string) => ({
            eq: async () => ({ data: exercisesData, error: null }),
          }),
          update: (payload: { status: string; completed_at?: string }) => {
            return {
              eq: (column: string, value: string) => ({
                eq: async (column2: string, value2: string) => {
                  fake.exerciseUpdates.push({ id: value, status: payload.status });
                  return { error: null };
                },
              }),
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  return fake;
}

async function runTests() {
  console.log("\nTesting final exercise statuses on finish/abandon\n");

  console.log("1. finishSession: exercise with all sets → completed");
  {
    const session = {
      started_at: new Date(Date.now() - 1800000).toISOString(),
      local_date: "2026-10-24",
      timezone: "UTC",
    };
    const exercises = [
      {
        id: "ex1",
        planned_sets: 3,
        status: "pending",
        session_sets: [
          { id: "s1", is_warmup_set: false, completed_at: new Date().toISOString() },
          { id: "s2", is_warmup_set: false, completed_at: new Date().toISOString() },
          { id: "s3", is_warmup_set: false, completed_at: new Date().toISOString() },
        ],
      },
    ];
    const fake = makeFakeSupabase(session, exercises);

    await finishSessionCore(
      fake as unknown as import("../src/lib/session/finish-session").SupabaseClient,
      { sessionId: "s1", durationSeconds: 1800, cooldownCompleted: true }
    );

    assertEquals(fake.exerciseUpdates.length, 1, "One exercise updated");
    assertEquals(fake.exerciseUpdates[0].id, "ex1", "Correct exercise ID");
    assertEquals(fake.exerciseUpdates[0].status, "completed", "Status is completed (3 of 3 sets)");
  }

  console.log("\n2. finishSession: exercise with partial sets → completed");
  {
    const session = {
      started_at: new Date(Date.now() - 1800000).toISOString(),
      local_date: "2026-10-24",
      timezone: "UTC",
    };
    const exercises = [
      {
        id: "ex2",
        planned_sets: 4,
        status: "pending",
        session_sets: [
          { id: "s1", is_warmup_set: false, completed_at: new Date().toISOString() },
          { id: "s2", is_warmup_set: false, completed_at: new Date().toISOString() },
        ],
      },
    ];
    const fake = makeFakeSupabase(session, exercises);

    await finishSessionCore(
      fake as unknown as import("../src/lib/session/finish-session").SupabaseClient,
      { sessionId: "s1", durationSeconds: 1800, cooldownCompleted: true }
    );

    assertEquals(fake.exerciseUpdates.length, 1, "One exercise updated");
    assertEquals(fake.exerciseUpdates[0].status, "completed", "Status is completed (partial = 2 of 4 sets)");
  }

  console.log("\n3. finishSession: exercise with no sets → skipped");
  {
    const session = {
      started_at: new Date(Date.now() - 1800000).toISOString(),
      local_date: "2026-10-24",
      timezone: "UTC",
    };
    const exercises = [
      {
        id: "ex3",
        planned_sets: 3,
        status: "pending",
        session_sets: [],
      },
    ];
    const fake = makeFakeSupabase(session, exercises);

    await finishSessionCore(
      fake as unknown as import("../src/lib/session/finish-session").SupabaseClient,
      { sessionId: "s1", durationSeconds: 1800, cooldownCompleted: true }
    );

    assertEquals(fake.exerciseUpdates.length, 1, "One exercise updated");
    assertEquals(fake.exerciseUpdates[0].status, "skipped", "Status is skipped (0 of 3 sets)");
  }

  console.log("\n4. abandonSession: partial exercise → completed");
  {
    const exercises = [
      {
        id: "ex4",
        planned_sets: 5,
        status: "pending",
        session_sets: [
          { id: "s1", is_warmup_set: false },
          { id: "s2", is_warmup_set: false },
          { id: "s3", is_warmup_set: false },
        ],
      },
    ];
    const fake = makeFakeSupabase({}, exercises);

    await abandonSessionCore(
      fake as unknown as import("../src/lib/session/abandon-session").SupabaseClient,
      "s1",
      1200
    );

    assertEquals(fake.exerciseUpdates.length, 1, "One exercise updated");
    assertEquals(fake.exerciseUpdates[0].status, "completed", "Status is completed (partial = 3 of 5 sets)");
  }

  console.log("\n5. finishSession: mix of completed, partial, and skipped");
  {
    const session = {
      started_at: new Date(Date.now() - 1800000).toISOString(),
      local_date: "2026-10-24",
      timezone: "UTC",
    };
    const exercises = [
      {
        id: "ex5a",
        planned_sets: 3,
        status: "pending",
        session_sets: [
          { id: "s1", is_warmup_set: false, completed_at: new Date().toISOString() },
          { id: "s2", is_warmup_set: false, completed_at: new Date().toISOString() },
          { id: "s3", is_warmup_set: false, completed_at: new Date().toISOString() },
        ],
      },
      {
        id: "ex5b",
        planned_sets: 4,
        status: "pending",
        session_sets: [
          { id: "s4", is_warmup_set: false, completed_at: new Date().toISOString() },
        ],
      },
      {
        id: "ex5c",
        planned_sets: 3,
        status: "pending",
        session_sets: [],
      },
    ];
    const fake = makeFakeSupabase(session, exercises);

    await finishSessionCore(
      fake as unknown as import("../src/lib/session/finish-session").SupabaseClient,
      { sessionId: "s1", durationSeconds: 1800, cooldownCompleted: true }
    );

    assertEquals(fake.exerciseUpdates.length, 3, "Three exercises updated");
    assertEquals(fake.exerciseUpdates[0].status, "completed", "Ex 5a: completed (3 of 3)");
    assertEquals(fake.exerciseUpdates[1].status, "completed", "Ex 5b: completed (partial 1 of 4)");
    assertEquals(fake.exerciseUpdates[2].status, "skipped", "Ex 5c: skipped (0 of 3)");
  }

  console.log("\n6. finishSession: already-completed exercises not updated");
  {
    const session = {
      started_at: new Date(Date.now() - 1800000).toISOString(),
      local_date: "2026-10-24",
      timezone: "UTC",
    };
    const exercises = [
      {
        id: "ex6",
        planned_sets: 3,
        status: "completed",
        session_sets: [
          { id: "s1", is_warmup_set: false, completed_at: new Date().toISOString() },
          { id: "s2", is_warmup_set: false, completed_at: new Date().toISOString() },
          { id: "s3", is_warmup_set: false, completed_at: new Date().toISOString() },
        ],
      },
    ];
    const fake = makeFakeSupabase(session, exercises);

    await finishSessionCore(
      fake as unknown as import("../src/lib/session/finish-session").SupabaseClient,
      { sessionId: "s1", durationSeconds: 1800, cooldownCompleted: true }
    );

    assertEquals(fake.exerciseUpdates.length, 0, "No updates for already-completed exercises");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }

  console.log("\n✨ All final exercise status tests passed!");
}

runTests();
