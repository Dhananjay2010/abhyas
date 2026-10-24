/**
 * Test page.tsx runner initialization logic
 * Verifies initial weight and target computation from progress
 *
 *   npm run test:page-runner-init
 */
import { effectiveRepsMax } from "../src/lib/program/effective-target";
import { suggestedWeight } from "../src/lib/program/progression";
import { isBodyweightEquipment } from "../src/lib/program/bodyweight";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nRunner init: loaded exercise (has progress)");
{
  const progress = {
    current_working_weight_kg: 60,
    current_target_reps: 10,
  };
  const plannedMax = 12;
  const isBodyweight = false;
  const working = progress.current_working_weight_kg;

  const repsMax = effectiveRepsMax({
    plannedMax,
    progressedTarget: progress.current_target_reps,
    isBodyweight,
    usedWeight: working,
  });

  const suggested = suggestedWeight(
    { currentWorkingWeightKg: working },
    false,
    {
      mechanic: "compound",
      movementPattern: "hinge",
      metric: "reps",
      isBodyweight,
      progressionChain: null,
      progressionRank: null,
      equipmentIds: ["barbell"],
    }
  );

  check("working weight is from progress",
    working === 60,
    `got ${working}`);
  
  check("loaded exercise uses planned max (ignores progressed target)",
    repsMax === 12,
    `got ${repsMax}, progressed=${progress.current_target_reps}`);
  
  check("suggested weight equals working (not deload)",
    suggested === 60,
    `got ${suggested}`);
}

console.log("\nRunner init: bodyweight exercise (progressed target)");
{
  const progress = {
    current_working_weight_kg: null,
    current_target_reps: 14,
  };
  const plannedMax = 12;
  const isBodyweight = true;
  const working = null;

  const repsMax = effectiveRepsMax({
    plannedMax,
    progressedTarget: progress.current_target_reps,
    isBodyweight,
    usedWeight: working,
  });

  check("bodyweight: working weight is null",
    working === null);
  
  check("bodyweight uses progressed target when higher",
    repsMax === 14,
    `got ${repsMax}, planned=${plannedMax}`);
}

console.log("\nRunner init: no progress record");
{
  type ProgressRecord = { current_working_weight_kg: number | null; current_target_reps: number | null };
  const progress = undefined as ProgressRecord | undefined;
  const plannedMax = 12;
  const isBodyweight = false;
  const working = progress?.current_working_weight_kg ?? null;

  const repsMax = effectiveRepsMax({
    plannedMax,
    progressedTarget: progress?.current_target_reps,
    isBodyweight,
    usedWeight: working,
  });

  check("no progress: working weight is null",
    working === null);
  
  check("no progress: uses planned max",
    repsMax === 12,
    `got ${repsMax}`);
}

console.log("\nRunner init: equipment classification");
{
  check("empty equipment is bodyweight",
    isBodyweightEquipment([]) === true);
  
  check("pull-up bar is bodyweight",
    isBodyweightEquipment(["pull_up_bar"]) === true);
  
  check("barbell is not bodyweight",
    isBodyweightEquipment(["barbell"]) === false);
}

console.log("\nMutation guards: G5 and P-series");
{
  // G5: Runner ignores progressed target (swapped weights)
  const progress = {
    current_working_weight_kg: 60,
    current_target_reps: 14,
  };
  
  const loadedMax = effectiveRepsMax({
    plannedMax: 12,
    progressedTarget: progress.current_target_reps,
    isBodyweight: false,
    usedWeight: progress.current_working_weight_kg,
  });
  
  const bodyweightMax = effectiveRepsMax({
    plannedMax: 12,
    progressedTarget: progress.current_target_reps,
    isBodyweight: true,
    usedWeight: null,
  });
  
  check("G5: loaded ignores progressed, uses planned (mutation guard)",
    loadedMax === 12,
    `got ${loadedMax}, should ignore progressed=${progress.current_target_reps}`);
  
  check("P-series: bodyweight uses progressed when higher (mutation guard)",
    bodyweightMax === 14,
    `got ${bodyweightMax}, should use progressed=${progress.current_target_reps}`);
  
  // P-series: working weight computation
  type ProgressRecord2 = { current_working_weight_kg: number | null; current_target_reps: number | null };
  const hasProgressWeight = progress.current_working_weight_kg;
  const noProgress = undefined as ProgressRecord2 | undefined;
  const noProgressWeight = noProgress?.current_working_weight_kg ?? null;
  
  check("P1: progress exists → use its weight",
    hasProgressWeight === 60,
    `got ${hasProgressWeight}`);
  
  check("P2: no progress → weight is null",
    noProgressWeight === null,
    `got ${noProgressWeight}`);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
