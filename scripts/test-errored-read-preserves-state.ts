#!/usr/bin/env tsx
/**
 * Test: Errored sets read preserves Today state (HIGH bug fix)
 * 
 * When yesterday's session_exercises query fails, Today must:
 * - Suppress the "missed yesterday" prompt (treat as unknown)
 * - Keep isTraining from today's day type
 * - Keep rest-day content and "Or train today anyway"
 * - NOT hide Start/Resume, exercises, warm-up, or deload badge
 * 
 * Regression: buildTodayState(null) returned isTraining:false and promptType:'none',
 * which blanked the entire Today page on a transient read error.
 */

import { buildPageState } from "../src/lib/today/page-wiring";
import { buildTodayState } from "../src/lib/today/build-state";
import { todayPromptBlocks } from "../src/lib/today/prompt-blocks";

const baseInput = {
  profile: {
    created_at: "2024-01-01T00:00:00Z",
    timezone: "America/New_York",
  },
  program: {
    id: "p1",
    started_on: "2024-01-01",
  },
  days: [
    { day_index: 1, day_type: "weights" as const, label: "Push" },
    { day_index: 2, day_type: "rest" as const, label: null },
    { day_index: 3, day_type: "weights" as const, label: "Pull" },
  ],
  timezone: "America/New_York",
  localToday: "2024-01-15", // Monday
  yesterday: "2024-01-14", // Sunday (rest)
  strengthDone: false,
  strengthOpen: false,
};

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

console.log("\n=== Test 1: Training day + errored sets read ===\n");

// Scenario: Today is Monday (weights), yesterday's sets query failed
// Expected: isTraining=true, no missed prompt, normal Today rendering
const trainingDayErrored = buildPageState({
  ...baseInput,
  allSessionsRes: {
    data: [
      { actual_type: "weights" as const, started_at: "2024-01-10T10:00:00Z" },
    ],
    error: null,
  },
  todaySessions: [],
  yesterdaySessions: null, // ERRORED READ
  dayType: "weights",
});

const trainingState = buildTodayState(trainingDayErrored.todayStateInput);

assert(
  trainingState.isTraining === true,
  "Training day + errored read: isTraining = true (not false)"
);

assert(
  trainingState.missedYesterday === false,
  "Training day + errored read: missedYesterday = false (suppressed)"
);

assert(
  trainingState.promptType === "none",
  "Training day + errored read: promptType = 'none' (day already answered)"
);

console.log("\n=== Test 2: Rest day + errored sets read ===\n");

// Scenario: Today is Tuesday (rest), yesterday (Monday) was training, sets query failed
// Expected: promptType='rest_plan', showRestPlan=true, no "both" prompt
const restDayErrored = buildPageState({
  ...baseInput,
  allSessionsRes: {
    data: [
      { actual_type: "weights" as const, started_at: "2024-01-10T10:00:00Z" },
    ],
    error: null,
  },
  todaySessions: [],
  yesterdaySessions: null, // ERRORED READ
  localToday: "2024-01-16", // Tuesday
  yesterday: "2024-01-15", // Monday (was weights)
  dayType: "rest",
});

const restState = buildTodayState(restDayErrored.todayStateInput);

assert(
  restState.isTraining === false,
  "Rest day + errored read: isTraining = false (rest day)"
);

assert(
  restState.missedYesterday === false,
  "Rest day + errored read: missedYesterday = false (suppressed)"
);

assert(
  restState.promptType === "rest_plan",
  "Rest day + errored read: promptType = 'rest_plan' (not 'none')"
);

const restPromptBlocks = todayPromptBlocks({
  promptType: restState.promptType,
  missedYesterday: restState.missedYesterday,
  hasStartedAny: true,
  nextTrainingDay: null,
  isTraining: restState.isTraining,
  firstTrainingDay: null,
});

assert(
  restPromptBlocks.showRestPlan === true,
  "Rest day + errored read: showRestPlan = true (rest content visible)"
);

assert(
  restPromptBlocks.showBothPrompt === false,
  "Rest day + errored read: showBothPrompt = false (no 'both' prompt)"
);

assert(
  restPromptBlocks.showMissedPrompt === false,
  "Rest day + errored read: showMissedPrompt = false"
);

console.log("\n=== Test 3: Training day + successful read + actually missed ===\n");

// Scenario: Today is Wednesday (Pull), yesterday was Push (Monday), no sessions yesterday
// Expected: missedYesterday=true, isTraining=true
const trainingDayMissed = buildPageState({
  ...baseInput,
  allSessionsRes: {
    data: [
      { actual_type: "weights" as const, started_at: "2024-01-10T10:00:00Z" },
    ],
    error: null,
  },
  todaySessions: [],
  yesterdaySessions: [], // Successful read, no sessions
  localToday: "2024-01-17", // Wednesday
  yesterday: "2024-01-15", // Monday (was weights)
  dayType: "weights",
});

const missedState = buildTodayState(trainingDayMissed.todayStateInput);

assert(
  missedState.isTraining === true,
  "Training day + missed: isTraining = true"
);

assert(
  missedState.missedYesterday === true,
  "Training day + missed: missedYesterday = true (detected)"
);

assert(
  missedState.promptType === "missed",
  "Training day + missed: promptType = 'missed'"
);

console.log("\n✅ All errored-read state preservation tests passed!\n");
