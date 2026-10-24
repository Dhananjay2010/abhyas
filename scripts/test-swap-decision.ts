/**
 * Test swap decision logic (extracted pure function)
 *
 *   npm run test:swap-decision
 */
import { buildSwapResult } from "../src/lib/session/swap-decision";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nSwap decision: uses NEW exercise progress");
{
  const result = buildSwapResult({
    newExerciseProgress: {
      currentWorkingWeightKg: 60,
      currentTargetReps: 10,
    },
    planningMode: "progressive_overload",
    isDeload: false,
    exerciseMeta: {
      mechanic: "compound",
      movementPattern: "hinge",
      metric: "reps",
      equipmentIds: ["barbell"],
    },
    repsMin: 8,
    repsMax: 12,
  });

  check("uses new exercise's working weight",
    result.workingWeightKg === 60,
    `got ${result.workingWeightKg}`);
  check("uses new exercise's target reps",
    result.targetReps === 10,
    `got ${result.targetReps}`);
  check("suggested weight matches working (not deload)",
    result.suggestedWeightKg === 60,
    `got ${result.suggestedWeightKg}`);
}

console.log("\nSwap decision: respects daily_menu mode");
{
  const result = buildSwapResult({
    newExerciseProgress: {
      currentWorkingWeightKg: 60,
      currentTargetReps: 10,
    },
    planningMode: "daily_menu",
    isDeload: false,
    exerciseMeta: {
      mechanic: "compound",
      movementPattern: "hinge",
      metric: "reps",
      equipmentIds: ["barbell"],
    },
    repsMin: 8,
    repsMax: 12,
  });

  check("daily_menu ignores progress: working weight is null",
    result.workingWeightKg === null,
    `got ${result.workingWeightKg}`);
  check("daily_menu ignores progress: target reps is null",
    result.targetReps === null,
    `got ${result.targetReps}`);
  check("daily_menu: suggested weight is null",
    result.suggestedWeightKg === null,
    `got ${result.suggestedWeightKg}`);
}

console.log("\nSwap decision: applies deload");
{
  const result = buildSwapResult({
    newExerciseProgress: {
      currentWorkingWeightKg: 100,
      currentTargetReps: 10,
    },
    planningMode: "progressive_overload",
    isDeload: true,
    exerciseMeta: {
      mechanic: "compound",
      movementPattern: "hinge",
      metric: "reps",
      equipmentIds: ["barbell"],
    },
    repsMin: 8,
    repsMax: 12,
  });

  check("deload: working weight unchanged",
    result.workingWeightKg === 100,
    `got ${result.workingWeightKg}`);
  check("deload: suggested weight is reduced",
    result.suggestedWeightKg !== null && result.suggestedWeightKg < 100,
    `got ${result.suggestedWeightKg} (should be < 100)`);
}

console.log("\nSwap decision: no progress record");
{
  const result = buildSwapResult({
    newExerciseProgress: null,
    planningMode: "progressive_overload",
    isDeload: false,
    exerciseMeta: {
      mechanic: "compound",
      movementPattern: "hinge",
      metric: "reps",
      equipmentIds: ["barbell"],
    },
    repsMin: 8,
    repsMax: 12,
  });

  check("no progress: working weight is null",
    result.workingWeightKg === null,
    `got ${result.workingWeightKg}`);
  check("no progress: target reps is null",
    result.targetReps === null,
    `got ${result.targetReps}`);
  check("no progress: suggested weight is null",
    result.suggestedWeightKg === null,
    `got ${result.suggestedWeightKg}`);
}

console.log("\nSwap decision: bodyweight exercise");
{
  const result = buildSwapResult({
    newExerciseProgress: {
      currentWorkingWeightKg: null,
      currentTargetReps: 10,
    },
    planningMode: "progressive_overload",
    isDeload: false,
    exerciseMeta: {
      mechanic: "compound",
      movementPattern: "vertical_pull",
      metric: "reps",
      equipmentIds: ["pull_up_bar"],
    },
    repsMin: 5,
    repsMax: 10,
  });

  check("bodyweight: working weight is null",
    result.workingWeightKg === null,
    `got ${result.workingWeightKg}`);
  check("bodyweight: target reps preserved",
    result.targetReps === 10,
    `got ${result.targetReps}`);
  check("bodyweight: suggested weight is null",
    result.suggestedWeightKg === null,
    `got ${result.suggestedWeightKg}`);
}

console.log("\nSwap uses new exercise, not old");
{
  // If the action mistakenly reads current.exercise_id instead of input.newExerciseId,
  // it would get the old exercise's progress instead of the new one's.
  // This test shows the difference.
  
  const oldExerciseProgress = {
    currentWorkingWeightKg: 40,
    currentTargetReps: 12,
  };
  
  const newExerciseProgress = {
    currentWorkingWeightKg: 60,
    currentTargetReps: 10,
  };
  
  const withOld = buildSwapResult({
    newExerciseProgress: oldExerciseProgress,
    planningMode: "progressive_overload",
    isDeload: false,
    exerciseMeta: {
      mechanic: "compound",
      movementPattern: "hinge",
      metric: "reps",
      equipmentIds: ["barbell"],
    },
    repsMin: 8,
    repsMax: 12,
  });
  
  const withNew = buildSwapResult({
    newExerciseProgress: newExerciseProgress,
    planningMode: "progressive_overload",
    isDeload: false,
    exerciseMeta: {
      mechanic: "compound",
      movementPattern: "hinge",
      metric: "reps",
      equipmentIds: ["barbell"],
    },
    repsMin: 8,
    repsMax: 12,
  });
  
  check("swap must differ when progress differs",
    withOld.workingWeightKg !== withNew.workingWeightKg,
    `old=${withOld.workingWeightKg}, new=${withNew.workingWeightKg}`);
  check("correct swap uses new exercise weight (60)",
    withNew.workingWeightKg === 60,
    `got ${withNew.workingWeightKg}`);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
