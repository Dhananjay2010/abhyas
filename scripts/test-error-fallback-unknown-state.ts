#!/usr/bin/env tsx
/**
 * Test: Error fallback for allSessionsRes failure
 * 
 * When allSessionsRes fails (query error), the state should be 'unknown':
 * - isMissedTrainingDay returns false (no missed prompt)
 * - First-session offer is hidden (showFirstSessionOffer = false)
 * - Normal Today shows (safe fallback on error)
 */

import { isMissedTrainingDay } from "../src/lib/today/missed-day";
import { todayPromptBlocks } from "../src/lib/today/prompt-blocks";

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

console.log("\n=== Test 1: hasStartedAny = null (error state) means no missed prompt ===\n");

// When allSessionsRes fails, hasStartedAny is null
// isMissedTrainingDay should return false (no missed prompt on error)
const missed = isMissedTrainingDay({
  date: "2026-10-23", // Thu (training day)
  programStartedOn: "2026-10-20", // Tue (program start)
  profileCreatedAt: "2026-10-20T10:00:00Z",
  timezone: "UTC",
  templateDayType: "weights", // Training day in template
  programId: "program-1",
  sessions: [], // No sessions (could be due to error)
  hasStartedAny: null, // null = unknown state (query error)
});

assert(
  !missed,
  "hasStartedAny = null: isMissedTrainingDay returns false (no missed prompt on error)"
);

console.log("\n=== Test 2: hasStartedAny = null hides first-session offer ===\n");

// When allSessionsRes fails, showFirstSessionOffer should be false
// (hide first-session offer on error, show normal Today)
const promptBlocks = todayPromptBlocks({
  promptType: "rest_plan",
  missedYesterday: false,
  hasStartedAny: null, // null = unknown state (query error)
  nextTrainingDay: { dayName: "Monday", dayIndex: 1 },
  isTraining: false, // Rest day
  firstTrainingDay: { dayIndex: 1, label: "Push" },
});

assert(
  !promptBlocks.showFirstSessionOffer,
  "hasStartedAny = null: showFirstSessionOffer = false (hide offer on error)"
);

assert(
  promptBlocks.showRestPlan,
  "hasStartedAny = null: showRestPlan = true (show normal rest day UI)"
);

assert(
  !promptBlocks.showFirstDayWelcome,
  "hasStartedAny = null: showFirstDayWelcome = false (not a first-day state)"
);

console.log("\n=== Test 3: hasStartedAny = false (no error) shows first-session offer ===\n");

// For comparison: when hasStartedAny = false (no error, just never started),
// showFirstSessionOffer should be true
const promptBlocksNoError = todayPromptBlocks({
  promptType: "rest_plan",
  missedYesterday: false,
  hasStartedAny: false, // false = user never started (no error)
  nextTrainingDay: { dayName: "Monday", dayIndex: 1 },
  isTraining: false, // Rest day
  firstTrainingDay: { dayIndex: 1, label: "Push" },
});

assert(
  promptBlocksNoError.showFirstSessionOffer,
  "hasStartedAny = false (no error): showFirstSessionOffer = true"
);

assert(
  promptBlocksNoError.showFirstDayWelcome,
  "hasStartedAny = false (no error): showFirstDayWelcome = true"
);

console.log("\n=== Test 4: hasStartedAny = null on training day shows normal day ===\n");

// On a training day, when hasStartedAny = null (error state),
// no prompts should show (normal training day UI)
const promptBlocksTraining = todayPromptBlocks({
  promptType: "none",
  missedYesterday: false,
  hasStartedAny: null, // null = unknown state (query error)
  nextTrainingDay: null,
  isTraining: true, // Training day
  firstTrainingDay: null,
});

assert(
  !promptBlocksTraining.showFirstSessionOffer,
  "hasStartedAny = null on training day: showFirstSessionOffer = false"
);

assert(
  !promptBlocksTraining.showMissedPrompt,
  "hasStartedAny = null on training day: showMissedPrompt = false"
);

assert(
  !promptBlocksTraining.showFirstDayWelcome,
  "hasStartedAny = null on training day: showFirstDayWelcome = false"
);

console.log(`\n✅ All ${passedTests}/${totalTests} error fallback tests passed!\n`);
