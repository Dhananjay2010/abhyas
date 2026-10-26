/**
 * Test: Existing programs keep same schedule as main
 * 
 * Verifies:
 * (c) Existing programs (block 1 already has startedOn) give the same 28-day schedule 
 *     as main's logic, compared against explicit expected values.
 * 
 * Run: npx tsx scripts/test-existing-plan-schedule-unchanged.ts
 */

import { strict as assert } from "node:assert";
import { generateProgram, type GeneratorInput, type CandidateExercise } from "../src/lib/program/generate";

console.log("Test: Existing plans preserve main's schedule\n");

// Minimal valid catalogue
const CATALOGUE: CandidateExercise[] = [
  { id: "1", slug: "squat", name: "Squat", movement_pattern: "squat", mechanic: "compound", metric: "reps", primary_muscles: ["quads"], equipment_ids: [], level_min: "beginner", contraindicated_regions: [], impact: "low", spinal_load: "low", tracks: ["weights"], default_rest_seconds: 90, category: "strength" },
  { id: "2", slug: "bench", name: "Bench Press", movement_pattern: "horizontal_press", mechanic: "compound", metric: "reps", primary_muscles: ["chest"], equipment_ids: [], level_min: "beginner", contraindicated_regions: [], impact: "low", spinal_load: "low", tracks: ["weights"], default_rest_seconds: 90, category: "strength" },
  { id: "3", slug: "row", name: "Row", movement_pattern: "horizontal_pull", mechanic: "compound", metric: "reps", primary_muscles: ["upper_back"], equipment_ids: [], level_min: "beginner", contraindicated_regions: [], impact: "low", spinal_load: "low", tracks: ["weights"], default_rest_seconds: 75, category: "strength" },
  { id: "4", slug: "deadlift", name: "Deadlift", movement_pattern: "hinge", mechanic: "compound", metric: "reps", primary_muscles: ["hamstrings", "glutes"], equipment_ids: [], level_min: "beginner", contraindicated_regions: [], impact: "low", spinal_load: "high", tracks: ["weights"], default_rest_seconds: 180, category: "strength" },
  { id: "5", slug: "press", name: "Press", movement_pattern: "vertical_press", mechanic: "compound", metric: "reps", primary_muscles: ["front_delts"], equipment_ids: [], level_min: "beginner", contraindicated_regions: [], impact: "low", spinal_load: "low", tracks: ["weights"], default_rest_seconds: 90, category: "strength" },
  { id: "6", slug: "pulldown", name: "Pulldown", movement_pattern: "vertical_pull", mechanic: "compound", metric: "reps", primary_muscles: ["lats"], equipment_ids: [], level_min: "beginner", contraindicated_regions: [], impact: "low", spinal_load: "none", tracks: ["weights"], default_rest_seconds: 75, category: "strength" },
  { id: "7", slug: "plank", name: "Plank", movement_pattern: "core", mechanic: "isolation", metric: "seconds", primary_muscles: ["abs"], equipment_ids: [], level_min: "beginner", contraindicated_regions: [], impact: "low", spinal_load: "none", tracks: ["weights", "bodyweight"], default_rest_seconds: 60, category: "strength" },
];

console.log("1. Block 2+ uses original [1,3,5] weekday mapping for 3-day plans");
{
  const input: GeneratorInput = {
    userId: "test",
    blockNumber: 2, // Existing plan
    goal: "general_fitness",
    level: "beginner",
    primaryTrack: "weights",
    daysPerWeek: 3,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 24,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: [],
    preferredSessionMinutes: 60,
    catalogue: CATALOGUE,
    // NO startedOn - should use original mapping
  };

  const plan = generateProgram(input);
  const trainingDays = plan.days
    .filter(d => d.dayType === "weights" || d.dayType === "bodyweight")
    .map(d => d.dayIndex)
    .sort((a, b) => a - b);

  assert.deepEqual(trainingDays, [1, 3, 5], "Block 2+: uses original [1,3,5] mapping");
  console.log("  ✓ 3-day plan: [1,3,5] (Monday, Wednesday, Friday)");
}

console.log("\n2. Block 2+ uses original [1,2,4,5] for 4-day plans");
{
  const input: GeneratorInput = {
    userId: "test",
    blockNumber: 2,
    goal: "general_fitness",
    level: "beginner",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 24,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: [],
    preferredSessionMinutes: 60,
    catalogue: CATALOGUE,
  };

  const plan = generateProgram(input);
  const trainingDays = plan.days
    .filter(d => d.dayType === "weights" || d.dayType === "bodyweight")
    .map(d => d.dayIndex)
    .sort((a, b) => a - b);

  assert.deepEqual(trainingDays, [1, 2, 4, 5], "Block 2+: uses original [1,2,4,5] mapping");
  console.log("  ✓ 4-day plan: [1,2,4,5] (Mon, Tue, Thu, Fri)");
}

console.log("\n3. Block 2+ uses original [1,2,3,5,6] for 5-day plans");
{
  const input: GeneratorInput = {
    userId: "test",
    blockNumber: 2,
    goal: "general_fitness",
    level: "beginner",
    primaryTrack: "weights",
    daysPerWeek: 5,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 24,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: [],
    preferredSessionMinutes: 60,
    catalogue: CATALOGUE,
  };

  const plan = generateProgram(input);
  const trainingDays = plan.days
    .filter(d => d.dayType === "weights" || d.dayType === "bodyweight")
    .map(d => d.dayIndex)
    .sort((a, b) => a - b);

  assert.deepEqual(trainingDays, [1, 2, 3, 5, 6], "Block 2+: uses original [1,2,3,5,6] mapping");
  console.log("  ✓ 5-day plan: [1,2,3,5,6] (Mon, Tue, Wed, Fri, Sat)");
}

console.log("\n4. 28-day cycle: block 2+ preserves deload week");
{
  const input: GeneratorInput = {
    userId: "test",
    blockNumber: 2,
    goal: "general_fitness",
    level: "beginner",
    primaryTrack: "weights",
    daysPerWeek: 3,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 24,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: [],
    preferredSessionMinutes: 60,
    catalogue: CATALOGUE,
  };

  const plan = generateProgram(input);
  
  // Deload week should still be week 4
  assert.ok(plan.deloadWeek === 4, "Deload week is 4");
  console.log("  ✓ 28-day structure with deload in week 4 preserved");
}

console.log("\n5. Training day labels match main's split patterns");
{
  const input3day: GeneratorInput = {
    userId: "test",
    blockNumber: 2,
    goal: "general_fitness",
    level: "beginner",
    primaryTrack: "weights",
    daysPerWeek: 3,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 24,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: [],
    preferredSessionMinutes: 60,
    catalogue: CATALOGUE,
  };

  const plan3 = generateProgram(input3day);
  const labels3 = plan3.days
    .filter(d => d.dayType === "weights" || d.dayType === "bodyweight")
    .map(d => d.label);

  assert.ok(labels3.includes("Full Body A"), "3-day has Full Body A");
  assert.ok(labels3.includes("Full Body B"), "3-day has Full Body B");
  assert.ok(labels3.includes("Full Body C"), "3-day has Full Body C");
  console.log("  ✓ 3-day labels: Full Body A, B, C");

  const input4day: GeneratorInput = {
    ...input3day,
    daysPerWeek: 4,
  };

  const plan4 = generateProgram(input4day);
  const labels4 = plan4.days
    .filter(d => d.dayType === "weights" || d.dayType === "bodyweight")
    .map(d => d.label);

  assert.ok(labels4.includes("Upper"), "4-day has Upper");
  assert.ok(labels4.includes("Lower"), "4-day has Lower");
  console.log("  ✓ 4-day labels: Upper, Lower");

  const input5day: GeneratorInput = {
    ...input3day,
    daysPerWeek: 5,
  };

  const plan5 = generateProgram(input5day);
  const labels5 = plan5.days
    .filter(d => d.dayType === "weights" || d.dayType === "bodyweight")
    .map(d => d.label);

  assert.ok(labels5.includes("Push"), "5-day has Push");
  assert.ok(labels5.includes("Pull"), "5-day has Pull");
  assert.ok(labels5.includes("Legs"), "5-day has Legs");
  console.log("  ✓ 5-day labels: Push, Pull, Legs");
}

console.log("\n✅ All existing plan schedule tests passed");
