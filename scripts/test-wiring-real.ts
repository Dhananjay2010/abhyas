/**
 * Real wiring tests - test actual code paths, not re-implementations
 *
 *   npx tsx scripts/test-wiring-real.ts
 */
import { effectiveRepsMax } from "../src/lib/program/effective-target";
import { swapSheetState } from "../src/lib/session/swap";
import { setFormKey } from "../src/lib/session/form-key";
import { isBodyweightEquipment } from "../src/lib/program/bodyweight";
import { evaluateProgression } from "../src/lib/program/progression";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nWiring: effectiveRepsMax used by both Today and Runner");
{
  // Loaded: ignores progressed target
  const loaded = effectiveRepsMax({
    plannedMax: 12,
    progressedTarget: 14,
    isBodyweight: false,
    usedWeight: 60,
  });
  check("loaded exercise ignores progressed target (uses planned)",
    loaded === 12, `got ${loaded}`);
  
  // Bodyweight: uses progressed target when higher
  const bodyweight = effectiveRepsMax({
    plannedMax: 12,
    progressedTarget: 14,
    isBodyweight: true,
    usedWeight: null,
  });
  check("bodyweight uses progressed target when higher",
    bodyweight === 14, `got ${bodyweight}`);
  
  // Bodyweight with added weight: uses planned
  const bodyweightWithWeight = effectiveRepsMax({
    plannedMax: 12,
    progressedTarget: 14,
    isBodyweight: true,
    usedWeight: 5,
  });
  check("bodyweight with added weight uses planned target",
    bodyweightWithWeight === 12, `got ${bodyweightWithWeight}`);
}

console.log("\nWiring: swapSheetState used by runner");
{
  // Empty list
  const empty = swapSheetState({ alternatives: [] });
  check("empty alternatives: isEmpty is true",
    empty.isEmpty === true);
  check("empty alternatives: shows exact copy",
    empty.message === "No safe swap for this one. You can skip it.");
  check("empty alternatives: showSkipButton is true",
    empty.showSkipButton === true);
  
  // Non-empty list
  const nonEmpty = swapSheetState({ alternatives: [{ id: 1 }] });
  check("non-empty alternatives: isEmpty is false",
    nonEmpty.isEmpty === false);
  check("non-empty alternatives: no message",
    nonEmpty.message === "");
  check("non-empty alternatives: showSkipButton is false",
    nonEmpty.showSkipButton === false);
}

console.log("\nWiring: setFormKey prevents swap carryover");
{
  // Keys must differ when exerciseId changes
  const before = setFormKey("se-1", "ex-a", 1);
  const after = setFormKey("se-1", "ex-b", 1);
  
  check("swap changes key (prevents form state reuse)",
    before !== after,
    `before=${before}, after=${after}`);
  
  // Key must include exerciseId
  check("key includes exerciseId",
    before.includes("ex-a") && after.includes("ex-b"),
    "exerciseId must be in key");
}

console.log("\nWiring: isBodyweightEquipment classification");
{
  // Used by page.tsx:112, session/actions.ts:382, runner, swap
  check("empty equipment is bodyweight",
    isBodyweightEquipment([]) === true);
  check("pull-up bar is bodyweight",
    isBodyweightEquipment(["pull_up_bar"]) === true);
  check("barbell is not bodyweight",
    isBodyweightEquipment(["barbell"]) === false);
  check("mixed (pull-up + dumbbell) is not bodyweight",
    isBodyweightEquipment(["pull_up_bar", "dumbbell"]) === false);
}

console.log("\nKettlebell progression");
{
  // Note: Kettlebell progression is tested comprehensively in test-progression.ts
  // The actual behavior is complex (depends on feel, current state, etc.)
  // Here we just verify the module exports the function
  check("evaluateProgression is exported",
    typeof evaluateProgression === "function");
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
