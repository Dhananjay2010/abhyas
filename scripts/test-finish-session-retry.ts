#!/usr/bin/env tsx
/**
 * Test that finish-session retry correctly re-reads the stored status.
 *
 *   npx tsx scripts/test-finish-session-retry.ts
 */

import { finishSessionCore } from "../src/lib/session/finish-session";
import type { FinishSessionDeps, SessionRow, SessionExerciseWithSets, ExerciseForUpdate } from "../src/lib/session/finish-session-deps";

let testsPassed = 0;
let testsFailed = 0;

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    console.log(`  ok   ${message}`);
    testsPassed++;
  } else {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
    testsFailed++;
  }
}

function makeFakeDeps(config: {
  updatedCount: number;
  storedStatus?: "completed" | "skipped" | "in_progress";
}): FinishSessionDeps {
  return {
    async loadSession() {
      return {
        data: {
          started_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          local_date: new Date().toISOString().split("T")[0],
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
              { id: "set1", is_warmup_set: false, completed_at: new Date().toISOString() },
            ],
          },
        ],
        error: null,
      };
    },
    async updateSession() {
      return { error: null, updatedCount: config.updatedCount };
    },
    async loadSessionStatus() {
      return {
        data: config.storedStatus ? { status: config.storedStatus } : null,
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
  console.log("\nTesting finish-session retry re-read behavior\n");

  console.log("1. First finish attempt succeeds (updatedCount = 1)");
  {
    const deps = makeFakeDeps({ updatedCount: 1 });

    const result = await finishSessionCore(deps, {
      sessionId: "session-1",
      durationSeconds: 1800,
      cooldownCompleted: true,
    });

    assertEquals(result.ok, true, "First finish succeeds");
    if (result.ok) {
      assertEquals(result.data.status, "completed", "Returns 'completed' status");
    }
  }

  console.log("\n2. Retry after already finished (updatedCount = 0, re-read returns stored status)");
  {
    const deps = makeFakeDeps({ updatedCount: 0, storedStatus: "completed" });

    const result = await finishSessionCore(deps, {
      sessionId: "session-1",
      durationSeconds: 1800,
      cooldownCompleted: false,
    });

    assertEquals(result.ok, true, "Retry succeeds");
    if (result.ok) {
      assertEquals(
        result.data.status,
        "completed",
        "Returns stored 'completed' from re-read",
      );
    }
  }

  console.log("\n3. Retry returns actual stored status (skipped)");
  {
    const deps = makeFakeDeps({ updatedCount: 0, storedStatus: "skipped" });

    const result = await finishSessionCore(deps, {
      sessionId: "session-1",
      durationSeconds: 1800,
      cooldownCompleted: true,
    });

    assertEquals(result.ok, true, "Retry succeeds");
    if (result.ok) {
      assertEquals(
        result.data.status,
        "skipped",
        "Returns stored 'skipped' from re-read",
      );
    }
  }

  console.log(`\n✅ Passed: ${testsPassed}`);
  if (testsFailed > 0) {
    console.log(`❌ Failed: ${testsFailed}`);
    process.exit(1);
  }

  console.log("\n✨ All finish-session retry tests passed!");
}

runTests();
