#!/usr/bin/env tsx
/**
 * Test that abandonSessionCore is idempotent on retry.
 *
 * Item 10: When updatedCount is 0 (session already finished), re-read
 * and return the stored status without rewriting exercise statuses.
 *
 *   npx tsx scripts/test-abandon-retry.ts
 */

import { abandonSessionCore } from "../src/lib/session/abandon-session";
import type { AbandonSessionDeps } from "../src/lib/session/abandon-session-deps";

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

function assertTrue(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`❌ ${message}`);
  }
}

async function runTests() {
  console.log("\n1. First abandon: updates session, does NOT update exercise statuses");
  {
    let updateCalled = false;
    const exerciseUpdates: Array<{ id: string; status: string }> = [];
    
    const deps: AbandonSessionDeps & { 
      loadExercisesForUpdate?: () => Promise<{ data: Array<{ id: string; status: string; planned_sets: number; session_sets: unknown[] }> | null; error: string | null }>;
      updateExerciseStatus?: (id: string, status: string) => Promise<{ error: string | null }>;
    } = {
      async loadExercises() {
        return {
          data: [
            {
              session_sets: [
                { id: "s1", is_warmup_set: false },
              ],
            },
          ],
          error: null,
        };
      },
      async updateSession() {
        updateCalled = true;
        return { error: null, updatedCount: 1 };
      },
      async loadSessionStatus() {
        return { data: { status: "completed" as const, duration_seconds: null }, error: null };
      },
      async loadSessionMetadata() {
        return { data: { started_at: "2026-10-25T11:30:00Z", user_id: "user1" }, error: null };
      },
      async loadTimezone() {
        return { data: { timezone: "UTC" }, error: null };
      },
      async loadExercisesWithSets() {
        return { data: [], error: null };
      },
      // Optional deps that mutant (a) would call
      async loadExercisesForUpdate() {
        return { data: [{ id: "ex1", status: "pending", planned_sets: 3, session_sets: [{ id: "s1", is_warmup_set: false }] }], error: null };
      },
      async updateExerciseStatus(id: string, status: string) {
        exerciseUpdates.push({ id, status });
        return { error: null };
      },
    };

    const result = await abandonSessionCore(deps, "s1", 1800);

    assertTrue(result.ok, "Should succeed on first abandon");
    assertTrue(updateCalled, "Should call updateSession");
    assertEquals(exerciseUpdates.length, 0, "Should NOT update exercise status (exercises stay pending)");
    if (result.ok) {
      assertEquals(result.data.status, "completed", "Status should be completed (has working set)");
    }
  }

  console.log("\n2. Retry with updatedCount=0: re-reads status, skips exercise updates");
  {
    let updateCalled = false;
    let loadStatusCalled = false;
    const exerciseUpdates: Array<{ id: string; status: string }> = [];

    const deps: AbandonSessionDeps & {
      loadExercisesForUpdate?: () => Promise<{ data: Array<{ id: string; status: string; planned_sets: number; session_sets: unknown[] }> | null; error: string | null }>;
      updateExerciseStatus?: (id: string, status: string) => Promise<{ error: string | null }>;
    } = {
      async loadExercises() {
        return {
          data: [
            {
              session_sets: [
                { id: "s1", is_warmup_set: false },
              ],
            },
          ],
          error: null,
        };
      },
      async updateSession() {
        updateCalled = true;
        return { error: null, updatedCount: 0 }; // Already finished
      },
      async loadSessionStatus() {
        loadStatusCalled = true;
        return { data: { status: "completed" as const, duration_seconds: null }, error: null };
      },
      async loadSessionMetadata() {
        return { data: { started_at: "2026-10-25T11:30:00Z", user_id: "user1" }, error: null };
      },
      async loadTimezone() {
        return { data: { timezone: "UTC" }, error: null };
      },
      async loadExercisesWithSets() {
        return { data: [], error: null };
      },
      async loadExercisesForUpdate() {
        return { data: [{ id: "ex1", status: "pending", planned_sets: 3, session_sets: [{ id: "s1", is_warmup_set: false }] }], error: null };
      },
      async updateExerciseStatus(id: string, status: string) {
        exerciseUpdates.push({ id, status });
        return { error: null };
      },
    };

    const result = await abandonSessionCore(deps, "s1", 1800);

    assertTrue(result.ok, "Should succeed on retry");
    assertTrue(updateCalled, "Should call updateSession");
    assertTrue(loadStatusCalled, "Should call loadSessionStatus after updatedCount=0");
    assertEquals(exerciseUpdates.length, 0, "Should NOT update exercise statuses on retry");
    if (result.ok) {
      assertEquals(result.data.status, "completed", "Status should be the stored value");
    }
  }

  console.log("\n3. Retry returns skipped status when stored");
  {
    const deps: AbandonSessionDeps = {
      async loadExercises() {
        return {
          data: [
            {
              session_sets: [], // No working sets
            },
          ],
          error: null,
        };
      },
      async updateSession() {
        return { error: null, updatedCount: 0 }; // Already finished
      },
      async loadSessionStatus() {
        return { data: { status: "skipped" as const, duration_seconds: null }, error: null };
      },
      async loadSessionMetadata() {
        return { data: { started_at: "2026-10-25T11:30:00Z", user_id: "user1" }, error: null };
      },
      async loadTimezone() {
        return { data: { timezone: "UTC" }, error: null };
      },
      async loadExercisesWithSets() {
        return { data: [], error: null };
      },
    };

    const result = await abandonSessionCore(deps, "s1", 1800);

    assertTrue(result.ok, "Should succeed on retry");
    if (result.ok) {
      assertEquals(result.data.status, "skipped", "Status should be skipped from stored value");
    }
  }

  console.log("\n4. Retry fails if loadSessionStatus fails");
  {
    const deps: AbandonSessionDeps = {
      async loadExercises() {
        return { data: [], error: null };
      },
      async updateSession() {
        return { error: null, updatedCount: 0 };
      },
      async loadSessionStatus() {
        return { data: null, error: "Database error" };
      },
      async loadSessionMetadata() {
        return { data: { started_at: "2026-10-25T11:30:00Z", user_id: "user1" }, error: null };
      },
      async loadTimezone() {
        return { data: { timezone: "UTC" }, error: null };
      },
      async loadExercisesWithSets() {
        return { data: [], error: null };
      },
    };

    const result = await abandonSessionCore(deps, "s1", 1800);

    assertEquals(result.ok, false, "Should fail if loadSessionStatus fails");
    if (!result.ok) {
      assertEquals(result.error, "Database error", "Should return the error message");
    }
  }

  console.log("\n5. Retry fails if session still in_progress after updatedCount=0");
  {
    const deps: AbandonSessionDeps = {
      async loadExercises() {
        return { data: [], error: null };
      },
      async updateSession() {
        return { error: null, updatedCount: 0 };
      },
      async loadSessionStatus() {
        return { data: { status: "in_progress" as const, duration_seconds: null }, error: null };
      },
      async loadSessionMetadata() {
        return { data: { started_at: "2026-10-25T11:30:00Z", user_id: "user1" }, error: null };
      },
      async loadTimezone() {
        return { data: { timezone: "UTC" }, error: null };
      },
      async loadExercisesWithSets() {
        return { data: [], error: null };
      },
    };

    const result = await abandonSessionCore(deps, "s1", 1800);

    assertEquals(result.ok, false, "Should fail if still in_progress");
    if (!result.ok) {
      assertTrue(result.error.includes("still in_progress"), "Error should mention still in_progress");
    }
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Tests passed: ${passed}`);
  console.log(`Tests failed: ${failed}`);
  console.log(`${"=".repeat(60)}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
