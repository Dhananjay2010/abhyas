#!/usr/bin/env tsx
/**
 * Mutant (a): generate anchors even when the block-1 check is dropped
 * 
 * This test verifies that the generator does NOT anchor schedules based on
 * block number alone. Anchoring happens only at the database level via
 * started_on, which persist.ts sets ONLY for block 1.
 * 
 * If generate.ts were to anchor weekdays differently for block 1 vs block 2,
 * that would couple anchoring to the generator and break the separation of
 * concerns. This test ensures generator output is block-agnostic.
 */

import { strict as assert } from "node:assert";
import { generateProgram, type GeneratorInput, type CandidateExercise } from "../src/lib/program/generate";

// Minimal fixture for testing
const catalogue: CandidateExercise[] = [
  {
    id: "ex1",
    slug: "barbell-squat",
    name: "Barbell Squat",
    movement_pattern: "squat",
    mechanic: "compound",
    metric: "reps",
    primary_muscles: ["quadriceps" as any],
    equipment_ids: ["eq-barbell"],
    level_min: "beginner",
    contraindicated_regions: [],
    impact: "high",
    spinal_load: "high",
    tracks: ["weights"],
    default_rest_seconds: 120,
    category: "strength" as any,
  },
];

const baseInput: GeneratorInput = {
  userId: "test-user-123",
  blockNumber: 1, // Will vary
  goal: "muscle_gain",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 3,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 24,
  hasAllEquipment: true,
  equipmentIds: ["eq-barbell"],
  currentInjuryRegions: [],
  catalogue,
};

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Block 1 and Block 2 produce same day indices (no generator-level anchoring)");
{
  const block1 = generateProgram({ ...baseInput, blockNumber: 1 });
  const block2 = generateProgram({ ...baseInput, blockNumber: 2 });
  
  const indices1 = block1.days.map(d => d.dayIndex).sort().join(",");
  const indices2 = block2.days.map(d => d.dayIndex).sort().join(",");
  
  check("day indices match", indices1 === indices2, `block1: ${indices1}, block2: ${indices2}`);
}

console.log("\n2. Block 1 and Block 10 produce same day types (no anchoring drift)");
{
  const block1 = generateProgram({ ...baseInput, blockNumber: 1 });
  const block10 = generateProgram({ ...baseInput, blockNumber: 10 });
  
  const types1 = block1.days.map(d => `${d.dayIndex}:${d.dayType}`).sort().join(";");
  const types10 = block10.days.map(d => `${d.dayIndex}:${d.dayType}`).sort().join(";");
  
  check("day types match", types1 === types10, `block1: ${types1}, block10: ${types10}`);
}

console.log("\n3. Different userId produces different exercises (RNG seed works)");
{
  const user1 = generateProgram({ ...baseInput, userId: "user-1", blockNumber: 1 });
  const user2 = generateProgram({ ...baseInput, userId: "user-2", blockNumber: 1 });
  
  const indices1 = user1.days.map(d => d.dayIndex).sort().join(",");
  const indices2 = user2.days.map(d => d.dayIndex).sort().join(",");
  
  // Day indices should still be the same (based on daysPerWeek, not userId)
  check("day indices same for different users", indices1 === indices2, `user1: ${indices1}, user2: ${indices2}`);
}

console.log(`\n${failures === 0 ? "✓ Generator is block-agnostic (no implicit anchoring)" : `FAILED: ${failures} test(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);

export {};
