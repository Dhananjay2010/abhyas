#!/usr/bin/env tsx
/**
 * Test suite for "Or train today anyway" logic (H2).
 *
 * Product rule: On a rest day, always offer workout options:
 * - If yesterday was missed, offer today's workout (if it exists)
 * - Otherwise, offer the next scheduled training day in the block
 * - Wrap to next week if needed
 * - For blocks with no strength days, offer nothing (yoga/breathe handled elsewhere)
 */

import { trainAnywayOptions, type TrainAnywayDay } from "../src/lib/today/train-anyway";
import type { Database } from "../src/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`✓ ${message}`);
  }
}

// Helper to create test days
function day(index: number, type: DayType, label: string | null = null): TrainAnywayDay {
  return { day_index: index, day_type: type, label };
}

console.log("=== Test 1: Rest day, yesterday done, next training day is tomorrow ===\n");

const result1 = trainAnywayOptions({
  todayDay: day(6, "rest"),
  upcomingDays: [
    day(7, "rest"),       // Sun
    day(1, "weights", "Push"),  // Mon (next training day)
    day(2, "rest"),
    day(3, "weights", "Pull"),
    day(4, "rest"),
    day(5, "weights", "Legs"),
  ],
  missedYesterday: false,
});

assert(result1.length === 1, "Returns 1 option");
assert(result1[0]?.day_index === 1, "Returns Monday (next training day)");
assert(result1[0]?.label === "Push", "Returns correct label");

console.log("\n=== Test 2: Rest day, yesterday missed, today has workout in template ===\n");

const result2 = trainAnywayOptions({
  todayDay: day(5, "weights", "Legs"),
  upcomingDays: [
    day(6, "rest"),
    day(7, "rest"),
    day(1, "weights", "Push"),
    day(2, "rest"),
    day(3, "weights", "Pull"),
    day(4, "rest"),
  ],
  missedYesterday: true,
});

assert(result2.length === 1, "Returns 1 option");
assert(result2[0]?.day_index === 5, "Returns today's workout (missed yesterday scenario)");
assert(result2[0]?.label === "Legs", "Returns correct label");

console.log("\n=== Test 3: Last day of week (Sunday), wraps to Monday ===\n");

const result3 = trainAnywayOptions({
  todayDay: day(7, "rest"),
  upcomingDays: [
    day(1, "weights", "Push"),  // Mon (wraps to next week)
    day(2, "rest"),
    day(3, "weights", "Pull"),
    day(4, "rest"),
    day(5, "weights", "Legs"),
    day(6, "rest"),
  ],
  missedYesterday: false,
});

assert(result3.length === 1, "Returns 1 option");
assert(result3[0]?.day_index === 1, "Wraps to Monday");
assert(result3[0]?.label === "Push", "Returns correct label");

console.log("\n=== Test 4: Block with no weights days (all rest/yoga/meditation) ===\n");

const result4 = trainAnywayOptions({
  todayDay: day(3, "rest"),
  upcomingDays: [
    day(4, "meditation"),
    day(5, "rest"),
    day(6, "yoga"),
    day(7, "rest"),
    day(1, "meditation"),
    day(2, "rest"),
  ],
  missedYesterday: false,
});

assert(result4.length === 0, "Returns empty array (no training days in block)");

console.log("\n=== Test 5: Rest day with yesterday missed, but today is also rest ===\n");

const result5 = trainAnywayOptions({
  todayDay: day(6, "rest"),
  upcomingDays: [
    day(7, "rest"),
    day(1, "weights", "Push"),
    day(2, "rest"),
    day(3, "weights", "Pull"),
    day(4, "rest"),
    day(5, "weights", "Legs"),
  ],
  missedYesterday: true,
});

assert(result5.length === 1, "Returns 1 option");
assert(result5[0]?.day_index === 1, "Returns next training day (not today's rest)");
assert(result5[0]?.label === "Push", "Returns correct label");

console.log("\n=== Test 6: Bodyweight training days (not just weights) ===\n");

const result6 = trainAnywayOptions({
  todayDay: day(4, "rest"),
  upcomingDays: [
    day(5, "bodyweight", "Bodyweight A"),
    day(6, "rest"),
    day(7, "rest"),
    day(1, "bodyweight", "Bodyweight B"),
    day(2, "rest"),
    day(3, "rest"),
  ],
  missedYesterday: false,
});

assert(result6.length === 1, "Returns 1 option");
assert(result6[0]?.day_index === 5, "Returns bodyweight day");
assert(result6[0]?.day_type === "bodyweight", "Correct day type");
assert(result6[0]?.label === "Bodyweight A", "Returns correct label");

console.log("\n=== Test 7: Mixed weights and bodyweight ===\n");

const result7 = trainAnywayOptions({
  todayDay: day(2, "rest"),
  upcomingDays: [
    day(3, "weights", "Push"),
    day(4, "bodyweight", "Bodyweight"),
    day(5, "rest"),
    day(6, "weights", "Pull"),
    day(7, "rest"),
    day(1, "rest"),
  ],
  missedYesterday: false,
});

assert(result7.length === 1, "Returns 1 option");
assert(result7[0]?.day_index === 3, "Returns first training day (weights)");

console.log("\n=== Test 8: Yesterday missed AND today has bodyweight workout ===\n");

const result8 = trainAnywayOptions({
  todayDay: day(3, "bodyweight", "Bodyweight A"),
  upcomingDays: [
    day(4, "rest"),
    day(5, "weights", "Push"),
    day(6, "rest"),
    day(7, "rest"),
    day(1, "bodyweight", "Bodyweight B"),
    day(2, "rest"),
  ],
  missedYesterday: true,
});

assert(result8.length === 1, "Returns 1 option");
assert(result8[0]?.day_index === 3, "Returns today's bodyweight workout");
assert(result8[0]?.label === "Bodyweight A", "Returns correct label");

console.log("\n✅ All train-anyway tests passed\n");
