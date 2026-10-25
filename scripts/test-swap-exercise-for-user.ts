import { swapExerciseForUser } from "../src/lib/session/swap-exercise-for-user";
import type { Database } from "../src/lib/database.types";

type Metric = Database["public"]["Enums"]["exercise_metric"];

function createFakeSupabase(progressRow: { working_weight_kg: number; current_target_reps: number } | null, planningMode: "daily_menu" | "progression" | null) {
  const fakeChain = {
    from: (table: string) => {
      if (table === "session_exercises") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  exercise_id: "old-ex",
                  metric: "reps" as Metric,
                  planned_reps_min: 6,
                  planned_reps_max: 8,
                  session_id: "sess-123",
                },
              }),
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      }
      if (table === "exercises") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  metric: "reps" as Metric,
                  mechanic: "compound",
                  equipment_ids: ["bar"],
                  movement_pattern: "squat",
                },
              }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  goal: "strength",
                  level: "novice",
                },
              }),
            }),
          }),
        };
      }
      if (table === "user_settings") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: planningMode ? { planning_mode: planningMode } : null,
              }),
            }),
          }),
        };
      }
      if (table === "exercise_progress") {
        return {
          select: () => ({
            eq: (_field: string, _value: string) => {
              const chainable = {
                eq: (_field2: string, _value2: string) => chainable,
                maybeSingle: async () => ({
                  data: progressRow ? {
                    current_working_weight_kg: progressRow.working_weight_kg,
                    current_target_reps: progressRow.current_target_reps,
                  } : null,
                }),
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({
                      data: progressRow,
                    }),
                  }),
                }),
              };
              return chainable;
            },
          }),
        };
      }
      if (table === "sessions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { is_deload: false },
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return fakeChain as any;
}

async function testDailyMenu() {
  const supabase = createFakeSupabase(
    { working_weight_kg: 100, current_target_reps: 10 },
    "daily_menu"
  );

  const result = await swapExerciseForUser(supabase, "user-1", {
    sessionExerciseId: "se-1",
    newExerciseId: "new-ex",
  });

  if (!result.ok) throw new Error(`Daily menu test failed: ${result.error}`);
  
  const { weightPrefill, workingWeightKg, currentTargetReps } = result.data;
  if (weightPrefill !== null) {
    throw new Error(`Daily menu: expected null weightPrefill, got ${weightPrefill}`);
  }
  if (workingWeightKg !== null) {
    throw new Error(`Daily menu: expected null workingWeightKg, got ${workingWeightKg}`);
  }
  if (currentTargetReps !== null) {
    throw new Error(`Daily menu: expected null currentTargetReps, got ${currentTargetReps}`);
  }

  console.log("✓ Daily menu: weightPrefill, workingWeightKg, and currentTargetReps are all null");
}

async function testProgression() {
  const supabase = createFakeSupabase(
    { working_weight_kg: 100, current_target_reps: 10 },
    "progression"
  );

  const result = await swapExerciseForUser(supabase, "user-1", {
    sessionExerciseId: "se-1",
    newExerciseId: "new-ex",
  });

  if (!result.ok) throw new Error(`Progression test failed: ${result.error}`);
  
  const { weightPrefill, workingWeightKg, currentTargetReps } = result.data;
  if (weightPrefill !== 100) {
    throw new Error(`Progression: expected 100 kg weightPrefill, got ${weightPrefill}`);
  }
  if (workingWeightKg !== 100) {
    throw new Error(`Progression: expected 100 kg workingWeightKg, got ${workingWeightKg}`);
  }
  if (currentTargetReps !== 10) {
    throw new Error(`Progression: expected 10 currentTargetReps, got ${currentTargetReps}`);
  }

  console.log("✓ Progression: weightPrefill 100 kg, workingWeightKg 100 kg, currentTargetReps 10");
}

async function testDailyMenuDepsForwarding() {
  // This test verifies that the deps lambda in swapExerciseForUser correctly forwards
  // the remembersWeights flag. It creates a scenario where planning_mode is "daily_menu"
  // but we have progress data - if the deps lambda passes true instead of the actual flag,
  // we'll get weights back even though we shouldn't.
  const supabase = createFakeSupabase(
    { working_weight_kg: 100, current_target_reps: 10 },
    "daily_menu"
  );

  const result = await swapExerciseForUser(supabase, "user-1", {
    sessionExerciseId: "se-1",
    newExerciseId: "new-ex",
  });

  if (!result.ok) throw new Error(`Daily menu deps forwarding test failed: ${result.error}`);
  
  const { weightPrefill, workingWeightKg } = result.data;
  
  // If deps lambda passes hardcoded true, resolveSwapWeights will return 100 kg
  // If it correctly forwards false, resolveSwapWeights returns null
  if (weightPrefill !== null) {
    throw new Error(`Daily menu deps forwarding: expected null weightPrefill (flag not forwarded), got ${weightPrefill}`);
  }
  if (workingWeightKg !== null) {
    throw new Error(`Daily menu deps forwarding: expected null workingWeightKg (flag not forwarded), got ${workingWeightKg}`);
  }

  console.log("✓ Daily menu deps forwarding: deps lambda correctly forwards remembersWeights=false");
}

async function testNullPlanningMode() {
  const supabase = createFakeSupabase(
    { working_weight_kg: 100, current_target_reps: 10 },
    null
  );

  const result = await swapExerciseForUser(supabase, "user-1", {
    sessionExerciseId: "se-1",
    newExerciseId: "new-ex",
  });

  if (!result.ok) throw new Error(`Null planning mode test failed: ${result.error}`);
  
  const { weightPrefill, workingWeightKg, currentTargetReps } = result.data;
  if (weightPrefill !== 100) {
    throw new Error(`Null planning mode: expected 100 kg weightPrefill, got ${weightPrefill}`);
  }
  if (workingWeightKg !== 100) {
    throw new Error(`Null planning mode: expected 100 kg workingWeightKg, got ${workingWeightKg}`);
  }
  if (currentTargetReps !== 10) {
    throw new Error(`Null planning mode: expected 10 currentTargetReps, got ${currentTargetReps}`);
  }

  console.log("✓ Null planning mode defaults to remembering (100 kg, 10 reps)");
}

async function main() {
  console.log("Testing swapExerciseForUser with in-memory fake Supabase client...\n");
  
  await testDailyMenu();
  await testProgression();
  await testNullPlanningMode();
  await testDailyMenuDepsForwarding();

  console.log("\nAll swapExerciseForUser tests passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
