#!/usr/bin/env tsx
/**
 * Test: buildTrainAnywayDays offers next strength day with "Lift: " prefix
 *
 * Tests that on a rest day, the train-anyway option is the next upcoming strength day
 * with the "Lift: " prefix.
 */

import { buildTrainAnywayDays } from "../src/lib/today/train-anyway";

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    passedTests++;
    console.log(`✓ ${message}`);
  }
}

console.log("\n=== Test 1: Rest day offers next strength day with Lift prefix ===\n");

// Scenario: Today is Monday 2026-10-19 (day 1 = rest)
// Upcoming: Tue (day 2 = Push), Wed (day 3 = Pull), Thu (day 4 = Legs)
// Expected: [Lift: Push] - only the next strength day

const result1 = buildTrainAnywayDays({
  allDays: [
    { id: "day-1", day_index: 1, day_type: "rest", label: null },
    { id: "day-2", day_index: 2, day_type: "weights", label: "Push" },
    { id: "day-3", day_index: 3, day_type: "weights", label: "Pull" },
    { id: "day-4", day_index: 4, day_type: "weights", label: "Legs" },
    { id: "day-5", day_index: 5, day_type: "rest", label: null },
    { id: "day-6", day_index: 6, day_type: "weights", label: "Push" },
    { id: "day-7", day_index: 7, day_type: "rest", label: null },
  ],
  localToday: "2026-10-19", // Monday (day 1)
  missedYesterday: false,
});

console.log("Result 1:", result1.map(d => d.label).join(", "));

assert(result1.length === 1, "Exactly one option offered");
assert(result1[0].label === "Lift: Push", `Label is "Lift: Push", got "${result1[0].label}"`);

console.log("\n=== Test 2: Rest day on Friday offers next strength day (wraps to Monday) ===\n");

// Scenario: Today is Friday 2026-10-23 (day 5 = rest)
// Upcoming: Sat (day 6 = rest), Sun (day 7 = rest), Mon (day 1 = Push), Tue (day 2 = Pull)
// Expected: [Lift: Push] - wraps to next week

const result2 = buildTrainAnywayDays({
  allDays: [
    { id: "day-1", day_index: 1, day_type: "weights", label: "Push" },
    { id: "day-2", day_index: 2, day_type: "weights", label: "Pull" },
    { id: "day-3", day_index: 3, day_type: "weights", label: "Legs" },
    { id: "day-4", day_index: 4, day_type: "rest", label: null },
    { id: "day-5", day_index: 5, day_type: "rest", label: null },
    { id: "day-6", day_index: 6, day_type: "rest", label: null },
    { id: "day-7", day_index: 7, day_type: "rest", label: null },
  ],
  localToday: "2026-10-23", // Friday (day 5)
  missedYesterday: false,
});

console.log("Result 2:", result2.map(d => d.label).join(", "));

assert(result2.length === 1, "Exactly one option offered");
assert(result2[0].label === "Lift: Push", `Label wraps to "Lift: Push", got "${result2[0].label}"`);

console.log("\n=== Test 3: Rest day offers bodyweight training day ===\n");

// Scenario: Today is Thursday 2026-10-22 (day 4 = rest)
// Upcoming: Fri (day 5 = Bodyweight A), Sat (day 6 = rest), Sun (day 7 = Bodyweight B)
// Expected: [Lift: Bodyweight A] - next training day is bodyweight

const result3 = buildTrainAnywayDays({
  allDays: [
    { id: "day-1", day_index: 1, day_type: "rest", label: null },
    { id: "day-2", day_index: 2, day_type: "rest", label: null },
    { id: "day-3", day_index: 3, day_type: "rest", label: null },
    { id: "day-4", day_index: 4, day_type: "rest", label: null },
    { id: "day-5", day_index: 5, day_type: "bodyweight", label: "Bodyweight A" },
    { id: "day-6", day_index: 6, day_type: "rest", label: null },
    { id: "day-7", day_index: 7, day_type: "bodyweight", label: "Bodyweight B" },
  ],
  localToday: "2026-10-22", // Thursday (day 4)
  missedYesterday: false,
});

console.log("Result 3:", result3.map(d => d.label).join(", "));

assert(result3.length === 1, "Exactly one option offered");
assert(
  result3[0].label === "Lift: Bodyweight A",
  `Label is "Lift: Bodyweight A", got "${result3[0].label}"`
);

console.log(`\n✅ All ${passedTests}/${totalTests} buildTrainAnywayDays deduplication tests passed!\n`);
