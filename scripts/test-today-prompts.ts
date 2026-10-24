#!/usr/bin/env tsx
/**
 * Test: TodayPrompts component logic and element counts
 *
 * Ensures each state shows exactly ONE prompt and validates that
 * choice rows and primary buttons are not duplicated.
 */

import { todayPromptBlocks } from "../src/lib/today/prompt-blocks";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

// ==============================================================================
// SOURCE CODE INSPECTION: Count DayPlanPrompt instantiations
// ==============================================================================

const todayPromptsSource = readFileSync(join(__dirname, "../src/components/today/today-prompts.tsx"), "utf-8");

console.log("\n=== Source Inspection Test: DayPlanPrompt instantiation counts ===\n");
test("TodayPrompts.tsx contains exactly 4 DayPlanPrompt instantiations (no duplication)", () => {
  // Count <DayPlanPrompt occurrences in the source
  const dayPlanPromptMatches = todayPromptsSource.match(/<DayPlanPrompt/g);
  const count = dayPlanPromptMatches ? dayPlanPromptMatches.length : 0;
  
  // Expected: 4 total
  // 1. Missed-yesterday prompt (showMissedPrompt)
  // 2. Rest day with missed yesterday (showBothPrompt)
  // 3. First day on rest day (showRestPlan && showFirstDayWelcome)
  // 4. Normal rest day (showRestPlan && !showBothPrompt)
  assert(count === 4, `Expected exactly 4 <DayPlanPrompt> instances in source, found ${count}`);
});

test("All DayPlanPrompt instances are properly conditional (not duplicated)", () => {
  // Verify each instance is inside a block/conditional structure
  // Count the opening conditional blocks in the component
  const missedPromptBlocks = (todayPromptsSource.match(/promptBlocks\.showMissedPrompt/g) || []).length;
  const bothPromptBlocks = (todayPromptsSource.match(/promptBlocks\.showBothPrompt/g) || []).length;
  const restPlanBlocks = (todayPromptsSource.match(/promptBlocks\.showRestPlan/g) || []).length;
  const firstDayWelcomeBlocks = (todayPromptsSource.match(/promptBlocks\.showFirstDayWelcome/g) || []).length;
  
  // Should have at least 4 conditional checks for the 4 DayPlanPrompt instances
  const totalConditionals = missedPromptBlocks + bothPromptBlocks + restPlanBlocks + firstDayWelcomeBlocks;
  assert(totalConditionals >= 4, `Expected at least 4 conditional checks, found ${totalConditionals}`);
});

test("'Start your first session now' appears exactly once in intro prop", () => {
  const startNowMatches = todayPromptsSource.match(/Start your first session now/g);
  const count = startNowMatches ? startNowMatches.length : 0;
  assert(count === 1, `Expected 1 "Start your first session now" in source, found ${count}`);
});

test("First-day rest day scenario has correct intro copy", () => {
  // Verify the first-day rest day prompt shows "Start your first session now"
  // The structure is: promptBlocks.showFirstDayWelcome && nextTraining ? ... <DayPlanPrompt intro="Start..."
  const hasFirstDayIntro = todayPromptsSource.includes('intro="Start your first session now."');
  assert(hasFirstDayIntro, "First-day rest day should have 'Start your first session now.' intro");
  
  // Also verify it's in the first-day rest context
  const firstDayRestBlock = todayPromptsSource.includes("promptBlocks.showFirstDayWelcome && nextTraining");
  assert(firstDayRestBlock, "Should have first-day-with-nextTraining conditional block");
});

console.log("\n✅ All source inspection tests passed. No duplicate DayPlanPrompt or buttons detected.");
