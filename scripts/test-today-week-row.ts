#!/usr/bin/env tsx
/**
 * Behavior tests: verify production code behavior that would break if changed.
 * These tests target specific behaviors that could regress without explicit coverage.
 */

import { labelForDayType } from "../src/lib/program/day-plan";
import { getWeekRowLabel } from "../src/lib/today/week-display";
import { WarmupSection } from "../src/components/today/warmup-section";
import { todayPromptBlocks } from "../src/lib/today/prompt-blocks";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`✓ ${message}`);
  }
}

console.log("=== Test 1: Label must use actual label, not hardcoded ===\n");

const pushLabel = labelForDayType("weights", "Push");
const pullLabel = labelForDayType("weights", "Pull");
const legsLabel = labelForDayType("weights", "Legs");

assert(pushLabel === "Push", "Push label must be 'Push', not hardcoded");
assert(pullLabel === "Pull", "Pull label must be 'Pull', not hardcoded");
assert(legsLabel === "Legs", "Legs label must be 'Legs', not hardcoded");
assert(pushLabel !== pullLabel, "Different labels must not be equal");
assert(pushLabel !== "Hardcoded", "Label must not be hardcoded string");

console.log("\n=== Test 2: WarmupSection must render exercises, not null ===\n");

const exercises = [
  {
    key: "ex1",
    name: "Bench Press",
    cue: "Touch chest",
    metric: null,
    sets: 4,
    repsMin: 8,
    repsMax: 12,
    restSeconds: 120,
    skipped: false,
    swappedIn: false,
  },
];

const warmupResult = WarmupSection({
  todayExercises: exercises,
  actual: null,
  strengthDone: false,
});

assert(warmupResult !== null, "WarmupSection must return JSX, not null");
assert(
  typeof warmupResult === "object" && warmupResult !== null && "type" in warmupResult && warmupResult.type === "section",
  "WarmupSection must return a section element"
);

console.log("\n=== Test 3: Week row label must reflect actual day type, not always Rest ===\n");

const pushRow = getWeekRowLabel(
  { day_index: 1, day_type: "weights", label: "Push" },
  new Map()
);
const restRow = getWeekRowLabel(
  { day_index: 2, day_type: "rest", label: null },
  new Map()
);

assert(pushRow.label === "Push", "Training day must show actual label (Push)");
assert(restRow.label === "Rest", "Rest day must show Rest");
assert(pushRow.label !== restRow.label, "Different day types must have different labels");
assert(pushRow.label !== "Rest", "Training day must not show Rest");

console.log("\n=== Test 4: Week row with choice must use actual choice label ===\n");

const choiceMap = new Map([[3, "Swap to Pull"]]);
const choiceRow = getWeekRowLabel(
  { day_index: 3, day_type: "weights", label: "Push" },
  choiceMap
);

assert(
  choiceRow.label === "Swap to Pull",
  "Chosen day must show choice label, not template label or Rest"
);
assert(choiceRow.isChoice === true, "Chosen day must be marked as choice");
assert(choiceRow.label !== "Rest", "Chosen training day must not show Rest");
assert(choiceRow.label !== "Push", "Chosen day must show choice, not template");

console.log("\n=== Test 5: Rest day with missed yesterday must not duplicate prompt ===\n");

const bothPromptBlocks = todayPromptBlocks({
  promptType: "both",
  missedYesterday: true,
  hasStartedAny: true,
  nextTrainingDay: null,
  isTraining: false,
});

const normalRestBlocks = todayPromptBlocks({
  promptType: "rest_plan",
  missedYesterday: false,
  hasStartedAny: true,
  nextTrainingDay: null,
  isTraining: false,
});

// The "both" state must show the unified prompt (showBothPrompt=true, showMissedPrompt=false)
// to avoid duplicating the missed-yesterday message
assert(
  bothPromptBlocks.showBothPrompt === true,
  "'both' state must show unified both prompt"
);
assert(
  bothPromptBlocks.showMissedPrompt === false,
  "'both' state must not show separate missed prompt (avoid duplication)"
);
assert(
  bothPromptBlocks.showRestPlan === true,
  "'both' state must show rest plan content"
);

// Normal rest day must not show both prompt
assert(
  normalRestBlocks.showRestPlan === true,
  "Normal rest day must show rest plan"
);
assert(
  normalRestBlocks.showBothPrompt === false,
  "Normal rest day must not show both prompt"
);
assert(
  normalRestBlocks.showMissedPrompt === false,
  "Normal rest day must not show missed prompt"
);

console.log("\n✅ All week-row behavior tests passed\n");
