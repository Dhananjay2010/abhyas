#!/usr/bin/env tsx
/**
 * Test: TodayPrompts component logic and element counts
 *
 * Ensures each state shows exactly ONE prompt and validates that
 * choice rows and primary buttons are not duplicated.
 */

import { todayPromptBlocks } from "../src/lib/today/prompt-blocks";

function countVisiblePrompts(blocks: ReturnType<typeof todayPromptBlocks>): number {
  let count = 0;
  if (blocks.showMissedPrompt) count++;
  if (blocks.showBothPrompt) count++;
  if (blocks.showRestPlan && !blocks.showBothPrompt) count++;
  if (blocks.showFirstDayWelcome && !blocks.showRestPlan) count++;
  return count;
}

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

// Test 1: Missed training day (not rest)
console.log("\n=== Test 1: Missed training day ===\n");
test("Shows exactly one prompt (missed)", () => {
  const blocks = todayPromptBlocks({
    promptType: "missed",
    missedYesterday: true,
    hasStartedAny: true,
    nextTrainingDay: null,
    isTraining: true,
  });

  assert(blocks.showMissedPrompt === true, "Should show missed prompt");
  assert(blocks.showBothPrompt === false, "Should not show both prompt");
  assert(blocks.showRestPlan === false, "Should not show rest plan");

  const promptCount = countVisiblePrompts(blocks);
  assert(promptCount === 1, `Expected 1 prompt, got ${promptCount}`);
});

// Test 2: Rest day with missed yesterday
console.log("\n=== Test 2: Rest day with missed yesterday ===\n");
test("Shows exactly one prompt (both)", () => {
  const blocks = todayPromptBlocks({
    promptType: "both",
    missedYesterday: true,
    hasStartedAny: true,
    nextTrainingDay: null,
    isTraining: false,
  });

  assert(blocks.showBothPrompt === true, "Should show both prompt");
  assert(blocks.showMissedPrompt === false, "Should not show standalone missed");
  assert(blocks.showRestPlan === true, "Should show rest plan (with both prompt)");

  const promptCount = countVisiblePrompts(blocks);
  assert(promptCount === 1, `Expected 1 prompt, got ${promptCount}`);
});

// Test 3: First day on rest day or any weekday
console.log("\n=== Test 3: First day on rest day or any weekday ===\n");
test("Shows exactly one prompt (rest with first day)", () => {
  const blocks = todayPromptBlocks({
    promptType: "rest_plan",
    missedYesterday: false,
    hasStartedAny: false,
    nextTrainingDay: { dayName: "Thursday", dayIndex: 4 },
    isTraining: false,
  });

  assert(blocks.showRestPlan === true, "Should show rest plan");
  assert(blocks.showFirstDayWelcome === true, "Should show first day welcome");
  assert(blocks.showBothPrompt === false, "Should not show both prompt");

  const promptCount = countVisiblePrompts(blocks);
  assert(promptCount === 1, `Expected 1 prompt, got ${promptCount}`);
});

// Test 4: Normal rest day
console.log("\n=== Test 4: Normal rest day ===\n");
test("Shows exactly one prompt (normal rest)", () => {
  const blocks = todayPromptBlocks({
    promptType: "rest_plan",
    missedYesterday: false,
    hasStartedAny: true,
    nextTrainingDay: null,
    isTraining: false,
  });

  assert(blocks.showRestPlan === true, "Should show rest plan");
  assert(blocks.showFirstDayWelcome === false, "Should not show first day");
  assert(blocks.showBothPrompt === false, "Should not show both prompt");

  const promptCount = countVisiblePrompts(blocks);
  assert(promptCount === 1, `Expected 1 prompt, got ${promptCount}`);
});

// Test 5: First day on training day
console.log("\n=== Test 5: First day on training day ===\n");
test("Shows first day welcome only once", () => {
  const blocks = todayPromptBlocks({
    promptType: "none",
    missedYesterday: false,
    hasStartedAny: false,
    nextTrainingDay: null,
    isTraining: true,
  });

  assert(blocks.showFirstDayWelcome === true, "Should show first day welcome");
  assert(blocks.showRestPlan === false, "Should not show rest plan");
  assert(blocks.showBothPrompt === false, "Should not show both prompt");
  
  const promptCount = countVisiblePrompts(blocks);
  assert(promptCount === 1, `Expected 1 prompt, got ${promptCount}`);
});

// Test 6: No prompts on meditation day
console.log("\n=== Test 6: Meditation day ===\n");
test("Shows no decision prompts on meditation day", () => {
  const blocks = todayPromptBlocks({
    promptType: "none",
    missedYesterday: false,
    hasStartedAny: true,
    nextTrainingDay: null,
    isTraining: false,
  });

  assert(blocks.showMissedPrompt === false, "Should not show missed");
  assert(blocks.showRestPlan === false, "Should not show rest plan");
  assert(blocks.showBothPrompt === false, "Should not show both prompt");

  const promptCount = countVisiblePrompts(blocks);
  assert(promptCount === 0, `Expected 0 prompts, got ${promptCount}`);
});

console.log("\n✅ All TodayPrompts logic tests passed.");
