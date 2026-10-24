#!/usr/bin/env tsx
/**
 * Test that finish-session-deps correctly maps rest_seconds from query results.
 *
 * Catches break 12a: if the deps mapping drops rest_seconds, stale sessions
 * won't add rest intervals and will end immediately at last set.
 *
 *   npx tsx scripts/test-finish-rest-seconds-mapping.ts
 */

import { makeFinishSessionDeps } from "../src/lib/session/finish-session-deps";

let passed = 0;
let failed = 0;

function assertTrue(condition: boolean, message: string, detail?: string) {
  if (condition) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}${detail ? ` -- ${detail}` : ""}`);
    failed++;
  }
}

// Mock Supabase client with a rest_seconds field in exercise query
function makeFakeClient(restSeconds: number | null) {
  return {
    from: (table: string) => {
      if (table === "sessions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "session-1",
                  user_id: "user-1",
                  started_at: "2026-10-24T08:00:00Z",
                  status: "in_progress" as const,
                },
                error: null,
              }),
            }),
          }),
        };
      } else if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "user-1", timezone: "UTC" },
                error: null,
              }),
            }),
          }),
        };
      } else if (table === "session_exercises") {
        return {
          select: () => ({
            eq: () => ({
              data: [
                {
                  id: "ex-1",
                  order_index: 0,
                  rest_seconds: restSeconds, // This field must be mapped
                  session_sets: [
                    {
                      id: "set-1",
                      is_warmup_set: false,
                      completed_at: "2026-10-24T08:30:00Z",
                    },
                  ],
                },
              ],
              error: null,
            }),
          }),
        };
      } else if (table === "session_sets") {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                count: async () => ({
                  count: 1,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    rpc: () => ({
      throwOnError: () => ({ data: null, error: null }),
    }),
  } as any;
}

async function runTests() {
  console.log("\nTesting finish-session-deps rest_seconds mapping\n");

  console.log("1. loadExercises includes rest_seconds when present (12a)");
  {
    const fakeClient = makeFakeClient(120);
    const deps = makeFinishSessionDeps(fakeClient);

    const result = await deps.loadExercises("session-1");

    assertTrue(result.error === null, "loadExercises should succeed");
    if (result.data && result.data.length > 0) {
      const exercise = result.data[0];
      assertTrue(
        "rest_seconds" in exercise,
        "Exercise should have rest_seconds field",
      );
      assertTrue(
        exercise.rest_seconds === 120,
        "Exercise rest_seconds should match query result",
        `Got ${exercise.rest_seconds}`,
      );
    } else {
      console.error("❌ loadExercises returned no data");
      failed++;
    }
  }

  console.log("\n2. loadExercises handles null rest_seconds");
  {
    const fakeClient = makeFakeClient(null);
    const deps = makeFinishSessionDeps(fakeClient);

    const result = await deps.loadExercises("session-1");

    assertTrue(result.error === null, "loadExercises should succeed with null rest_seconds");
    if (result.data && result.data.length > 0) {
      const exercise = result.data[0];
      assertTrue(
        "rest_seconds" in exercise,
        "Exercise should have rest_seconds field even when null",
      );
      assertTrue(
        exercise.rest_seconds === null,
        "Exercise rest_seconds should be null",
        `Got ${exercise.rest_seconds}`,
      );
    } else {
      console.error("❌ loadExercises returned no data");
      failed++;
    }
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }

  console.log("\n✨ All rest_seconds mapping tests passed!");
}

runTests().catch((err) => {
  console.error("\n❌ Test suite threw an error:");
  console.error(err);
  process.exit(1);
});
