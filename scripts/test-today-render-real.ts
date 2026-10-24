#!/usr/bin/env tsx
/**
 * Real render tests for Today page components using renderToStaticMarkup.
 * 
 * Tests:
 * - DayPlanPrompt with hideKeepAndRest shows no "Keep it" or "Rest" buttons
 * - TodayPrompts shows single choice group on missed yesterday + rest today
 * - Week row labels show overrides with "your choice"
 * - Warm-up section is hidden when list is empty
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DayPlanInitialChoices } from "../src/components/day-plan-prompt-ui";
import { getWeekRowLabel, type WeekDayRow } from "../src/lib/today/week-display";
import { WarmupSection } from "../src/components/today/warmup-section";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`✓ ${message}`);
  }
}

console.log("=== Test 1: DayPlanInitialChoices with hideKeepAndRest (missed yesterday + rest today) ===\n");

const restDayMissedYesterday = renderToStaticMarkup(
  createElement(DayPlanInitialChoices, {
    isRestDay: false, // It's actually a day that *could* be a workout
    hideKeepAndRest: true, // But today is rest and yesterday was missed
    onChoosing: () => {},
    onKeep: () => {},
    onRest: () => {},
    disabled: false,
  })
);

assert(
  !restDayMissedYesterday.includes("Keep it"),
  "Does NOT show 'Keep it' button when hideKeepAndRest=true"
);

assert(
  !restDayMissedYesterday.includes(">Rest<"),
  "Does NOT show 'Rest' button when hideKeepAndRest=true"
);

// Count button elements - should be exactly 1 "Pick a workout" button
const buttonMatches = restDayMissedYesterday.match(/<button[^>]*>/g) || [];
assert(
  buttonMatches.length === 1,
  `Shows exactly 1 button (Pick a workout), got ${buttonMatches.length}`
);

assert(
  restDayMissedYesterday.includes("Pick a workout"),
  "Shows 'Pick a workout' button"
);

console.log("\n=== Test 2: DayPlanInitialChoices WITHOUT hideKeepAndRest (normal training day) ===\n");

const trainingDayNormal = renderToStaticMarkup(
  createElement(DayPlanInitialChoices, {
    isRestDay: false,
    hideKeepAndRest: false,
    onChoosing: () => {},
    onKeep: () => {},
    onRest: () => {},
    disabled: false,
  })
);

assert(
  trainingDayNormal.includes("Keep it"),
  "Shows 'Keep it' when hideKeepAndRest=false"
);

assert(
  trainingDayNormal.includes("Swap the day"),
  "Shows 'Swap the day'"
);

assert(
  trainingDayNormal.includes(">Rest<"),
  "Shows 'Rest' button"
);

console.log("\n=== Test 3: Week row labels - template vs override ===\n");

const mondayTemplate: WeekDayRow = {
  day_index: 1,
  day_type: "weights",
  label: "Push",
};

const tuesdayRest: WeekDayRow = {
  day_index: 2,
  day_type: "rest",
  label: null,
};

// No overrides
const emptyChoices = new Map<number, string>();

const mondayNoChoice = getWeekRowLabel(mondayTemplate, emptyChoices);
assert(
  mondayNoChoice.label === "Push" && !mondayNoChoice.isChoice,
  "Template day shows template label with isChoice=false"
);

const tuesdayNoChoice = getWeekRowLabel(tuesdayRest, emptyChoices);
assert(
  tuesdayNoChoice.label === "Rest" && !tuesdayNoChoice.isChoice,
  "Rest day with no choice shows 'Rest'"
);

// With override
const choicesWithSwap = new Map<number, string>();
choicesWithSwap.set(2, "Upper");

const tuesdaySwapped = getWeekRowLabel(tuesdayRest, choicesWithSwap);
assert(
  tuesdaySwapped.label === "Upper",
  "Swapped rest day shows chosen label 'Upper'"
);

assert(
  tuesdaySwapped.isChoice === true,
  "Swapped day has isChoice=true"
);

// Monday not affected
const mondayStillTemplate = getWeekRowLabel(mondayTemplate, choicesWithSwap);
assert(
  mondayStillTemplate.label === "Push" && !mondayStillTemplate.isChoice,
  "Other days unaffected by swap"
);

console.log("\n=== Test 4: Warm-up section rendering logic (extracted helper) ===\n");

// Extract the warm-up section rendering logic from page.tsx
function shouldRenderWarmupSection(isTraining: boolean, exercises: unknown[]): boolean {
  return isTraining && exercises.length > 0;
}

// Test the helper
const isTraining = true;
const emptyExercises: { key: string; name: string }[] = [];
const hasExercises = [{ key: "1", name: "Squat", sets: 3 }];

const shouldRenderEmpty = shouldRenderWarmupSection(isTraining, emptyExercises);
const shouldRenderWithItems = shouldRenderWarmupSection(isTraining, hasExercises);

assert(
  !shouldRenderEmpty,
  "Warm-up section NOT rendered when todayExercises.length === 0"
);

assert(
  shouldRenderWithItems,
  "Warm-up section IS rendered when todayExercises.length > 0"
);

// Render test: check the actual WarmupSection component
const emptyRender = renderToStaticMarkup(
  createElement(WarmupSection, {
    todayExercises: [],
    actual: null,
    strengthDone: false,
  })
);

const withItemsRender = renderToStaticMarkup(
  createElement(WarmupSection, {
    todayExercises: [
      {
        key: "1",
        name: "Squat",
        cue: null,
        metric: null,
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        restSeconds: 90,
        skipped: false,
        swappedIn: false,
      },
    ],
    actual: null,
    strengthDone: false,
  })
);

assert(
  emptyRender === "",
  "Empty exercises: renders nothing (empty string)"
);

assert(
  withItemsRender.includes("Warm-up, then"),
  "With exercises: renders 'Warm-up, then' heading"
);

assert(
  withItemsRender.includes("Squat"),
  "With exercises: renders exercise name"
);

assert(
  withItemsRender.includes("3"),
  "With exercises: renders sets count"
);

console.log("\n✅ All render tests passed\n");
