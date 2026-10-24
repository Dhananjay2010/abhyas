#!/usr/bin/env tsx
/**
 * Test that finishSessionCore uses exact updatedCount to detect idempotent retries.
 *
 * Regression test for regression #3: if the updatedCount check is removed or replaced
 * with a looser check (e.g., just checking error), concurrent or retry calls won't
 * be handled correctly.
 *
 *   npx tsx scripts/test-finish-session-exact-count.ts
 */

import { finishSessionCore } from "../src/lib/session/finish-session";

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

function makeFakeDeps(alreadyCompleted: boolean) {
  let updateCallCount = 0;

  return {
    updateCallCount: () => updateCallCount,
    async loadSession() {
      return {
        data: {
          started_at: "2026-10-24T10:00:00Z",
          local_date: "2026-10-24",
          user_id: "user-123",
        },
    async loadTimezone() {
      return { data: { timezone: "UTC" }, error: null };
    },
        error: null,
      };
    },
    async loadExercises() {
      return {
        data: [
          {
        rest_seconds: null,
            session_sets: [
              { id: "set1", is_warmup_set: false, completed_at: "2026-10-24T10:30:00Z" },
            ],
          },
        ],
        error: null,
      };
    },
    async updateSession() {
      updateCallCount++;
      // If already completed, the .eq(status, in_progress) filter matches 0 rows
      return { error: null, updatedCount: alreadyCompleted ? 0 : 1 };
    },
    async loadSessionStatus() {
      return {
        data: { status: "completed" as const },
    async loadTimezone() {
      return { data: { timezone: "UTC" }, error: null };
    },
        error: null,
      };
    },
    async loadExercisesForUpdate() {
      return { data: [], error: null };
    },
    async updateExerciseStatus() {
      return { error: null };
    },
  };
}

async function runTests() {
  console.log("\n🧪 Testing finishSessionCore exact updatedCount check\n");

  console.log("1. First call (session in_progress): updatedCount = 1, updates session");
  {
    const deps = makeFakeDeps(false);
    const result = await finishSessionCore(
      deps,
      { sessionId: "s1", durationSeconds: 1800, cooldownCompleted: true },
    );

    assertEquals(result.ok, true, "First call succeeds");
    if (result.ok) {
      assertEquals(result.data.status, "completed", "Status is completed");
    }
    assertEquals(deps.updateCallCount(), 1, "updateSession called exactly once");
  }

  console.log("\n2. Second call (already completed): updatedCount = 0, re-reads status");
  {
    const deps = makeFakeDeps(true); // Session already completed
    const result = await finishSessionCore(
      deps,
      { sessionId: "s1", durationSeconds: 1800, cooldownCompleted: true },
    );

    assertEquals(result.ok, true, "Second call succeeds idempotently");
    if (result.ok) {
      assertEquals(result.data.status, "completed", "Re-read status is completed");
    }
    assertEquals(deps.updateCallCount(), 1, "updateSession called (returns 0 count)");
  }

  console.log("\n3. Concurrent calls: first updates (count=1), second re-reads (count=0)");
  {
    let callNumber = 0;
    const deps1 = {
      async loadSession() {
        return {
          data: {
            started_at: "2026-10-24T10:00:00Z",
            local_date: "2026-10-24",
            user_id: "user-123",
          },
    async loadTimezone() {
      return { data: { timezone: "UTC" }, error: null };
    },
          error: null,
        };
      },
      async loadExercises() {
        return {
          data: [
            {
        rest_seconds: null,
              session_sets: [
                { id: "set1", is_warmup_set: false, completed_at: "2026-10-24T10:30:00Z" },
              ],
            },
          ],
          error: null,
        };
      },
      async updateSession() {
        callNumber++;
        // First call gets the update (count=1), second sees it already done (count=0)
        return { error: null, updatedCount: callNumber === 1 ? 1 : 0 };
      },
      async loadSessionStatus() {
        return {
          data: { status: "completed" as const },
    async loadTimezone() {
      return { data: { timezone: "UTC" }, error: null };
    },
          error: null,
        };
      },
      async loadExercisesForUpdate() {
        return { data: [], error: null };
      },
      async updateExerciseStatus() {
        return { error: null };
      },
    };

    const [result1, result2] = await Promise.all([
      finishSessionCore(deps1, { sessionId: "s1", durationSeconds: 1800, cooldownCompleted: true }),
      finishSessionCore(deps1, { sessionId: "s1", durationSeconds: 1800, cooldownCompleted: true }),
    ]);

    assertEquals(result1.ok, true, "First concurrent call succeeds");
    assertEquals(result2.ok, true, "Second concurrent call succeeds");
    assertEquals(callNumber, 2, "Both calls reached updateSession");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }

  console.log("\n✨ All exact count tests passed!");
}

runTests();
