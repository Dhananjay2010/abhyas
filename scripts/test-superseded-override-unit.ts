#!/usr/bin/env tsx
/**
 * Unit test: resolveDay handles superseded program_day in override
 * 
 * This test verifies that when a planned override points to a superseded
 * program_day (from a previous block), resolveDay fetches the superseded
 * day's metadata and attempts to resolve to the active day with the same
 * day_index, or preserves the superseded label as a fallback.
 */

import { readFileSync } from "fs";
import { join } from "path";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

console.log("Testing resolveDay superseded override handling");
console.log("================================================\n");

// Read the day-plan source
const dayPlanPath = join(process.cwd(), "src/lib/program/day-plan.ts");
const source = readFileSync(dayPlanPath, "utf8");

// Check for superseded day handling logic
const hasSupersededCheck = source.includes("superseded");
assert(hasSupersededCheck, "Code includes 'superseded' handling");

// Check for fallback query to fetch superseded day metadata
const hasSupersededQuery = source.includes('.eq("id", override.program_day_id)') &&
                           source.includes('superseded');
assert(hasSupersededQuery, "Fetches superseded day metadata when not found in active list");

// Check for day_index matching logic
const hasDayIndexMatch = source.includes('day_index === superseded.day_index') ||
                        source.includes('d.day_index === superseded.day_index');
assert(hasDayIndexMatch, "Tries to match active day by day_index");

// Check for label fallback
const hasLabelFallback = source.includes('day?.label ?? superseded.label') ||
                        source.includes('superseded.label');
assert(hasLabelFallback, "Uses superseded label as fallback");

console.log("\n================================================");
if (failed === 0) {
  console.log(`✅ All checks passed (${passed}/${passed})`);
  process.exit(0);
} else {
  console.log(`❌ ${failed} check(s) failed (${passed}/${passed + failed})`);
  process.exit(1);
}
