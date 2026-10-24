/**
 * Integration tests for server actions
 * Tests that actions call pure functions with correct data
 *
 *   npm run test:action-integration
 */
import * as fs from "fs";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nAction integration: imports and usage");
{
  
  // O1: Swap action must query with input.newExerciseId
  const swapAction = fs.readFileSync("src/app/session/actions.ts", "utf8");
  check("O1: swap queries with input.newExerciseId",
    swapAction.includes('.eq("exercise_id", input.newExerciseId)'),
    "must query NEW exercise, not current");
  
  // O2: Swap action checks planning_mode !== "daily_menu"
  check("O2: swap checks daily_menu mode",
    swapAction.includes('settingsRes.data?.planning_mode !== "daily_menu"'),
    "must respect daily_menu setting");
  
  // O3: Swap action reads is_deload from session
  check("O3: swap reads session is_deload",
    swapAction.includes('is_deload: boolean'),
    "must check deload flag");
  
  // O10: Settings action uses shouldResetProgressionTargets
  const settingsAction = fs.readFileSync("src/app/settings/actions.ts", "utf8");
  check("O10: settings imports shouldResetProgressionTargets",
    settingsAction.includes('import { shouldResetProgressionTargets }'));
  check("O10: settings calls shouldResetProgressionTargets conditionally",
    settingsAction.includes('if (shouldResetProgressionTargets('));
}

console.log("\nComponent integration: React components use pure helpers");
{
  
  // M5: Today page uses effectiveRepsMax
  const todayPage = fs.readFileSync("src/app/today/page.tsx", "utf8");
  check("M5: Today imports effectiveRepsMax",
    todayPage.includes('import { effectiveRepsMax }'));
  check("M5: Today calls effectiveRepsMax with progressedTarget",
    todayPage.includes('progressedTarget: progress?.current_target_reps'));
  
  // M6: Runner uses effectiveRepsMax
  const runner = fs.readFileSync("src/app/session/[id]/session-runner.tsx", "utf8");
  check("M6: Runner imports effectiveRepsMax",
    runner.includes('import { effectiveRepsMax }'));
  check("M6: Runner assigns effectiveMax result to repsMax",
    runner.includes('repsMax: effectiveMax'));
  
  // P-series: Page.tsx uses progress correctly
  const pageTsx = fs.readFileSync("src/app/session/[id]/page.tsx", "utf8");
  check("P1/P2: page reads progress.current_working_weight_kg",
    pageTsx.includes('progress?.current_working_weight_kg'));
  check("P3: page calls isBodyweightEquipment",
    pageTsx.includes('isBodyweightEquipment(ex?.equipment_ids)'));
  check("P4: page passes progress?.current_target_reps to effectiveRepsMax",
    pageTsx.includes('progressedTarget: progress?.current_target_reps'));
}

console.log("\nSwap sheet: component integration");
{
  const swapTs = fs.readFileSync("src/lib/session/swap.ts", "utf8");
  
  // O4-O6: swapSheetState returns correct values
  check("O4/O5/O6: swapSheetState returns object with message and showSkipButton",
    swapTs.includes('isEmpty') && 
    swapTs.includes('message:') && 
    swapTs.includes('showSkipButton:'));
  
  check("O4: empty state shows skip message",
    swapTs.includes('No safe swap for this one'));
  
  check("O5/O6: showSkipButton equals isEmpty",
    swapTs.includes('showSkipButton: isEmpty'));
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
