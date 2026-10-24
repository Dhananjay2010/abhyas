/**
 * Test deload application across all session-creation paths.
 *
 * QA HIGH: In a deload week, train-anyway and swapped days are labelled deload
 * but give full volume (4 sets at full weight), because ensureSessionExercises
 * copied exercises without applying the deload.
 *
 * Fix: prepareSessionExercises() is the ONE shared function that applies deload,
 * used by every path (startSession, ensureSessionExercises, train-anyway, swap,
 * tomorrow-choice, Keep, rebuild re-point).
 *
 *   npm run test:deload-paths
 */
import { prepareSessionExercises } from "../src/lib/session/prepare-exercises";
import { applyDeload } from "../src/lib/program/prescription";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. prepareSessionExercises applies deload when isDeload=true");
{
  const dayExercises = [
    {
      exercise_id: "ex1",
      order_index: 1,
      target_sets: 4,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 180,
      exercises: { metric: "reps" as const },
    },
    {
      exercise_id: "ex2",
      order_index: 2,
      target_sets: 3,
      target_reps_min: 10,
      target_reps_max: 15,
      rest_seconds: 120,
      exercises: { metric: "reps" as const },
    },
  ];

  const withDeload = prepareSessionExercises("session1", "user1", dayExercises, true);
  const withoutDeload = prepareSessionExercises("session1", "user1", dayExercises, false);

  check("without deload: 4 sets stays 4", withoutDeload[0]?.planned_sets === 4);
  check("without deload: 3 sets stays 3", withoutDeload[1]?.planned_sets === 3);
  check("with deload: 4 sets becomes 2", withDeload[0]?.planned_sets === 2);
  check("with deload: 3 sets becomes 2", withDeload[1]?.planned_sets === 2);
}

console.log("\n2. applyDeload reduces sets to ~60% (min 2)");
{
  const test = (sets: number) => applyDeload({
    sets,
    repsMin: 8,
    repsMax: 12,
    restSeconds: 180,
  }).sets;

  check("4 sets → 2 sets", test(4) === 2);
  check("3 sets → 2 sets", test(3) === 2);
  check("5 sets → 3 sets", test(5) === 3);
  check("2 sets → 2 sets (minimum)", test(2) === 2);
  check("1 set → 2 sets (minimum enforced)", test(1) === 2);
}

console.log("\n3. prepareSessionExercises preserves exercise order");
{
  const dayExercises = [
    {
      exercise_id: "ex1",
      order_index: 1,
      target_sets: 4,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 180,
      exercises: { metric: "reps" as const },
    },
    {
      exercise_id: "ex2",
      order_index: 2,
      target_sets: 3,
      target_reps_min: 10,
      target_reps_max: 15,
      rest_seconds: 120,
      exercises: { metric: "reps" as const },
    },
    {
      exercise_id: "ex3",
      order_index: 3,
      target_sets: 4,
      target_reps_min: 6,
      target_reps_max: 10,
      rest_seconds: 240,
      exercises: { metric: "reps" as const },
    },
  ];

  const result = prepareSessionExercises("session1", "user1", dayExercises, false);

  check("order_index 1 comes first", result[0]?.exercise_id === "ex1");
  check("order_index 2 comes second", result[1]?.exercise_id === "ex2");
  check("order_index 3 comes third", result[2]?.exercise_id === "ex3");
  check("all exercises included", result.length === 3);
}

console.log("\n4. prepareSessionExercises handles null target values with defaults");
{
  const dayExercises = [
    {
      exercise_id: "ex1",
      order_index: 1,
      target_sets: null,
      target_reps_min: null,
      target_reps_max: null,
      rest_seconds: null,
      exercises: { metric: "reps" as const },
    },
  ];

  const result = prepareSessionExercises("session1", "user1", dayExercises, false);

  check("null target_sets defaults to 3", result[0]?.planned_sets === 3);
  check("null target_reps_min defaults to 8", result[0]?.planned_reps_min === 8);
  check("null target_reps_max defaults to 12", result[0]?.planned_reps_max === 12);
  check("null rest_seconds defaults to 75", result[0]?.rest_seconds === 75);
}

console.log("\n5. prepareSessionExercises preserves metric from exercise");
{
  const dayExercises = [
    {
      exercise_id: "ex1",
      order_index: 1,
      target_sets: 3,
      target_reps_min: 30,
      target_reps_max: 60,
      rest_seconds: 60,
      exercises: { metric: "seconds" as const },
    },
    {
      exercise_id: "ex2",
      order_index: 2,
      target_sets: 4,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 180,
      exercises: { metric: "reps" as const },
    },
  ];

  const result = prepareSessionExercises("session1", "user1", dayExercises, false);

  check("metric 'seconds' preserved", result[0]?.metric === "seconds");
  check("metric 'reps' preserved", result[1]?.metric === "reps");
}

console.log("\n6. prepareSessionExercises assigns all required fields");
{
  const dayExercises = [
    {
      exercise_id: "ex1",
      order_index: 1,
      target_sets: 4,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 180,
      exercises: { metric: "reps" as const },
    },
  ];

  const result = prepareSessionExercises("session1", "user1", dayExercises, false);

  check("session_id set", result[0]?.session_id === "session1");
  check("user_id set", result[0]?.user_id === "user1");
  check("exercise_id set", result[0]?.exercise_id === "ex1");
  check("order_index set", result[0]?.order_index === 1);
  check("metric set", result[0]?.metric === "reps");
}

if (failures > 0) {
  console.log(`\n❌ ${failures} failure(s)`);
  process.exit(1);
} else {
  console.log("\n✅ All deload path checks passed");
}
