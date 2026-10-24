#!/usr/bin/env tsx
/**
 * Test: cycleWeekFor must respect week_offset parameter.
 * 
 * Verifies week calculation includes offset from block-range.ts.
 */

import { cycleWeekFor } from "../src/lib/program/block-range";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`✓ ${message}`);
  }
}

console.log("=== Test: cycleWeekFor must respect week_offset ===\n");

// Block with week_offset=1 started on 2026-10-01
const block = {
  id: "test-block",
  started_on: "2026-10-01",
  ended_on: null,
  week_offset: 1,
};

// Day 0 (started_on): week 1 + offset 1 = week 2
const week0 = cycleWeekFor(block, "2026-10-01");
console.log(`Week 0 (started_on): ${week0}`);
assert(week0 === 2, "Week 0 must be 2 (1 + offset 1)");

// Day 7 (one week in): week 2 + offset 1 = week 3
const week7 = cycleWeekFor(block, "2026-10-08");
console.log(`Week 7 (one week in): ${week7}`);
assert(week7 === 3, "Week 7 must be 3 (2 + offset 1)");

// Day 14 (two weeks in): week 3 + offset 1 = week 4
const week14 = cycleWeekFor(block, "2026-10-15");
console.log(`Week 14 (two weeks in): ${week14}`);
assert(week14 === 4, "Week 14 must be 4 (3 + offset 1)");

// Block with no offset (week_offset undefined)
const blockNoOffset = {
  id: "test-block-2",
  started_on: "2026-10-01",
  ended_on: null,
};

const weekNoOffset = cycleWeekFor(blockNoOffset, "2026-10-01");
console.log(`\nWeek 0 (no offset): ${weekNoOffset}`);
assert(weekNoOffset === 1, "Week 0 with no offset must be 1");

console.log("\n✅ week_offset test passed\n");
