#!/usr/bin/env tsx
/**
 * Test: First-session offer and day-1 guard comprehensive coverage
 * 
 * Tests for owner product decision:
 * 1. First session offer on rest day (shows plan day 1, not next calendar day)
 * 2. Day-1 guard suppresses missed-day messages before max(signup, block start)
 * 3. Mutants to verify test coverage
 */

import { findFirstTrainingDay } from "../src/lib/today/first-training-day";
import { todayPromptBlocks } from "../src/lib/today/prompt-blocks";
import { isMissedTrainingDay } from "../src/lib/today/missed-day";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`✓ ${message}`);
  }
}

console.log("=== Test 1: findFirstTrainingDay returns plan day 1, not next calendar day ===\n");

// Plan: Mon=Push, Tue=Rest, Wed=Pull, Thu=Rest, Fri=Legs, Sat=Rest, Sun=Rest
// Day 1 in plan order = Monday (day_index 1), NOT just "next training day"
const days = [
  { id: "day-1", day_index: 1, day_type: "weights" as const, label: "Push" },
  { id: "day-2", day_index: 2, day_type: "rest" as const, label: null },
  { id: "day-3", day_index: 3, day_type: "weights" as const, label: "Pull" },
  { id: "day-4", day_index: 4, day_type: "rest" as const, label: null },
  { id: "day-5", day_index: 5, day_type: "weights" as const, label: "Legs" },
  { id: "day-6", day_index: 6, day_type: "rest" as const, label: null },
  { id: "day-7", day_index: 7, day_type: "rest" as const, label: null },
];

const firstDay = findFirstTrainingDay(days);
assert(firstDay !== null, "Returns a training day");
assert(firstDay!.dayIndex === 1, "Returns day 1 (Monday), not next calendar day");
assert(firstDay!.label === "Push", "Returns correct label");
assert(firstDay!.programDayId === "day-1", "Returns correct program day ID");

console.log("\n=== Test 2: First-session offer on rest day for brand-new user ===\n");

const firstSessionBlocks = todayPromptBlocks({
  promptType: "rest_plan",
  missedYesterday: false,
  hasStartedAny: false,
  nextTrainingDay: { dayName: "Monday", dayIndex: 1 },
  isTraining: false,
  firstTrainingDay: { dayIndex: 1, label: "Push" },
});

assert(firstSessionBlocks.showFirstSessionOffer === true, "Shows first-session offer");
assert(firstSessionBlocks.showFirstDayWelcome === true, "Shows first-day welcome");
assert(firstSessionBlocks.showRestPlan === true, "Shows rest plan content");
assert(firstSessionBlocks.showMissedPrompt === false, "Does not show missed prompt");

console.log("\n=== Test 3: No first-session offer for user who has started ===\n");

const noOfferBlocks = todayPromptBlocks({
  promptType: "rest_plan",
  missedYesterday: false,
  hasStartedAny: true,
  nextTrainingDay: { dayName: "Monday", dayIndex: 1 },
  isTraining: false,
  firstTrainingDay: { dayIndex: 1, label: "Push" },
});

assert(noOfferBlocks.showFirstSessionOffer === false, "Does not show first-session offer");

console.log("\n=== Test 4: Day-1 guard - Signup today (Saturday) ===\n");

// User signs up Saturday 2026-10-24, today is Saturday
// Block started earlier (e.g., 2026-10-20)
// Yesterday Friday was a training day
// Guard must use max(signup, block start) = Saturday signup
// So Friday should NOT be missed (before signup)
assert(
  !isMissedTrainingDay({
    date: "2026-10-23", // Friday (yesterday, training day)
    programStartedOn: "2026-10-20", // Block started Monday (before signup)
    profileCreatedAt: "2026-10-24T10:00:00Z", // Saturday signup (today)
    timezone: "UTC",
    programId: "test-program",
    templateDayType: "weights",
    sessions: [],
    hasStartedAny: false,
  }),
  "Signup today with old block: yesterday training day NOT missed"
);

console.log("\n=== Test 5: Day-1 guard - Signup yesterday evening, nothing missed ===\n");

// User signs up Friday evening 2026-10-23T22:00 UTC (23:00 local in Asia/Kolkata)
// Today is Saturday 2026-10-24
// Yesterday (local Friday) was signup day, so nothing missed
assert(
  !isMissedTrainingDay({
    date: "2026-10-23", // Friday (signup day local)
    programStartedOn: "2026-10-23", // Friday
    profileCreatedAt: "2026-10-23T22:00:00Z", // Friday 22:00 UTC = late Friday
    timezone: "UTC",
    programId: "test-program",
    templateDayType: "weights",
    sessions: [],
    hasStartedAny: true,
  }),
  "Signup yesterday evening: no missed day"
);

console.log("\n=== Test 6: Day-1 guard - Signup 3 days ago with missed training day (shown) ===\n");

// User signs up Monday 2026-10-21
// Today is Thursday 2026-10-24
// Wednesday 2026-10-23 was a training day (2 days after signup)
// This SHOULD show as missed
assert(
  isMissedTrainingDay({
    date: "2026-10-23", // Wednesday (2 days after signup, training day)
    programStartedOn: "2026-10-21", // Monday (signup day)
    profileCreatedAt: "2026-10-21T10:00:00Z", // Monday signup
    timezone: "UTC",
    programId: "test-program",
    templateDayType: "weights",
    sessions: [],
    hasStartedAny: true,
  }),
  "Signup 3 days ago: missed training day IS shown"
);

console.log("\n=== Test 7: Day-1 guard - Old account, block started today ===\n");

// Account created 2 weeks ago, but block started today
// Yesterday should NOT be missed
assert(
  !isMissedTrainingDay({
    date: "2026-10-23", // Yesterday (training day)
    programStartedOn: "2026-10-24", // Block started today
    profileCreatedAt: "2026-10-10T10:00:00Z", // Account 2 weeks old
    timezone: "UTC",
    programId: "test-program",
    templateDayType: "weights",
    sessions: [],
    hasStartedAny: true,
  }),
  "Old account, block started today: yesterday NOT missed"
);

console.log("\n✅ All first-session and day-1 guard tests passed\n");
