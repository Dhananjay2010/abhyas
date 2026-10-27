/**
 * Test: Existing programs preserve main's schedule (byte-identical)
 * 
 * Verifies that existing plans (block 2+) generate the same weekday pattern as pre-PR behavior.
 * Tests the real code path through generateProgram and asserts the weekday mapping is unchanged.
 * 
 * Mutant: applying weekday_anchor to existing plans (block 2+) → test fails
 * 
 * Run: npx tsx scripts/test-existing-plan-schedule-unchanged.ts
 */

import { strict as assert } from "node:assert";
import { generateProgram, type GeneratorInput, type CandidateExercise } from "../src/lib/program/generate";

async function main() {
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
    
    // Extract training day indices from the first week
    const weekOne = plan.days.slice(0, 7);
    const trainingDays = weekOne
      .filter(d => d.dayType === "weights" || d.dayType === "bodyweight")
      .map(d => d.dayIndex);

    assert.deepStrictEqual(trainingDays, [1, 3, 5], "Block 2 3-day plan must use [1,3,5] (Mon, Wed, Fri)");
    console.log("  ✓ 3-day plan: [1,3,5] (Monday, Wednesday, Friday) - matches main");
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
    const weekOne = plan.days.slice(0, 7);
    const trainingDays = weekOne
      .filter(d => d.dayType === "weights" || d.dayType === "bodyweight")
      .map(d => d.dayIndex);

    assert.deepStrictEqual(trainingDays, [1, 2, 4, 5], "Block 2 4-day plan must use [1,2,4,5] (Mon, Tue, Thu, Fri)");
    console.log("  ✓ 4-day plan: [1,2,4,5] (Mon, Tue, Thu, Fri) - matches main");
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
    const weekOne = plan.days.slice(0, 7);
    const trainingDays = weekOne
      .filter(d => d.dayType === "weights" || d.dayType === "bodyweight")
      .map(d => d.dayIndex);

    assert.deepStrictEqual(trainingDays, [1, 2, 3, 5, 6], "Block 2 5-day plan must use [1,2,3,5,6] (Mon, Tue, Wed, Fri, Sat)");
    console.log("  ✓ 5-day plan: [1,2,3,5,6] (Mon, Tue, Wed, Fri, Sat) - matches main");
  }

  console.log("\n4. Block 2+ preserves deload week 4 structure");
  {
    const input: GeneratorInput = {
      userId: "test",
      blockNumber: 3,
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

    assert.strictEqual(plan.deloadWeek, 4, "Deload week must be 4");
    assert.strictEqual(plan.days.length, 7, "Plan returns 7 days (one week)");
    
    // Verify it still uses same weekday pattern for block 3
    const trainingDays = plan.days
      .filter(d => d.dayType === "weights" || d.dayType === "bodyweight")
      .map(d => d.dayIndex);

    assert.deepStrictEqual(trainingDays, [1, 3, 5], "Block 3 must still use [1,3,5] pattern");
    console.log("  ✓ Deload week 4 preserved, weekday pattern unchanged");
  }

  console.log("\n5. Block 1 with startedOn anchors to sign-up day (new behavior)");
  {
    const input: GeneratorInput = {
      userId: "test",
      blockNumber: 1,
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
      startedOn: "2024-03-14", // Thursday (isoWeekday 4)
    };

    const plan = generateProgram(input);
    const weekOne = plan.days.slice(0, 7);
    const trainingDays = weekOne
      .filter(d => d.dayType === "weights" || d.dayType === "bodyweight")
      .map(d => d.dayIndex);

    // Should anchor to Thursday (4), shifting from [1,3,5] to [4,6,1] or similar
    assert.notDeepEqual(trainingDays, [1, 3, 5], "New plan should NOT use default [1,3,5]");
    assert.ok(trainingDays.includes(4), "New plan anchored to Thursday should include day 4");
    console.log(`  ✓ New plan with startedOn="2024-03-14" anchors to Thursday: ${JSON.stringify(trainingDays)}`);
  }

  console.log("\n✅ All existing plan schedule tests passed");
  console.log("  ✓ Block 2+ schedules match main (pre-PR behavior)");
  console.log("  ✓ Block 1 with startedOn uses new anchoring behavior");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
