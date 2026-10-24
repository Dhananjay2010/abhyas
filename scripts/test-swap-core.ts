/**
 * Test swap action core with fake Supabase
 *
 *   npm run test:swap-core
 */
import type { Database } from "../src/lib/database.types";
import { FakeSupabaseClient } from "./fake-supabase";
import { swapExerciseCore } from "../src/lib/session/swap-core";

type SwapCoreDeps = Parameters<typeof swapExerciseCore>[0];

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function runTests() {
console.log("\nSwap core: reads NEW exercise progress (O1)");
{
  const fake = new FakeSupabaseClient();
  fake.seed("session_exercises", [
    { id: "se-1", exercise_id: "old-ex", metric: "reps", planned_reps_min: 8, planned_reps_max: 12 },
  ]);
  fake.seed("exercises", [{ id: "new-ex", metric: "reps", mechanic: "compound", movement_pattern: "hinge", equipment_ids: ["barbell"] }]);
  fake.seed("profiles", [{ id: "user-1", goal: "hypertrophy", level: "intermediate" }]);
  fake.seed("user_settings", [{ user_id: "user-1", planning_mode: "progressive_overload" }]);
  fake.seed("exercise_progress", [
    { user_id: "user-1", exercise_id: "old-ex", current_working_weight_kg: 40, current_target_reps: 12 },
    { user_id: "user-1", exercise_id: "new-ex", current_working_weight_kg: 60, current_target_reps: 10 },
  ]);

  await swapExerciseCore(
    { supabase: fake, userId: "user-1" } as SwapCoreDeps,
    { sessionExerciseId: "se-1", newExerciseId: "new-ex" }
  );

  const progressCalls = fake.getCalls().filter((c) => c.table === "exercise_progress");
  const progressCall = progressCalls[0];

  check("O1: queries exercise_progress table", progressCalls.length > 0);
  check(
    "O1: queries with NEW exercise_id (not old)",
    progressCall?.filters.some((f) => f.column === "exercise_id" && f.value === "new-ex"),
    `filters: ${JSON.stringify(progressCall?.filters)}`
  );
}

console.log("\nSwap core: respects daily_menu mode (O2)");
{
  const fake = new FakeSupabaseClient();
  fake.seed("session_exercises", [
    { id: "se-1", exercise_id: "old-ex", metric: "reps", planned_reps_min: 8, planned_reps_max: 12 },
  ]);
  fake.seed("exercises", [{ id: "new-ex", metric: "reps", mechanic: "compound", movement_pattern: "hinge", equipment_ids: ["barbell"] }]);
  fake.seed("profiles", [{ id: "user-1", goal: "hypertrophy", level: "intermediate" }]);
  fake.seed("user_settings", [{ user_id: "user-1", planning_mode: "daily_menu" }]);

  const result = await swapExerciseCore(
    { supabase: fake, userId: "user-1" } as SwapCoreDeps,
    { sessionExerciseId: "se-1", newExerciseId: "new-ex" }
  );

  const progressCalls = fake.getCalls().filter((c) => c.table === "exercise_progress");

  check("O2: daily_menu skips progress query", progressCalls.length === 0, `got ${progressCalls.length} calls`);
  check("O2: daily_menu returns null weights", result.ok && result.data.workingWeightKg === null);
}

console.log("\nSwap core: applies deload (O3)");
{
  const fakeWithDeload = new FakeSupabaseClient();
  fakeWithDeload.seed("session_exercises", [
    {
      id: "se-1",
      exercise_id: "old-ex",
      metric: "reps",
      planned_reps_min: 8,
      planned_reps_max: 12,
      sessions: { is_deload: true },
    },
  ]);
  fakeWithDeload.seed("exercises", [
    { id: "new-ex", metric: "reps", mechanic: "compound", movement_pattern: "hinge", equipment_ids: ["barbell"] },
  ]);
  fakeWithDeload.seed("profiles", [{ id: "user-1", goal: "hypertrophy", level: "intermediate" }]);
  fakeWithDeload.seed("user_settings", [{ user_id: "user-1", planning_mode: "progressive_overload" }]);
  fakeWithDeload.seed("exercise_progress", [
    { user_id: "user-1", exercise_id: "new-ex", current_working_weight_kg: 100, current_target_reps: 10 },
  ]);

  const resultDeload = await swapExerciseCore(
    { supabase: fakeWithDeload as unknown as SupabaseClient<Database>, userId: "user-1" },
    { sessionExerciseId: "se-1", newExerciseId: "new-ex" }
  );

  const fakeNoDeload = new FakeSupabaseClient();
  fakeNoDeload.seed("session_exercises", [
    { id: "se-1", exercise_id: "old-ex", metric: "reps", planned_reps_min: 8, planned_reps_max: 12, sessions: { is_deload: false } },
  ]);
  fakeNoDeload.seed("exercises", [
    { id: "new-ex", metric: "reps", mechanic: "compound", movement_pattern: "hinge", equipment_ids: ["barbell"] },
  ]);
  fakeNoDeload.seed("profiles", [{ id: "user-1", goal: "hypertrophy", level: "intermediate" }]);
  fakeNoDeload.seed("user_settings", [{ user_id: "user-1", planning_mode: "progressive_overload" }]);
  fakeNoDeload.seed("exercise_progress", [
    { user_id: "user-1", exercise_id: "new-ex", current_working_weight_kg: 100, current_target_reps: 10 },
  ]);

  const resultNoDeload = await swapExerciseCore(
    { supabase: fakeNoDeload as unknown as SupabaseClient<Database>, userId: "user-1" },
    { sessionExerciseId: "se-1", newExerciseId: "new-ex" }
  );

  check(
    "O3: deload reduces suggested weight",
    resultDeload.ok &&
      resultNoDeload.ok &&
      resultDeload.data.suggestedWeightKg !== null &&
      resultNoDeload.data.suggestedWeightKg !== null &&
      resultDeload.data.suggestedWeightKg < resultNoDeload.data.suggestedWeightKg,
    `deload=${resultDeload.ok ? resultDeload.data.suggestedWeightKg : "?"}, no-deload=${resultNoDeload.ok ? resultNoDeload.data.suggestedWeightKg : "?"}`
  );
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
}

runTests();
