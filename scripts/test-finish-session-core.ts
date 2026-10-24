#!/usr/bin/env tsx
import { finishSessionCore } from "../src/lib/session/finish-session";
import { abandonSessionCore } from "../src/lib/session/abandon-session";

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

type Call = { method: string; table: string; payload?: Record<string, unknown>; filters?: Record<string, unknown> };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeFakeSupabase(exercises: any[], updateError?: string, readError?: string): any {
  const calls: Call[] = [];

  return {
    calls,
    from: (table: string) => {
      let currentTable = table;
      let selectColumns = "*";
      const filters: Record<string, unknown> = {};
      let updatePayload: Record<string, unknown> = {};

      return {
        select: (columns: string) => {
          selectColumns = columns;
          return {
            eq: (column: string, value: unknown) => {
              filters[column] = value;
              calls.push({
                method: "select",
                table: currentTable,
                filters: { ...filters },
              });

              if (readError) {
                return { data: null, error: { message: readError } };
              }

              return { data: exercises, error: null };
            },
          };
        },
        update: (payload: Record<string, unknown>) => {
          updatePayload = payload;
          return {
            eq: (column: string, value: unknown) => {
              filters[column] = value;
              return {
                eq: (column2: string, value2: unknown) => {
                  filters[column2] = value2;
                  calls.push({
                    method: "update",
                    table: currentTable,
                    payload: { ...updatePayload },
                    filters: { ...filters },
                  });

                  if (updateError) {
                    return { error: { message: updateError } };
                  }

                  return { error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

// --- finishSessionCore tests ---

async function testFinishSessionRequiresInProgressFilter() {
  const exercises = [
    {
      session_sets: [{ id: "1", is_warmup_set: false }],
    },
  ];

  const fake = makeFakeSupabase(exercises);
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
      session_sets: [{ id: "1", is_warmup_set: true }], // Only warmup
    },
  ];

  const fake = makeFakeSupabase(exercises);
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

  const updateCall = fake.calls.find((c: Call) => c.method === "update");
  assertEquals(updateCall?.payload?.status, "skipped", "update must use 'skipped' status");
}

async function testFinishSessionRespectsDecideAbandonStatusWithWorkingSets() {
  const exercises = [
    {
      session_sets: [
        { id: "1", is_warmup_set: true },
        { id: "2", is_warmup_set: false }, // Working set
      ],
    },
  ];

  const fake = makeFakeSupabase(exercises);
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

  const updateCall = fake.calls.find((c: Call) => c.method === "update");
  assertEquals(updateCall?.payload?.status, "completed", "update must use 'completed' status");
}

async function testFinishSessionHandlesReadError() {
  const fake = makeFakeSupabase([], undefined, "Database read failed");
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
      session_sets: [{ id: "1", is_warmup_set: false }],
    },
  ];

  const fake = makeFakeSupabase(exercises, "Database write failed");
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
      session_sets: [{ id: "1", is_warmup_set: false }],
    },
  ];

  const fakeCompleted = makeFakeSupabase(completedExercises);
  await finishSessionCore(fakeCompleted, {
    sessionId: "s1",
    durationSeconds: 100,
    cooldownCompleted: true,
  });

  const completedUpdateCall = fakeCompleted.calls.find((c: Call) => c.method === "update");
  assertEquals(
    completedUpdateCall?.payload?.cooldown_completed,
    true,
    "completed session must set cooldown_completed",
  );

  // Skipped session
  const skippedExercises = [
    {
      session_sets: [{ id: "1", is_warmup_set: true }],
    },
  ];

  const fakeSkipped = makeFakeSupabase(skippedExercises);
  await finishSessionCore(fakeSkipped, {
    sessionId: "s1",
    durationSeconds: 100,
    cooldownCompleted: true,
  });

  const skippedUpdateCall = fakeSkipped.calls.find((c: Call) => c.method === "update");
  assertEquals(
    skippedUpdateCall?.payload?.cooldown_completed,
    undefined,
    "skipped session must NOT set cooldown_completed",
  );
}

// --- abandonSessionCore tests ---

async function testAbandonSessionRequiresInProgressFilter() {
  const exercises = [
    {
      session_sets: [{ id: "1", is_warmup_set: false }],
    },
  ];

  const fake = makeFakeSupabase(exercises);
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
      session_sets: [{ id: "1", is_warmup_set: true }], // Only warmup
    },
  ];

  const fake = makeFakeSupabase(exercises);
  await abandonSessionCore(fake, "s1", 100);

  const updateCall = fake.calls.find((c: Call) => c.method === "update");
  assertEquals(updateCall?.payload?.status, "skipped", "abandon with 0 working sets must save 'skipped'");
}

async function testAbandonSessionHandlesReadError() {
  const fake = makeFakeSupabase([], undefined, "Database read failed");
  const result = await abandonSessionCore(fake, "s1", 100);

  assertEquals(result.ok, false, "abandonSession must return {ok:false} on read error");
  if (!result.ok) {
    assertEquals(result.error, "Database read failed", "abandonSession must return read error message");
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
