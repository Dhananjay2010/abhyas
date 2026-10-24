/**
 * Mutant-killing unit tests for prepareSessionExercises.
 *
 * Tests the shared deload application function used by every path that creates
 * session exercises: startSession, ensureSessionExercises, train-anyway, swap,
 * tomorrow-choice, rebuild re-point.
 *
 * npm run test:prepare-session-exercises
 */
import { prepareSessionExercises } from "../src/app/session/actions";

type ProgramDayExercise = {
  exercise_id: string;
  order_index: number;
  target_sets: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  rest_seconds: number | null;
  exercises: { metric?: string } | null;
};

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function exercise(
  id: string,
  orderIndex: number,
  sets: number,
  repsMin: number,
  repsMax: number,
  metric?: "reps" | "seconds",
): ProgramDayExercise {
  return {
    exercise_id: id,
    order_index: orderIndex,
    target_sets: sets,
    target_reps_min: repsMin,
    target_reps_max: repsMax,
    rest_seconds: 90,
    exercises: metric === "seconds" ? { metric: "seconds" } : null,
  };
}

console.log("\n1. Normal week (not deload): exercises get full volume");
{
  const exercises = [
    exercise("ex1", 1, 4, 8, 12),
    exercise("ex2", 2, 3, 10, 15),
  ];
  const result = prepareSessionExercises("session1", "user1", exercises, false);

  check("returns 2 exercises", result.length === 2);
  check("first exercise has 4 sets", result[0].planned_sets === 4);
  check("first exercise has 8-12 reps", result[0].planned_reps_min === 8 && result[0].planned_reps_max === 12);
  check("second exercise has 3 sets", result[1].planned_sets === 3);
  check("second exercise has 10-15 reps", result[1].planned_reps_min === 10 && result[1].planned_reps_max === 15);
  check("metric defaults to reps", result[0].metric === "reps");
}

console.log("\n2. Deload week: sets reduced by 60%, min 2");
{
  const exercises = [
    exercise("ex1", 1, 4, 8, 12),
    exercise("ex2", 2, 3, 10, 15),
    exercise("ex3", 3, 5, 6, 10),
  ];
  const result = prepareSessionExercises("session1", "user1", exercises, true);

  check("returns 3 exercises", result.length === 3);
  // 4 sets → Math.max(2, Math.round(4 * 0.6)) = Math.max(2, 2) = 2
  check("4 sets becomes 2 (deload)", result[0].planned_sets === 2);
  // 3 sets → Math.max(2, Math.round(3 * 0.6)) = Math.max(2, 2) = 2
  check("3 sets becomes 2 (deload)", result[1].planned_sets === 2);
  // 5 sets → Math.max(2, Math.round(5 * 0.6)) = Math.max(2, 3) = 3
  check("5 sets becomes 3 (deload)", result[2].planned_sets === 3);
  check("reps unchanged in deload", result[0].planned_reps_min === 8 && result[0].planned_reps_max === 12);
}

console.log("\n3. Null values get defaults: 3 sets, 8-12 reps, 75s rest");
{
  const exercises: ProgramDayExercise[] = [
    {
      exercise_id: "ex1",
      order_index: 1,
      target_sets: null,
      target_reps_min: null,
      target_reps_max: null,
      rest_seconds: null,
      exercises: null,
    },
  ];
  const result = prepareSessionExercises("session1", "user1", exercises, false);

  check("null sets defaults to 3", result[0].planned_sets === 3);
  check("null reps_min defaults to 8", result[0].planned_reps_min === 8);
  check("null reps_max defaults to 12", result[0].planned_reps_max === 12);
  check("null rest defaults to 75", result[0].rest_seconds === 75);
}

console.log("\n4. Metric is preserved: seconds vs reps");
{
  const exercises = [
    exercise("plank", 1, 3, 30, 60, "seconds"),
    exercise("squat", 2, 4, 8, 12, "reps"),
  ];
  const result = prepareSessionExercises("session1", "user1", exercises, false);

  check("plank metric is seconds", result[0].metric === "seconds");
  check("squat metric is reps", result[1].metric === "reps");
}

console.log("\n5. Session and user IDs are stamped correctly");
{
  const exercises = [exercise("ex1", 1, 4, 8, 12)];
  const result = prepareSessionExercises("my-session", "my-user", exercises, false);

  check("session_id stamped", result[0].session_id === "my-session");
  check("user_id stamped", result[0].user_id === "my-user");
  check("exercise_id preserved", result[0].exercise_id === "ex1");
  check("order_index preserved", result[0].order_index === 1);
}

console.log("\n6. Empty exercise list returns empty result");
{
  const result = prepareSessionExercises("session1", "user1", [], false);
  check("empty input returns empty array", result.length === 0);
}

console.log("\n7. Deload with 2 sets stays at 2 (min threshold)");
{
  const exercises = [exercise("ex1", 1, 2, 8, 12)];
  const result = prepareSessionExercises("session1", "user1", exercises, true);
  // 2 sets → Math.max(2, Math.round(2 * 0.6)) = Math.max(2, 1) = 2
  check("2 sets stays 2 in deload (min)", result[0].planned_sets === 2);
}

console.log("\n8. Deload with 6 sets becomes 4");
{
  const exercises = [exercise("ex1", 1, 6, 8, 12)];
  const result = prepareSessionExercises("session1", "user1", exercises, true);
  // 6 sets → Math.max(2, Math.round(6 * 0.6)) = Math.max(2, 4) = 4
  check("6 sets becomes 4 in deload", result[0].planned_sets === 4);
}

if (failures > 0) {
  console.log(`\n❌ ${failures} failure(s)`);
  process.exit(1);
} else {
  console.log("\n✅ All checks passed");
}
