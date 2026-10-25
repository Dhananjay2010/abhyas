#!/usr/bin/env tsx
/**
 * Test: buildTrainAnywayDays deduplication for duplicate labels
 *
 * Tests that when yesterday was a missed "Pull" and an upcoming day is also "Pull",
 * the train-anyway options list "Pull" only once.
 * This proves break g3 (no deduplication in seenLabels) is caught.
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

console.log("\n=== Test 1: Duplicate Pull (missed yesterday + upcoming) ===\n");

// Scenario: Today is Thursday 2026-10-22 (day 4 = Legs - training day)
// Yesterday was Wednesday (day 3 = Pull) - missed
// Upcoming: Sat (day 6 = Push), Sun (day 7 = Pull), Mon (day 1 = rest), Tue (day 2 = Push)
// Expected on training day: [Pull (from yesterday), Push (from day 6), Legs (wraps)]
// Key test: Pull appears only once even though day 7 is also Pull
// NO "Lift:" prefix because today is a training day, not rest

const result1 = buildTrainAnywayDays({
  allDays: [
    { id: "day-1", day_index: 1, day_type: "rest", label: null },
    { id: "day-2", day_index: 2, day_type: "weights", label: "Push" },
    { id: "day-3", day_index: 3, day_type: "weights", label: "Pull" },
    { id: "day-4", day_index: 4, day_type: "weights", label: "Legs" },
    { id: "day-5", day_index: 5, day_type: "rest", label: null },
    { id: "day-6", day_index: 6, day_type: "weights", label: "Push" },
    { id: "day-7", day_index: 7, day_type: "weights", label: "Pull" },
  ],
  localToday: "2026-10-22", // Thursday (day 4)
  missedYesterday: true,
});

console.log("Result 1:", result1.map(d => d.label).join(", "));

const pullCount1 = result1.filter(d => d.label === "Pull" || d.label === "Lift: Pull").length;
assert(
  pullCount1 === 1,
  `Pull appears exactly once (missed yesterday, deduplicated with upcoming day 7), got ${pullCount1}`
);

console.log("\n=== Test 2: Duplicate Push (missed yesterday + 2 upcoming Push days) ===\n");

// Scenario: Today is Wednesday 2026-10-21 (day 3 = Pull - training day)
// Yesterday was Tuesday (day 2 = Push) - missed
// Upcoming: Thu (day 4 = Legs), Fri (day 5 = rest), Sat (day 6 = Push), Sun (day 7 = Pull), Mon (day 1 = rest), Tue (day 2 = Push)
// Expected on training day: [Push (from yesterday), Legs (from day 4), Pull (from day 7)]
// Key test: Push appears only once even though day 6 and day 2 (next week) are also Push

const result2 = buildTrainAnywayDays({
  allDays: [
    { id: "day-1", day_index: 1, day_type: "rest", label: null },
    { id: "day-2", day_index: 2, day_type: "weights", label: "Push" },
    { id: "day-3", day_index: 3, day_type: "weights", label: "Pull" },
    { id: "day-4", day_index: 4, day_type: "weights", label: "Legs" },
    { id: "day-5", day_index: 5, day_type: "rest", label: null },
    { id: "day-6", day_index: 6, day_type: "weights", label: "Push" },
    { id: "day-7", day_index: 7, day_type: "weights", label: "Pull" },
  ],
  localToday: "2026-10-21", // Wednesday (day 3)
  missedYesterday: true,
});

console.log("Result 2:", result2.map(d => d.label).join(", "));

const pushCount2 = result2.filter(d => d.label === "Push" || d.label === "Lift: Push").length;
assert(
  pushCount2 === 1,
  `Push appears exactly once (missed yesterday, deduplicated with upcoming days 6 & 2), got ${pushCount2}`
);

console.log("\n=== Test 3: No missed day, rest day with Lift prefix ===\n");

// Scenario: Today is Monday 2026-10-19 (day 1 = rest), no missed yesterday
// Upcoming: Tue (day 2 = Push), Wed (day 3 = Pull), Thu (day 4 = Legs), Fri (day 5 = rest), Sat (day 6 = Push)
// Expected on rest day: [Lift:Push (from day 2), Pull (from day 3), Legs (from day 4)]
// Key test: Push appears only once even though day 6 is also Push, AND first option has "Lift:" prefix

const result3 = buildTrainAnywayDays({
  allDays: [
    { id: "day-1", day_index: 1, day_type: "rest", label: null },
    { id: "day-2", day_index: 2, day_type: "weights", label: "Push" },
    { id: "day-3", day_index: 3, day_type: "weights", label: "Pull" },
    { id: "day-4", day_index: 4, day_type: "weights", label: "Legs" },
    { id: "day-5", day_index: 5, day_type: "rest", label: null },
    { id: "day-6", day_index: 6, day_type: "weights", label: "Push" },
    { id: "day-7", day_index: 7, day_type: "weights", label: "Pull" },
  ],
  localToday: "2026-10-19", // Monday (day 1)
  missedYesterday: false,
});

console.log("Result 3:", result3.map(d => d.label).join(", "));

const pushCount3 = result3.filter(d => d.label === "Push" || d.label === "Lift: Push").length;
assert(
  pushCount3 === 1,
  `Push appears exactly once in upcoming (deduplicated day 2 vs day 6), got ${pushCount3}`
);

assert(
  result3.length === 2,
  `Rest day offers 2 options (Lift + 1 more distinct), got ${result3.length}`
);

assert(
  result3[0].label === "Push",
  `First option on rest day is Push (for Lift), got "${result3[0].label}"`
);

console.log(`\n✅ All ${passedTests}/${totalTests} buildTrainAnywayDays deduplication tests passed!\n`);
