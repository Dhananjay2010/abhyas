/**
 * Unit test: Today prescription helper produces correct deload transformations.
 * 
 * This test verifies that todayPrescription() applies the same deload transform
 * as session creation (via applyDeload), ensuring Today shows what the session
 * will create.
 * 
 * Tests:
 * - Normal week (passthrough)
 * - Deload week (4 → 2, 5 → 3)
 * - Null sets and reps (passthrough)
 * - Result equals applyDeload output
 * 
 * Run: npm run test:deload-today-prescription
 */

import { applyDeload } from "../src/lib/program/prescription";
import { todayPrescription } from "../src/lib/today/deload-prescription";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function runTests() {
  console.log("\nDeload Today Prescription Tests\n");

  // Test 1: Normal week - passthrough
  console.log("Normal week (passthrough):");
  const normalBench = todayPrescription(
    { target_sets: 4, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90 },
    false,
  );
  const normalSquat = todayPrescription(
    { target_sets: 5, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90 },
    false,
  );
  
  check("Bench 4 sets unchanged", normalBench.sets === 4);
  check("Squat 5 sets unchanged", normalSquat.sets === 5);
  check("Rep range unchanged", normalBench.repsMin === 8 && normalBench.repsMax === 12);

  // Test 2: Deload week - transformation
  console.log("\nDeload week:");
  const deloadBench = todayPrescription(
    { target_sets: 4, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90 },
    true,
  );
  const deloadSquat = todayPrescription(
    { target_sets: 5, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90 },
    true,
  );
  
  check("Bench 4 sets → 2 sets", deloadBench.sets === 2, `got ${deloadBench.sets}`);
  check("Squat 5 sets → 3 sets", deloadSquat.sets === 3, `got ${deloadSquat.sets}`);
  check("Rep range unchanged (bench)", deloadBench.repsMin === 8 && deloadBench.repsMax === 12);
  check("Rep range unchanged (squat)", deloadSquat.repsMin === 8 && deloadSquat.repsMax === 12);
  check("Rest seconds unchanged (bench)", deloadBench.restSeconds === 90);
  check("Rest seconds unchanged (squat)", deloadSquat.restSeconds === 90);

  // Test 3: Null sets (passthrough)
  console.log("\nNull cases:");
  const nullSets = todayPrescription(
    { target_sets: null, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90 },
    true,
  );
  check("Null sets → passthrough", nullSets.sets === null);

  const nullReps = todayPrescription(
    { target_sets: 4, target_reps_min: null, target_reps_max: null, rest_seconds: 90 },
    true,
  );
  check("Null reps → deload applied", nullReps.sets === 2, `got ${nullReps.sets}`);

  // Test 4: Equals applyDeload
  console.log("\nEquivalence with applyDeload:");
  const row = { target_sets: 4, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90 };
  const todayResult = todayPrescription(row, true);
  const applyDeloadResult = applyDeload({
    sets: 4,
    repsMin: 8,
    repsMax: 12,
    restSeconds: 90,
  });
  
  check(
    "todayPrescription == applyDeload",
    todayResult.sets === applyDeloadResult.sets &&
    todayResult.repsMin === applyDeloadResult.repsMin &&
    todayResult.repsMax === applyDeloadResult.repsMax &&
    todayResult.restSeconds === applyDeloadResult.restSeconds,
    `Today: ${todayResult.sets}×${todayResult.repsMin}-${todayResult.repsMax}, applyDeload: ${applyDeloadResult.sets}×${applyDeloadResult.repsMin}-${applyDeloadResult.repsMax}`
  );

  return failures === 0;
}

const success = runTests();
console.log(failures > 0 ? `\n❌ ${failures} failure(s)\n` : "\n✅ All tests passed\n");
process.exit(success ? 0 : 1);
