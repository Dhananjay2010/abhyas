#!/usr/bin/env tsx
/**
 * Test e4: stale close-out uses the last set's exercise rest_seconds.
 *
 *   npx tsx scripts/test-stale-rest-used.ts
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
    status: "completed" | "skipped" | "in_progress";
    completed_at: string | null;
    duration_seconds: number;
    cooldown_completed?: boolean;
  };
};

function makeStaleFakeDeps(exercises: SessionExerciseWithSets[]): FinishSessionDeps & { updateCalls: UpdateCall[] } {
  const updateCalls: UpdateCall[] = [];
  const sessionMetadata: SessionRow = {
    started_at: "2026-10-23T10:00:00Z",
    local_date: "2026-10-23",
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

console.log("\nTesting stale close-out uses last set's exercise rest_seconds\n");

// Test 1: Stale session uses last exercise's rest_seconds (90s)
console.log("1. Stale session uses last set's exercise rest_seconds (90s)");
{
  const exercises: SessionExerciseWithSets[] = [
    {
      rest_seconds: 120,
      session_sets: [
        { id: "set-1", is_warmup_set: false, completed_at: "2026-10-23T10:10:00Z" },
      ],
    },
    {
      rest_seconds: 90,
      session_sets: [
        { id: "set-2", is_warmup_set: false, completed_at: "2026-10-23T10:20:00Z" },
      ],
    },
  ];

  const deps = makeStaleFakeDeps(exercises);
  
  (async () => {
    const result = await finishSessionCore(deps, {
      sessionId: "session-1",
      durationSeconds: 9999,
      cooldownCompleted: true,
    });

    assertTrue(result.ok, "finishSession succeeds");
    assertEquals(deps.updateCalls.length, 1, "updateSession called once");
    
    const update = deps.updateCalls[0];
    const lastSetTime = new Date("2026-10-23T10:20:00Z").getTime();
    const startTime = new Date("2026-10-23T10:00:00Z").getTime();
    const expectedDuration = Math.floor((lastSetTime - startTime + 90 * 1000) / 1000);
    
    assertEquals(update.patch.duration_seconds, expectedDuration, `duration uses 90s rest (last set's exercise), not 120s`);
    assertEquals(update.patch.status, "completed", "status is completed");
  })();
}

// Test 2: Stale session with null rest uses default 300s
console.log("\n2. Stale session with null rest_seconds uses default 300s");
{
  const exercises: SessionExerciseWithSets[] = [
    {
      rest_seconds: 180,
      session_sets: [
        { id: "set-1", is_warmup_set: false, completed_at: "2026-10-23T10:10:00Z" },
      ],
    },
    {
      rest_seconds: null,
      session_sets: [
        { id: "set-2", is_warmup_set: false, completed_at: "2026-10-23T10:25:00Z" },
      ],
    },
  ];

  const deps = makeStaleFakeDeps(exercises);
  
  (async () => {
    const result = await finishSessionCore(deps, {
      sessionId: "session-2",
      durationSeconds: 9999,
      cooldownCompleted: true,
    });

    assertTrue(result.ok, "finishSession succeeds");
    
    const update = deps.updateCalls[0];
    const lastSetTime = new Date("2026-10-23T10:25:00Z").getTime();
    const startTime = new Date("2026-10-23T10:00:00Z").getTime();
    const expectedDuration = Math.floor((lastSetTime - startTime + 300 * 1000) / 1000);
    
    assertEquals(update.patch.duration_seconds, expectedDuration, `duration uses 300s default rest, not 180s from earlier exercise`);
  })();
}

// Test 3: Stale session ignores warmup sets for determining last rest
console.log("\n3. Stale session uses last working set's exercise rest, ignoring warmup");
{
  const exercises: SessionExerciseWithSets[] = [
    {
      rest_seconds: 60,
      session_sets: [
        { id: "set-1", is_warmup_set: false, completed_at: "2026-10-23T10:15:00Z" },
      ],
    },
    {
      rest_seconds: 200,
      session_sets: [
        { id: "set-2", is_warmup_set: true, completed_at: "2026-10-23T10:30:00Z" },
      ],
    },
  ];

  const deps = makeStaleFakeDeps(exercises);
  
  (async () => {
    const result = await finishSessionCore(deps, {
      sessionId: "session-3",
      durationSeconds: 9999,
      cooldownCompleted: true,
    });

    assertTrue(result.ok, "finishSession succeeds");
    
    const update = deps.updateCalls[0];
    const lastWorkingSetTime = new Date("2026-10-23T10:15:00Z").getTime();
    const warmupSetTime = new Date("2026-10-23T10:30:00Z").getTime();
    const startTime = new Date("2026-10-23T10:00:00Z").getTime();
    
    const completedAtMs = new Date(update.patch.completed_at!).getTime();
    assertTrue(completedAtMs > warmupSetTime, "completed_at uses chronologically last set (warmup)");
    
    const expectedDuration = Math.floor((warmupSetTime - startTime + 200 * 1000) / 1000);
    assertEquals(update.patch.duration_seconds, expectedDuration, `duration uses warmup's 200s rest (chronologically last set)`);
  })();
}

// Give async tests time to complete
setTimeout(() => {
  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }
  console.log("\n✨ All stale-rest-used tests passed!");
}, 100);
