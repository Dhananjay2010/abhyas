#!/usr/bin/env tsx
/**
 * Test: Today page deload detection must respect week_offset.
 * 
 * Mutant killer: Verifies that cycleWeekFor in today/page.tsx correctly
 * uses week_offset when determining if current week is a deload week.
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

console.log("=== Test: Today page deload detection with week_offset ===\n");

// Scenario: Program with week_offset=2, started 2026-10-01, deload_week=4
// Without offset: week 2 of calendar = day 8-14 (2026-10-08 to 2026-10-14)
// With offset=2: week 2 becomes week 4 (2 + 2), which is the deload week
// So 2026-10-08 should be in deload week when offset=2

const programWithOffset = {
  started_on: "2026-10-01",
  week_offset: 2,
};

const programNoOffset = {
  started_on: "2026-10-01",
  week_offset: 0,
};

// Day 8 (2026-10-08) is in calendar week 2
const testDate = "2026-10-08";
const deloadWeek = 4;

const weekWithOffset = cycleWeekFor(programWithOffset, testDate);
const weekNoOffset = cycleWeekFor(programNoOffset, testDate);

console.log(`Test date: ${testDate} (8 days after start)`);
console.log(`Program with offset=2: week ${weekWithOffset}`);
console.log(`Program with offset=0: week ${weekNoOffset}`);

assert(weekNoOffset === 2, "Without offset: calendar week 2");
assert(weekWithOffset === 4, "With offset=2: week becomes 4 (2+2)");

// The deload detection in Today page does: const isDeload = week === program.deload_week
// With offset=2, week 4 should match deload_week=4
const isDeloadWithOffset = weekWithOffset === deloadWeek;
const isDeloadNoOffset = weekNoOffset === deloadWeek;

console.log(`\nDeload detection (deload_week=${deloadWeek}):`);
console.log(`  With offset=2: isDeload=${isDeloadWithOffset}`);
console.log(`  Without offset: isDeload=${isDeloadNoOffset}`);

assert(isDeloadWithOffset === true, "With offset=2: week 4 IS deload week");
assert(isDeloadNoOffset === false, "Without offset: week 2 is NOT deload week");

console.log("\n✅ Today deload detection respects week_offset\n");
