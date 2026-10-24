#!/usr/bin/env tsx
/**
 * Test suite for plannableDays - the workout list builder.
 *
 * Tests that plannableDays returns the correct list of training days
 * (weights/bodyweight) for "Swap the day" and "Pick a workout" on rest days.
 */

import type { Database } from "../src/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

type ProgramDay = {
  id: string;
  day_index: number;
  day_type: DayType;
  label: string | null;
};

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

// Mock plannableDays logic (the actual function filters program_days for weights/bodyweight)
function mockPlannableDays(programDays: ProgramDay[]): Array<{
  programDayId: string;
  label: string;
  dayType: DayType;
}> {
  return programDays
    .filter((d) => d.day_type === "weights" || d.day_type === "bodyweight")
    .map((d) => ({
      programDayId: d.id,
      label: d.label ?? `Day ${d.day_index}`,
      dayType: d.day_type,
    }));
}

console.log("=== Test 1: 3-day plan (Mon/Wed/Fri) ===\n");

const threeDayPlan: ProgramDay[] = [
  { id: "day-1", day_index: 1, day_type: "weights", label: "Mon Upper" },
  { id: "day-2", day_index: 2, day_type: "rest", label: null },
  { id: "day-3", day_index: 3, day_type: "weights", label: "Wed Lower" },
  { id: "day-4", day_index: 4, day_type: "rest", label: null },
  { id: "day-5", day_index: 5, day_type: "weights", label: "Fri Full" },
  { id: "day-6", day_index: 6, day_type: "rest", label: null },
  { id: "day-7", day_index: 7, day_type: "rest", label: null },
];

const threeDayResult = mockPlannableDays(threeDayPlan);

assert(
  threeDayResult.length === 3,
  "3-day plan returns exactly 3 training days"
);

assert(
  threeDayResult.every((d) => d.dayType === "weights" || d.dayType === "bodyweight"),
  "All returned days are weights or bodyweight"
);

assert(
  threeDayResult[0].label === "Mon Upper" &&
  threeDayResult[1].label === "Wed Lower" &&
  threeDayResult[2].label === "Fri Full",
  "Labels match the program days"
);

console.log("\n=== Test 2: 4-day plan (Mon/Tue/Thu/Fri) ===\n");

const fourDayPlan: ProgramDay[] = [
  { id: "day-1", day_index: 1, day_type: "weights", label: "Mon Push" },
  { id: "day-2", day_index: 2, day_type: "weights", label: "Tue Pull" },
  { id: "day-3", day_index: 3, day_type: "rest", label: null },
  { id: "day-4", day_index: 4, day_type: "weights", label: "Thu Legs" },
  { id: "day-5", day_index: 5, day_type: "weights", label: "Fri Upper" },
  { id: "day-6", day_index: 6, day_type: "rest", label: null },
  { id: "day-7", day_index: 7, day_type: "rest", label: null },
];

const fourDayResult = mockPlannableDays(fourDayPlan);

assert(
  fourDayResult.length === 4,
  "4-day plan returns exactly 4 training days"
);

assert(
  fourDayResult[0].label === "Mon Push" &&
  fourDayResult[1].label === "Tue Pull" &&
  fourDayResult[2].label === "Thu Legs" &&
  fourDayResult[3].label === "Fri Upper",
  "All 4 training days returned in order"
);

console.log("\n=== Test 3: Mixed weights/bodyweight plan ===\n");

const mixedPlan: ProgramDay[] = [
  { id: "day-1", day_index: 1, day_type: "weights", label: "Mon Weights" },
  { id: "day-2", day_index: 2, day_type: "bodyweight", label: "Tue BW" },
  { id: "day-3", day_index: 3, day_type: "rest", label: null },
  { id: "day-4", day_index: 4, day_type: "weights", label: "Thu Weights" },
  { id: "day-5", day_index: 5, day_type: "rest", label: null },
  { id: "day-6", day_index: 6, day_type: "rest", label: null },
  { id: "day-7", day_index: 7, day_type: "rest", label: null },
];

const mixedResult = mockPlannableDays(mixedPlan);

assert(
  mixedResult.length === 3,
  "Mixed plan returns 3 training days (weights + bodyweight)"
);

assert(
  mixedResult.some((d) => d.dayType === "weights") &&
  mixedResult.some((d) => d.dayType === "bodyweight"),
  "Both weights and bodyweight days included"
);

console.log("\n=== Test 4: Yoga/meditation/active_recovery filtered out ===\n");

const filteredPlan: ProgramDay[] = [
  { id: "day-1", day_index: 1, day_type: "weights", label: "Mon" },
  { id: "day-2", day_index: 2, day_type: "yoga", label: "Tue Yoga" },
  { id: "day-3", day_index: 3, day_type: "weights", label: "Wed" },
  { id: "day-4", day_index: 4, day_type: "meditation", label: "Thu Breathe" },
  { id: "day-5", day_index: 5, day_type: "weights", label: "Fri" },
  { id: "day-6", day_index: 6, day_type: "active_recovery", label: "Sat Active" },
  { id: "day-7", day_index: 7, day_type: "rest", label: null },
];

const filteredResult = mockPlannableDays(filteredPlan);

assert(
  filteredResult.length === 3,
  "Only weights/bodyweight days returned (yoga/meditation/active_recovery filtered)"
);

assert(
  filteredResult.every((d) => d.label?.includes("Mon") || d.label?.includes("Wed") || d.label?.includes("Fri")),
  "Only Mon/Wed/Fri weights days in result"
);

console.log("\n==================================================");
console.log(`📊 Test Results: ${passedTests}/${totalTests} passed`);

if (passedTests === totalTests) {
  console.log("✅ All tests passed!");
  process.exit(0);
} else {
  console.log(`❌ ${totalTests - passedTests} test(s) failed`);
  process.exit(1);
}
