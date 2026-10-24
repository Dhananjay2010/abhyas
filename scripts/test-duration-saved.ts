#!/usr/bin/env tsx
/**
 * Test a2: duration_seconds is correctly saved (not 0) for non-stale sessions.
 *
 *   npx tsx scripts/test-duration-saved.ts
 */

import { finishSessionCore } from "../src/lib/session/finish-session";
import type { SessionRow, SessionExerciseWithSets, ExerciseForUpdate, FinishSessionDeps } from "../src/lib/session/finish-session-deps";

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
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    failed++;
  }
}

type UpdateCall = {
  sessionId: string;
  patch: {
    status: string;
    completed_at: string | null;
    duration_seconds: number;
    cooldown_completed?: boolean;
  };
};

function makeFakeDeps(exercises: SessionExerciseWithSets[]): FinishSessionDeps & { updateCalls: UpdateCall[] } {
  const updateCalls: UpdateCall[] = [];
  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const sessionMetadata: SessionRow = {
    started_at: fiveMinutesAgo.toISOString(),
    local_date: fiveMinutesAgo.toISOString().split('T')[0],
    timezone: "UTC",
  };

  const exercisesForUpdate: ExerciseForUpdate[] = exercises.map((ex, i) => ({
    id: `ex-${i}`,
    planned_sets: 3,
    status: "pending" as const,
    session_sets: ex.session_sets?.map((s) => ({
      id: s.id,
      is_warmup_set: s.is_warmup_set,
    })) ?? [],
  }));

  return {
    updateCalls,
    async loadSession() {
      return { data: sessionMetadata, error: null };
    },
    async loadExercises() {
      return { data: exercises, error: null };
    },
    async updateSession(sessionId, patch) {
      updateCalls.push({ sessionId, patch });
      return { error: null, updatedCount: 1 };
    },
    async loadSessionStatus() {
      return { data: { status: "completed" as const }, error: null };
    },
    async loadExercisesForUpdate() {
      return { data: exercisesForUpdate, error: null };
    },
    async updateExerciseStatus() {
      return { error: null };
    },
  };
}

console.log("\nTesting duration_seconds is saved correctly (not 0)\n");

// Test 1: Non-stale session with working sets saves client duration
console.log("1. Non-stale session saves client-provided duration");
{
  const now = new Date();
  const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
  const exercises: SessionExerciseWithSets[] = [
    {
      rest_seconds: 90,
      session_sets: [
        { id: "set-1", is_warmup_set: false, completed_at: twoMinutesAgo.toISOString() },
        { id: "set-2", is_warmup_set: false, completed_at: now.toISOString() },
      ],
    },
  ];

  const deps = makeFakeDeps(exercises);
  
  (async () => {
    const result = await finishSessionCore(deps, {
      sessionId: "session-1",
      durationSeconds: 1234,
      cooldownCompleted: true,
    });

    assertTrue(result.ok, "finishSession succeeds");
    assertEquals(deps.updateCalls.length, 1, "updateSession called once");
    
    const update = deps.updateCalls[0];
    assertTrue(update.patch.duration_seconds > 0, "duration_seconds is not 0");
    assertEquals(update.patch.duration_seconds, 1234, "duration_seconds is the client-provided value");
    assertEquals(update.patch.status, "completed", "status is completed");
  })();
}

// Test 2: Non-stale session with only warmup sets saves client duration
console.log("\n2. Non-stale skipped session saves client-provided duration");
{
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  const exercises: SessionExerciseWithSets[] = [
    {
      rest_seconds: 90,
      session_sets: [
        { id: "set-1", is_warmup_set: true, completed_at: oneMinuteAgo.toISOString() },
      ],
    },
  ];

  const deps = makeFakeDeps(exercises);
  
  (async () => {
    const result = await finishSessionCore(deps, {
      sessionId: "session-2",
      durationSeconds: 456,
      cooldownCompleted: false,
    });

    assertTrue(result.ok, "finishSession succeeds");
    assertEquals(deps.updateCalls.length, 1, "updateSession called once");
    
    const update = deps.updateCalls[0];
    assertTrue(update.patch.duration_seconds > 0, "duration_seconds is not 0");
    assertEquals(update.patch.duration_seconds, 456, "duration_seconds is the client-provided value");
    assertEquals(update.patch.status, "skipped", "status is skipped");
  })();
}

// Test 3: Duration is clamped to valid range
console.log("\n3. Duration is clamped to [0, 21600]");
{
  const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
  const exercises: SessionExerciseWithSets[] = [
    {
      rest_seconds: 90,
      session_sets: [
        { id: "set-1", is_warmup_set: false, completed_at: threeMinutesAgo.toISOString() },
      ],
    },
  ];

  const deps = makeFakeDeps(exercises);
  
  (async () => {
    const result = await finishSessionCore(deps, {
      sessionId: "session-3",
      durationSeconds: 30000,
      cooldownCompleted: true,
    });

    assertTrue(result.ok, "finishSession succeeds");
    const update = deps.updateCalls[0];
    assertEquals(update.patch.duration_seconds, 21600, "duration_seconds is clamped to 21600 (6 hours)");
  })();
}

// Give async tests time to complete
setTimeout(() => {
  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }
  console.log("\n✨ All duration-saved tests passed!");
}, 100);
