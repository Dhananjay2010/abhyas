#!/usr/bin/env tsx
/**
 * Unit test for computeHistoryEndedEarly helper boundaries.
 * 
 * Tests all boundary conditions to catch wrong rules like:
 * - workingSetCount > 0 addition
 * - <= instead of <
 * - Missing status checks
 * 
 *   npx tsx scripts/test-compute-history-ended-early.ts
 */

import { computeHistoryEndedEarly } from "../src/lib/history/compute-ended-early";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  ✓ ${label}${detail ? ` -- ${detail}` : ""}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}${detail ? ` -- ${detail}` : ""}`);
    failed++;
  }
}

console.log("Test computeHistoryEndedEarly boundaries\n");

console.log("1. Working sets equal to planned → NOT ended early");
{
  const result = computeHistoryEndedEarly({
    hasPendingExercise: true,
    plannedSets: 10,
    workingSetCount: 10,
    isStrength: true,
    status: "completed",
    hasNoExercises: false,
  });
  check("10 of 10 sets = not ended early", result === false, `got ${result}`);
}

console.log("\n2. Working sets one under planned → ended early");
{
  const result = computeHistoryEndedEarly({
    hasPendingExercise: true,
    plannedSets: 10,
    workingSetCount: 9,
    isStrength: true,
    status: "completed",
    hasNoExercises: false,
  });
  check("9 of 10 sets = ended early", result === true, `got ${result}`);
}

console.log("\n3. Zero working sets, completed strength, pending exercises → ended early");
{
  const result = computeHistoryEndedEarly({
    hasPendingExercise: true,
    plannedSets: 10,
    workingSetCount: 0,
    isStrength: true,
    status: "completed",
    hasNoExercises: false,
  });
  check("0 of 10 sets, completed, pending → ended early", result === true, `got ${result}`);
}

console.log("\n4. Zero working sets, completed strength, no exercises → ended early");
{
  const result = computeHistoryEndedEarly({
    hasPendingExercise: false,
    plannedSets: 0,
    workingSetCount: 0,
    isStrength: true,
    status: "completed",
    hasNoExercises: true,
  });
  check("0 sets, no exercises, completed → ended early", result === true, `got ${result}`);
}

console.log("\n5. Zero working sets, in-progress strength → ended early (first rule applies)");
{
  const result = computeHistoryEndedEarly({
    hasPendingExercise: true,
    plannedSets: 10,
    workingSetCount: 0,
    isStrength: true,
    status: "in_progress",
    hasNoExercises: false,
  });
  check("0 sets, in_progress, pending → ended early", result === true, `got ${result}`);
}

console.log("\n6. Zero working sets, completed yoga → NOT ended early");
{
  const result = computeHistoryEndedEarly({
    hasPendingExercise: true,
    plannedSets: 0,
    workingSetCount: 0,
    isStrength: false,
    status: "completed",
    hasNoExercises: false,
  });
  check("0 sets, yoga, completed → not ended early", result === false, `got ${result}`);
}

console.log("\n7. Some working sets under planned, no pending → NOT ended early");
{
  const result = computeHistoryEndedEarly({
    hasPendingExercise: false,
    plannedSets: 10,
    workingSetCount: 5,
    isStrength: true,
    status: "completed",
    hasNoExercises: false,
  });
  check("5 of 10, no pending → not ended early", result === false, `got ${result}`);
}

console.log("\n8. Planned sets undefined → NOT ended early");
{
  const result = computeHistoryEndedEarly({
    hasPendingExercise: true,
    plannedSets: undefined,
    workingSetCount: 5,
    isStrength: true,
    status: "completed",
    hasNoExercises: false,
  });
  check("plannedSets undefined → not ended early", result === false, `got ${result}`);
}

console.log("\n9. Planned sets zero, completed, pending → ended early (second rule)");
{
  const result = computeHistoryEndedEarly({
    hasPendingExercise: true,
    plannedSets: 0,
    workingSetCount: 0,
    isStrength: true,
    status: "completed",
    hasNoExercises: false,
  });
  check("plannedSets 0, pending → ended early", result === true, `got ${result}`);
}

console.log("\n10. Skipped status, 0 working sets, pending → ended early (first rule applies)");
{
  const result = computeHistoryEndedEarly({
    hasPendingExercise: true,
    plannedSets: 10,
    workingSetCount: 0,
    isStrength: true,
    status: "skipped",
    hasNoExercises: false,
  });
  check("skipped, 0 sets, pending → ended early", result === true, `got ${result}`);
}

console.log("\n11. Boundary: working sets equal to planned (catches <= bug)");
{
  const result = computeHistoryEndedEarly({
    hasPendingExercise: true,
    plannedSets: 5,
    workingSetCount: 5,
    isStrength: true,
    status: "completed",
    hasNoExercises: false,
  });
  check("5 of 5 sets = not ended early (must use <, not <=)", result === false, `got ${result}`);
}

console.log("\n12. Zero working sets, no pending, no exercises → ended early (catches > 0 bug)");
{
  const result = computeHistoryEndedEarly({
    hasPendingExercise: false,
    plannedSets: undefined,
    workingSetCount: 0,
    isStrength: true,
    status: "completed",
    hasNoExercises: true,
  });
  check("0 sets, no exercises, completed → ended early (not blocked by > 0)", result === true, `got ${result}`);
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All computeHistoryEndedEarly tests passed!");
