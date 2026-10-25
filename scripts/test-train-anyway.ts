#!/usr/bin/env tsx
/**
 * Test suite for "Or train today anyway" logic (H2).
 *
 * Product rule: On a rest day, always offer workout options:
 * - Offer the next upcoming strength day first (shown as "Lift: <day name>" in UI)
 * - If yesterday was missed, offer it next
 * - Then offer the next 2 distinct upcoming training days
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
    day(1, "weights", "Push"),  // Mon (next training day for Lift)
    day(2, "rest"),
    day(3, "weights", "Pull"),  // Wed (2nd training day)
    day(4, "rest"),
    day(5, "weights", "Legs"),
  ],
  missedYesterday: false,
});

assert(result1.length === 2, "Returns 2 options (Lift + 1 more)");
assert(result1[0]?.day_index === 1, "First option is Monday (for Lift)");
assert(result1[0]?.label === "Push", "First option label is Push");
assert(result1[1]?.day_index === 3, "Second option is Wednesday");
assert(result1[1]?.label === "Pull", "Second option label is Pull");

console.log("\n=== Test 2: Rest day, yesterday missed workout ===\n");

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
  missedYesterday: true,
});

assert(result2.length === 3, "Returns 3 options (missed + upcoming)");
assert(result2[0]?.day_index === 4, "First option is yesterday's missed workout (Shoulders)");
assert(result2[0]?.label === "Shoulders", "First option label is Shoulders");
assert(result2[1]?.day_index === 1, "Second option is Monday (Push)");
assert(result2[1]?.label === "Push", "Second option label is Push");
assert(result2[2]?.day_index === 3, "Third option is Wednesday (Pull)");
assert(result2[2]?.label === "Pull", "Third option label is Pull");

console.log("\n=== Test 3: Last day of week (Sunday), wraps to Monday ===\n");

const result3 = trainAnywayOptions({
  yesterdayDay: null,
  todayDay: day(7, "rest"),
  upcomingDays: [
    day(1, "weights", "Push"),  // Mon (wraps to next week for Lift)
    day(2, "rest"),
    day(3, "weights", "Pull"),
    day(4, "rest"),
    day(5, "weights", "Legs"),
    day(6, "rest"),
  ],
  missedYesterday: false,
});

assert(result3.length === 2, "Returns 2 options (Lift + 1 more)");
assert(result3[0]?.day_index === 1, "First option wraps to Monday");
assert(result3[0]?.label === "Push", "First option label is Push");
assert(result3[1]?.day_index === 3, "Second option is Wednesday");
assert(result3[1]?.label === "Pull", "Second option label is Pull");

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

console.log("\n=== Test 5: Rest day with yesterday missed, but today is also rest ===\n");

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
  missedYesterday: true,
});

assert(result5.length === 3, "Returns 3 options (Lift + 2 more when yesterday missed but was rest)");
assert(result5[0]?.day_index === 1, "First option is Monday (for Lift)");
assert(result5[0]?.label === "Push", "First option label is Push");
assert(result5[1]?.day_index === 3, "Second option is Wednesday");
assert(result5[1]?.label === "Pull", "Second option label is Pull");
assert(result5[2]?.day_index === 5, "Third option is Friday");
assert(result5[2]?.label === "Legs", "Third option label is Legs");

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

assert(result6.length === 2, "Returns 2 options");
assert(result6[0]?.day_index === 5, "First option is next bodyweight day");
assert(result6[0]?.day_type === "bodyweight", "First option is bodyweight type");
assert(result6[0]?.label === "Bodyweight A", "First option label is Bodyweight A");
assert(result6[1]?.day_index === 1, "Second option is Monday");
assert(result6[1]?.label === "Bodyweight B", "Second option label is Bodyweight B");

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

assert(result7.length === 2, "Returns 2 options (Lift + 1 more)");
assert(result7[0]?.day_index === 3, "First option is first training day (weights)");
assert(result7[0]?.label === "Push", "First option label is Push");
assert(result7[1]?.day_index === 4, "Second option is bodyweight day");
assert(result7[1]?.label === "Bodyweight", "Second option label is Bodyweight");

console.log("\n=== Test 8: Yesterday missed workout (Bodyweight A), today is rest ===\n");

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
  missedYesterday: true,
});

assert(result8.length === 3, "Returns 3 options (missed + upcoming)");
assert(result8[0]?.day_index === 2, "First option is yesterday's missed bodyweight workout");
assert(result8[0]?.label === "Bodyweight A", "First option label is Bodyweight A");
assert(result8[1]?.day_index === 5, "Second option is Friday weights (Push)");
assert(result8[1]?.label === "Push", "Second option label is Push");
assert(result8[2]?.day_index === 1, "Third option is Monday bodyweight (Bodyweight B)");
assert(result8[2]?.label === "Bodyweight B", "Third option label is Bodyweight B");

console.log("\n=== Test 9: Rest day, yesterday missed, today is rest (no workout to catch up) ===\n");

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
  missedYesterday: true,
});

assert(result9.length === 3, "Returns 3 options (missed + upcoming)");
assert(result9[0]?.day_index === 5, "First option is yesterday's missed Legs");
assert(result9[0]?.label === "Legs", "First option label is Legs");
assert(result9[1]?.day_index === 1, "Second option is Monday (Push)");
assert(result9[1]?.label === "Push", "Second option label is Push");
assert(result9[2]?.day_index === 3, "Third option is Wednesday (Pull)");
assert(result9[2]?.label === "Pull", "Third option label is Pull");

console.log("\n=== Test 10: Yesterday missed (Legs), today is rest, upcoming has duplicate Legs ===\n");

const result10 = trainAnywayOptions({
  yesterdayDay: day(5, "weights", "Legs"),  // Yesterday was Legs
  todayDay: day(6, "rest"),  // Today is rest
  upcomingDays: [
    day(7, "rest"),
    day(1, "weights", "Push"),
    day(2, "rest"),
    day(3, "weights", "Pull"),
    day(4, "rest"),
    day(5, "weights", "Legs"),  // Duplicate label
  ],
  missedYesterday: true,
});

// Offer missed Legs + upcoming distinct (Push, Pull) - duplicate Legs label filtered
assert(result10.length === 3, "Returns 3 options (missed + upcoming, no duplicate)");
assert(result10[0]?.day_index === 5, "First option is yesterday's missed Legs");
assert(result10[0]?.label === "Legs", "First option label is Legs");
assert(result10[1]?.day_index === 1, "Second option is Monday (Push)");
assert(result10[1]?.label === "Push", "Second option label is Push");
assert(result10[2]?.day_index === 3, "Third option is Wednesday (Pull)");
assert(result10[2]?.label === "Pull", "Third option label is Pull");

console.log("\n=== Test B11: Missed yesterday vs Lift dedupe ===\n");

// Friday (rest), Thursday missed Legs, and Monday is Push (for Lift)
// Should show: Lift: Push, Legs (missed), next distinct (not Push again)

const result_b11 = trainAnywayOptions({
  yesterdayDay: day(4, "weights", "Legs"),
  todayDay: day(5, "rest"),
  upcomingDays: [
    day(6, "rest"),
    day(7, "rest"),
    day(1, "weights", "Push"),  // For Lift
    day(2, "rest"),
    day(3, "weights", "Pull"),
    day(4, "rest"),
  ],
  missedYesterday: true,
});

assert(result_b11.length === 3, "(B11) Returns 3 options");
assert(result_b11[0]?.day_index === 4, "(B11) First is missed Legs (Thursday)");
assert(result_b11[0]?.label === "Legs", "(B11) First label is Legs");
assert(result_b11[1]?.day_index === 1, "(B11) Second is Push (Monday)");
assert(result_b11[1]?.label === "Push", "(B11) Second label is Push");
assert(result_b11[2]?.day_index === 3, "(B11) Third is Pull (Wednesday)");
assert(result_b11[2]?.label === "Pull", "(B11) Third label is Pull");

console.log("\n=== Test L6: Upcoming list excludes today ===\n");

// Today is Monday (training day), upcoming should not include today's day_index

const result_l6 = trainAnywayOptions({
  yesterdayDay: null,
  todayDay: day(1, "weights", "Push"),
  upcomingDays: [
    day(2, "rest"),
    day(3, "weights", "Pull"),
    day(4, "rest"),
    day(5, "weights", "Legs"),
    day(6, "rest"),
    day(7, "rest"),
  ],
  missedYesterday: false,
});

// All options should be day_index > 1 or wrapped to next week
const includesMonday = result_l6.some((d) => d.day_index === 1);
assert(!includesMonday, "(L6) Upcoming list does not include today (Monday, day_index 1)");

console.log("\n✅ All train-anyway tests passed\n");
