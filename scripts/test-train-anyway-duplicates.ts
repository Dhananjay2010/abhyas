#!/usr:bin/env tsx
/**
 * Test: Train-anyway must not offer duplicate day_index values.
 * 
 * Verifies deduplication logic in trainAnywayOptions.
 */

import { trainAnywayOptions } from "../src/lib/today/train-anyway";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`✓ ${message}`);
  }
}

console.log("=== Test: Train-anyway must not offer duplicate day_index ===\n");

// Plan: Mon=Push, Tue=Rest, Wed=Pull, Thu=Rest, Fri=Push, Sat=Rest, Sun=Rest
// Note: Monday and Friday are both "Push" (same label, different day_index)
const upcomingDays = [
  { day_index: 2, day_type: "rest" as const, label: null },
  { day_index: 3, day_type: "weights" as const, label: "Pull" },
  { day_index: 4, day_type: "rest" as const, label: null },
  { day_index: 5, day_type: "weights" as const, label: "Push" },
  { day_index: 6, day_type: "rest" as const, label: null },
  { day_index: 7, day_type: "rest" as const, label: null },
  { day_index: 1, day_type: "weights" as const, label: "Push" }, // Wraps around
];

const result = trainAnywayOptions({
  yesterdayDay: null,
  todayDay: null,
  upcomingDays,
  missedYesterday: false,
});

console.log(`Result day_index values: ${result.map(d => d.day_index).join(", ")}`);

// Should get next 2 distinct training days: Pull (3) and Push (5)
// NOT Push (1) because that would be a third distinct day_index
assert(result.length === 2, "Must offer exactly 2 training days");
assert(result[0].day_index === 3, "First option must be Pull (day 3)");
assert(result[1].day_index === 5, "Second option must be Push (day 5)");

// Verify no duplicate day_index
const dayIndices = result.map(d => d.day_index);
const uniqueIndices = new Set(dayIndices);
assert(
  dayIndices.length === uniqueIndices.size,
  "Must not include duplicate day_index values"
);

console.log("\n✅ Train-anyway duplicate test passed\n");
