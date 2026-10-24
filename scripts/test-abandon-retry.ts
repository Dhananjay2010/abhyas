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
  console.log("\n1. First abandon: updates session and exercises");
  {
    let updateCalled = false;
    let exerciseUpdateCount = 0;

    const deps: AbandonSessionDeps = {
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
        return { data: { status: "completed" as const }, error: null };
      },
      async loadExercisesForUpdate() {
        return {
          data: [
            {
              id: "ex1",
              planned_sets: 3,
              status: "pending" as const,
              session_sets: [{ id: "s1", is_warmup_set: false }],
            },
          ],
          error: null,
        };
      },
      async updateExerciseStatus() {
        exerciseUpdateCount++;
        return { error: null };
      },
    };

    const result = await abandonSessionCore(deps, "s1", 1800);

    assertTrue(result.ok, "Should succeed on first abandon");
    assertTrue(updateCalled, "Should call updateSession");
    assertEquals(exerciseUpdateCount, 1, "Should update exercise status");
    if (result.ok) {
      assertEquals(result.data.status, "completed", "Status should be completed (has working set)");
    }
  }

  console.log("\n2. Retry with updatedCount=0: re-reads status, skips exercise updates");
  {
    let updateCalled = false;
    let loadStatusCalled = false;
    let exerciseUpdateCount = 0;

    const deps: AbandonSessionDeps = {
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
        return { data: { status: "completed" as const }, error: null };
      },
      async loadExercisesForUpdate() {
        return {
          data: [
            {
              id: "ex1",
              planned_sets: 3,
              status: "completed" as const, // Already updated
              session_sets: [{ id: "s1", is_warmup_set: false }],
            },
          ],
          error: null,
        };
      },
      async updateExerciseStatus() {
        exerciseUpdateCount++;
        return { error: null };
      },
    };

    const result = await abandonSessionCore(deps, "s1", 1800);

    assertTrue(result.ok, "Should succeed on retry");
    assertTrue(updateCalled, "Should call updateSession");
    assertTrue(loadStatusCalled, "Should call loadSessionStatus after updatedCount=0");
    assertEquals(exerciseUpdateCount, 0, "Should NOT update exercise statuses on retry");
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
        return { data: { status: "skipped" as const }, error: null };
      },
      async loadExercisesForUpdate() {
        return { data: [], error: null };
      },
      async updateExerciseStatus() {
        return { error: null };
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
      async loadExercisesForUpdate() {
        return { data: [], error: null };
      },
      async updateExerciseStatus() {
        return { error: null };
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
        return { data: { status: "in_progress" as const }, error: null };
      },
      async loadExercisesForUpdate() {
        return { data: [], error: null };
      },
      async updateExerciseStatus() {
        return { error: null };
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
