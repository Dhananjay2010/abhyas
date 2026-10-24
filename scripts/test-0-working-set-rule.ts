#!/usr/bin/env tsx
/**
 * Test 0-working-set rule for finish paths.
 *
 * Validates that sessions with 0 working sets are saved as 'skipped', not 'completed'.
 * This rule must apply on ALL paths: normal Finish, End early, and retries.
 *
 *   npx tsx scripts/test-0-working-set-rule.ts
 */

import { finishSessionCore, asSupabaseClient } from "../src/lib/session/finish-session";
import { abandonSessionCore, asSupabaseClient as asAbandonClient } from "../src/lib/session/abandon-session";

let passed = 0;
let failed = 0;

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
  }
}

function assertTrue(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`❌ ${message}`);
  }
}

interface FakeSupabase {
  calls: Array<{ method: string; table: string; payload?: Record<string, unknown>; filters?: Record<string, unknown> }>;
  from: (table: string) => unknown;
}

function makeFakeSupabase(exercises: unknown[], updateError?: string, readError?: string): FakeSupabase {
  const calls: Array<{ method: string; table: string; payload?: Record<string, unknown>; filters?: Record<string, unknown> }> = [];

  // Session metadata for stale detection
  const session = {
    started_at: new Date(Date.now() - 1800000).toISOString(), // 30 min ago
    local_date: new Date().toISOString().slice(0, 10),
    timezone: "UTC",
  };

  return {
    calls,
    from: (table: string) => {
      const currentTable = table;
      const filters: Record<string, unknown> = {};
      let updatePayload: Record<string, unknown> = {};

      return {
        select: () => ({
          eq: async (column: string, value: unknown) => {
            filters[column] = value;
            calls.push({ method: "select", table: currentTable, filters: { ...filters } });
            if (readError) return { data: null, error: { message: readError } };
            // Return session data for sessions table, exercises for session_exercises
            if (currentTable === "sessions") {
              return { data: [session], error: null };
            }
            return { data: exercises, error: null };
          },
        }),
        update: (payload: Record<string, unknown>) => {
          updatePayload = payload;
          return {
            eq: (column: string, value: unknown) => {
              filters[column] = value;
              return {
                eq: async (column2: string, value2: unknown) => {
                  filters[column2] = value2;
                  calls.push({ method: "update", table: currentTable, payload: { ...updatePayload }, filters: { ...filters } });
                  if (updateError) return { error: { message: updateError }, count: null };
                  return { error: null, count: 1 };
                },
              };
            },
          };
        },
      };
    },
  };
}

(async () => {
  console.log("🧪 Testing 0-working-set rule\n");

  // Test 1: Skip all exercises then Finish -> should give 'skipped'
  console.log("1. Skip all exercises then Finish");
  {
    const exercises = [
      { session_sets: [] }, // All exercises skipped, no sets at all
      { session_sets: [] },
      { session_sets: [] },
    ];

    const fake = makeFakeSupabase(exercises);
    const result = await finishSessionCore(asSupabaseClient(fake), {
      sessionId: "s1",
      durationSeconds: 300,
      cooldownCompleted: false,
    });

    assertTrue(result.ok, "Finish should succeed");
    if (result.ok) {
      assertEquals(result.data.status, "skipped", "Skip all -> status must be 'skipped'");
    }

    const updateCall = fake.calls.find((c) => c.method === "update");
    assertEquals(updateCall?.payload?.status, "skipped", "DB update must save 'skipped'");
    assertEquals(updateCall?.payload?.completed_at, null, "completed_at must be null for skipped");
  }

  // Test 2: Skip all exercises, only warm-up sets logged, then Finish -> should give 'skipped'
  console.log("\n2. Skip all, only warm-up sets logged, then Finish");
  {
    const exercises = [
      { session_sets: [{ id: "w1", is_warmup_set: true }, { id: "w2", is_warmup_set: true }] },
      { session_sets: [] },
      { session_sets: [{ id: "w3", is_warmup_set: true }] },
    ];

    const fake = makeFakeSupabase(exercises);
    const result = await finishSessionCore(asSupabaseClient(fake), {
      sessionId: "s2",
      durationSeconds: 600,
      cooldownCompleted: true,
    });

    assertTrue(result.ok, "Finish should succeed");
    if (result.ok) {
      assertEquals(result.data.status, "skipped", "Only warm-up sets -> status must be 'skipped'");
    }

    const updateCall = fake.calls.find((c) => c.method === "update");
    assertEquals(updateCall?.payload?.status, "skipped", "DB update must save 'skipped'");
    assertEquals(updateCall?.payload?.completed_at, null, "completed_at must be null for skipped");
  }

  // Test 3: End early with 0 working sets -> should give 'skipped'
  console.log("\n3. End early with 0 working sets");
  {
    const exercises = [
      { session_sets: [{ id: "w1", is_warmup_set: true }] },
      { session_sets: [] },
    ];

    const fake = makeFakeSupabase(exercises);
    const result = await abandonSessionCore(asAbandonClient(fake), "s3", 200);

    assertTrue(result.ok, "Abandon should succeed");
    if (result.ok) {
      assertEquals(result.data.status, "skipped", "End early with 0 working sets -> status must be 'skipped'");
    }

    const updateCall = fake.calls.find((c) => c.method === "update");
    assertEquals(updateCall?.payload?.status, "skipped", "DB update must save 'skipped'");
    assertEquals(updateCall?.payload?.completed_at, null, "completed_at must be null for skipped");
  }

  // Test 4: Finish with 1+ working sets -> should give 'completed'
  console.log("\n4. Finish with 1+ working sets");
  {
    const exercises = [
      { session_sets: [{ id: "w1", is_warmup_set: true }] },
      { session_sets: [{ id: "s1", is_warmup_set: false }] }, // One working set
      { session_sets: [] },
    ];

    const fake = makeFakeSupabase(exercises);
    const result = await finishSessionCore(asSupabaseClient(fake), {
      sessionId: "s4",
      durationSeconds: 900,
      cooldownCompleted: true,
    });

    assertTrue(result.ok, "Finish should succeed");
    if (result.ok) {
      assertEquals(result.data.status, "completed", "1+ working sets -> status must be 'completed'");
    }

    const updateCall = fake.calls.find((c) => c.method === "update");
    assertEquals(updateCall?.payload?.status, "completed", "DB update must save 'completed'");
    assertTrue(updateCall?.payload?.completed_at !== null && updateCall?.payload?.completed_at !== undefined, "completed_at must be set for completed");
  }

  // Test 5: End early with 1+ working sets -> should give 'completed'
  console.log("\n5. End early with 1+ working sets");
  {
    const exercises = [
      { session_sets: [{ id: "s1", is_warmup_set: false }, { id: "s2", is_warmup_set: false }] },
      { session_sets: [] }, // Not reached
    ];

    const fake = makeFakeSupabase(exercises);
    const result = await abandonSessionCore(asAbandonClient(fake), "s5", 400);

    assertTrue(result.ok, "Abandon should succeed");
    if (result.ok) {
      assertEquals(result.data.status, "completed", "End early with working sets -> status must be 'completed'");
    }

    const updateCall = fake.calls.find((c) => c.method === "update");
    assertEquals(updateCall?.payload?.status, "completed", "DB update must save 'completed'");
    assertTrue(updateCall?.payload?.completed_at !== null && updateCall?.payload?.completed_at !== undefined, "completed_at must be set for completed");
  }

  // Summary
  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }

  console.log("\n✨ All 0-working-set rule tests passed!");
})();
