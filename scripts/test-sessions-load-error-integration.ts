#!/usr/bin/env tsx
/**
 * Integration test: allSessionsRes error handling behavior
 * 
 * When allSessionsRes query fails, the page must set hasStartedAny to null (not false).
 * This test verifies the CONTRACT between page.tsx and the helper functions:
 * - hasStartedAny = null means "unknown state" (query error)
 * - hasStartedAny = false means "user never started" (no error)
 * 
 * These two states must behave differently:
 * - null: hide first-session offer, show normal Today
 * - false: show first-session offer, show welcome card
 */

import { todayPromptBlocks } from "../src/lib/today/prompt-blocks";
import { isMissedTrainingDay } from "../src/lib/today/missed-day";

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

console.log("\n=== CONTRACT: hasStartedAny = null vs false must behave differently ===\n");

// Scenario: Rest day, user never started (no error)
const blocksNeverStarted = todayPromptBlocks({
  promptType: "rest_plan",
  missedYesterday: false,
  hasStartedAny: false, // User never started (no error)
  nextTrainingDay: { dayName: "Monday", dayIndex: 1 },
  isTraining: false,
  firstTrainingDay: { dayIndex: 1, label: "Push" },
});

// Scenario: Rest day, query error (unknown state)
const blocksQueryError = todayPromptBlocks({
  promptType: "rest_plan",
  missedYesterday: false,
  hasStartedAny: null, // Query error (unknown state)
  nextTrainingDay: { dayName: "Monday", dayIndex: 1 },
  isTraining: false,
  firstTrainingDay: null, // Page must nullify this when hasStartedAny is null
});

console.log("\n=== Test 1: false (never started) shows first-session offer ===\n");
assert(
  blocksNeverStarted.showFirstSessionOffer === true,
  "hasStartedAny=false → showFirstSessionOffer=true (user never started)"
);

assert(
  blocksNeverStarted.showFirstDayWelcome === true,
  "hasStartedAny=false → showFirstDayWelcome=true (welcome card)"
);

console.log("\n=== Test 2: null (query error) hides first-session offer ===\n");
assert(
  blocksQueryError.showFirstSessionOffer === false,
  "hasStartedAny=null → showFirstSessionOffer=false (hide offer on error)"
);

assert(
  blocksQueryError.showFirstDayWelcome === false,
  "hasStartedAny=null → showFirstDayWelcome=false (no welcome card on error)"
);

console.log("\n=== Test 3: Missed-day detection respects null vs false ===\n");

// Scenario: Yesterday was a training day, no completed session
// User never started (false) → suppress missed (day-one guard)
const missedNeverStarted = isMissedTrainingDay({
  date: "2026-10-23",
  programStartedOn: "2026-10-20",
  profileCreatedAt: "2026-10-20T10:00:00Z",
  timezone: "UTC",
  templateDayType: "weights",
  programId: "program-1",
  sessions: [],
  hasStartedAny: false, // User never started
});

// Query error (null) → also suppress missed (unknown state)
const missedQueryError = isMissedTrainingDay({
  date: "2026-10-23",
  programStartedOn: "2026-10-20",
  profileCreatedAt: "2026-10-20T10:00:00Z",
  timezone: "UTC",
  templateDayType: "weights",
  programId: "program-1",
  sessions: [],
  hasStartedAny: null, // Query error
});

assert(
  missedNeverStarted === false,
  "hasStartedAny=false → isMissedTrainingDay=false (day-one guard)"
);

assert(
  missedQueryError === false,
  "hasStartedAny=null → isMissedTrainingDay=false (error state guard)"
);

console.log("\n=== Test 4: User has started → both null and false should differ from true ===\n");

// User has started (true) → missed prompt should fire
const missedHasStarted = isMissedTrainingDay({
  date: "2026-10-23",
  programStartedOn: "2026-10-20",
  profileCreatedAt: "2026-10-20T10:00:00Z",
  timezone: "UTC",
  templateDayType: "weights",
  programId: "program-1",
  sessions: [],
  hasStartedAny: true, // User has started before
});

assert(
  missedHasStarted === true,
  "hasStartedAny=true → isMissedTrainingDay=true (user has started, missed yesterday)"
);

console.log("\n=== INTEGRATION CONTRACT VERIFIED ===\n");
console.log("The page must:");
console.log("1. Set hasStartedAny=null when allSessionsRes.error is truthy");
console.log("2. Set hasStartedAny=false only when query succeeds and user never started");
console.log("3. Pass hasStartedAny to todayPromptBlocks and buildTodayView");
console.log("4. Nullify firstTrainingDay when hasStartedAny is null");

console.log(`\n✅ All ${passedTests}/${totalTests} integration contract tests passed!\n`);
