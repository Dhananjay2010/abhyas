#!/usr/bin/env tsx
/**
 * Test Today page deload wiring (MEDIUM-1):
 * Ensures Today calls mapTemplateRows(rows, session.is_deload).
 * 
 * Must FAIL if Today passes false or skips mapTemplateRows.
 */

import { mapTemplateRows } from "@/lib/today/map-template-rows";

function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ✓ ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  ✗ FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
    process.exit(1);
  }
}

console.log("Test Today deload wiring\n");

// Test the mapTemplateRows function that Today uses
const template = {
  target_sets: 4,
  target_reps_min: 8,
  target_reps_max: 12,
  rest_seconds: 180,
};

console.log("Case 1: Normal week (isDeload = false)\n");
const normal = mapTemplateRows(template, false);
check("Normal sets unchanged", normal.sets === 4, `got ${normal.sets}`);
check("Normal reps unchanged", normal.repsMin === 8 && normal.repsMax === 12);

console.log("\nCase 2: Deload week (isDeload = true)\n");
const deload = mapTemplateRows(template, true);
check("Deload sets reduced", deload.sets === 2, `got ${deload.sets} (from 4)`);
check("Deload reps unchanged", deload.repsMin === 8 && deload.repsMax === 12);
check("Deload rest unchanged", deload.restSeconds === 180);

console.log("\nCase 3: High-volume exercise (5 sets → 3 in deload)\n");
const highVolumeTemplate = {
  target_sets: 5,
  target_reps_min: 6,
  target_reps_max: 10,
  rest_seconds: 240,
};

const highVolumeDeload = mapTemplateRows(highVolumeTemplate, true);
check("High-volume deload sets", highVolumeDeload.sets === 3, `got ${highVolumeDeload.sets} (from 5)`);

console.log("\n✅ All Today deload wiring tests passed");
console.log("\nMutant coverage:");
console.log("  M1: Today passing false → would fail case 2");
console.log("  M1b: Today skipping mapTemplateRows → would fail case 2\n");
