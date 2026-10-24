#!/usr/bin/env tsx
/**
 * Unit test: Progress page query filters program_days by status='active'
 * 
 * This test verifies that the Progress page query includes .eq('status', 'active')
 * to filter out superseded program_days from previous blocks.
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

console.log("Testing Progress page program_days query");
console.log("==========================================\n");

// Read the progress page source
const progressPagePath = join(process.cwd(), "src/app/progress/page.tsx");
const source = readFileSync(progressPagePath, "utf8");

// Find the program_days query
const programDaysQueryMatch = source.match(/supabase\.from\("program_days"\)\.select\([^)]+\)([^\]]*)/);

if (!programDaysQueryMatch) {
  console.error("✗ Could not find program_days query");
  process.exit(1);
}

const queryChain = programDaysQueryMatch[0] + programDaysQueryMatch[1];

// Check for .eq('status', 'active')
const hasStatusFilter = queryChain.includes('.eq("status", "active")') || 
                        queryChain.includes(".eq('status', 'active')");

assert(hasStatusFilter, 'Query includes .eq("status", "active")');

// Check for .order('day_index') or .order("day_index")
const hasOrderByDayIndex = queryChain.includes('.order("day_index")') || 
                           queryChain.includes(".order('day_index')");

assert(hasOrderByDayIndex, "Query includes .order('day_index') or .order(\"day_index\")");

console.log("\n==========================================");
if (failed === 0) {
  console.log(`✅ All checks passed (${passed}/${passed})`);
  process.exit(0);
} else {
  console.log(`❌ ${failed} check(s) failed (${passed}/${passed + failed})`);
  process.exit(1);
}
