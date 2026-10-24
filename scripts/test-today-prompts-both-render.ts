#!/usr/bin/env tsx
/**
 * Real render test: TodayPrompts 'both' state
 * 
 * Tests that when showBothPrompt=true, the component renders:
 * - "Rest is part of the training" exactly once
 * - The missed heading exactly once
 * - No duplication of content
 * 
 * Uses renderToStaticMarkup to test the real component markup.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TodayPromptsBothUI } from "../src/components/today/today-prompts-ui";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`✓ ${message}`);
  }
}

console.log("\n=== Test: TodayPrompts 'both' state render ===\n");

// Test the 'both' state: rest today + missed yesterday
const bothState = renderToStaticMarkup(
  createElement(TodayPromptsBothUI, {
    promptBlocks: {
      showMissedPrompt: true,
      showRestPlan: true,
      showBothPrompt: true,
      showFirstDayWelcome: false,
      showFirstSessionOffer: false,
    },
    yesterdayDay: {
      day_type: "weights",
      label: "Pull",
    },
  })
);

// Count occurrences of key text
const restTrainingText = "Rest is part of the training";
const restMatches = (bothState.match(new RegExp(restTrainingText, "g")) || []).length;

assert(
  restMatches === 1,
  `"${restTrainingText}" appears exactly once, got ${restMatches}`
);

// Count "You missed yesterday" heading
const missedHeading = "You missed yesterday";
const missedMatches = (bothState.match(new RegExp(missedHeading, "g")) || []).length;

assert(
  missedMatches === 1,
  `"${missedHeading}" appears exactly once, got ${missedMatches}`
);

// Verify key content is present
assert(
  bothState.includes("Active recovery"),
  "Contains 'Active recovery' section"
);

assert(
  bothState.includes("Yoga"),
  "Contains 'Yoga' link"
);

assert(
  bothState.includes("Breathe"),
  "Contains 'Breathe' link"
);

assert(
  bothState.includes("Pull did not happen"),
  "Contains missed day label (Pull)"
);

console.log("\n=== Test: TodayPrompts showBothPrompt=false ===\n");

// Test when showBothPrompt is false - should render nothing
const notBothState = renderToStaticMarkup(
  createElement(TodayPromptsBothUI, {
    promptBlocks: {
      showMissedPrompt: false,
      showRestPlan: true,
      showBothPrompt: false,
      showFirstDayWelcome: false,
      showFirstSessionOffer: false,
    },
    yesterdayDay: null,
  })
);

assert(
  notBothState === "",
  "Renders nothing when showBothPrompt=false"
);

console.log("\n✅ All TodayPrompts 'both' state render tests passed!\n");
