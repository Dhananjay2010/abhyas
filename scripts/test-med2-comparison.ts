#!/usr/bin/env npx tsx
/**
 * MED-2 Comparison: Verify owner decision exclusions don't cause unexpected RNG shifts
 * 
 * Baseline: scripts/fixtures/med2-baseline-main.json (byte-identical to origin/main)
 * 
 * Owner decisions in this PR:
 * - Landmine jammers excluded for ANY knee (G-3)
 * - Calf-press excluded for past-knee only (QA Bot 1)  
 * - Single-leg-leg-extension excluded for past-knee only (new owner decision)
 * 
 * These exclusions shift the RNG stream. We verify the shifts are limited to:
 * 1. Day 2: Calf 5→4 (pre-existing fixture drift between main's fixture and main's code)
 * 2. Day 5: Cable Crunch→Crunches (RNG shift from exclusions)
 * 
 * All other exercises, their order, sets, totals, and minutes must match the baseline.
 */

import { readFileSync } from "fs";
import {
  generateProgram,
  estimateSessionMinutes,
  type CandidateExercise,
  type GeneratorInput,
} from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);

const catalogueById = new Map(catalogue.map(ex => [ex.id, ex]));

// Past-knee user at 75 min session (triggers time-fill)
const pastKneeInput: GeneratorInput = {
  userId: "test-med2-comparison",
  blockNumber: 1,
  goal: "muscle_gain",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 23,
  hasAllEquipment: true,
  equipmentIds: [],
  currentInjuryRegions: [],
  anyKneeInjury: true,
  preferredSessionMinutes: 75,
  catalogue,
};

const result = generateProgram(pastKneeInput);

console.log("MED-2 Comparison: Owner Decision RNG Impact");
console.log("─".repeat(80));
console.log("Session length: 75 min (time-fill active)");
console.log("");

const lowerDays = result.days.filter(day => 
  day.focus === "lower" || day.focus === "legs" || day.focus === "full_body"
);

console.log("Day | Label      | Lower Sets | Total Sets | Est. Min | Exercises");
console.log("─".repeat(80));

const lowerBodyPatterns = new Set(["squat", "lunge", "hinge", "calf"]);

// Load baseline from origin/main
type BaselineDay = {
  dayIndex: number;
  label: string;
  focus: string;
  lowerBodySets: number;
  totalSets: number;
  estMinutes: number;
  exercises: Array<{
    name: string;
    slug?: string;
    targetSets: number;
    movementPattern?: string;
  }>;
};

const baseline: BaselineDay[] = JSON.parse(
  readFileSync("scripts/fixtures/med2-baseline-main.json", "utf-8")
);

// Known RNG drifts from owner decision exclusions
type AllowedChange = 
  | { type: 'fixturedrift'; exercise: string; baselineSets: number; codeSets: number }
  | { type: 'exercise'; exercise: string; becomes: string };

const ALLOWED_CHANGES: Map<number, AllowedChange[]> = new Map([
  [2, [
    // Fixture drift: Calf 5→4 is pre-existing between main's fixture and code
    { type: 'fixturedrift', exercise: 'Barbell Seated Calf Raise', baselineSets: 5, codeSets: 4 },
  ]],
  [5, [
    // RNG shift from owner decision exclusions: Cable Crunch→Crunches
    { type: 'exercise', exercise: 'Cable Crunch', becomes: 'Crunches' },
  ]],
]);

console.log("Baseline from origin/main:");
baseline.forEach(day => {
  console.log(`  Day ${day.dayIndex} (${day.label}): ${day.lowerBodySets} lower sets, ${day.estMinutes} min`);
});
console.log("");

let failures = 0;
const allowedChangesUsed = new Set<string>();

for (const day of lowerDays) {
  if (day.dayType === "rest") continue;
  
  const exercises = day.exercises.map(ex => {
    const exData = catalogueById.get(ex.exerciseId);
    return { ...ex, exData };
  }).filter(e => e.exData !== undefined);
  
  const lowerBodySets = exercises
    .filter(e => e.exData && lowerBodyPatterns.has(e.exData.movement_pattern))
    .reduce((sum, e) => sum + e.targetSets, 0);
  
  const totalSets = exercises.reduce((sum, e) => sum + e.targetSets, 0);
  
  const estMinutes = Math.round(estimateSessionMinutes({ exercises: day.exercises }));
  
  const exList = exercises.map(e => `${e.name} (${e.targetSets})`).join(", ");
  
  console.log(
    `${String(day.dayIndex).padStart(3)} | ` +
    `${day.label.padEnd(10)} | ` +
    `${String(lowerBodySets).padStart(10)} | ` +
    `${String(totalSets).padStart(10)} | ` +
    `${String(estMinutes).padStart(8)} | ` +
    `${exercises.length} exercises`
  );
  
  console.log(`     ${exList}`);
  console.log("");
  
  // Check against baseline
  const baselineDay = baseline.find(b => b.dayIndex === day.dayIndex);
  if (!baselineDay) {
    console.log(`  ✗ MISSING: Day ${day.dayIndex} not found in baseline`);
    failures++;
    continue;
  }
  
  const dayAllowedChanges = ALLOWED_CHANGES.get(day.dayIndex) || [];
  
  // Check totals (accounting for fixture drift)
  const totalSetsDrift = dayAllowedChanges.find(c => 
    c.type === 'fixturedrift'
  ) as { type: 'fixturedrift'; exercise: string; baselineSets: number; codeSets: number } | undefined;
  
  const expectedTotalSets = totalSetsDrift 
    ? baselineDay.totalSets - totalSetsDrift.baselineSets + totalSetsDrift.codeSets
    : baselineDay.totalSets;
  
  const expectedLowerSets = totalSetsDrift && lowerBodyPatterns.has(
    baselineDay.exercises.find(e => e.name === totalSetsDrift.exercise)?.movementPattern || ''
  )
    ? baselineDay.lowerBodySets - totalSetsDrift.baselineSets + totalSetsDrift.codeSets
    : baselineDay.lowerBodySets;
  
  const expectedMinutes = totalSetsDrift
    ? estMinutes  // Don't check minutes when there's a set drift (minutes will naturally differ)
    : baselineDay.estMinutes;
  
  if (totalSets !== expectedTotalSets) {
    console.log(`  ✗ Total sets: ${totalSets} vs expected ${expectedTotalSets}`);
    failures++;
  }
  
  if (lowerBodySets !== expectedLowerSets) {
    console.log(`  ✗ Lower-body sets: ${lowerBodySets} vs expected ${expectedLowerSets}`);
    failures++;
  }
  
  if (estMinutes !== expectedMinutes) {
    console.log(`  ✗ Estimated minutes: ${estMinutes} vs expected ${expectedMinutes}`);
    failures++;
  }
  
  // Check exercise count
  if (exercises.length !== baselineDay.exercises.length) {
    console.log(`  ✗ Exercise count: ${exercises.length} vs baseline ${baselineDay.exercises.length}`);
    failures++;
    continue;
  }
  
  // Check each exercise: name, order, and sets
  for (let i = 0; i < exercises.length; i++) {
    const prEx = exercises[i];
    const baseEx = baselineDay.exercises[i];
    
    // Check if there's an allowed exercise swap
    const exerciseSwap = dayAllowedChanges.find(c =>
      c.type === 'exercise' && c.exercise === baseEx.name
    ) as { type: 'exercise'; exercise: string; becomes: string } | undefined;
    
    const expectedName = exerciseSwap ? exerciseSwap.becomes : baseEx.name;
    
    if (prEx.name !== expectedName) {
      console.log(`  ✗ Exercise ${i + 1}: "${prEx.name}" vs expected "${expectedName}"`);
      failures++;
    } else {
      if (exerciseSwap) {
        const key = `${day.dayIndex}-${i}-${exerciseSwap.exercise}-${exerciseSwap.becomes}`;
        allowedChangesUsed.add(key);
      }
      
      // Check sets (accounting for fixture drift)
      const setsDrift = dayAllowedChanges.find(c =>
        c.type === 'fixturedrift' && c.exercise === prEx.name
      ) as { type: 'fixturedrift'; exercise: string; baselineSets: number; codeSets: number } | undefined;
      
      if (setsDrift) {
        const key = `${day.dayIndex}-${i}-drift-${setsDrift.exercise}`;
        allowedChangesUsed.add(key);
        
        if (baseEx.targetSets !== setsDrift.baselineSets) {
          console.log(`  ✗ Fixture drift: baseline ${setsDrift.exercise} should have ${setsDrift.baselineSets} sets, got ${baseEx.targetSets}`);
          failures++;
        }
        if (prEx.targetSets !== setsDrift.codeSets) {
          console.log(`  ✗ Fixture drift: code ${setsDrift.exercise} should produce ${setsDrift.codeSets} sets, got ${prEx.targetSets}`);
          failures++;
        }
      } else if (prEx.targetSets !== baseEx.targetSets) {
        console.log(`  ✗ Exercise ${i + 1} "${prEx.name}": ${prEx.targetSets} sets vs baseline ${baseEx.targetSets} sets`);
        failures++;
      }
    }
  }
  
  if (failures === 0) {
    console.log(`  ✓ Day ${day.dayIndex} matches baseline (with allowed drifts)`);
  }
  
  console.log("");
}

// Assert all baseline days are present in PR output
console.log("─".repeat(80));
console.log("Baseline day verification:");

for (const baselineDay of baseline) {
  const prDay = lowerDays.find(d => d.dayIndex === baselineDay.dayIndex);
  if (!prDay) {
    console.log(`  ✗ MISSING: Baseline day ${baselineDay.dayIndex} (${baselineDay.label}) not found in PR output`);
    failures++;
    continue;
  }
  
  // Check that focus/type didn't change unexpectedly
  const prFocus = prDay.focus;
  const mainFocus = baselineDay.focus;
  if (prFocus !== mainFocus) {
    console.log(`  ✗ TYPE CHANGE: Day ${baselineDay.dayIndex} changed from ${mainFocus} to ${prFocus}`);
    failures++;
  } else {
    console.log(`  ✓ Day ${baselineDay.dayIndex} (${baselineDay.label}) present and checked`);
  }
}

console.log("");

console.log("─".repeat(80));
console.log("\nRequirements:");
console.log("  - Match baseline from origin/main (byte-identical fixture)");
console.log("  - Allow explicit RNG drifts from owner decision exclusions");
console.log("  - Day 2: Calf 5→4 (pre-existing fixture drift)");
console.log("  - Day 5: Cable Crunch→Crunches (RNG shift from exclusions)");

console.log("\n" + "─".repeat(80));
if (failures === 0) {
  console.log("✓ MED-2 comparison passed");
  process.exit(0);
} else {
  console.log(`✗ FAIL: MED-2 comparison - ${failures} discrepanc${failures === 1 ? 'y' : 'ies'}`);
  process.exit(1);
}
