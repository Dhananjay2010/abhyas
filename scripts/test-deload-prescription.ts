#!/usr/bin/env tsx
/**
 * Test deload prescription logic (X10-X15)
 */
import { prepareSessionExercises } from "../src/lib/session/prepare-exercises";
import { applyDeload } from "../src/lib/program/prescription";

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    console.log(`  ✗ FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    process.exitCode = 1;
  }
}

async function main() {
  console.log("Testing deload prescription...");

  console.log("\nX10-X15: Deload reduces sets by 40%");
  {
    const programDayExercises = [
      {
        exercise_id: "ex1",
        order_index: 1,
        target_sets: 5,
        target_reps_min: 8,
        target_reps_max: 12,
        rest_seconds: 90,
        exercises: { metric: "reps" },
      },
      {
        exercise_id: "ex2",
        order_index: 2,
        target_sets: 4,
        target_reps_min: 10,
        target_reps_max: 15,
        rest_seconds: 75,
        exercises: { metric: "reps" },
      },
      {
        exercise_id: "ex3",
        order_index: 3,
        target_sets: 3,
        target_reps_min: 12,
        target_reps_max: 15,
        rest_seconds: 60,
        exercises: { metric: "reps" },
      },
    ];

    // Test with deload = true
    const deloadExercises = prepareSessionExercises("s1", "user1", programDayExercises, true);
    
    check("deload applied to ex1 (5 sets → 3)", deloadExercises[0].planned_sets === 3,
      `expected 3, got ${deloadExercises[0].planned_sets}`);
    check("deload applied to ex2 (4 sets → 2)", deloadExercises[1].planned_sets === 2,
      `expected 2, got ${deloadExercises[1].planned_sets}`);
    check("deload applied to ex3 (3 sets → 2)", deloadExercises[2].planned_sets === 2,
      `expected 2, got ${deloadExercises[2].planned_sets}`);

    // Test with deload = false (control)
    const normalExercises = prepareSessionExercises("s1", "user1", programDayExercises, false);
    
    check("normal ex1 keeps 5 sets", normalExercises[0].planned_sets === 5);
    check("normal ex2 keeps 4 sets", normalExercises[1].planned_sets === 4);
    check("normal ex3 keeps 3 sets", normalExercises[2].planned_sets === 3);
  }

  console.log("\nX10-X15: applyDeload formula is Math.max(2, Math.round(sets * 0.6))");
  {
    check("5 sets → 3 sets", applyDeload({ sets: 5, repsMin: 8, repsMax: 12, restSeconds: 90 }).sets === 3);
    check("4 sets → 2 sets", applyDeload({ sets: 4, repsMin: 8, repsMax: 12, restSeconds: 90 }).sets === 2);
    check("3 sets → 2 sets", applyDeload({ sets: 3, repsMin: 8, repsMax: 12, restSeconds: 90 }).sets === 2);
    check("2 sets → 2 sets (minimum)", applyDeload({ sets: 2, repsMin: 8, repsMax: 12, restSeconds: 90 }).sets === 2);
    check("1 set → 2 sets (minimum)", applyDeload({ sets: 1, repsMin: 8, repsMax: 12, restSeconds: 90 }).sets === 2);
  }

  console.log("\n" + (process.exitCode ? "TESTS FAILED" : "ALL TESTS PASSED"));
}

main();
