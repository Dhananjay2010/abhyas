#!/usr/bin/env tsx
/**
 * Test suite for "Or train today anyway" logic (H2).
 *
 * Product rule: On a rest day, offer "Lift: <next strength day>":
 * - Offer the next upcoming strength day only
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
  yesterdayDay: null,
  todayDay: day(6, "rest"),
  upcomingDays: [
    day(7, "rest"),       // Sun
    day(1, "weights", "Push"),  // Mon (next training day)
    day(2, "rest"),
    day(3, "weights", "Pull"),  // Wed (2nd training day)
    day(4, "rest"),
    day(5, "weights", "Legs"),
  ],
  missedYesterday: false,
});

assert(result1.length === 1, "Returns 1 option (next training day)");
assert(result1[0]?.day_index === 1, "First option is Monday (next training day)");
assert(result1[0]?.label === "Push", "First option label is Push");

console.log("\n=== Test 2: Rest day, next training day is Monday ===\n");

const result2 = trainAnywayOptions({
  yesterdayDay: day(4, "weights", "Shoulders"),
  todayDay: day(5, "rest"),
  upcomingDays: [
    day(6, "rest"),
    day(7, "rest"),
    day(1, "weights", "Push"),
    day(2, "rest"),
    day(3, "weights", "Pull"),
    day(4, "rest"),
  ],
  missedYesterday: false,
});

assert(result2.length === 1, "Returns 1 option (next training day)");
assert(result2[0]?.day_index === 1, "Option is Monday");
assert(result2[0]?.label === "Push", "Option label is Push");

console.log("\n=== Test 3: Last day of week (Sunday), wraps to Monday ===\n");

const result3 = trainAnywayOptions({
  yesterdayDay: null,
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
assert(result3[0]?.day_index === 1, "Option wraps to Monday");
assert(result3[0]?.label === "Push", "Option label is Push");

console.log("\n=== Test 4: Block with no weights days (all rest/yoga/meditation) ===\n");

const result4 = trainAnywayOptions({
  yesterdayDay: null,
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

console.log("\n=== Test 5: Rest day, next training day is Monday ===\n");

const result5 = trainAnywayOptions({
  yesterdayDay: null,
  todayDay: day(6, "rest"),
  upcomingDays: [
    day(7, "rest"),
    day(1, "weights", "Push"),
    day(2, "rest"),
    day(3, "weights", "Pull"),
    day(4, "rest"),
    day(5, "weights", "Legs"),
  ],
  missedYesterday: false,
});

assert(result5.length === 1, "Returns 1 option (next training day)");
assert(result5[0]?.day_index === 1, "Option is Monday (next training day)");
assert(result5[0]?.label === "Push", "Option label is Push");

console.log("\n=== Test 6: Bodyweight training days (not just weights) ===\n");

const result6 = trainAnywayOptions({
  yesterdayDay: null,
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
assert(result6[0]?.day_index === 5, "Option is next bodyweight day");
assert(result6[0]?.day_type === "bodyweight", "Option is bodyweight type");
assert(result6[0]?.label === "Bodyweight A", "Option label is Bodyweight A");

console.log("\n=== Test 7: Mixed weights and bodyweight ===\n");

const result7 = trainAnywayOptions({
  yesterdayDay: null,
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
assert(result7[0]?.day_index === 3, "Option is first training day (weights)");
assert(result7[0]?.label === "Push", "Option label is Push");

console.log("\n=== Test 8: Rest day, next training day is Friday (weights) ===\n");

const result8 = trainAnywayOptions({
  yesterdayDay: day(2, "bodyweight", "Bodyweight A"),
  todayDay: day(3, "rest"),
  upcomingDays: [
    day(4, "rest"),
    day(5, "weights", "Push"),
    day(6, "rest"),
    day(7, "rest"),
    day(1, "bodyweight", "Bodyweight B"),
    day(2, "rest"),
  ],
  missedYesterday: false,
});

assert(result8.length === 1, "Returns 1 option (next training day)");
assert(result8[0]?.day_index === 5, "Option is Friday weights");
assert(result8[0]?.label === "Push", "Option label is Push");

console.log("\n=== Test 9: Rest day, next training day is Monday (Push) ===\n");

const result9 = trainAnywayOptions({
  yesterdayDay: day(5, "weights", "Legs"),
  todayDay: day(6, "rest"),
  upcomingDays: [
    day(7, "rest"),
    day(1, "weights", "Push"),
    day(2, "rest"),
    day(3, "weights", "Pull"),
    day(4, "rest"),
    day(5, "rest"),
  ],
  missedYesterday: false,
});

assert(result9.length === 1, "Returns 1 option (next training day)");
assert(result9[0]?.day_index === 1, "Option is Monday");
assert(result9[0]?.label === "Push", "Option is Push");

console.log("\n=== Test 10: Rest day, next training day is Monday (Push) ===\n");

const result10 = trainAnywayOptions({
  yesterdayDay: day(5, "weights", "Legs"),  // Yesterday was Legs
  todayDay: day(6, "rest"),  // Today is rest
  upcomingDays: [
    day(7, "rest"),
    day(1, "weights", "Push"),
    day(2, "rest"),
    day(3, "weights", "Pull"),
    day(4, "rest"),
    day(5, "weights", "Legs"),
  ],
  missedYesterday: false,
});

assert(result10.length === 1, "Returns 1 option (next training day)");
assert(result10[0]?.day_index === 1, "Option is Monday Push");
assert(result10[0]?.label === "Push", "Option label is Push");

console.log("\n✅ All train-anyway tests passed\n");
