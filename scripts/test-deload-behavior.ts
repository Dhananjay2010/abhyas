#!/usr/bin/env tsx
/**
 * Behavioral test: deload week must reduce sets and trim reps for bodyweight/holds
 * 
 * ROOT CAUSE: Sessions started from PLANNED rows lost deload (14 sets instead of 8).
 * - planDay writes is_deload=true
 * - startSession resumes → ensureSessionExercises
 * - On MAIN: ensureSessionExercises didn't read is_deload, inserted full 14 sets
 * - EXPECTED: 8 sets with proper rep/hold trim for bodyweight exercises
 */

import { buildSessionExerciseRows } from "../src/lib/session/build-session-exercises.js";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("1. Deload week: weighted exercises get set reduction");
{
  const weightedExercises = [
    { exercise_id: "bench", order_index: 0, target_sets: 4, target_reps_min: 8, target_reps_max: 12, rest_seconds: 120,
      exercises: { metric: "reps", equipment_ids: ["barbell"] } },
    { exercise_id: "squat", order_index: 1, target_sets: 4, target_reps_min: 8, target_reps_max: 12, rest_seconds: 120,
      exercises: { metric: "reps", equipment_ids: ["barbell"] } },
    { exercise_id: "row", order_index: 2, target_sets: 3, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90,
      exercises: { metric: "reps", equipment_ids: ["barbell"] } },
    { exercise_id: "ohp", order_index: 3, target_sets: 3, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90,
      exercises: { metric: "reps", equipment_ids: ["barbell"] } },
  ];

  const deloadRows = buildSessionExerciseRows(weightedExercises, { isDeload: true });
  const totalSets = deloadRows.reduce((sum, r) => sum + r.planned_sets, 0);
  
  check("weighted deload: total sets 4+4+3+3 -> 2+2+2+2 = 8", totalSets === 8, `got ${totalSets}`);
  check("weighted deload: reps unchanged (8-12)", 
    deloadRows.every(r => r.planned_reps_min === 8 && r.planned_reps_max === 12),
    `got ${deloadRows[0].planned_reps_min}-${deloadRows[0].planned_reps_max}`);
}

console.log("\n2. Deload week: bodyweight exercises get rep trim (no set cut)");
{
  const bodyweightExercises = [
    { exercise_id: "pushup", order_index: 0, target_sets: 2, target_reps_min: 8, target_reps_max: 12, rest_seconds: 60,
      exercises: { metric: "reps", equipment_ids: [] } },
    { exercise_id: "pullup", order_index: 1, target_sets: 2, target_reps_min: 6, target_reps_max: 10, rest_seconds: 90,
      exercises: { metric: "reps", equipment_ids: [] } },
  ];

  const deloadRows = buildSessionExerciseRows(bodyweightExercises, { isDeload: true });
  
  check("bodyweight deload: sets unchanged (2->2, 2->2)", 
    deloadRows[0].planned_sets === 2 && deloadRows[1].planned_sets === 2,
    `got ${deloadRows[0].planned_sets}, ${deloadRows[1].planned_sets}`);
  check("bodyweight deload: reps trimmed 8-12 -> 5-8", 
    deloadRows[0].planned_reps_min === 5 && deloadRows[0].planned_reps_max === 8,
    `got ${deloadRows[0].planned_reps_min}-${deloadRows[0].planned_reps_max}`);
  check("bodyweight deload: reps trimmed 6-10 -> 4-7",
    deloadRows[1].planned_reps_min === 4 && deloadRows[1].planned_reps_max === 7,
    `got ${deloadRows[1].planned_reps_min}-${deloadRows[1].planned_reps_max}`);
}

console.log("\n3. Deload week: holds get duration trim");
{
  const holdExercises = [
    { exercise_id: "plank", order_index: 0, target_sets: 2, target_reps_min: 30, target_reps_max: 45, rest_seconds: 60,
      exercises: { metric: "seconds", equipment_ids: [] } },
  ];

  const deloadRows = buildSessionExerciseRows(holdExercises, { isDeload: true });
  
  check("hold deload: sets unchanged (2->2)", 
    deloadRows[0].planned_sets === 2,
    `got ${deloadRows[0].planned_sets}`);
  check("hold deload: duration trimmed 30-45 -> 20-30",
    deloadRows[0].planned_reps_min === 20 && deloadRows[0].planned_reps_max === 30,
    `got ${deloadRows[0].planned_reps_min}-${deloadRows[0].planned_reps_max}`);
}

console.log("\n4. Non-deload week: all exercises unchanged");
{
  const exercises = [
    { exercise_id: "bench", order_index: 0, target_sets: 4, target_reps_min: 8, target_reps_max: 12, rest_seconds: 120,
      exercises: { metric: "reps", equipment_ids: ["barbell"] } },
    { exercise_id: "pushup", order_index: 1, target_sets: 2, target_reps_min: 8, target_reps_max: 12, rest_seconds: 60,
      exercises: { metric: "reps", equipment_ids: [] } },
  ];

  const normalRows = buildSessionExerciseRows(exercises, { isDeload: false });
  const totalSets = normalRows.reduce((sum, r) => sum + r.planned_sets, 0);
  
  check("normal week: sets unchanged (4+2 = 6)", totalSets === 6, `got ${totalSets}`);
  check("normal week: reps unchanged (8-12)",
    normalRows.every(r => r.planned_reps_min === 8 && r.planned_reps_max === 12),
    `got ${normalRows[0].planned_reps_min}-${normalRows[0].planned_reps_max}`);
}

console.log("\n5. Validation: negative/NaN sets throw RangeError");
{
  try {
    const badRow = [
      { exercise_id: "bad", order_index: 0, target_sets: -1, target_reps_min: 8, target_reps_max: 12, rest_seconds: 60,
        exercises: { metric: "reps", equipment_ids: [] } },
    ];
    buildSessionExerciseRows(badRow, { isDeload: true });
    check("negative sets throw RangeError", false, "did not throw");
  } catch (err) {
    check("negative sets throw RangeError", err instanceof RangeError, `got ${err?.constructor?.name}`);
  }

  try {
    const nanRow = [
      { exercise_id: "nan", order_index: 0, target_sets: NaN, target_reps_min: 8, target_reps_max: 12, rest_seconds: 60,
        exercises: { metric: "reps", equipment_ids: [] } },
    ];
    buildSessionExerciseRows(nanRow, { isDeload: true });
    check("NaN sets throw RangeError", false, "did not throw");
  } catch (err) {
    check("NaN sets throw RangeError", err instanceof RangeError, `got ${err?.constructor?.name}`);
  }
}

if (failures === 0) {
  console.log("\n✅ ALL CHECKS PASSED\n");
  process.exit(0);
} else {
  console.log(`\n❌ ${failures} FAILURES\n`);
  process.exit(1);
}
