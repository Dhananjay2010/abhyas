#!/usr/bin/env tsx
/**
 * Test final exercise statuses on finish and end early.
 *
 *   npx tsx scripts/test-final-exercise-statuses.ts
 */

import { finishSessionCore } from "../src/lib/session/finish-session";
import { abandonSessionCore } from "../src/lib/session/abandon-session";
import type { Database } from "../src/lib/database.types";

const NOW = "2026-10-25T12:00:00Z";
const NOW_FN = () => NOW;
const NOW_MS = Date.parse(NOW);
const THIRTY_MIN_AGO = new Date(NOW_MS - 30 * 60 * 1000).toISOString();

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

type SessionRow = {
  started_at: string;
  local_date: string;
  user_id: string;
};

type ExerciseRow = {
  id: string;
  planned_sets: number;
  status: Database["public"]["Enums"]["exercise_status"];
  rest_seconds: number | null;
  session_sets: Array<{ id: string; is_warmup_set: boolean; completed_at: string | null }> | null;
};

function makeFakeFinishSessionDeps(
  sessionData: SessionRow | null,
  exercisesData: ExerciseRow[],
  updateError?: string
) {
  const exerciseUpdates: Array<{ id: string; status: string }> = [];

  return {
    exerciseUpdates,
    async loadSession() {
      return { data: sessionData, error: null };
    },
    async loadTimezone() {
      return { data: { timezone: "UTC" }, error: null };
    },
    async loadExercises() {
      return { data: exercisesData.map(ex => ({
        rest_seconds: ex.rest_seconds,
        session_sets: ex.session_sets,
      })), error: null };
    },
    async updateSession() {
      return { error: updateError || null, updatedCount: updateError ? 0 : 1 };
    },
    async loadSessionStatus() {
      return { data: { status: "in_progress" as const }, error: null };
    },
    async loadExercisesForUpdate() {
      return { data: exercisesData, error: null };
    },
    async updateExerciseStatus(id: string, status: string) {
      exerciseUpdates.push({ id, status });
      return { error: null };
    },
    now: NOW_FN,
  };
}

function makeFakeAbandonSessionDeps(exercisesData: ExerciseRow[]) {
  const exerciseUpdates: Array<{ id: string; status: string }> = [];

  return {
    exerciseUpdates,
    async loadExercises() {
      return { data: exercisesData.map(ex => ({
        session_sets: ex.session_sets,
      })), error: null };
    },
    async updateSession() {
      return { error: null, updatedCount: 1 };
    },
    async loadSessionStatus() {
      return { data: { status: "completed" as const }, error: null };
    },
    async loadSessionMetadata() {
      return { data: { started_at: THIRTY_MIN_AGO, user_id: "user-123" }, error: null };
    },
    async loadTimezone() {
      return { data: { timezone: "UTC" }, error: null };
    },
    async loadExercisesWithSets() {
      return { data: exercisesData.map(ex => ({
        rest_seconds: ex.rest_seconds,
        session_sets: (ex.session_sets ?? []).map(s => ({
          completed_at: s.completed_at ?? NOW,
          is_warmup_set: s.is_warmup_set,
        })),
      })), error: null };
    },
    // Optional deps that mutant (a) would call
    async loadExercisesForUpdate() {
      return { data: exercisesData, error: null };
    },
    async updateExerciseStatus(id: string, status: string) {
      exerciseUpdates.push({ id, status });
      return { error: null };
    },
  };
}

async function runTests() {
  console.log("\nTesting final exercise statuses on finish/abandon\n");

  console.log("1. finishSession: exercise with all sets → completed");
  {
    const session = {
      started_at: THIRTY_MIN_AGO,
      local_date: "2026-10-24",
      user_id: "user-123",
    };
    const exercises = [
      {
        id: "ex1",
        planned_sets: 3,
        status: "pending" as const,
        rest_seconds: null,
        session_sets: [
          { id: "s1", is_warmup_set: false, completed_at: NOW },
          { id: "s2", is_warmup_set: false, completed_at: NOW },
          { id: "s3", is_warmup_set: false, completed_at: NOW },
        ],
      },
    ];
    const fake = makeFakeFinishSessionDeps(session, exercises);

    await finishSessionCore(
      fake,
      { sessionId: "s1", durationSeconds: 1800, cooldownCompleted: true },
      
    );

    assertEquals(fake.exerciseUpdates.length, 1, "One exercise updated");
    assertEquals(fake.exerciseUpdates[0].id, "ex1", "Correct exercise ID");
    assertEquals(fake.exerciseUpdates[0].status, "completed", "Status is completed (3 of 3 sets)");
  }

  console.log("\n2. finishSession: exercise with partial sets → completed");
  {
    const session = {
      started_at: THIRTY_MIN_AGO,
      local_date: "2026-10-24",
      user_id: "user-123",
    };
    const exercises = [
      {
        id: "ex2",
        planned_sets: 4,
        status: "pending" as const,
        rest_seconds: null,
        session_sets: [
          { id: "s1", is_warmup_set: false, completed_at: NOW },
          { id: "s2", is_warmup_set: false, completed_at: NOW },
        ],
      },
    ];
    const fake = makeFakeFinishSessionDeps(session, exercises);

    await finishSessionCore(
      fake,
      { sessionId: "s1", durationSeconds: 1800, cooldownCompleted: true },
      
    );

    assertEquals(fake.exerciseUpdates.length, 1, "One exercise updated");
    assertEquals(fake.exerciseUpdates[0].status, "completed", "Status is completed (partial = 2 of 4 sets)");
  }

  console.log("\n3. finishSession: exercise with no sets → skipped");
  {
    const session = {
      started_at: THIRTY_MIN_AGO,
      local_date: "2026-10-24",
      user_id: "user-123",
    };
    const exercises = [
      {
        id: "ex3",
        planned_sets: 3,
        status: "pending" as const,
        rest_seconds: null,
        session_sets: [],
      },
    ];
    const fake = makeFakeFinishSessionDeps(session, exercises);

    await finishSessionCore(
      fake,
      { sessionId: "s1", durationSeconds: 1800, cooldownCompleted: true },
      
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
        status: "pending" as const,
        rest_seconds: null,
        session_sets: [
          { id: "s1", is_warmup_set: false, completed_at: null },
          { id: "s2", is_warmup_set: false, completed_at: null },
          { id: "s3", is_warmup_set: false, completed_at: null },
        ],
      },
    ];
    const fake = makeFakeAbandonSessionDeps(exercises);

    await abandonSessionCore(
      fake,
      "s1",
      1200,
    );

    assertEquals(fake.exerciseUpdates.length, 0, "No exercise status updates (exercises stay pending)");
  }

  console.log("\n5. finishSession: mix of completed, partial, and skipped");
  {
    const session = {
      started_at: THIRTY_MIN_AGO,
      local_date: "2026-10-24",
      user_id: "user-123",
    };
    const exercises = [
      {
        id: "ex5a",
        planned_sets: 3,
        status: "pending" as const,
        rest_seconds: null,
        session_sets: [
          { id: "s1", is_warmup_set: false, completed_at: NOW },
          { id: "s2", is_warmup_set: false, completed_at: NOW },
          { id: "s3", is_warmup_set: false, completed_at: NOW },
        ],
      },
      {
        id: "ex5b",
        planned_sets: 4,
        status: "pending" as const,
        rest_seconds: null,
        session_sets: [
          { id: "s4", is_warmup_set: false, completed_at: NOW },
        ],
      },
      {
        id: "ex5c",
        planned_sets: 3,
        status: "pending" as const,
        rest_seconds: null,
        session_sets: [],
      },
    ];
    const fake = makeFakeFinishSessionDeps(session, exercises);

    await finishSessionCore(
      fake,
      { sessionId: "s1", durationSeconds: 1800, cooldownCompleted: true },
      
    );

    assertEquals(fake.exerciseUpdates.length, 3, "Three exercises updated");
    assertEquals(fake.exerciseUpdates[0].status, "completed", "Ex 5a: completed (3 of 3)");
    assertEquals(fake.exerciseUpdates[1].status, "completed", "Ex 5b: completed (partial 1 of 4)");
    assertEquals(fake.exerciseUpdates[2].status, "skipped", "Ex 5c: skipped (0 of 3)");
  }

  console.log("\n6. finishSession: already-completed exercises not updated");
  {
    const session = {
      started_at: THIRTY_MIN_AGO,
      local_date: "2026-10-24",
      user_id: "user-123",
    };
    const exercises = [
      {
        id: "ex6",
        planned_sets: 3,
        status: "completed" as const,
        rest_seconds: null,
        session_sets: [
          { id: "s1", is_warmup_set: false, completed_at: NOW },
          { id: "s2", is_warmup_set: false, completed_at: NOW },
          { id: "s3", is_warmup_set: false, completed_at: NOW },
        ],
      },
    ];
    const fake = makeFakeFinishSessionDeps(session, exercises);

    await finishSessionCore(
      fake,
      { sessionId: "s1", durationSeconds: 1800, cooldownCompleted: true },
      
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
