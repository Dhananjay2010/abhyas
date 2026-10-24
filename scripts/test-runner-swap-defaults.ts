/**
 * Test runner swap defaults (M6, G5 mutations)
 *
 *   npm run test:runner-swap-defaults
 */
import { runnerSwapDefaults } from "../src/lib/session/runner-swap-defaults";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nM6: runner applies effectiveRepsMax");
{
  const current = { repsMax: 12 };
  const swapped = {
    metric: "reps",
    repsMin: 5,
    repsMax: 10,
    equipmentIds: ["pull_up_bar"],
    workingWeightKg: null,
    suggestedWeightKg: null,
    targetReps: 14,
  };

  const result = runnerSwapDefaults(current, swapped);

  check(
    "M6: uses effectiveRepsMax (bodyweight progressed target)",
    result.repsMax === 14,
    `got ${result.repsMax}, should use progressed=14 not planned=10`
  );
}

console.log("\nG5: runner doesn't ignore swapped weights");
{
  const currentLoaded = { repsMax: 12 };
  const swappedLoaded = {
    metric: "reps",
    repsMin: 8,
    repsMax: 12,
    equipmentIds: ["barbell"],
    workingWeightKg: 60,
    suggestedWeightKg: 60,
    targetReps: 14,
  };

  const resultLoaded = runnerSwapDefaults(currentLoaded, swappedLoaded);

  check(
    "G5: loaded exercise ignores progressed target, uses planned",
    resultLoaded.repsMax === 12,
    `got ${resultLoaded.repsMax}, loaded should use planned=12 not progressed=14`
  );

  const currentBodyweight = { repsMax: 10 };
  const swappedBodyweight = {
    metric: "reps",
    repsMin: 5,
    repsMax: 10,
    equipmentIds: ["pull_up_bar"],
    workingWeightKg: null,
    suggestedWeightKg: null,
    targetReps: 14,
  };

  const resultBodyweight = runnerSwapDefaults(currentBodyweight, swappedBodyweight);

  check(
    "G5: bodyweight uses progressed target when higher",
    resultBodyweight.repsMax === 14,
    `got ${resultBodyweight.repsMax}, bodyweight should use progressed=14`
  );
}

console.log("\nRunner swap: isBodyweight derived from equipment");
{
  const current = { repsMax: 12 };
  const barbell = {
    metric: "reps",
    repsMin: 8,
    repsMax: 12,
    equipmentIds: ["barbell"],
    workingWeightKg: 60,
    suggestedWeightKg: 60,
    targetReps: null,
  };

  const pullup = {
    metric: "reps",
    repsMin: 5,
    repsMax: 10,
    equipmentIds: ["pull_up_bar"],
    workingWeightKg: null,
    suggestedWeightKg: null,
    targetReps: null,
  };

  const barbellResult = runnerSwapDefaults(current, barbell);
  const pullupResult = runnerSwapDefaults(current, pullup);

  check("barbell is not bodyweight", barbellResult.isBodyweight === false);
  check("pull-up bar is bodyweight", pullupResult.isBodyweight === true);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
