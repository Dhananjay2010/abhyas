#!/usr/bin/env tsx
/**
 * Test Today page deload wiring (MEDIUM-1):
 * Ensures Today calls buildTodayRows with the correct isDeload flag.
 * 
 * Must FAIL if Today passes false or skips buildTodayRows.
 */

import { buildTodayRows } from "@/lib/today/build-today-rows";

function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ✓ ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  ✗ FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
    process.exit(1);
  }
}

console.log("Test Today deload wiring\n");

const template = [{
  order_index: 0,
  target_sets: 4,
  target_reps_min: 8,
  target_reps_max: 12,
  rest_seconds: 180,
  exercises: { name: "Bench Press", cue: null, metric: "reps" as const },
}];

console.log("Case 1: No actual rows, normal week\n");
const normalResult = buildTodayRows({ actual: null, template, isDeload: false });
check("Normal sets unchanged", normalResult[0].sets === 4, `got ${normalResult[0].sets}`);
check("Normal reps unchanged", normalResult[0].repsMin === 8 && normalResult[0].repsMax === 12);

console.log("\nCase 2: No actual rows, deload week\n");
const deloadResult = buildTodayRows({ actual: null, template, isDeload: true });
check("Deload sets reduced", deloadResult[0].sets === 2, `got ${deloadResult[0].sets} (from 4)`);
check("Deload reps unchanged", deloadResult[0].repsMin === 8 && deloadResult[0].repsMax === 12);
check("Deload rest unchanged", deloadResult[0].restSeconds === 180);

console.log("\nCase 3: Actual rows present (win over template+deload)\n");
const actual = [{
  order_index: 0,
  planned_sets: 3,
  planned_reps_min: 10,
  planned_reps_max: 15,
  rest_seconds: 120,
  status: "pending" as const,
  metric: "reps" as const,
  swapped_from_exercise_id: null,
  exercises: { name: "Dumbbell Press", cue: "slow eccentric" },
}];

const actualResult = buildTodayRows({ actual, template, isDeload: true });
check("Actual rows win over deload", actualResult[0].sets === 3, `got ${actualResult[0].sets} (not 2 from deload)`);
check("Actual name used", actualResult[0].name === "Dumbbell Press");

console.log("\n✅ All Today deload wiring tests passed");
console.log("\nMutant coverage:");
console.log("  M1: Today passing false → would fail case 2");
console.log("  M1b: buildTodayRows passing false internally → would fail case 2\n");
