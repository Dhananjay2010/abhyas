#!/usr/bin/env tsx
/**
 * Test: TodayPrompts renders correctly for rest day after missed day (g2)
 * 
 * Tests that when showBothPrompt=true (rest + missed), each text appears exactly once:
 * - "Rest is part of the training" ×1
 * - "Active recovery" ×1
 * - "You missed yesterday" ×1
 * 
 * The guard `&& !promptBlocks.showBothPrompt` at today-prompts.tsx
 * prevents rendering the standalone rest block when the combined 'both' block
 * is already shown, which would cause duplicates.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TodayPrompts } from "../src/components/today/today-prompts";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`✓ ${message}`);
  }
}

console.log("\n=== Test: TodayPrompts rest day after missed day (showBothPrompt) ===\n");

// Mock router context
const mockRouter = {
  push: () => Promise.resolve(true),
  replace: () => Promise.resolve(true),
  refresh: () => {},
  prefetch: () => Promise.resolve(),
  back: () => {},
  forward: () => {},
  bfcacheId: "test",
} as any;

// Scenario: rest day after missed yesterday (showBothPrompt = true)
const promptBlocks = {
  showMissedPrompt: false,     // Not shown separately
  showRestPlan: true,          // Would show if not for g2 guard
  showBothPrompt: true,        // Combined prompt active
  showFirstDayWelcome: false,
  showFirstSessionOffer: false,
};

const yesterdayDay = {
  day_type: "weights" as const,
  label: "Pull",
};

const plannable = [
  { programDayId: "d1", dayType: "weights" as const, label: "Push" },
  { programDayId: "d2", dayType: "rest" as const, label: "Rest" },
];

const todayPrompts = createElement(
  AppRouterContext.Provider,
  { value: mockRouter },
  createElement(TodayPrompts, {
    promptBlocks,
    localToday: "2024-01-15",
    dayLabel: "Rest",
    plannable,
    trainAnywayDays: plannable,
    yesterdayDay,
    nextTraining: null,
    isTraining: false,
    firstTrainingDay: null,
  })
);

const rendered = renderToStaticMarkup(todayPrompts);

// Check each text appears exactly once
const restText = "Rest is part of the training";
const restCount = (rendered.match(new RegExp(restText, "g")) || []).length;

assert(
  restCount === 1,
  `"${restText}" appears exactly once, got ${restCount}`
);

const activeRecoveryText = "Active recovery";
const activeRecoveryCount = (rendered.match(new RegExp(activeRecoveryText, "g")) || []).length;

assert(
  activeRecoveryCount === 1,
  `"${activeRecoveryText}" appears exactly once, got ${activeRecoveryCount}`
);

const missedText = "You missed yesterday";
const missedCount = (rendered.match(new RegExp(missedText, "g")) || []).length;

assert(
  missedCount === 1,
  `"${missedText}" appears exactly once, got ${missedCount}`
);

console.log("\n=== Test: TodayPrompts single-prompt cases ===\n");

// Test case 1: Only missed prompt (training day, missed yesterday)
const missedOnlyBlocks = {
  showMissedPrompt: true,
  showRestPlan: false,
  showBothPrompt: false,
  showFirstDayWelcome: false,
  showFirstSessionOffer: false,
};

const missedOnlyRender = renderToStaticMarkup(
  createElement(
    AppRouterContext.Provider,
    { value: mockRouter },
    createElement(TodayPrompts, {
      promptBlocks: missedOnlyBlocks,
      localToday: "2024-01-16",
      dayLabel: "Push",
      plannable,
      trainAnywayDays: plannable,
      yesterdayDay,
      nextTraining: null,
      isTraining: true,
      firstTrainingDay: null,
    })
  )
);

const missedOnlyCount = (missedOnlyRender.match(new RegExp(missedText, "g")) || []).length;

assert(
  missedOnlyCount === 1,
  `Missed-only: "${missedText}" appears exactly once, got ${missedOnlyCount}`
);

// Test case 2: Only rest prompt (rest day, no missed yesterday)
const restOnlyBlocks = {
  showMissedPrompt: false,
  showRestPlan: true,
  showBothPrompt: false,
  showFirstDayWelcome: false,
  showFirstSessionOffer: false,
};

const restOnlyRender = renderToStaticMarkup(
  createElement(
    AppRouterContext.Provider,
    { value: mockRouter },
    createElement(TodayPrompts, {
      promptBlocks: restOnlyBlocks,
      localToday: "2024-01-17",
      dayLabel: "Rest",
      plannable,
      trainAnywayDays: plannable,
      yesterdayDay: null,
      nextTraining: { dayName: "Tuesday", dayIndex: 2 },
      isTraining: false,
      firstTrainingDay: null,
    })
  )
);

const restOnlyCount = (restOnlyRender.match(new RegExp(restText, "g")) || []).length;

assert(
  restOnlyCount === 1,
  `Rest-only: "${restText}" appears exactly once, got ${restOnlyCount}`
);

const restOnlyActiveRecoveryCount = (restOnlyRender.match(new RegExp(activeRecoveryText, "g")) || []).length;

assert(
  restOnlyActiveRecoveryCount === 1,
  `Rest-only: "${activeRecoveryText}" appears exactly once, got ${restOnlyActiveRecoveryCount}`
);

console.log("\n✅ All TodayPrompts render tests passed!\n");
console.log("Summary: The guard `&& !promptBlocks.showBothPrompt` prevents duplication");
console.log("by ensuring only ONE rest content block renders when showBothPrompt=true.");
