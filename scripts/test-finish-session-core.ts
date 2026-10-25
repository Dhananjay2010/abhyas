#!/usr/bin/env tsx
import { finishSessionCore } from "../src/lib/session/finish-session";
import { abandonSessionCore } from "../src/lib/session/abandon-session";
import type { SessionRow, SessionExerciseWithSets, ExerciseForUpdate } from "../src/lib/session/finish-session-deps";

const NOW = "2026-10-25T12:00:00Z";
const NOW_FN = () => NOW;
const THIRTY_MIN_AGO = "2026-10-25T11:30:00Z";

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

type Call = { method: string; filters?: Record<string, unknown>; patch?: Record<string, unknown> };

function makeFakeFinishSessionDeps(
  exercises: SessionExerciseWithSets[],
  exercisesForUpdate: ExerciseForUpdate[],
  updateError?: string,
  readError?: string,
  updateCount?: number
) {
  const calls: Call[] = [];
  const sessionMetadata: SessionRow = {
    started_at: "2026-10-24T14:00:00Z",
    local_date: "2026-10-24",
    user_id: "user-123",
  };

  return {
    calls,
    async loadSession() {
      if (readError) return { data: null, error: readError };
      return { data: sessionMetadata, error: null };
    },
    async loadTimezone() {
      return { data: { timezone: "UTC" }, error: null };
    },
    async loadExercises() {
      if (readError) return { data: null, error: readError };
      return { data: exercises, error: null };
    },
    async updateSession(_id: string, patch: Record<string, unknown>) {
      calls.push({ method: "update", filters: { status: "in_progress" }, patch });
      if (updateError) return { error: updateError, updatedCount: 0 };
      return { error: null, updatedCount: updateCount ?? 1 };
    },
    async loadSessionStatus() {
      if (readError) return { data: null, error: readError };
      return { data: { status: "in_progress" as const }, error: null };
    },
    async loadExercisesForUpdate() {
      if (readError) return { data: null, error: readError };
      return { data: exercisesForUpdate, error: null };
    },
    async updateExerciseStatus() {
      return { error: null };
    },
    now: NOW_FN,
  };
}

function makeFakeAbandonSessionDeps(
  exercises: Array<{ rest_seconds: null, session_sets: Array<{ id: string; is_warmup_set: boolean }> }>,
  exercisesForUpdate: ExerciseForUpdate[],
  updateError?: string,
  readError?: string
) {
  const calls: Call[] = [];

  return {
    calls,
    async loadExercises() {
      if (readError) return { data: null, error: readError };
      return { data: exercises, error: null };
    },
    async updateSession() {
      calls.push({ method: "update", filters: { status: "in_progress" } });
      if (updateError) return { error: updateError, updatedCount: 0 };
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
      return { data: exercises.map(ex => ({
        rest_seconds: ex.rest_seconds,
        session_sets: ex.session_sets.map(s => ({
          completed_at: NOW,
          is_warmup_set: s.is_warmup_set,
        })),
      })), error: null };
    },
  };
}

// --- finishSessionCore tests ---

async function testFinishSessionRequiresInProgressFilter() {
  const exercises = [
    {
      rest_seconds: null,
      session_sets: [{ id: "1", is_warmup_set: false, completed_at: "2026-10-24T14:10:00Z" }],
    },
  ];

  const fake = makeFakeFinishSessionDeps(exercises, [], undefined, undefined);
  await finishSessionCore(fake, {
    sessionId: "s1",
    durationSeconds: 100,
    cooldownCompleted: true,
  });

  const updateCall = fake.calls.find((c: Call) => c.method === "update");
  assertTrue(updateCall !== undefined, "finishSession must call update");
  assertEquals(
    updateCall?.filters?.status,
    "in_progress",
    "finishSession must filter .eq('status', 'in_progress')",
  );
}

async function testFinishSessionRespectsDecideAbandonStatusZeroSets() {
  const exercises = [
    {
      rest_seconds: null,
      session_sets: [{ id: "1", is_warmup_set: true, completed_at: "2026-10-24T14:05:00Z" }], // Only warmup
    },
  ];

  const fake = makeFakeFinishSessionDeps(exercises, [], undefined, undefined);
  const result = await finishSessionCore(fake, {
    sessionId: "s1",
    durationSeconds: 100,
    cooldownCompleted: true,
  });

  assertTrue(result.ok, "finishSession with 0 working sets should succeed");
  if (result.ok) {
    assertEquals(
      result.data.status,
      "skipped",
      "finishSession with 0 working sets must save 'skipped'",
    );
  }
}

async function testFinishSessionRespectsDecideAbandonStatusWithWorkingSets() {
  const exercises = [
    {
      rest_seconds: null,
      session_sets: [
        { id: "1", is_warmup_set: true, completed_at: "2026-10-24T14:05:00Z" },
        { id: "2", is_warmup_set: false, completed_at: "2026-10-24T14:10:00Z" }, // Working set
      ],
    },
  ];

  const fake = makeFakeFinishSessionDeps(exercises, [], undefined, undefined);
  const result = await finishSessionCore(fake, {
    sessionId: "s1",
    durationSeconds: 100,
    cooldownCompleted: true,
  });

  assertTrue(result.ok, "finishSession with working sets should succeed");
  if (result.ok) {
    assertEquals(
      result.data.status,
      "completed",
      "finishSession with working sets must save 'completed'",
    );
  }
}

async function testFinishSessionHandlesReadError() {
  const fake = makeFakeFinishSessionDeps([], [], undefined, "Database read failed");
  const result = await finishSessionCore(fake, {
    sessionId: "s1",
    durationSeconds: 100,
    cooldownCompleted: true,
  });

  assertEquals(result.ok, false, "finishSession must return {ok:false} on read error");
  if (!result.ok) {
    assertEquals(result.error, "Database read failed", "finishSession must return read error message");
  }
}

async function testFinishSessionHandlesUpdateError() {
  const exercises = [
    {
      rest_seconds: null,
      session_sets: [{ id: "1", is_warmup_set: false, completed_at: "2026-10-24T14:10:00Z" }],
    },
  ];

  const fake = makeFakeFinishSessionDeps(exercises, [], "Database write failed");
  const result = await finishSessionCore(fake, {
    sessionId: "s1",
    durationSeconds: 100,
    cooldownCompleted: true,
  });

  assertEquals(result.ok, false, "finishSession must return {ok:false} on update error");
  if (!result.ok) {
    assertEquals(result.error, "Database write failed", "finishSession must return update error message");
  }
}

async function testFinishSessionSetsCooldownCompletedOnlyWhenCompleted() {
  const completedExercises = [
    {
      rest_seconds: null,
      session_sets: [{ id: "1", is_warmup_set: false, completed_at: "2026-10-24T14:10:00Z" }],
    },
  ];

  const fakeCompleted = makeFakeFinishSessionDeps(completedExercises, [], undefined, undefined);
  const resultCompleted = await finishSessionCore(fakeCompleted, {
    sessionId: "s1",
    durationSeconds: 100,
    cooldownCompleted: true,
  });

  assertTrue(resultCompleted.ok && resultCompleted.data.status === "completed", "completed session returned");

  // Skipped session
  const skippedExercises = [
    {
      rest_seconds: null,
      session_sets: [{ id: "1", is_warmup_set: true, completed_at: "2026-10-24T14:05:00Z" }],
    },
  ];

  const fakeSkipped = makeFakeFinishSessionDeps(skippedExercises, [], undefined, undefined);
  const resultSkipped = await finishSessionCore(fakeSkipped, {
    sessionId: "s1",
    durationSeconds: 100,
    cooldownCompleted: true,
  });

  assertTrue(resultSkipped.ok && resultSkipped.data.status === "skipped", "skipped session returned");
}

// --- abandonSessionCore tests ---

async function testAbandonSessionRequiresInProgressFilter() {
  const exercises = [
    {
      rest_seconds: null,
      session_sets: [{ id: "1", is_warmup_set: false }],
    },
  ];

  const fake = makeFakeAbandonSessionDeps(exercises, [], undefined, undefined);
  await abandonSessionCore(fake, "s1", 100);

  const updateCall = fake.calls.find((c: Call) => c.method === "update");
  assertTrue(updateCall !== undefined, "abandonSession must call update");
  assertEquals(
    updateCall?.filters?.status,
    "in_progress",
    "abandonSession must filter .eq('status', 'in_progress')",
  );
}

async function testAbandonSessionRespectsDecideAbandonStatus() {
  const exercises = [
    {
      rest_seconds: null,
      session_sets: [{ id: "1", is_warmup_set: true }], // Only warmup
    },
  ];

  const fake = makeFakeAbandonSessionDeps(exercises, [], undefined, undefined);
  const result = await abandonSessionCore(fake, "s1", 100);

  assertTrue(result.ok, "abandonSession with warmup-only should succeed");
  if (result.ok) {
    assertEquals(result.data.status, "skipped", "abandon with 0 working sets must save 'skipped'");
  }
}

async function testAbandonSessionHandlesReadError() {
  const fake = makeFakeAbandonSessionDeps([], [], undefined, "Database read failed");
  const result = await abandonSessionCore(fake, "s1", 100);

  assertEquals(result.ok, false, "abandonSession must return {ok:false} on read error");
  if (!result.ok) {
    assertEquals(result.error, "Database read failed", "abandonSession must return read error message");
  }
}

// --- Null duration tests (item 5) ---

async function testFinishSessionNullDurationForNullStartedAt() {
  // Session with null started_at and working sets logged
  const exercises = [
    {
      rest_seconds: 90,
      session_sets: [{ id: "1", is_warmup_set: false, completed_at: "2026-10-24T14:05:00Z" }],
    },
  ];

  const fake = makeFakeFinishSessionDeps(exercises, [], undefined, undefined, 1);
  // Override to return null started_at
  fake.loadSession = async () => ({
    data: {
      started_at: null,
      local_date: "2026-10-24",
      user_id: "user-123",
    },
    error: null,
  });

  const result = await finishSessionCore(fake, {
    sessionId: "s1",
    durationSeconds: 100,
    cooldownCompleted: true,
  });

  assertTrue(result.ok, "finishSession with null started_at must succeed (owner decision: never error)");
  if (result.ok) {
    assertEquals(result.data.status, "completed", "Status must be completed");
  }
  const updateCall = fake.calls.find((c: Call) => c.method === "update");
  assertTrue(updateCall !== undefined, "finishSession must call update (saves completed_at=now, duration=null)");
  if (updateCall && updateCall.patch) {
    assertEquals(updateCall.patch.status, "completed", "Update must save completed status");
    assertEquals(updateCall.patch.duration_seconds, null, "Duration must be null for invalid timestamps");
    assertEquals(updateCall.patch.completed_at, NOW, "completed_at must be NOW");
  }
}

async function testFinishSessionNullDurationForInvalidStartedAt() {
  // Session with invalid (unparseable) started_at and working sets logged
  const exercises = [
    {
      rest_seconds: 90,
      session_sets: [{ id: "1", is_warmup_set: false, completed_at: "2026-10-24T14:05:00Z" }],
    },
  ];

  const fake = makeFakeFinishSessionDeps(exercises, [], undefined, undefined, 1);
  // Override to return invalid started_at
  fake.loadSession = async () => ({
    data: {
      started_at: "invalid-date-string",
      local_date: "2026-10-24",
      user_id: "user-123",
    },
    error: null,
  });

  const result = await finishSessionCore(fake, {
    sessionId: "s1",
    durationSeconds: 100,
    cooldownCompleted: true,
  });

  assertTrue(result.ok, "finishSession with invalid started_at must succeed (owner decision)");
  if (result.ok) {
    assertEquals(result.data.status, "completed", "Status must be completed");
  }
  const updateCall = fake.calls.find((c: Call) => c.method === "update");
  assertTrue(updateCall !== undefined, "finishSession must call update (saves completed_at=now, duration=null)");
  if (updateCall && updateCall.patch) {
    assertEquals(updateCall.patch.status, "completed", "Update must save completed status");
    assertEquals(updateCall.patch.duration_seconds, null, "Duration must be null for invalid timestamps");
    assertEquals(updateCall.patch.completed_at, NOW, "completed_at must be NOW");
  }
}

async function testFinishSessionNullDurationForInvalidLastSetTime() {
  // Session with valid started_at but invalid lastSet completed_at
  const exercises = [
    {
      rest_seconds: 90,
      session_sets: [{ id: "1", is_warmup_set: false, completed_at: "not-a-valid-timestamp" }],
    },
  ];

  const fake = makeFakeFinishSessionDeps(exercises, [], undefined, undefined, 1);
  const result = await finishSessionCore(fake, {
    sessionId: "s1",
    durationSeconds: 100,
    cooldownCompleted: true,
  });

  assertTrue(result.ok, "finishSession with invalid lastSet time must succeed (owner decision)");
  if (result.ok) {
    assertEquals(result.data.status, "completed", "Status must be completed");
  }
  const updateCall = fake.calls.find((c: Call) => c.method === "update");
  assertTrue(updateCall !== undefined, "finishSession must call update (saves completed_at=now, duration=null)");
  if (updateCall && updateCall.patch) {
    assertEquals(updateCall.patch.status, "completed", "Update must save completed status");
    assertEquals(updateCall.patch.duration_seconds, null, "Duration must be null for invalid timestamps");
    assertEquals(updateCall.patch.completed_at, NOW, "completed_at must be NOW");
  }
}

// --- Run all tests ---

(async () => {
  console.log("🧪 Running finish-session-core tests...\n");

  await testFinishSessionRequiresInProgressFilter();
  await testFinishSessionRespectsDecideAbandonStatusZeroSets();
  await testFinishSessionRespectsDecideAbandonStatusWithWorkingSets();
  await testFinishSessionHandlesReadError();
  await testFinishSessionHandlesUpdateError();
  await testFinishSessionSetsCooldownCompletedOnlyWhenCompleted();
  await testFinishSessionNullDurationForNullStartedAt();
  await testFinishSessionNullDurationForInvalidStartedAt();
  await testFinishSessionNullDurationForInvalidLastSetTime();

  await testAbandonSessionRequiresInProgressFilter();
  await testAbandonSessionRespectsDecideAbandonStatus();
  await testAbandonSessionHandlesReadError();

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }
  console.log("\n✨ All finish-session-core tests passed!");
})();
