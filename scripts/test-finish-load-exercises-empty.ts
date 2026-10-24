#!/usr/bin/env tsx
/**
 * Test that finishSessionCore handles empty exercises array from loadExercises.
 *
 * Catches break g4: if loadExercises returns data: [] or exercises mapping is empty,
 * the finish deps should handle it gracefully without crashes.
 *
 *   npx tsx scripts/test-finish-load-exercises-empty.ts
 */

import { finishSessionCore } from "../src/lib/session/finish-session";
import type { SessionRow } from "../src/lib/session/finish-session-deps";

let passed = 0;
let failed = 0;

function assertTrue(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    failed++;
  }
}

function makeFakeDeps(exercises: any) {
  const sessionMetadata: SessionRow = {
    started_at: "2026-10-24T14:00:00Z",
    local_date: "2026-10-24",
    user_id: "user-123",
  };

  return {
    async loadSession() {
      return { data: sessionMetadata, error: null };
    },
    async loadTimezone() {
      return { data: { timezone: "UTC" }, error: null };
    },
    async loadExercises() {
      return { data: exercises, error: null };
    },
    async updateSession() {
      return { error: null, updatedCount: 1 };
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
}

async function runTests() {
  console.log("\nTesting finishSessionCore with empty exercises\n");

  console.log("1. loadExercises returns empty array (g4)");
  {
    const deps = makeFakeDeps([]);

    const result = await finishSessionCore(deps, {
      sessionId: "session-1",
      durationSeconds: 1800,
      cooldownCompleted: false,
    });

    assertTrue(result.ok, "finishSessionCore should succeed with empty exercises");
    if (result.ok) {
      assertTrue(
        result.data.status === "skipped",
        "Status should be skipped for 0 sets",
      );
    }
  }

  console.log("\n2. loadExercises returns null data");
  {
    const deps = makeFakeDeps(null);

    const result = await finishSessionCore(deps, {
      sessionId: "session-1",
      durationSeconds: 1800,
      cooldownCompleted: false,
    });

    assertTrue(result.ok, "finishSessionCore should handle null exercises");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }

  console.log("\n✨ All loadExercises empty tests passed!");
}

runTests().catch((err) => {
  console.error("\n❌ Test suite threw an error:");
  console.error(err);
  process.exit(1);
});
