#!/usr/bin/env tsx
/**
 * Test: generateProgram respects blockNumber gate for anchoring (mutant a)
 * 
 * Mutant (a): Remove `blockNumber === 1` check in generate.ts
 *   → Block 2 with startedOn would incorrectly anchor
 * 
 * This test verifies:
 * - Block 1 with startedOn='2026-10-29' (Thursday) → [1,4,6] (anchored)
 * - Block 2 with startedOn='2026-10-29' → [1,3,5] (NOT anchored, gate prevents it)
 * - Block 2 with a carried weekdayLayout keeps the previous block's week (QA2 M-1);
 *   block 1 ignores it, and an invalid layout falls back to the default
 */

import { strict as assert } from "node:assert";
import { generateProgram, type CandidateExercise } from "../src/lib/program/generate";

const CATALOGUE: CandidateExercise[] = [
  {
    id: "ex1",
    slug: "barbell-squat",
    name: "Barbell Squat",
    movement_pattern: "squat",
    mechanic: "compound",
    metric: "reps",
    primary_muscles: ["glutes"],
    equipment_ids: ["eq-barbell"],
    level_min: "beginner",
    contraindicated_regions: [],
    impact: "high",
    spinal_load: "high",
    tracks: ["weights"],
    default_rest_seconds: 120,
    category: "strength",
  },
];

const BASE_INPUT = {
  userId: "user-123",
  goal: "muscle_gain" as const,
  level: "intermediate" as const,
  primaryTrack: "weights" as const,
  daysPerWeek: 3,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 23,
  hasAllEquipment: true,
  equipmentIds: ["eq-barbell"],
  hasAnyKnee: false,
  hasActiveLowerBack: false,
  hasActiveShoulderElbow: false,
  hasActiveWrist: false,
  hasAnyLowerBack: false,
  hasAnyShoulderElbow: false,
  hasAnyWrist: false,
  hasAnyHip: false,
  currentInjuryRegions: [],
  preferredSessionMinutes: 45,
  catalogue: CATALOGUE,
};

console.log("Test: generateProgram blockNumber gate for anchoring (mutant a)\n");

console.log("1. Block 1 with startedOn='2026-10-29' (Thursday) → [1,4,6] (anchored)");
{
  const plan = generateProgram({
    ...BASE_INPUT,
    blockNumber: 1,
    startedOn: "2026-10-29",
  });
  
  const trainingDayIndices = plan.days
    .filter((d) => d.dayType === "weights")
    .map((d) => d.dayIndex)
    .sort((a, b) => a - b);
  
  assert.deepStrictEqual(
    trainingDayIndices,
    [1, 4, 6],
    "Block 1 with startedOn must anchor to Thursday weekday pattern [1,4,6]"
  );
  
  console.log(`  ✓ Block 1 anchored: [${trainingDayIndices.join(",")}] = [1,4,6]`);
}

console.log("\n2. Block 2 with startedOn='2026-10-29' → [1,3,5] (NOT anchored, gate prevents it)");
{
  const plan = generateProgram({
    ...BASE_INPUT,
    blockNumber: 2,
    startedOn: "2026-10-29",
  });
  
  const trainingDayIndices = plan.days
    .filter((d) => d.dayType === "weights")
    .map((d) => d.dayIndex)
    .sort((a, b) => a - b);
  
  assert.deepStrictEqual(
    trainingDayIndices,
    [1, 3, 5],
    "Block 2 must NOT anchor even when startedOn is passed (blockNumber gate prevents it)"
  );
  
  console.log(`  ✓ Block 2 not anchored: [${trainingDayIndices.join(",")}] = [1,3,5]`);
}

console.log("\n3. Block 2 with a carried weekdayLayout [4,6,1] (QA2 M-1) → keeps Thu A / Sat B / Mon C");
{
  const plan = generateProgram({
    ...BASE_INPUT,
    blockNumber: 2,
    startedOn: "2026-10-29",
    weekdayLayout: [4, 6, 1],
  });

  const week = plan.days
    .filter((d) => d.dayType === "weights")
    .map((d) => `${d.dayIndex}:${d.label}`);

  assert.deepStrictEqual(
    week,
    ["1:Full Body C", "4:Full Body A", "6:Full Body B"],
    "Block 2 must keep the previous block's weekdays and their sessions when a layout is carried"
  );

  console.log(`  ✓ Block 2 carried: ${week.join(", ")}`);
}

console.log("\n4. Block 1 ignores weekdayLayout (only #165's started_on anchor or the default)");
{
  const plan = generateProgram({
    ...BASE_INPUT,
    blockNumber: 1,
    weekdayLayout: [4, 6, 1],
  });

  const trainingDayIndices = plan.days
    .filter((d) => d.dayType === "weights")
    .map((d) => d.dayIndex)
    .sort((a, b) => a - b);

  assert.deepStrictEqual(
    trainingDayIndices,
    [1, 3, 5],
    "Block 1 without startedOn must stay on the default [1,3,5] even if a layout is passed"
  );

  console.log(`  ✓ Block 1 not carried: [${trainingDayIndices.join(",")}] = [1,3,5]`);
}

console.log("\n5. Block 2 ignores an invalid carried layout (wrong count, duplicate, out of range) → [1,3,5]");
{
  for (const weekdayLayout of [[3, 4, 6, 7], [4, 4, 1], [0, 4, 6], [4, 6, 8]]) {
    const plan = generateProgram({ ...BASE_INPUT, blockNumber: 2, weekdayLayout });
    const trainingDayIndices = plan.days
      .filter((d) => d.dayType === "weights")
      .map((d) => d.dayIndex)
      .sort((a, b) => a - b);
    assert.deepStrictEqual(
      trainingDayIndices,
      [1, 3, 5],
      `Block 2 must fall back to the default for invalid layout ${JSON.stringify(weekdayLayout)}`
    );
  }
  console.log("  ✓ invalid layouts fall back to [1,3,5]");
}

console.log("\n✓ Mutant (a) would fail: removing blockNumber gate would anchor block 2\n");
