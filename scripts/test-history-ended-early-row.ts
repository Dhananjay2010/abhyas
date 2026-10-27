#!/usr/bin/env tsx
/**
 * Test computeHistoryEndedEarlyForRow with real-shaped DB rows.
 * 
 * This catches bugs in the page's mapping logic like:
 * - (p1) Adding workingSetCount > 0 check
 * - (p2) Going back to inline <= rule
 * 
 *   npx tsx scripts/test-history-ended-early-row.ts
 */

import { computeHistoryEndedEarlyForRow } from "../src/lib/history/compute-ended-early-for-row";

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

console.log("Test computeHistoryEndedEarlyForRow with real-shaped rows\n");

console.log("1. Completed strength, 1 of 10 sets, pending exercise → ended early");
{
  const result = computeHistoryEndedEarlyForRow({
    session: { actual_type: "weights", status: "completed" },
    exercises: [{ id: "ex1" }, { id: "ex2" }],
    workingSetCount: 1,
    plannedSets: 10,
    hasPendingExercise: true,
  });
  check("1 of 10 sets → ended early", result === true, `got ${result}`);
}

console.log("\n2. Completed strength, 10 of 10 sets → NOT ended early (catches <= bug)");
{
  const result = computeHistoryEndedEarlyForRow({
    session: { actual_type: "weights", status: "completed" },
    exercises: [{ id: "ex1" }],
    workingSetCount: 10,
    plannedSets: 10,
    hasPendingExercise: true,
  });
  check("10 of 10 sets → not ended early", result === false, `got ${result}`);
}

console.log("\n3. Completed strength, 0 sets, no exercises → ended early (catches > 0 bug)");
{
  const result = computeHistoryEndedEarlyForRow({
    session: { actual_type: "weights", status: "completed" },
    exercises: [],
    workingSetCount: 0,
    plannedSets: undefined,
    hasPendingExercise: false,
  });
  check("0 sets, no exercises → ended early", result === true, `got ${result}`);
}

console.log("\n4. Completed strength, 0 sets, pending exercises → ended early");
{
  const result = computeHistoryEndedEarlyForRow({
    session: { actual_type: "bodyweight", status: "completed" },
    exercises: [{ id: "ex1" }],
    workingSetCount: 0,
    plannedSets: 5,
    hasPendingExercise: true,
  });
  check("0 of 5 sets, pending → ended early", result === true, `got ${result}`);
}

console.log("\n5. Completed yoga, 0 sets → NOT ended early");
{
  const result = computeHistoryEndedEarlyForRow({
    session: { actual_type: "yoga", status: "completed" },
    exercises: [{ id: "ex1" }],
    workingSetCount: 0,
    plannedSets: 0,
    hasPendingExercise: true,
  });
  check("yoga, 0 sets → not ended early", result === false, `got ${result}`);
}

console.log("\n6. Completed breathing, 0 sets → NOT ended early");
{
  const result = computeHistoryEndedEarlyForRow({
    session: { actual_type: "meditation", status: "completed" },
    exercises: [],
    workingSetCount: 0,
    plannedSets: undefined,
    hasPendingExercise: false,
  });
  check("breathing, 0 sets → not ended early", result === false, `got ${result}`);
}

console.log("\n7. In-progress strength, 5 of 10 sets → ended early");
{
  const result = computeHistoryEndedEarlyForRow({
    session: { actual_type: "weights", status: "in_progress" },
    exercises: [{ id: "ex1" }],
    workingSetCount: 5,
    plannedSets: 10,
    hasPendingExercise: true,
  });
  check("5 of 10, in_progress → ended early", result === true, `got ${result}`);
}

console.log("\n8. Completed strength, 5 of 10, no pending → NOT ended early");
{
  const result = computeHistoryEndedEarlyForRow({
    session: { actual_type: "weights", status: "completed" },
    exercises: [{ id: "ex1" }],
    workingSetCount: 5,
    plannedSets: 10,
    hasPendingExercise: false,
  });
  check("5 of 10, no pending → not ended early", result === false, `got ${result}`);
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All history-ended-early-row tests passed!");
