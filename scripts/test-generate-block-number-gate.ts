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

console.log("\n✓ Mutant (a) would fail: removing blockNumber gate would anchor block 2\n");
