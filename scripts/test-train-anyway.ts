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
    day(3, "weights", "Pull"),  // Wed (2nd training day)
    day(4, "rest"),
    day(5, "weights", "Legs"),
  ],
  missedYesterday: false,
});

assert(result1.length === 2, "Returns 2 options (next 2 training days)");
assert(result1[0]?.day_index === 1, "First option is Monday (next training day)");
assert(result1[0]?.label === "Push", "First option label is Push");
assert(result1[1]?.day_index === 3, "Second option is Wednesday");
assert(result1[1]?.label === "Pull", "Second option label is Pull");

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

assert(result2.length === 3, "Returns 3 options (missed + next 2)");
assert(result2[0]?.day_index === 5, "First option is today's workout (missed yesterday scenario)");
assert(result2[0]?.label === "Legs", "First option label is Legs");
assert(result2[1]?.day_index === 1, "Second option is Monday");
assert(result2[1]?.label === "Push", "Second option label is Push");
assert(result2[2]?.day_index === 3, "Third option is Wednesday");
assert(result2[2]?.label === "Pull", "Third option label is Pull");

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

assert(result3.length === 2, "Returns 2 options");
assert(result3[0]?.day_index === 1, "First option wraps to Monday");
assert(result3[0]?.label === "Push", "First option label is Push");
assert(result3[1]?.day_index === 3, "Second option is Wednesday");
assert(result3[1]?.label === "Pull", "Second option label is Pull");

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

assert(result5.length === 2, "Returns 2 options (next 2 training days since today is rest)");
assert(result5[0]?.day_index === 1, "First option is Monday (next training day)");
assert(result5[0]?.label === "Push", "First option label is Push");
assert(result5[1]?.day_index === 3, "Second option is Wednesday");
assert(result5[1]?.label === "Pull", "Second option label is Pull");

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

assert(result6.length === 2, "Returns 2 options");
assert(result6[0]?.day_index === 5, "First option is next bodyweight day");
assert(result6[0]?.day_type === "bodyweight", "First option is bodyweight type");
assert(result6[0]?.label === "Bodyweight A", "First option label is Bodyweight A");
assert(result6[1]?.day_index === 1, "Second option is Monday");
assert(result6[1]?.label === "Bodyweight B", "Second option label is Bodyweight B");

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

assert(result7.length === 2, "Returns 2 options");
assert(result7[0]?.day_index === 3, "First option is first training day (weights)");
assert(result7[0]?.label === "Push", "First option label is Push");
assert(result7[1]?.day_index === 4, "Second option is bodyweight day");
assert(result7[1]?.label === "Bodyweight", "Second option label is Bodyweight");

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

assert(result8.length === 3, "Returns 3 options (missed + next 2)");
assert(result8[0]?.day_index === 3, "First option is today's bodyweight workout");
assert(result8[0]?.label === "Bodyweight A", "First option label is Bodyweight A");
assert(result8[1]?.day_index === 5, "Second option is Friday weights");
assert(result8[1]?.label === "Push", "Second option label is Push");
assert(result8[2]?.day_index === 1, "Third option is Monday bodyweight");
assert(result8[2]?.label === "Bodyweight B", "Third option label is Bodyweight B");

console.log("\n=== Test 9: Rest day after a missed training day ===\n");

const result9 = trainAnywayOptions({
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

// Should offer: yesterday's missed workout (if today's template had one, but it doesn't - today is rest)
// So should offer the next 2 training days: Monday Push, Wednesday Pull
assert(result9.length === 2, "Returns 2 options (next 2 training days)");
assert(result9[0]?.day_index === 1, "First option is Monday");
assert(result9[0]?.label === "Push", "First option is Push");
assert(result9[1]?.day_index === 3, "Second option is Wednesday");
assert(result9[1]?.label === "Pull", "Second option is Pull");

console.log("\n=== Test 10: Rest day after missed day, today IS training in template ===\n");

const result10 = trainAnywayOptions({
  todayDay: day(6, "weights", "Legs"),  // Today (Sat) IS a training day in template, but user chose rest
  upcomingDays: [
    day(7, "rest"),
    day(1, "weights", "Push"),
    day(2, "rest"),
    day(3, "weights", "Pull"),
    day(4, "rest"),
    day(5, "weights", "Legs"),
  ],
  missedYesterday: true,  // AND yesterday (Fri) was missed
});

// Should offer: yesterday's missed workout (today's Legs) PLUS next 2 training days
assert(result10.length === 3, "Returns 3 options (missed workout + next 2)");
assert(result10[0]?.day_index === 6, "First option is today's template workout (Legs)");
assert(result10[0]?.label === "Legs", "First option label is Legs");
assert(result10[1]?.day_index === 1, "Second option is Monday");
assert(result10[1]?.label === "Push", "Second option is Push");
assert(result10[2]?.day_index === 3, "Third option is Wednesday");
assert(result10[2]?.label === "Pull", "Third option is Pull");

console.log("\n✅ All train-anyway tests passed\n");
