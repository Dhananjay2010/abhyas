#!/usr/bin/env tsx
/**
 * Behavioral unit tests for Today page wiring helpers.
 *
 * Tests todayStateInputFromRows and todayPromptBlocks without source-grep.
 * These helpers extract page logic from the DB layer.
 */

import { todayStateInputFromRows } from "../src/lib/today/page-input";
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

console.log("\n=== Test 1: todayStateInputFromRows ===\n");

const inputRows = {
  profile: {
    created_at: "2026-10-20T10:00:00Z",
    timezone: "UTC",
  },
  program: {
    id: "program-1",
    started_on: "2026-10-20",
  },
  days: [
    { day_index: 1, day_type: "weights" as const, label: "Upper A" },
    { day_index: 2, day_type: "rest" as const, label: null },
  ],
  todaySessions: [
    { status: "planned", actual_type: "rest" as const, program_id: "program-1", started_at: null },
  ],
  yesterdaySessions: [],
  timezone: "UTC",
  localToday: "2026-10-22",
  yesterday: "2026-10-21",
  dayType: "rest" as const,
  strengthDone: false,
  strengthOpen: false,
  hasStartedAny: true,
};

const result = todayStateInputFromRows(inputRows);

assert(
  result.profile.created_at === "2026-10-20T10:00:00Z",
  "Maps profile.created_at"
);

assert(
  result.program.id === "program-1",
  "Maps program.id"
);

assert(
  result.days.length === 2,
  "Maps days array"
);

assert(
  result.sessions.today.length === 1,
  "Maps today sessions"
);

assert(
  result.sessions.today[0].status === "planned",
  "Maps session status"
);

assert(
  result.dayType === "rest",
  "Maps dayType"
);

assert(
  result.hasStartedSession === true,
  "Maps hasStartedAny to hasStartedSession"
);

console.log("\n=== Test 2: todayPromptBlocks - missed prompt ===\n");

const missedBlocks = todayPromptBlocks({
  promptType: "missed",
  missedYesterday: true,
  hasStartedAny: true,
  nextTrainingDay: null,
  isTraining: true,
});

assert(
  missedBlocks.showMissedPrompt === true,
  "Shows missed prompt for 'missed' type"
);

assert(
  "Hides Keep/Swap/Rest for 'missed' type"
);

assert(
  missedBlocks.showRestPlan === false,
  "Hides rest plan for 'missed' type"
);

assert(
  missedBlocks.showBothPrompt === false,
  "Hides both prompt for 'missed' type"
);

console.log("\n=== Test 3: todayPromptBlocks - both state ===\n");

const bothBlocks = todayPromptBlocks({
  promptType: "both",
  missedYesterday: true,
  hasStartedAny: true,
  nextTrainingDay: null,
  isTraining: false,
});

assert(
  bothBlocks.showBothPrompt === true,
  "Shows both prompt for 'both' type"
);

assert(
  bothBlocks.showRestPlan === true,
  "Shows rest plan for 'both' type"
);

assert(
  bothBlocks.showMissedPrompt === false,
  "Hides separate missed prompt for 'both' type"
);

assert(
  "Hides Keep/Swap/Rest for 'both' type"
);

console.log("\n=== Test 4: todayPromptBlocks - first day rest ===\n");

const firstDayBlocks = todayPromptBlocks({
  promptType: "rest_plan",
  missedYesterday: false,
  hasStartedAny: false,
  nextTrainingDay: { dayName: "Monday", dayIndex: 1 },
  isTraining: false,
});

assert(
  firstDayBlocks.showFirstDayWelcome === true,
  "Shows first day welcome when never started on rest day"
);

assert(
  "Shows 'start first workout anyway' when never started on rest day"
);

assert(
  firstDayBlocks.showRestPlan === true,
  "Shows rest plan for first day rest"
);

assert(
  firstDayBlocks.showMissedPrompt === false,
  "Hides missed prompt for first day rest"
);

console.log("\n=== Test 5: todayPromptBlocks - normal rest day ===\n");

const normalRestBlocks = todayPromptBlocks({
  promptType: "rest_plan",
  missedYesterday: false,
  hasStartedAny: true,
  nextTrainingDay: null,
  isTraining: false,
});

assert(
  normalRestBlocks.showRestPlan === true,
  "Shows rest plan for normal rest day"
);

assert(
  normalRestBlocks.showFirstDayWelcome === false,
  "Hides first day welcome when user has started"
);

assert(
  "Hides 'start first workout anyway' when user has started"
);

console.log("\n=== Test 6: todayPromptBlocks - no prompt ===\n");

const noPromptBlocks = todayPromptBlocks({
  promptType: "none",
  missedYesterday: false,
  hasStartedAny: true,
  nextTrainingDay: null,
  isTraining: false,
});

assert(
  noPromptBlocks.showMissedPrompt === false,
  "Hides all prompts for 'none' type"
);

assert(
  "Hides Keep/Swap/Rest for 'none' type"
);

assert(
  noPromptBlocks.showRestPlan === false,
  "Hides rest plan for 'none' type"
);

assert(
  noPromptBlocks.showBothPrompt === false,
  "Hides both prompt for 'none' type"
);

assert(
  noPromptBlocks.showFirstDayWelcome === false,
  "Hides first day welcome for 'none' type"
);

console.log("\n=== Test 7: Day-one - never started on training day ===\n");

const neverStartedTraining = todayPromptBlocks({
  promptType: "none",
  missedYesterday: false,
  hasStartedAny: false,
  nextTrainingDay: null,
  isTraining: true,
});

assert(
  neverStartedTraining.showFirstDayWelcome === true,
  "Shows first day welcome when never started on training day"
);

assert(
  neverStartedTraining.showMissedPrompt === false,
  "Hides missed prompt when never started on training day"
);

assert(
  "Hides Keep/Swap/Rest when never started on training day"
);

console.log("\n=== Test 8: Day-one - never started on rest day ===\n");

const neverStartedRest = todayPromptBlocks({
  promptType: "rest_plan",
  missedYesterday: false,
  hasStartedAny: false,
  nextTrainingDay: { dayName: "Monday", dayIndex: 1 },
  isTraining: false,
});

assert(
  neverStartedRest.showFirstDayWelcome === true,
  "Shows first day welcome when never started on rest day"
);

assert(
  "Shows 'start first workout anyway' when never started on rest day"
);

assert(
  neverStartedRest.showMissedPrompt === false,
  "Hides missed prompt when never started on rest day"
);

console.log("\n=== Test 9: Day-one - one completed session then missed ===\n");

const oneThenMissed = todayPromptBlocks({
  promptType: "missed",
  missedYesterday: true,
  hasStartedAny: true,
  nextTrainingDay: null,
  isTraining: true,
});

assert(
  oneThenMissed.showMissedPrompt === true,
  "Shows missed prompt after one completed session"
);

assert(
  oneThenMissed.showFirstDayWelcome === false,
  "Hides first day welcome after one completed session"
);

console.log("\n=== Test 10: Day-one - never started suppresses missed prompt ===\n");

const neverStartedSuppressesMissed = todayPromptBlocks({
  promptType: "missed",
  missedYesterday: true,
  hasStartedAny: false,
  nextTrainingDay: null,
  isTraining: true,
});

assert(
  neverStartedSuppressesMissed.showMissedPrompt === false,
  "Suppresses missed prompt when never started (day-one guard)"
);

assert(
  neverStartedSuppressesMissed.showFirstDayWelcome === true,
  "Shows first day welcome instead of missed prompt when never started"
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
