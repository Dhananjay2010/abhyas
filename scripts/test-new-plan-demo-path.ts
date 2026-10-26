/**
 * Test: New plan anchoring - demo path fixes
 * 
 * Verifies:
 * 1. New plans anchor first training day to started_on (sign-up day)
 * 2. Existing plans preserve weekday mapping (no re-anchoring)
 * 3. All 7 weekdays work correctly
 * 
 * Run: npx tsx scripts/test-new-plan-demo-path.ts
 */

import { strict as assert } from "assert";
import { generateProgram, type GeneratorInput, type CandidateExercise } from "../src/lib/program/generate";
import { activeDayIndices, activeDayIndicesAnchored } from "../src/lib/program/splits";
import { isoWeekday } from "../src/lib/dates";

// Minimal catalogue for testing (just enough to generate plans)
const MINIMAL_CATALOGUE: CandidateExercise[] = [
  {
    id: "ex1", slug: "barbell-squat", name: "Barbell Squat",
    movement_pattern: "squat", mechanic: "compound", metric: "reps",
    primary_muscles: ["quads"], equipment_ids: ["barbell", "rack"],
    level_min: "beginner", contraindicated_regions: [], impact: "medium",
    spinal_load: "high", tracks: ["weights"], default_rest_seconds: 90,
    category: "strength"
  },
  {
    id: "ex2", slug: "barbell-bench-press", name: "Barbell Bench Press",
    movement_pattern: "horizontal_press", mechanic: "compound", metric: "reps",
    primary_muscles: ["chest"], equipment_ids: ["barbell", "bench"],
    level_min: "beginner", contraindicated_regions: [], impact: "low",
    spinal_load: "low", tracks: ["weights"], default_rest_seconds: 90,
    category: "strength"
  },
  {
    id: "ex3", slug: "bent-over-row", name: "Bent Over Row",
    movement_pattern: "horizontal_pull", mechanic: "compound", metric: "reps",
    primary_muscles: ["upper_back"], equipment_ids: ["barbell"],
    level_min: "beginner", contraindicated_regions: [], impact: "low",
    spinal_load: "medium", tracks: ["weights"], default_rest_seconds: 75,
    category: "strength"
  },
  {
    id: "ex4", slug: "deadlift", name: "Deadlift",
    movement_pattern: "hinge", mechanic: "compound", metric: "reps",
    primary_muscles: ["hamstrings", "glutes"], equipment_ids: ["barbell"],
    level_min: "beginner", contraindicated_regions: [], impact: "low",
    spinal_load: "high", tracks: ["weights"], default_rest_seconds: 180,
    category: "strength"
  },
  {
    id: "ex5", slug: "overhead-press", name: "Overhead Press",
    movement_pattern: "vertical_press", mechanic: "compound", metric: "reps",
    primary_muscles: ["shoulders"], equipment_ids: ["barbell"],
    level_min: "beginner", contraindicated_regions: [], impact: "low",
    spinal_load: "medium", tracks: ["weights"], default_rest_seconds: 90,
    category: "strength"
  },
  {
    id: "ex6", slug: "lat-pulldown", name: "Lat Pulldown",
    movement_pattern: "vertical_pull", mechanic: "compound", metric: "reps",
    primary_muscles: ["lats"], equipment_ids: ["cable_machine"],
    level_min: "beginner", contraindicated_regions: [], impact: "low",
    spinal_load: "none", tracks: ["weights"], default_rest_seconds: 75,
    category: "strength"
  },
  {
    id: "ex7", slug: "plank", name: "Plank",
    movement_pattern: "core", mechanic: "isolation", metric: "seconds",
    primary_muscles: ["abs"], equipment_ids: [],
    level_min: "beginner", contraindicated_regions: [], impact: "low",
    spinal_load: "none", tracks: ["weights", "bodyweight"], default_rest_seconds: 60,
    category: "strength"
  },
  {
    id: "ex8", slug: "lunge", name: "Lunge",
    movement_pattern: "lunge", mechanic: "compound", metric: "reps",
    primary_muscles: ["quads", "glutes"], equipment_ids: [],
    level_min: "beginner", contraindicated_regions: [], impact: "low",
    spinal_load: "low", tracks: ["weights", "bodyweight"], default_rest_seconds: 75,
    category: "strength"
  },
  {
    id: "ex9", slug: "calf-raise", name: "Calf Raise",
    movement_pattern: "calf", mechanic: "isolation", metric: "reps",
    primary_muscles: ["calves"], equipment_ids: [],
    level_min: "beginner", contraindicated_regions: [], impact: "low",
    spinal_load: "none", tracks: ["weights", "bodyweight"], default_rest_seconds: 60,
    category: "strength"
  },
];

console.log("Test: New plan anchoring - demo path fixes\n");

// Test 1: New 3-day plan on each weekday
console.log("1. NEW plans: First training day = started_on for all weekdays");
{
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dates = [
    "2026-10-26", // Monday
    "2026-10-27", // Tuesday  
    "2026-10-28", // Wednesday
    "2026-10-29", // Thursday
    "2026-10-30", // Friday
    "2026-10-31", // Saturday
    "2026-11-01", // Sunday
  ];
  
  for (let i = 0; i < 7; i++) {
    const startedOn = dates[i];
    const weekday = isoWeekday(startedOn);
    
    const input: GeneratorInput = {
      userId: "test-user",
      blockNumber: 1, // NEW plan
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
      catalogue: MINIMAL_CATALOGUE,
      startedOn, // Anchor to this date
    };
    
    const plan = generateProgram(input);
    
    // Find the day that corresponds to the sign-up weekday
    const signUpDay = plan.days.find(d => d.dayIndex === weekday);
    assert.ok(signUpDay, `${weekdays[i]}: Day ${weekday} must exist in plan`);
    assert.ok(signUpDay.dayType === "weights" || signUpDay.dayType === "bodyweight", 
      `${weekdays[i]}: Sign-up day (weekday ${weekday}) must be a training day, got ${signUpDay.dayType}`);
    assert.equal(signUpDay.label, "Full Body A", 
      `${weekdays[i]}: Sign-up day should be Full Body A (first workout)`);
    
    console.log(`  ✓ ${weekdays[i]} (${startedOn}): Weekday ${weekday} = Full Body A`);
  }
}

// Test 2: EXISTING plans preserve weekday mapping
console.log("\n2. EXISTING plans: Preserve original weekday mapping (no re-anchoring)");
{
  const input: GeneratorInput = {
    userId: "existing-user",
    blockNumber: 2, // EXISTING plan (block 2+)
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
    catalogue: MINIMAL_CATALOGUE,
    // NO startedOn - should use original weekday mapping
  };
  
  const plan = generateProgram(input);
  
  // For 3-day plan, original mapping is [1, 3, 5] = Mon, Wed, Fri
  const originalMapping = activeDayIndices(3);
  
  // Check that training days are on the original weekdays
  const trainingDays = plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight");
  const trainingWeekdays = trainingDays.map(d => d.dayIndex).sort((a, b) => a - b);
  
  assert.deepEqual(trainingWeekdays, originalMapping, 
    "EXISTING plan: Should use original weekday mapping");
  
  console.log(`  ✓ Block 2+ uses original mapping: weekdays ${trainingWeekdays.join(", ")}`);
}

// Test 3: Demo path scenario - Tuesday sign-up
console.log("\n3. Demo path: 3-day plan starting Tuesday");
{
  const startedOn = "2026-10-27"; // Tuesday
  const input: GeneratorInput = {
    userId: "demo-user",
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
    preferredSessionMinutes: 45,
    catalogue: MINIMAL_CATALOGUE,
    startedOn,
  };
  
  const plan = generateProgram(input);
  
  // Tuesday (weekday 2) should be a training day
  const tuesday = plan.days.find(d => d.dayIndex === 2);
  assert.ok(tuesday, "Tuesday must be in the plan");
  assert.ok(tuesday.dayType === "weights" || tuesday.dayType === "bodyweight",
    "Tuesday must be a training day");
  assert.equal(tuesday.label, "Full Body A", "Tuesday should be Full Body A");
  
  // Check spacing pattern
  const trainingDays = plan.days
    .filter(d => d.dayType === "weights" || d.dayType === "bodyweight")
    .sort((a, b) => a.dayIndex - b.dayIndex);
  
  assert.equal(trainingDays.length, 3, "Should have 3 training days");
  assert.equal(trainingDays[0].dayIndex, 2, "First training on Tuesday");
  assert.equal(trainingDays[0].label, "Full Body A", "First training is Full Body A");
  assert.equal(trainingDays[1].label, "Full Body B", "Second training is Full Body B");
  assert.equal(trainingDays[2].label, "Full Body C", "Third training is Full Body C");
  
  console.log(`  ✓ Tuesday = Full Body A (first training day)`);
  console.log(`  ✓ Training days: ${trainingDays.map(d => `${d.label} (weekday ${d.dayIndex})`).join(", ")}`);
  console.log(`  ✓ User will NOT land on rest day`);
}

// Test 4: Anchored indices match generator output
console.log("\n4. activeDayIndicesAnchored() matches generator output");
{
  const startedOn = "2026-10-29"; // Thursday
  const computed = activeDayIndicesAnchored(startedOn, 3);
  
  const input: GeneratorInput = {
    userId: "test-user",
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
    catalogue: MINIMAL_CATALOGUE,
    startedOn,
  };
  
  const plan = generateProgram(input);
  const actualIndices = plan.days
    .filter(d => d.dayType === "weights" || d.dayType === "bodyweight")
    .map(d => d.dayIndex)
    .sort((a, b) => a - b);
  
  assert.deepEqual(computed.sort(), actualIndices, 
    "activeDayIndicesAnchored should match actual training day indices");
  
  console.log(`  ✓ Computed weekdays: ${computed.join(", ")}`);
  console.log(`  ✓ Actual weekdays:   ${actualIndices.join(", ")}`);
}

console.log("\n✅ All new plan anchoring tests passed");
console.log("\nVerified:");
console.log("- NEW plans (block 1): First training day = sign-up day");
console.log("- EXISTING plans (block 2+): Preserve original weekday mapping");
console.log("- All 7 weekdays work correctly");
console.log("- Demo path: Tuesday sign-up lands on Full Body A, not rest");
