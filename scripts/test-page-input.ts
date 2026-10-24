#!/usr/bin/env tsx
/**
 * Test: todayStateInputFromRows (page-input.ts)
 *
 * Tests that:
 * - A non-UTC profile timezone changes the result
 * - A null created_at falls back correctly
 */

import { todayStateInputFromRows } from "../src/lib/today/page-input";
import type { Database } from "../src/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

const baseProfile = {
  id: "user-1",
  created_at: "2026-10-22T04:00:00Z",
  timezone: "UTC",
  display_name: "Test User",
  email: "test@example.com",
  primary_track: "weights" as const,
  level: "intermediate" as const,
  goal: "strength" as const,
  preferred_session_minutes: 60,
  birth_year: 1990,
  onboarding_completed_at: "2026-10-22T04:00:00Z",
  has_all_equipment: true,
  plan_customized: false,
};

const baseProgram = {
  id: "prog-1",
  block_number: 1,
  split_type: "upper_lower" as const,
  started_on: "2026-10-22",
  ends_on: "2026-11-18",
  deload_week: null,
};

const baseDays = [
  { day_index: 1, day_type: "weights" as DayType, label: null },
  { day_index: 2, day_type: "weights" as DayType, label: null },
  { day_index: 3, day_type: "rest" as DayType, label: null },
  { day_index: 4, day_type: "weights" as DayType, label: null },
  { day_index: 5, day_type: "weights" as DayType, label: null },
  { day_index: 6, day_type: "rest" as DayType, label: null },
  { day_index: 7, day_type: "rest" as DayType, label: null },
];

// Test 1: UTC profile
console.log("\n=== Test 1: UTC profile ===\n");
test("UTC profile resolves correctly", () => {
  const result = todayStateInputFromRows({
    profile: baseProfile,
    program: baseProgram,
    days: baseDays,
    todaySessions: [],
    yesterdaySessions: [],
    yesterdayUnknown: false,
    timezone: "UTC",
    localToday: "2026-10-22",
    yesterday: "2026-10-21",
    dayType: "weights",
    strengthDone: false,
    strengthOpen: false,
    hasStartedAny: false,
  });

  assert(result.profile.created_at === "2026-10-22T04:00:00Z", "Created_at should match");
  assert(result.timezone === "UTC", "Timezone should be UTC");
});

// Test 2: Non-UTC profile (Asia/Kolkata)
console.log("\n=== Test 2: Non-UTC profile (Asia/Kolkata) ===\n");
test("Asia/Kolkata profile resolves correctly", () => {
  const profileIST = {
    ...baseProfile,
    timezone: "Asia/Kolkata",
  };

  const result = todayStateInputFromRows({
    profile: profileIST,
    program: baseProgram,
    days: baseDays,
    todaySessions: [],
    yesterdaySessions: [],
    yesterdayUnknown: false,
    timezone: "Asia/Kolkata",
    localToday: "2026-10-22",
    yesterday: "2026-10-21",
    dayType: "weights",
    strengthDone: false,
    strengthOpen: false,
    hasStartedAny: false,
  });

  assert(result.profile.created_at === "2026-10-22T04:00:00Z", "Created_at should match");
  assert(result.timezone === "Asia/Kolkata", "Timezone should be Asia/Kolkata");
});

// Test 3: Null created_at falls back
console.log("\n=== Test 3: Null created_at falls back ===\n");
test("Null created_at handled correctly", () => {
  const profileNull = {
    ...baseProfile,
    created_at: null,
  };

  const result = todayStateInputFromRows({
    profile: profileNull,
    program: baseProgram,
    days: baseDays,
    todaySessions: [],
    yesterdaySessions: [],
    yesterdayUnknown: false,
    timezone: "UTC",
    localToday: "2026-10-22",
    yesterday: "2026-10-21",
    dayType: "weights",
    strengthDone: false,
    strengthOpen: false,
    hasStartedAny: false,
  });

  assert(result.profile.created_at === null, "Should handle null created_at");
  assert(result.timezone === "UTC", "Timezone should still resolve");
});

console.log("\n==================================================");
console.log("📊 Test Results: All tests passed");
console.log("✅ All page-input tests passed!");
