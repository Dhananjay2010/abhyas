#!/usr/bin/env tsx
/**
 * Test: First-session offer links to lowest day_index TRAINING day
 * 
 * Verifies that when day_index 1 is a rest day, the first training day
 * (lowest day_index with weights/bodyweight) is offered, not day 1.
 */

import { findFirstTrainingDay } from "../src/lib/today/first-training-day";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`✓ ${message}`);
  }
}

console.log("=== Test: First training day when day_index 1 is rest ===\n");

// Plan: Mon=Rest, Tue=Push, Wed=Rest, Thu=Pull, Fri=Rest, Sat=Legs, Sun=Rest
// First TRAINING day is Tuesday (day_index 2), NOT Monday (day_index 1)
const days = [
  { id: "day-1", day_index: 1, day_type: "rest" as const, label: null },
  { id: "day-2", day_index: 2, day_type: "weights" as const, label: "Push" },
  { id: "day-3", day_index: 3, day_type: "rest" as const, label: null },
  { id: "day-4", day_index: 4, day_type: "weights" as const, label: "Pull" },
  { id: "day-5", day_index: 5, day_type: "rest" as const, label: null },
  { id: "day-6", day_index: 6, day_type: "weights" as const, label: "Legs" },
  { id: "day-7", day_index: 7, day_type: "rest" as const, label: null },
];

const firstDay = findFirstTrainingDay(days);

assert(firstDay !== null, "Must find a first training day");
// firstDay already checked above
assert(firstDay.dayIndex === 2, "First training day must be day 2 (Tuesday), not day 1");
assert(firstDay!.label === "Push", "Label must be Push");
// firstDay already checked above
assert(firstDay.dayType === "weights", "Day type must be weights");
assert(firstDay!.programDayId === "day-2", "Program day ID must be day-2");

console.log("\n✅ First training day (day 1 = rest) test passed\n");
